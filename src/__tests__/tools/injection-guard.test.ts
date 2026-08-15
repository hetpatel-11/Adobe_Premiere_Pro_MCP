/**
 * No caller-supplied string may break out of the generated ExtendScript.
 *
 * This used to scan the TypeScript source for raw interpolation. That reads the
 * wrong artifact and it read it badly: the span scanner tracked `${` and `}`
 * depth, so an object literal inside an interpolation decremented the depth
 * early and the next backtick ended the span before the method did.
 *
 * So this drives every tool with a hostile value at every string position and
 * checks what the host would actually receive: that it still parses as ES3, and
 * that executing it cannot run the payload.
 *
 * Two blind spots the earlier version of this file had, both of which let a real
 * breakout through with the whole suite green:
 *
 *   - It selected parameters by `constructor.name` against a fixed list, so
 *     `z.array(z.string())` and nested `z.object({...})` were never fuzzed at
 *     all. A raw `${ids.join('","')}` was invisible. Arguments are now seeded
 *     from the schema and the payload is placed at *every* string leaf, inside
 *     arrays and nested objects included.
 *   - Every payload contained only double quotes, so a raw interpolation into a
 *     single-quoted ExtendScript literal could not be seen — it never terminated
 *     the string, so even the ES3 parse check passed. The PR moves message text
 *     to single quotes, which makes that shape idiomatic here, so single-quote
 *     payloads are now part of the set.
 *
 * It also captures every script a tool emits rather than the last one; a tool
 * that runs two scripts was previously only half-checked.
 */

import vm from 'vm';
import { parse } from 'acorn';
import { PremiereProTools } from '../../tools/index.js';
import { seedArgs, stringPaths, withPayloadAt } from '../helpers/schema-args.js';

/** Closes a double-quoted literal, sets a flag, and reopens it so the rest parses. */
const BREAKOUT_DOUBLE = 'zz"); __OWNED = true; ("';
/** The same against a single-quoted literal. */
const BREAKOUT_SINGLE = "zz'; __OWNED = true; var __x = '";
/** Adds a key to the returned JSON without breaking the call. */
const ADD_KEY = 'zz", INJECTED: "yes';
/** Ordinary names that merely contain a quote. */
const BENIGN_DOUBLE = '12" Cuts';
const BENIGN_SINGLE = "Bob's Takes";

const PAYLOADS = [BREAKOUT_DOUBLE, BREAKOUT_SINGLE, ADD_KEY, BENIGN_DOUBLE, BENIGN_SINGLE];

/** Runs an emitted script against a host that records whether the payload fired. */
function payloadRuns(script: string): boolean {
  const sandbox: Record<string, unknown> = {
    __OWNED: false,
    app: {
      enableQE() {},
      project: {
        name: 'p',
        sequences: { numSequences: 0 },
        rootItem: { name: 'root', nodeId: 'r', children: { numItems: 0 }, createBin: () => ({ name: 'b', nodeId: 'n' }) },
        activeSequence: null,
        importFiles: () => true,
        importSequences: () => true,
      },
    },
    qe: { project: {} },
    JSON,
    File: function () { return { exists: false }; },
    Folder: function () { return { exists: false, create: () => false }; },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(`(function(){${script}})()`, sandbox, { timeout: 2000 });
  } catch {
    // A missing DOM member is expected; only the flag matters.
  }
  return sandbox.__OWNED === true;
}

describe('generated scripts cannot be broken out of', () => {
  it('survives a hostile value at every string position of every tool', async () => {
    const probe = new PremiereProTools({ executeScript: async () => ({ success: true }) } as never);
    const escaped: string[] = [];
    const unparseable: string[] = [];
    let checked = 0;
    let toolsReached = 0;

    for (const tool of probe.getAvailableTools()) {
      const base = seedArgs(tool as never);
      const paths = stringPaths(base);
      if (paths.length) toolsReached++;

      for (const path of paths) {
        for (const payload of PAYLOADS) {
          const scripts: string[] = [];
          const tools = new PremiereProTools({
            executeScript: async (s: string) => { scripts.push(s); return { success: true }; },
          } as never);
          try {
            await tools.executeTool(tool.name, withPayloadAt(base, path, payload) as Record<string, unknown>);
          } catch {
            // schema rejection: nothing was emitted
          }

          const where = `${tool.name}.${path.join('.') || '(root)'}`;
          for (const script of scripts) {
            checked++;
            try {
              parse(script, { ecmaVersion: 3, allowReturnOutsideFunction: true });
            } catch {
              unparseable.push(where);
              continue;
            }
            if (payloadRuns(script)) escaped.push(where);
          }
        }
      }
    }

    // Floors, so a harness that quietly stopped emitting cannot pass vacuously.
    // Currently 97 tools carry a string position, 199 positions in all, driven
    // with 5 payloads each; 545 of those emit a script, the rest being rejected
    // by a field's own validation before anything is generated. The old selector
    // reached 61 tools and skipped array and nested-object parameters entirely,
    // so a raw interpolation there was invisible. These floors sit just under the
    // present numbers to catch a harness that silently stops reaching most of them.
    expect(toolsReached).toBeGreaterThan(90);
    expect(checked).toBeGreaterThan(500);
    expect([...new Set(escaped)]).toEqual([]);
    expect([...new Set(unparseable)]).toEqual([]);
  }, 600_000);
});
