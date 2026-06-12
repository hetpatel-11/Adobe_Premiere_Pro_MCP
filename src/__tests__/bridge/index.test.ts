/**
 * Unit tests for PremiereProBridge
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { createSecureTempDir } from '../../utils/security.js';
import { promises as fs } from 'fs';
import { join } from 'path';

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
  }
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234')
}));

describe('PremiereProBridge', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  // The bridge builds file paths with path.join(), so expectations must use the
  // platform-native separator to stay green on Windows as well as macOS/Linux.
  const TEST_TEMP_DIR = '/tmp/premiere-mcp-bridge-test';
  const COMMAND_FILE = join(TEST_TEMP_DIR, 'command-test-uuid-1234.json');
  const RESPONSE_FILE = join(TEST_TEMP_DIR, 'response-test-uuid-1234.json');

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = TEST_TEMP_DIR;
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
  });

  it('initializes using the configured temp directory', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();

    expect(mockFs.mkdir).toHaveBeenCalledWith(TEST_TEMP_DIR, {
      recursive: true,
      mode: 0o700
    });
  });

  it('writes and cleans up command and response files during executeScript', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result = await bridge.executeScript('return JSON.stringify({ ok: true });');

    expect(result).toEqual({ ok: true });
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('return JSON.stringify')
    );
    expect(mockFs.unlink).toHaveBeenCalledWith(COMMAND_FILE);
    expect(mockFs.unlink).toHaveBeenCalledWith(RESPONSE_FILE);
  });

  it('preserves self-invoking scripts instead of double-wrapping them', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.executeScript('(function(){ return JSON.stringify({ ok: true }); })();');

    expect(mockFs.writeFile).toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('(function(){ return JSON.stringify({ ok: true }); })();')
    );
    expect(mockFs.writeFile).not.toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('(function(){\n(function(){ return JSON.stringify({ ok: true }); })();\n})();')
    );
  });

  it('passes through importMedia responses', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: true,
      id: 'item-123',
      name: 'video.mp4'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result = await bridge.importMedia('/path/to/video.mp4');

    expect(result.success).toBe(true);
    expect(result.id).toBe('item-123');
  });

  it('blocks modal-prone unsupported subtitle imports before writing a command', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();
    const result: any = await bridge.importMedia('/path/to/captions.ass');

    expect(result.success).toBe(false);
    expect(result.blockedBeforePremiere).toBe(true);
    expect(result.error).toContain('Unsupported import format ".ass"');
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it('creates projects using a concrete .prproj path and verifies activation', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: false,
      error: 'Premiere Pro did not create or activate the requested project',
      projectPath: '/tmp/projects/Test.prproj'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result: any = await bridge.createProject('Test', '/tmp/projects/');

    expect(result.success).toBe(false);
    expect(result.projectPath).toBe('/tmp/projects/Test.prproj');
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('app.newProject(projectPath)')
    );
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('Premiere Pro did not create or activate the requested project')
    );
  });

  it('opens projects only after verifying the requested path became active', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: false,
      error: 'Premiere Pro did not activate the requested project',
      projectPath: '/tmp/projects/Target.prproj',
      actualPath: '/tmp/projects/AlreadyOpen.prproj'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result: any = await bridge.openProject('/tmp/projects/Target.prproj');

    expect(result.success).toBe(false);
    expect(result.actualPath).toBe('/tmp/projects/AlreadyOpen.prproj');
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('app.openDocument(projectPath)')
    );
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      COMMAND_FILE,
      expect.stringContaining('Premiere Pro did not activate the requested project')
    );
  });

  it('creates sequences with guarded ExtendScript and safe arguments', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: true,
      id: 'seq-123',
      name: 'Safe Sequence'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result: any = await bridge.createSequence('Safe Sequence');
    const commandPayload = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);

    expect(result.success).toBe(true);
    expect(result.id).toBe('seq-123');
    expect(commandPayload.script).toContain('try {');
    expect(commandPayload.script).toContain('app.project.createNewSequence(sequenceName, presetPath || "")');
    expect(commandPayload.script).toContain('Sequence creation completed but the new sequence could not be located');
  });

  it('does not delete externally managed temp directories during cleanup', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();
    await bridge.cleanup();

    expect(mockFs.rm).not.toHaveBeenCalled();
  });

  it('deletes generated temp directories when no external temp dir is configured', async () => {
    delete process.env.PREMIERE_TEMP_DIR;
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.rm.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.cleanup();

    expect(mockFs.rm).toHaveBeenCalledWith(createSecureTempDir('test-uuid-1234'), { recursive: true });
  });
});
