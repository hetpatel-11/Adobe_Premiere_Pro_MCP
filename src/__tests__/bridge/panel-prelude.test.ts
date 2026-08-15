/**
 * The panel prepends its own copy of the prelude.
 *
 * jest.config.js sets roots: ['<rootDir>/src'], so nothing under cep-plugin/ is
 * collected as a test. That is fine for test files, but it also meant the
 * panel's copy of the escaper was never executed by anything: it could be
 * reverted to the broken version and the whole suite stayed green. The two
 * copies are maintained by hand and drift silently, so this executes the
 * panel's copy from disk and holds it to the same contract as the server's.
 */

import vm from 'vm';
import path from 'path';

// The suite mocks 'fs' for the bridge tests; this needs the real one to read a
// file off disk.
const realFs = jest.requireActual<typeof import('fs')>('fs');

const PANEL = path.join(__dirname, '..', '..', '..', 'cep-plugin', 'bridge-cep.js');

const LINE_SEPARATOR = '\u2028';
const PARAGRAPH_SEPARATOR = '\u2029';

/**
 * Pulls the prelude out of the panel source and runs it, returning the sandbox
 * so both the helpers and the JSON object they install can be inspected.
 *
 * The array literal is evaluated rather than pattern-matched out, so a change to
 * how the lines are quoted or joined cannot quietly produce a different string
 * here than the panel builds at runtime.
 */
function loadPanelPrelude(): Record<string, unknown> {
  const source = realFs.readFileSync(PANEL, 'utf8');

  const start = source.indexOf('var EXTENDSCRIPT_COMPAT_HELPERS = [');
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf('[', start);
  const close = source.indexOf("].join('\\n');", open);
  expect(close).toBeGreaterThan(open);

  const arrayLiteral = source.slice(open, close + 1);
  const prelude = (vm.runInNewContext(arrayLiteral) as string[]).join('\n');

  // Sanity: this must be the prelude, not some other array that moved above it.
  expect(prelude).toContain('function __mcpStringify');

  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);
  return sandbox;
}

const panelStringify = (): ((v: unknown) => string) =>
  loadPanelPrelude().__mcpStringify as (v: unknown) => string;

describe('the panel copy of the prelude', () => {
  it('round-trips every character below U+0020', () => {
    const stringify = panelStringify();

    for (let code = 0; code < 0x20; code++) {
      const original = `a${String.fromCharCode(code)}b`;
      expect(JSON.parse(stringify(original))).toBe(original);
    }
  });

  it('round-trips quotes, backslashes and the two line separators', () => {
    const stringify = panelStringify();

    for (const original of [
      'say "hi"', 'C:\\Users\\bob', 'both " and \\', '\\"',
      `x${LINE_SEPARATOR}y`, `x${PARAGRAPH_SEPARATOR}y`,
    ]) {
      expect(JSON.parse(stringify(original))).toBe(original);
    }
  });

  it('produces four hex digits, not a truncated escape', () => {
    expect(panelStringify()('a\u0001b')).toBe('"a\\u0001b"');
  });

  it('replaces a conformant JSON.stringify rather than deferring to it', () => {
    // JSON is a context global, not an own property of the sandbox object, so
    // this has to be evaluated inside the context. The context supplies a real
    // JSON.stringify, so restoring a typeof guard here fails.
    const sandbox = loadPanelPrelude();

    expect(vm.runInContext('JSON.stringify === __mcpStringify', sandbox)).toBe(true);
    expect(vm.runInContext('JSON.stringify("a\\u0001b")', sandbox)).toBe('"a\\u0001b"');
  });

  it('serialises an object whose own key shadows hasOwnProperty', () => {
    const stringify = panelStringify();

    const shadowed = { hasOwnProperty: 'not a function', name: 'clip' };
    expect(() => stringify(shadowed)).not.toThrow();
    expect(JSON.parse(stringify(shadowed))).toEqual(shadowed);
  });
});
