import { parse } from "acorn";
import { expandedToolNames, executeExpandedTool } from "../../tools/expanded";
import { PremiereProTools } from "../../tools/index";
import { seedArgs } from "../helpers/schema-args";

/**
 * The expanded tools are emitted as ExtendScript from TypeScript template
 * literals. A backslash escape written for the *ExtendScript* string is
 * consumed by the *template literal* first, so `\"` reaches the host as a bare
 * `"` and silently terminates the message string it was meant to protect.
 *
 * That failure is invisible to `tsc` — the template literal is still a valid
 * TypeScript string — and it does not break one tool, it breaks every tool in
 * the file, because they all share one generated script. It reaches the host as
 * a generic "ExtendScript execution failed via CEP evalScript()".
 *
 * So parse what is actually emitted, for every tool, rather than trusting that
 * the TypeScript compiled.
 */
describe("generated ExtendScript is syntactically valid", () => {
  const capture = async (name: string): Promise<string> => {
    let script = "";
    const bridge = {
      executeScript: async (source: string) => {
        script = source;
        return { success: true, data: {} };
      },
    };
    try {
      await executeExpandedTool(bridge as any, name, {});
    } catch {
      // A tool may reject on missing arguments before it emits anything. That
      // is not what this suite is about — an empty capture is handled below.
    }
    return script;
  };

  /**
   * Parsed as ES3, which is what ExtendScript is — not as modern JavaScript.
   *
   * This used `new Function`, which compiles under whatever V8 the test runner
   * ships. That accepts a great deal ExtendScript will not, including a raw
   * U+2028 inside a string literal — the precise failure
   * a U+2028 in a generated string literal produces, so the guard could not catch
   * the bug it was written for. Verified: V8 accepts raw U+2028, U+2029, `const`
   * and ES5 getters; acorn in ES3 mode rejects all four.
   *
   * Not exhaustive — acorn's ES3 mode still tolerates reserved words as property
   * names and trailing commas, both of which ES3 forbids. It is a strict
   * improvement, not a complete ES3 conformance check.
   */
  const parses = (source: string): void => {
    // allowReturnOutsideFunction mirrors the bridge, which wraps these bodies in
    // an IIFE before they reach the host.
    parse(source, { ecmaVersion: 3, allowReturnOutsideFunction: true });
  };

  it.each([...expandedToolNames])("%s", async (name) => {
    const script = await capture(name);

    // A handful of tools are implemented in TypeScript rather than as generated
    // ExtendScript. They emit nothing through the bridge and have nothing to
    // parse; the shared-script tools are the ones this guard exists for.
    if (script.length === 0) return;

    expect(() => parses(script)).not.toThrow();
  });

  it("covers the shared generated script", async () => {
    // If the capture shim silently stopped working, every case above would pass
    // vacuously. Pin that the bulk of the catalog really is being parsed.
    const captured = await Promise.all(
      [...expandedToolNames].map((n) => capture(n)),
    );
    expect(captured.filter((s) => s.length > 0).length).toBeGreaterThan(100);
  });

  it("rejects an escape that collapses before it reaches the host", async () => {
    // Pin the specific regression: a double-quoted ExtendScript string whose
    // quotes were written as \" in the template literal. Guards the seven QE
    // fail() messages that took down all 168 tools.
    const script = await capture("add_tracks");
    expect(script).toContain("Could not address sequence '");
    expect(script).not.toContain('Could not address sequence "" +');
  });

  describe('lookup helpers signal "not found" with null', () => {
    /**
     * findClip() and markerCollectionForTool() used to return fail(seqErr) when
     * the caller's sequenceId could not be resolved. fail() returns a JSON
     * string, and a string is truthy, so every downstream
     * `if (!x) return fail(...)` guard was dead code: callers went straight on
     * to read .clip or .getFirstMarker off a string.
     *
     * Proven against a live 26.0.2 host before the fix:
     *   get_sequence_markers_by_type({sequenceId: 'NOPE'})
     *     -> {success: true, data: {count: 0, markers: []}}
     *   rename_clip({sequenceId: 'NOPE', ...})
     *     -> {success: false, error: 'undefined is not an object'}
     * The first is the dangerous one: a bogus id answered "this sequence has no
     * markers" with success: true.
     */
    const helperBody = (script, name) => {
      const start = script.indexOf('function ' + name + '(');
      expect(start).toBeGreaterThan(-1);
      return script.slice(start, start + 400);
    };

    it.each(['findClip', 'markerCollectionForTool'])(
      '%s returns null rather than a fail() string',
      async (helper) => {
        const script = await capture('get_clip_markers');
        const body = helperBody(script, helper);

        expect(body).toContain('pendingSequenceError = seqErr; return null;');
        expect(body).not.toContain('if (seqErr) return fail(seqErr);');
      },
    );

    it('reports the sequence error rather than the generic message', async () => {
      const script = await capture('get_clip_markers');

      expect(script).toContain('return fail(pendingSequenceError || "Marker collection unavailable")');
      expect(script).not.toContain('return fail("Marker collection unavailable")');
    });

    it('prefers the sequence error at every clip lookup guard', async () => {
      const script = await capture('rename_clip');

      expect(script).toContain('return fail(pendingSequenceError || "Clip not found")');
      expect(script).not.toContain('return fail("Clip not found")');
    });
  });

  describe("qeSequenceFor falls back only to the right sequence", () => {
    /**
     * qe.project.getSequenceAt() does not expose every sequence: one made by
     * duplicate_sequence and never opened in a timeline is invisible to it even
     * while it is active. Verified against 26.0.2 — getActiveSequence() returns
     * a working handle for exactly that sequence, guid and addTracks included —
     * so refusing without trying it gave up work the host can do.
     *
     * The guid check is what keeps this from re-becoming the original bug,
     * where a tool resolved one sequence and then mutated whichever was active.
     */
    it("verifies the guid before using the active sequence", async () => {
      const script = await capture("add_tracks");

      expect(script).toContain("qe.project.getActiveSequence()");
      expect(script).toContain(
        "String(activeCandidate.guid) === String(seq.sequenceID)",
      );
    });

    it("tries the indexed scan before the active sequence", async () => {
      const script = await capture("add_tracks");
      // Scoped to the helper body: the same call appears in prose elsewhere in
      // the generated script, and a whole-script indexOf finds the comment.
      const start = script.indexOf("function qeSequenceFor(");
      const body = script.slice(start, script.indexOf("\n    }", start));
      const scan = body.indexOf("qe.project.getSequenceAt(qi)");
      const fallback = body.indexOf("qe.project.getActiveSequence()");

      expect(scan).toBeGreaterThan(-1);
      expect(fallback).toBeGreaterThan(scan);
    });
  });

  describe("the 112 tools declared in index.ts", () => {
    /**
     * This suite only ever parsed expanded.ts. A collapsing \\" escape injected
     * into an index.ts generated script -- the exact failure this file
     * exists to catch -- and all tests stayed green, because those scripts were
     * never captured.
     *
     * They cannot be driven the same way: each tool has its own zod schema, so a
     * no-arg call is usually rejected before a script is generated. Filling
     * plausible arguments from the schema gets most of them to emit.
     */
    const localScripts = async (): Promise<Array<[string, string]>> => {
      const captured: Array<[string, string]> = [];
      const expanded = new Set<string>([...expandedToolNames]);
      const probe = new PremiereProTools({
        executeScript: async () => ({ success: true }),
      } as never);

      for (const tool of probe.getAvailableTools()) {
        if (expanded.has(tool.name)) continue;
        let script = "";
        const tools = new PremiereProTools({
          executeScript: async (s: string) => { script = s; return { success: true }; },
        } as never);
        try {
          await tools.executeTool(tool.name, seedArgs(tool as never));
        } catch {
          // Schema rejections and handlers that never reach the bridge are fine;
          // an empty capture is skipped below.
        }
        if (script) captured.push([tool.name, script]);
      }
      return captured;
    };

    it("emits a parseable script for every tool that generates one", async () => {
      const captured = await localScripts();
      const broken: string[] = [];

      for (const [name, script] of captured) {
        try {
          parses(script);
        } catch (error) {
          broken.push(`${name}: ${(error as Error).message}`);
        }
      }

      expect(broken).toEqual([]);
      // Captures and parses every local tool; the default limit is not enough.
    }, 120_000);

    it("actually captures a meaningful number of them", async () => {
      // Without this, a broken capture would make the parse check pass vacuously
      // -- which is exactly how the expanded-only version hid the gap.
      //
      // This used to build arguments by dispatching on `_def.typeName`, which is
      // undefined in this zod build, so every field became the string "x" and any
      // tool with a numeric parameter was rejected before emitting. It reached 36
      // of the 112 local tools and the floor was calibrated to that broken number.
      // Seeding from the schema reaches 77.
      const captured = await localScripts();

      expect(captured.length).toBeGreaterThanOrEqual(70);
    }, 120_000);
  });

  describe("the parser itself", () => {
    /**
     * Pins the upgrade from `new Function` to acorn's ES3 mode. Without this the
     * suite could quietly regress to a modern-JavaScript parser and keep passing
     * while missing the failures it exists to catch.
     */
    const LS = "\u2028";

    it("rejects a raw U+2028 inside a string literal", () => {
      // ExtendScript is ES3, where a line terminator inside a string literal is a
      // syntax error. V8 accepts it (ES2019 made it legal), so the old check could
      // not catch a U+2028 smuggled into a generated string literal.
      expect(() => parses(`var a = "x${LS}y";`)).toThrow();
    });

    it("rejects syntax that only exists after ES3", () => {
      expect(() => parses("const a = 1;")).toThrow();
      expect(() => parses("var o = { get x() { return 1; } };")).toThrow();
    });

    it("still accepts the ES3 the generator actually emits", () => {
      expect(() => parses('var a = 1; function f(){ return "ok"; } f();')).not.toThrow();
      expect(() => parses('return JSON.stringify({ ok: true });')).not.toThrow();
    });
  });
});
