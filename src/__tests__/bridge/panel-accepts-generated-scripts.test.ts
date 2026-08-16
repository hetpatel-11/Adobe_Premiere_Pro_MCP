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
import { loadPanel } from '../helpers/panel.js';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(), access: jest.fn(), readdir: jest.fn(), writeFile: jest.fn(),
    readFile: jest.fn(), unlink: jest.fn(), rename: jest.fn(), rm: jest.fn(),
  }
}));

jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid-1234') }));

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

  it('is accepted by the panel validator itself', async () => {
    // The panel's own validateScript is called rather than its rules re-derived
    // here. Reading the pattern list and the length ceiling out of the source
    // both looked right and both passed while the real validator rejected every
    // call -- one because patterns moved into a second array, the other because a
    // doc comment restated the old ceiling above a lower real one.
    const script = await generatedScript();
    const { bridge } = loadPanel();

    expect(typeof bridge.validateScript).toBe('function');
    expect(bridge.validateScript(script)).toBe(true);
  });

  it('is rejected when it carries something the panel refuses', async () => {
    // A positive control on the validator itself: if this passes, validateScript
    // is not actually inspecting the script and the assertion above proves
    // nothing. The wording below is what once made the panel refuse every call.
    const script = await generatedScript();
    const { bridge } = loadPanel();

    expect(bridge.validateScript(`${script}\n// the only stringify in the process.`)).toBe(false);
    expect(bridge.validateScript(`${script}\nvar x = eval("1");`)).toBe(false);
  });
});
