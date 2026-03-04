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
