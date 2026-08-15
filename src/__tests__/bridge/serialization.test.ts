/**
 * Characters that survive JSON.stringify but not the trip into Premiere.
 *
 * All three behaviours below were reproduced against a live 26.0.2 host before
 * being fixed, by writing marker names through add_marker and reading them back
 * through list_markers.
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import vm from 'vm';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    rename: jest.fn(),
    rm: jest.fn(),
  }
}));

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-1234')
}));

describe('script serialization', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const configuredTempDir = '/tmp/premiere-mcp-bridge-test';
  const commandPath = path.join(configuredTempDir, 'command-test-uuid-1234.json');
  // Written here first, then renamed to commandPath so the panel cannot read a
  // half-written command while polling.
  const stagingPath = path.join(configuredTempDir, '.tmp-test-uuid-1234.json');

  const LINE_SEPARATOR = '\u2028';
  const PARAGRAPH_SEPARATOR = '\u2029';
  const NUL = '\u0000';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = configuredTempDir;
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
  });

  const readyBridge = async (): Promise<PremiereProBridge> => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
    mockFs.unlink.mockResolvedValue(undefined);
    await bridge.initialize();
    return bridge;
  };

  /** The script as it was actually written to the command file. */
  const writtenScript = (): string => {
    const call = mockFs.writeFile.mock.calls.find(
      ([, payload]) => typeof payload === 'string' && payload.includes('"script"'),
    );
    if (!call) throw new Error('no command file was written');
    return JSON.parse(call[1] as string).script as string;
  };

  it('escapes U+2028 so it cannot split a generated string literal', async () => {
    // JSON.stringify leaves these raw — legal in JSON, but line terminators to
    // a JavaScript parser, so the generated script died at parse time with a
    // bare "ExtendScript execution failed via CEP evalScript()".
    const bridge = await readyBridge();

    await bridge.executeScript(`var name = ${JSON.stringify(`x${LINE_SEPARATOR}y`)};`);

    const script = writtenScript();
    expect(script).not.toContain(LINE_SEPARATOR);
    expect(script).toContain('\\u2028');
  });

  it('escapes U+2029 as well', async () => {
    const bridge = await readyBridge();

    await bridge.executeScript(`var name = ${JSON.stringify(`x${PARAGRAPH_SEPARATOR}y`)};`);

    const script = writtenScript();
    expect(script).not.toContain(PARAGRAPH_SEPARATOR);
    expect(script).toContain('\\u2029');
  });

  it('leaves an ordinary script untouched', async () => {
    const bridge = await readyBridge();

    await bridge.executeScript('return JSON.stringify({ ok: true });');

    expect(writtenScript()).toContain('return JSON.stringify({ ok: true });');
  });

  it('refuses a raw NUL rather than letting the host truncate at it', async () => {
    const bridge = await readyBridge();

    await expect(bridge.executeScript(`var n = "p${NUL}q";`)).rejects.toThrow(/NUL byte/);
    expect(mockFs.writeFile).not.toHaveBeenCalledWith(commandPath, expect.anything());
  });

  describe('the installed JSON.stringify', () => {
    /**
     * These used to assert on the SOURCE TEXT of the escaper and never call it.
     * Asserting on the escaper's source text would not catch a bug that keeps
     * the same shape: emitting \\u1 instead of \\u0001, dropping the quote escape,
     * or disabling the control-character branch all leave the surrounding code
     * intact. So the escaper is executed and its output parsed.
     *
     * It runs in an isolated vm context because the prelude assigns
     * JSON.stringify, which would otherwise clobber the real one for the suite.
     */
    const loadEscaper = async (): Promise<(v: unknown) => string> => {
      const bridge = await readyBridge();
      await bridge.executeScript('return 1;');
      const prelude = writtenScript();

      const sandbox: Record<string, unknown> = {};
      vm.createContext(sandbox);
      vm.runInContext(prelude.slice(0, prelude.indexOf('function __findSequence')), sandbox);
      return (sandbox as { __mcpStringify: (v: unknown) => string }).__mcpStringify;
    };

    it('round-trips every character below U+0020', async () => {
      const stringify = await loadEscaper();

      for (let code = 0; code < 0x20; code++) {
        const original = `a${String.fromCharCode(code)}b`;
        const emitted = stringify(original);
        expect(JSON.parse(emitted)).toBe(original);
      }
    });

    it('round-trips quotes and backslashes', async () => {
      const stringify = await loadEscaper();

      for (const original of ['say "hi"', 'C:\\Users\\bob', 'both " and \\', '\\"']) {
        expect(JSON.parse(stringify(original))).toBe(original);
      }
    });

    it('round-trips the two line separators', async () => {
      const stringify = await loadEscaper();

      for (const original of [`x${LINE_SEPARATOR}y`, `x${PARAGRAPH_SEPARATOR}y`]) {
        expect(JSON.parse(stringify(original))).toBe(original);
      }
    });

    it('escapes the two line separators rather than passing them through', async () => {
      // JSON.parse is the wrong oracle here and on its own this branch had no
      // coverage at all: U+2028 and U+2029 are legal unescaped inside a JSON
      // string, so parse succeeds whether or not they were escaped. Deleting the
      // branch left the whole suite green. They are escaped for consumers that
      // evaluate rather than parse, where a raw one is a line terminator, so the
      // emitted text is what has to be asserted.
      const stringify = await loadEscaper();

      expect(stringify(`x${LINE_SEPARATOR}y`)).toBe('"x\\u2028y"');
      expect(stringify(`x${PARAGRAPH_SEPARATOR}y`)).toBe('"x\\u2029y"');
      expect(stringify(`x${LINE_SEPARATOR}y`)).not.toContain(LINE_SEPARATOR);
    });

    it('replaces a conformant JSON.stringify rather than deferring to it', async () => {
      // The vm context already has a real JSON.stringify, so this fails if the
      // install goes back behind `if (typeof JSON.stringify !== "function")`.
      // Without this, that guard could be restored and every escaper test above
      // still passed: they reach __mcpStringify by name and never check what
      // JSON.stringify ended up pointing at.
      const bridge = await readyBridge();
      await bridge.executeScript('return 1;');
      const prelude = writtenScript();

      const sandbox: Record<string, unknown> = {};
      vm.createContext(sandbox);
      expect(vm.runInContext('typeof JSON.stringify', sandbox)).toBe('function');
      vm.runInContext(prelude.slice(0, prelude.indexOf('function __findSequence')), sandbox);

      expect(vm.runInContext('JSON.stringify === __mcpStringify', sandbox)).toBe(true);
      expect(vm.runInContext('JSON.stringify("a\\u0001b")', sandbox)).toBe('"a\\u0001b"');
    });

    it('ignores a shadowing hasOwnProperty that would drop every key', async () => {
      // Worse than the throwing case it replaced: a function returning false made
      // the walk skip every key and emit {}, which parses cleanly while the whole
      // payload silently vanishes. A lost response is at least visible.
      const stringify = await loadEscaper();

      const shadowed = { hasOwnProperty: () => false, name: 'clip', durationSeconds: 12.5 };
      const emitted = stringify(shadowed);

      expect(emitted).not.toBe('{}');
      expect(JSON.parse(emitted)).toMatchObject({ name: 'clip', durationSeconds: 12.5 });
    });

    it('serialises an object whose own key shadows hasOwnProperty', async () => {
      // Reachable through inspect_dom_object. Testing truthiness instead of
      // callability here throws TypeError out of the escaper, which loses the
      // entire response -- the failure this whole prelude exists to prevent.
      const stringify = await loadEscaper();

      const shadowed = { hasOwnProperty: 'not a function', name: 'clip' };
      expect(() => stringify(shadowed)).not.toThrow();
      expect(JSON.parse(stringify(shadowed))).toEqual(shadowed);
    });

    it('produces four hex digits, not a truncated escape', async () => {
      const stringify = await loadEscaper();

      // \u1 parses as nothing useful; the bug that emitted it survived the old tests.
      expect(stringify('a\u0001b')).toBe('"a\\u0001b"');
    });

    it('serialises nested structures a tool actually returns', async () => {
      const bridge = await readyBridge();
      await bridge.executeScript('return 1;');
      const prelude = writtenScript();

      const sandbox: Record<string, unknown> = {};
      vm.createContext(sandbox);
      // The payload is built INSIDE the context on purpose. __mcpStringify tests
      // arrays with `instanceof Array`, which is false for an array constructed in
      // another realm -- an artifact of this harness, not of the host, where there
      // is only one realm.
      vm.runInContext(
        prelude.slice(0, prelude.indexOf('function __findSequence')) +
        `;__out = __mcpStringify({
           success: true,
           markers: [{ name: "a" + String.fromCharCode(1) + "b", comment: 'has "quotes"', time: 1.5 }],
           count: 1
         });`,
        sandbox,
      );

      expect(JSON.parse(sandbox.__out as string)).toEqual({
        success: true,
        markers: [{ name: 'a\u0001b', comment: 'has "quotes"', time: 1.5 }],
        count: 1,
      });
    });
  });

  describe('the installed JSON.parse', () => {
    /**
     * The prelude fabricates the JSON object, so installing only stringify left a
     * JSON that answers `typeof` while having no read direction. Anything that
     * feature-detects it and calls parse gets "JSON.parse is not a function" --
     * which is what add_text_overlay hits decoding a MOGRT text payload.
     *
     * Correctness is checked against the platform's own JSON.parse rather than
     * against hand-written expectations, so the comparison is with a conformant
     * implementation instead of with my reading of the grammar.
     */
    const loadParse = async (): Promise<(v: string) => unknown> => {
      const bridge = await readyBridge();
      await bridge.executeScript('return 1;');
      const prelude = writtenScript();

      const sandbox: Record<string, unknown> = {};
      vm.createContext(sandbox);
      vm.runInContext(prelude.slice(0, prelude.indexOf('function __findSequence')), sandbox);
      return (sandbox as { __mcpParse: (v: string) => unknown }).__mcpParse;
    };

    const VALID: unknown[] = [
      null, true, false, 0, -1, 3.5, -2.25e10, 1e-7, 12345678901234,
      '', 'plain', 'with "quotes"', 'back\\slash', 'tab\there', 'newline\nhere',
      'unicode \u00e9 \u4e2d', `sep${LINE_SEPARATOR}arator`, 'nul-free \u0001 control',
      [], {}, [1, 2, 3], ['a', ['b', ['c']]],
      { a: 1 }, { nested: { deep: { deeper: [1, { x: null }] } } },
      { 'key with spaces': 'v', 'quote"key': 2 },
      { mTextString: 'hello', fontSize: 48, tracking: -1.5 },
    ];

    it('agrees with the platform JSON.parse on every value it is given', async () => {
      const parse = await loadParse();

      for (const value of VALID) {
        const encoded = JSON.stringify(value);
        expect({ encoded, got: parse(encoded) }).toEqual({ encoded, got: JSON.parse(encoded) });
      }
    });

    it('accepts the whitespace JSON allows between tokens', async () => {
      const parse = await loadParse();

      expect(parse(' \t\r\n { "a" : [ 1 , 2 ] } \n ')).toEqual({ a: [1, 2] });
    });

    it('round-trips through the escaper this prelude installs', async () => {
      const bridge = await readyBridge();
      await bridge.executeScript('return 1;');
      const prelude = writtenScript();
      const sandbox: Record<string, unknown> = {};
      vm.createContext(sandbox);
      vm.runInContext(prelude.slice(0, prelude.indexOf('function __findSequence')), sandbox);
      const stringify = (sandbox as { __mcpStringify: (v: unknown) => string }).__mcpStringify;
      const parse = (sandbox as { __mcpParse: (v: string) => unknown }).__mcpParse;

      // The trip runs entirely inside the sandbox. Handing a value built out here
      // to the sandbox's stringify would test the wrong thing: it checks
      // `value instanceof Array`, which is false across realms, so a host array
      // would serialise as an object. ExtendScript has one realm, so that is an
      // artifact of this harness rather than a defect being hidden.
      for (const value of VALID) {
        const encoded = JSON.stringify(value);
        const reEncoded = stringify(parse(encoded));
        expect(JSON.parse(reEncoded)).toEqual(JSON.parse(encoded));
      }
    });

    it('rejects what is not JSON rather than guessing', async () => {
      const parse = await loadParse();

      const REJECTED = [
        '', '{', '[1,', '[1,]', '{"a":1,}', "{'a':1}", '{a:1}', '{"a" 1}',
        'undefined', 'NaN', 'Infinity', '+1', '01', '.5', '1.', '0x10',
        '"unterminated', '"bad \\x escape"', '"raw \u0001 control"',
        '{"a":1} trailing', 'tru', 'nul',
      ];

      for (const bad of REJECTED) {
        expect(() => parse(bad)).toThrow();
      }
    });

    it('is installed onto the JSON object, not merely defined', async () => {
      const bridge = await readyBridge();
      await bridge.executeScript('return 1;');
      const prelude = writtenScript();
      const sandbox: Record<string, unknown> = {};
      vm.createContext(sandbox);
      vm.runInContext(prelude.slice(0, prelude.indexOf('function __findSequence')), sandbox);

      expect(vm.runInContext('JSON.parse === __mcpParse', sandbox)).toBe(true);
      expect(vm.runInContext('JSON.parse(JSON.stringify({a:[1,"x"]})).a[1]', sandbox)).toBe('x');
    });
  });

  describe('caller-authored scripts', () => {
    /**
     * The line-terminator repair is only sound on scripts this server generates,
     * where everything outside a string literal is ASCII. execute_extendscript
     * breaks that assumption, and rewriting blindly turned a U+2028 the caller
     * used as a line break into the literal characters \\u2028 -- a syntax error
     * on a script that previously ran. This was a regression, not a latent bug.
     */
    it('passes a caller script through untouched', async () => {
      const bridge = await readyBridge();
      const callerScript = `var a = 1;${LINE_SEPARATOR}var b = 2;`;

      await bridge.executeScript(callerScript, undefined, true);

      const script = writtenScript();
      expect(script).toContain(LINE_SEPARATOR);
      expect(script).not.toContain('\\u2028');
    });

    it('still repairs a generated script', async () => {
      const bridge = await readyBridge();

      await bridge.executeScript(`var n = ${JSON.stringify(`x${LINE_SEPARATOR}y`)};`);

      const script = writtenScript();
      expect(script).not.toContain(LINE_SEPARATOR);
      expect(script).toContain('\\u2028');
    });

    it('still refuses a NUL from a caller script', async () => {
      // Scoping the repair must not also disable the truncation guard.
      const bridge = await readyBridge();

      await expect(bridge.executeScript(`var n = "p${NUL}q";`, undefined, true))
        .rejects.toThrow(/NUL byte/);
    });
  });
});
