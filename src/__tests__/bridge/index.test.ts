/**
 * Unit tests for PremiereProBridge
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';

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

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PREMIERE_TEMP_DIR = '/tmp/premiere-mcp-bridge-test';
  });

  afterEach(() => {
    delete process.env.PREMIERE_TEMP_DIR;
  });

  it('initializes using the configured temp directory', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));

    await bridge.initialize();

    expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/premiere-mcp-bridge-test', {
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
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
      expect.stringContaining('return JSON.stringify')
    );
    expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json');
    expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/premiere-mcp-bridge-test/response-test-uuid-1234.json');
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
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
      expect.stringContaining('(function(){ return JSON.stringify({ ok: true }); })();')
    );
    expect(mockFs.writeFile).not.toHaveBeenCalledWith(
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
      expect.stringContaining('(function(){\n(function(){ return JSON.stringify({ ok: true }); })();\n})();')
    );
  });

  it('preserves named self-invoking scripts so their return values reach CEP', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    await bridge.executeScript('(function __probeNativeTranscriptionCapabilities(){ return JSON.stringify({ ok: true }); })();');

    const commandPayload = JSON.parse(mockFs.writeFile.mock.calls[0][1] as string);
    expect(commandPayload.script).toContain('(function __probeNativeTranscriptionCapabilities(){ return JSON.stringify({ ok: true }); })();');
    expect(commandPayload.script).not.toContain('(function(){\n(function __probeNativeTranscriptionCapabilities()');
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
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
      expect.stringContaining('app.newProject(projectPath)')
    );
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
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
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
      expect.stringContaining('app.openDocument(projectPath)')
    );
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      '/tmp/premiere-mcp-bridge-test/command-test-uuid-1234.json',
      expect.stringContaining('Premiere Pro did not activate the requested project')
    );
  });

  it('creates sequences by importing a generated FCP7 XML instead of using modal-prone createNewSequence', async () => {
    const bridge = new PremiereProBridge();
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue(new Error('Not found'));
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      success: true,
      method: 'importFiles(FCP7 XML)',
      id: 'seq-123',
      name: 'Safe Sequence'
    }));
    mockFs.unlink.mockResolvedValue(undefined);

    await bridge.initialize();
    const result: any = await bridge.createSequence('Safe Sequence');
    const xmlWrite = mockFs.writeFile.mock.calls.find(call => String(call[0]).endsWith('.xml'));
    const commandWrite = mockFs.writeFile.mock.calls.find(call => String(call[0]).includes('/command-'));
    const commandPayload = JSON.parse(commandWrite?.[1] as string);

    expect(result.success).toBe(true);
    expect(result.id).toBe('seq-123');
    expect(result.method).toBe('importFiles(FCP7 XML)');
    expect(xmlWrite?.[0]).toEqual(expect.stringContaining('/tmp/premiere-mcp-bridge-test/mcp-sequence-'));
    expect(xmlWrite?.[1]).toEqual(expect.stringContaining('<xmeml version="4">'));
    expect(xmlWrite?.[1]).toEqual(expect.stringContaining('<name>Safe Sequence</name>'));
    expect(commandPayload.script).toContain('try {');
    expect(commandPayload.script).toContain('var requestedSequenceId = "mcp-sequence-');
    expect(commandPayload.script).toContain('app.project.importFiles([xmlFile.fsName], true, app.project.rootItem, false)');
    expect(commandPayload.script).toContain('importFiles(FCP7 XML)');
    expect(commandPayload.script).not.toContain('app.project.createNewSequence');
    expect(commandPayload.script).not.toContain('presetPath || ""');
    expect(mockFs.unlink).toHaveBeenCalledWith(xmlWrite?.[0]);
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

    expect(mockFs.rm).toHaveBeenCalledWith('/tmp/premiere-bridge-test-uuid-1234', { recursive: true });
  });
});
