/**
 * The file-queue handoff between the server and the CEP panel.
 *
 * The protocol is a directory of command-<id>.json and response-<id>.json files
 * polled by both sides, so every failure here is a race or a partial read rather
 * than a logic error, and each one was visible in practice: stale response files
 * accumulated in the bridge directory, and a malformed payload was reported as
 * "Ensure Premiere Pro is open".
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';
import path from 'path';

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

describe('bridge file-queue protocol', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const dir = '/tmp/premiere-mcp-bridge-test';
  const commandPath = path.join(dir, 'command-test-uuid-1234.json');
  const responsePath = path.join(dir, 'response-test-uuid-1234.json');
  const stagingPath = path.join(dir, '.tmp-test-uuid-1234.json');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = dir;
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
  });

  const readyBridge = async (): Promise<PremiereProBridge> => {
    const bridge = new PremiereProBridge();
    await bridge.initialize();
    return bridge;
  };

  describe('publishing a command', () => {
    it('renames into place rather than writing the polled name directly', async () => {
      // The panel picks up anything matching command-*.json the moment it appears.
      // Writing that name directly publishes it before the content is complete.
      mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
      const bridge = await readyBridge();

      await bridge.executeScript('return 1;');

      expect(mockFs.writeFile).toHaveBeenCalledWith(stagingPath, expect.any(String));
      expect(mockFs.writeFile).not.toHaveBeenCalledWith(commandPath, expect.any(String));
      expect(mockFs.rename).toHaveBeenCalledWith(stagingPath, commandPath);
    });

    it('stages under a name the panel will not mistake for a command', async () => {
      // The panel matches on a "command-" prefix, so the scratch name must not
      // start with one or it defeats the point of staging.
      mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
      const bridge = await readyBridge();

      await bridge.executeScript('return 1;');

      const staged = mockFs.writeFile.mock.calls[0][0] as string;
      expect(path.basename(staged).startsWith('command-')).toBe(false);
    });

    it('removes the scratch file when the rename into place fails', async () => {
      // Nothing else ever matches that name, so a failed rename leaves it on disk
      // for good. The shared bridge directory is not removed on shutdown, so these
      // accumulate there indefinitely.
      mockFs.rename.mockRejectedValue(new Error('EXDEV'));
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;')).rejects.toThrow();

      expect(mockFs.unlink).toHaveBeenCalledWith(stagingPath);
    });
  });

  describe('a response that will not parse', () => {
    it('recovers from a torn read once the whole file lands', async () => {
      const whole = JSON.stringify({ result: { ok: true } });
      mockFs.readFile
        .mockResolvedValueOnce(whole.slice(0, 12) as any)  // caught mid-write
        .mockResolvedValue(whole as any);
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;')).resolves.toEqual({ ok: true });
    });

    it('reports the payload, not a connection problem, when it never parses', async () => {
      // Previously every failure here fell through to the same timeout message,
      // sending the reader to check whether Premiere was running when the real
      // problem was the bytes on disk.
      mockFs.readFile.mockResolvedValue('{"result": "unterminated' as any);
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;', 500)).rejects.toThrow(
        /never became valid JSON/,
      );
      await expect(bridge.executeScript('return 1;', 500)).rejects.toThrow(
        /Last parse error/,
      );
    });

    it('includes what was actually on disk so the payload can be diagnosed', async () => {
      mockFs.readFile.mockResolvedValue('NOT JSON AT ALL' as any);
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;', 500)).rejects.toThrow(
        /NOT JSON AT ALL/,
      );
    });
  });

  describe('cleanup', () => {
    it('removes both files when the response never arrives', async () => {
      // Cleanup used to sit after the await, so a timeout skipped it entirely and
      // the response file was left behind once the panel finally wrote one.
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;', 400)).rejects.toThrow(/timeout/i);

      expect(mockFs.unlink).toHaveBeenCalledWith(commandPath);
      expect(mockFs.unlink).toHaveBeenCalledWith(responsePath);
    });
    it('removes both files on the ordinary path too', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ result: { ok: true } }));
      const bridge = await readyBridge();

      await bridge.executeScript('return 1;');

      expect(mockFs.unlink).toHaveBeenCalledWith(commandPath);
      expect(mockFs.unlink).toHaveBeenCalledWith(responsePath);
    });

    it('does not let a cleanup failure mask the result', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ result: { ok: true } }));
      mockFs.unlink.mockRejectedValue(new Error('EPERM'));
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;')).resolves.toEqual({ ok: true });
    });
  });

  describe('panel heartbeat', () => {
    const heartbeatPath = path.join(dir, 'bridge-heartbeat.json');

    it('fails in a couple of seconds when Premiere is not listening, instead of hanging for a minute', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      const bridge = await readyBridge();
      const started = Date.now();

      await expect(bridge.executeScript('return 1;', 20000)).rejects.toThrow(
        /MCP Bridge is not running/,
      );

      expect(Date.now() - started).toBeLessThan(5000);
    });

    it('tells the caller to click Start Bridge when the panel is open but idle', async () => {
      mockFs.readFile.mockImplementation(async (file) => {
        if (String(file) === heartbeatPath) {
          return JSON.stringify({ t: Date.now(), started: false });
        }
        throw new Error('ENOENT');
      });
      const bridge = await readyBridge();

      await expect(bridge.executeScript('return 1;', 20000)).rejects.toThrow(
        /click Start Bridge/i,
      );
    });

    it('keeps waiting when the panel is alive and working on the command', async () => {
      mockFs.readFile.mockImplementation(async (file) => {
        if (String(file) === heartbeatPath) {
          return JSON.stringify({ t: Date.now(), started: true });
        }
        throw new Error('ENOENT');
      });
      const bridge = await readyBridge();
      const started = Date.now();

      await expect(bridge.executeScript('return 1;', 700)).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeGreaterThanOrEqual(700);
    });
  });
});
