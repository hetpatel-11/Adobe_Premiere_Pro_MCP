import { spawn, execFile } from 'node:child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { joinPremiereHostPath, PremiereProBridge } from '../../bridge/index.js';

function stubProcessPlatform(value: NodeJS.Platform): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    configurable: true,
    enumerable: true,
    value,
  });
  return () => {
    if (descriptor) Object.defineProperty(process, 'platform', descriptor);
  };
}

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
  },
}));

jest.mock('node:crypto', () => ({ randomUUID: jest.fn(() => 'test-uuid-1234') }));

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn(),
}));

describe('ensureHost', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
  const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;
  const dir = '/tmp/premiere-mcp-bridge-test';
  const heartbeatPath = path.join(dir, 'bridge-heartbeat.json');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = dir;
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('missing'));
    mockFs.readdir.mockResolvedValue([] as never);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockExecFile.mockImplementation(((
      _file: string,
      _args: readonly string[] | undefined,
      _opts: unknown,
      callback?: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const cb = typeof _opts === 'function' ? _opts : callback;
      const err = Object.assign(new Error('not running'), { code: 1 });
      if (cb) cb(err, '', '');
      return {} as never;
    }) as never);
    mockSpawn.mockReturnValue({ unref: jest.fn() } as never);
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
  });

  it('is ready when the panel heartbeat is already started', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({ t: Date.now(), started: true }));
    const bridge = new PremiereProBridge();
    await bridge.initialize();
    const result = await bridge.ensureHost({ launchIfNeeded: false, waitMs: 10 });
    expect(result.ready).toBe(true);
    expect(result.status).toBe('connected');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('asks the user to open Premiere when it is not installed', async () => {
    mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
    const bridge = new PremiereProBridge();
    await bridge.initialize();
    const result = await bridge.ensureHost({ launchIfNeeded: true, waitMs: 10 });
    expect(result.ready).toBe(false);
    expect(result.userActionRequired).toBe(true);
    expect(result.agentAction).toBe('tell_user');
    expect(result.nextStep).toMatch(/not installed/i);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('joins Premiere launch paths with the stubbed platform separators', () => {
    const restoreDarwin = stubProcessPlatform('darwin');
    try {
      expect(joinPremiereHostPath('/Applications', 'Adobe Premiere Pro 2026', 'Adobe Premiere Pro 2026.app'))
        .toBe('/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app');
    } finally {
      restoreDarwin();
    }

    const restoreWin32 = stubProcessPlatform('win32');
    try {
      expect(joinPremiereHostPath('C:\\Program Files', 'Adobe', 'Adobe Premiere Pro 2026', 'Adobe Premiere Pro.exe'))
        .toBe(path.win32.join('C:\\Program Files', 'Adobe', 'Adobe Premiere Pro 2026', 'Adobe Premiere Pro.exe'));
    } finally {
      restoreWin32();
    }
  });

  it('launches Premiere when an install path is found and the heartbeat is missing', async () => {
    const restore = stubProcessPlatform('darwin');
    try {
      const appPath = joinPremiereHostPath(
        '/Applications',
        'Adobe Premiere Pro 2026',
        'Adobe Premiere Pro 2026.app',
      );
      mockFs.readdir.mockImplementation(async (target) => {
        if (String(target) === '/Applications') return ['Adobe Premiere Pro 2026'] as never;
        if (String(target).includes('Adobe Premiere Pro 2026')) return ['Adobe Premiere Pro 2026.app'] as never;
        return [] as never;
      });
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockImplementation(async (file) => {
        if (String(file) === heartbeatPath) throw new Error('ENOENT');
        throw new Error('ENOENT');
      });

      const bridge = new PremiereProBridge();
      await bridge.initialize();
      const result = await bridge.ensureHost({ launchIfNeeded: true, waitMs: 20 });

      expect(mockSpawn).toHaveBeenCalledWith(
        'open',
        ['-a', appPath],
        expect.objectContaining({ detached: true }),
      );
      expect(appPath).toBe('/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app');
      expect(result.launched).toBe(true);
      expect(result.ready).toBe(false);
      expect(result.userActionRequired).toBe(true);
    } finally {
      restore();
    }
  });

  it('launches Premiere.exe when an install path is found on Windows', async () => {
    const restore = stubProcessPlatform('win32');
    try {
      const adobeRoot = joinPremiereHostPath(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe');
      const installDir = joinPremiereHostPath(adobeRoot, 'Adobe Premiere Pro 2026');
      const exe = joinPremiereHostPath(installDir, 'Adobe Premiere Pro.exe');
      mockFs.readdir.mockImplementation(async (target) => {
        if (String(target) === adobeRoot) return ['Adobe Premiere Pro 2026'] as never;
        return [] as never;
      });
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const bridge = new PremiereProBridge();
      await bridge.initialize();
      const result = await bridge.ensureHost({ launchIfNeeded: true, waitMs: 20 });

      expect(mockSpawn).toHaveBeenCalledWith(
        exe,
        [],
        expect.objectContaining({ detached: true }),
      );
      expect(exe.includes('/')).toBe(false);
      expect(result.launched).toBe(true);
      expect(result.ready).toBe(false);
      expect(result.userActionRequired).toBe(true);
    } finally {
      restore();
    }
  });
});
