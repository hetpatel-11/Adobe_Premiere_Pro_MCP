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

/** The literal regex list out of the panel's validateScript. */
function panelRejectPatterns(): RegExp[] {
  const source = realFs.readFileSync(PANEL, 'utf8');
  const start = source.indexOf('var dangerous = [');
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('[', start), source.indexOf(']', start) + 1);

  const patterns = [...body.matchAll(/\/(.+?)\/([a-z]*)\s*,?\s*$/gm)]
    .map((m) => new RegExp(m[1], m[2]));

  expect(patterns.length).toBeGreaterThan(4);
  return patterns;
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
    expect((await generatedScript()).length).toBeLessThanOrEqual(500000);
  });
});
