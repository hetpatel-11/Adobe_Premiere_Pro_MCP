/**
 * The panel validates the whole script, prelude included, before running it.
 *
 * validateScript() rejects a script matching any of a list of patterns — eval(,
 * new Function(, require(, __dirname, __filename, process. and child_process —
 * and returns a flat "Script validation failed" for the whole command. It scans
 * the text, so it does not distinguish code from a comment.
 *
 * That makes the prelude's own prose load-bearing: a comment ending in "the only
 * stringify in the process." matches /\bprocess\./i and every call the server
 * makes is rejected, with an error naming nothing useful. Caught only by running
 * against a live host, because nothing else feeds the generated script through
 * the panel's validator.
 *
 * The patterns are read from the panel source rather than restated here, so a
 * change to that list is picked up instead of silently diverging.
 */

import vm from 'vm';
import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';
import path from 'path';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(), access: jest.fn(), readdir: jest.fn(), writeFile: jest.fn(),
    readFile: jest.fn(), unlink: jest.fn(), rename: jest.fn(), rm: jest.fn(),
  }
}));

jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid-1234') }));

const realFs = jest.requireActual<typeof import('fs')>('fs');
const PANEL = path.join(__dirname, '..', '..', '..', 'cep-plugin', 'bridge-cep.js');

/**
 * The regex list out of the panel's validateScript, evaluated rather than scraped.
 *
 * Scraping it with a line-anchored regex and slicing to the first `]` was defeated
 * by two ordinary edits: a pattern containing a character class ended the slice
 * early, and a trailing `// comment` dropped its line. Either silently shortened
 * the list, and because the only check was a count floor, the pattern that matters
 * could vanish while this file still reported success.
 *
 * So the array literal is bounded by its closing line — never by a bracket, which
 * a character class also contains — and evaluated to real RegExp objects.
 */
function panelRejectPatterns(): RegExp[] {
  const source = realFs.readFileSync(PANEL, 'utf8');
  const start = source.indexOf('var dangerous = [');
  expect(start).toBeGreaterThan(-1);

  const lines = source.slice(source.indexOf('[', start)).split('\n');
  const collected: string[] = [];
  for (const line of lines) {
    collected.push(line);
    if (/^\s*\];?\s*$/.test(line)) break;
  }
  const literal = collected.join('\n').replace(/;\s*$/, '');
  const patterns = vm.runInNewContext(literal) as RegExp[];

  // Duck-typed, not `instanceof`: these are built in the vm's realm, so they are
  // regexes that fail an instanceof against this realm's RegExp.
  expect(Array.isArray(patterns)).toBe(true);
  expect(patterns.every((p) => typeof (p as RegExp).test === 'function')).toBe(true);

  // Positive control. A truncated or partly-dropped list still satisfies a count
  // floor, so the extraction is checked against text it is known to reject: this
  // exact wording in a prelude comment made the panel refuse every call.
  expect(patterns.some((re) => re.test('the only stringify in the process.'))).toBe(true);
  expect(patterns.some((re) => re.test('var x = eval("1");'))).toBe(true);
  expect(patterns.length).toBeGreaterThan(4);
  return patterns;
}

/** The panel's own script-length ceiling, read rather than restated. */
function panelLengthLimit(): number {
  const source = realFs.readFileSync(PANEL, 'utf8');
  const match = source.match(/script\.length\s*<=\s*(\d+)/);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

describe('the script the server sends', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  const generatedScript = async (): Promise<string> => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));

    const bridge = new PremiereProBridge({ info() {}, warn() {}, error() {}, debug() {} } as never);
    await bridge.initialize();
    await bridge.executeScript('return 1;');

    const payload = mockFs.writeFile.mock.calls[0][1] as string;
    return JSON.parse(payload).script as string;
  };

  it('is not rejected by the panel validator', async () => {
    const script = await generatedScript();

    const tripped = panelRejectPatterns()
      .filter((re) => re.test(script))
      .map((re) => {
        const hit = script.match(re);
        const at = hit?.index ?? 0;
        return `${re} matched ${JSON.stringify(script.slice(Math.max(0, at - 60), at + 30))}`;
      });

    expect(tripped).toEqual([]);
  });

  it('stays under the panel length limit', async () => {
    // Read from the panel rather than restated here: with the limit hardcoded this
    // compared roughly 6.7k against 500k and could not fail, and lowering the
    // panel's real ceiling to 1000 left it green.
    expect((await generatedScript()).length).toBeLessThanOrEqual(panelLengthLimit());
  });
});
