/**
 * Unit tests for PremiereProBridge
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock the fs module
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

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234')
}));

describe('PremiereProBridge', () => {
  let bridge: PremiereProBridge;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    bridge = new PremiereProBridge();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create bridge instance with default settings', () => {
      expect(bridge).toBeInstanceOf(PremiereProBridge);
    });
  });

  describe('initialize()', () => {
    it('should successfully initialize the bridge', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));

      await bridge.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/premiere-bridge', { recursive: true });
    });

    it('should throw error if temp directory creation fails', async () => {
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(bridge.initialize()).rejects.toThrow('Permission denied');
    });
  });

  describe('executeScript()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should throw error if bridge not initialized', async () => {
      const uninitializedBridge = new PremiereProBridge();

      await expect(uninitializedBridge.executeScript('test script'))
        .rejects.toThrow('Bridge not initialized');
    });

    it('should write command file and wait for response', async () => {
      const mockResponse = { success: true, data: 'test' };
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockResponse));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.executeScript('test script');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/tmp/premiere-bridge/command-test-uuid-1234.json',
        expect.stringContaining('test script')
      );
      expect(result).toEqual(mockResponse);
    });

    it('should clean up command and response files after execution', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true }));
      mockFs.unlink.mockResolvedValue(undefined);

      await bridge.executeScript('test script');

      expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/premiere-bridge/command-test-uuid-1234.json');
      expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/premiere-bridge/response-test-uuid-1234.json');
    });

    it('should timeout if response not received', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      mockFs.unlink.mockResolvedValue(undefined);

      // Use a very short timeout for testing
      const timeoutPromise = bridge.executeScript('test script');

      await expect(timeoutPromise).rejects.toThrow();
    }, 35000);
  });

  describe('createProject()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should create a new project', async () => {
      const mockProject = {
        id: 'proj-123',
        name: 'Test Project',
        path: '/path/to/project.prproj',
        isOpen: true,
        sequences: [],
        projectItems: []
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockProject));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.createProject('Test Project', '/path/to');

      expect(result).toEqual(mockProject);
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('openProject()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should open an existing project', async () => {
      const mockProject = {
        id: 'proj-456',
        name: 'Existing Project',
        path: '/path/to/existing.prproj',
        isOpen: true,
        sequences: [],
        projectItems: []
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockProject));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.openProject('/path/to/existing.prproj');

      expect(result).toEqual(mockProject);
    });
  });

  describe('saveProject()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should save the current project', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ success: true }));
      mockFs.unlink.mockResolvedValue(undefined);

      await bridge.saveProject();

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('importMedia()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should import a media file', async () => {
      const mockItem = {
        id: 'item-123',
        name: 'video.mp4',
        type: 'footage',
        mediaPath: '/path/to/video.mp4',
        duration: 10.5,
        frameRate: 29.97
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockItem));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.importMedia('/path/to/video.mp4');

      expect(result).toEqual(mockItem);
    });
  });

  describe('createSequence()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should create a new sequence', async () => {
      const mockSequence = {
        id: 'seq-123',
        name: 'Main Sequence',
        duration: 0,
        frameRate: 29.97,
        videoTracks: [],
        audioTracks: []
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSequence));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.createSequence('Main Sequence');

      expect(result).toEqual(mockSequence);
    });

    it('should create sequence with custom preset', async () => {
      const mockSequence = {
        id: 'seq-456',
        name: 'HD Sequence',
        duration: 0,
        frameRate: 29.97,
        videoTracks: [],
        audioTracks: []
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSequence));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.createSequence('HD Sequence', '/path/to/preset.sqpreset');

      expect(result).toEqual(mockSequence);
    });
  });

  describe('addToTimeline()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should add a clip to timeline', async () => {
      const mockClip = {
        id: 'clip-123',
        name: 'video.mp4',
        inPoint: 0,
        outPoint: 10.5,
        duration: 10.5,
        mediaPath: '/path/to/video.mp4'
      };

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockClip));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.addToTimeline('seq-123', 'item-456', 0, 0);

      expect(result).toEqual(mockClip);
    });
  });

  describe('renderSequence()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should render a sequence', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ success: true }));
      mockFs.unlink.mockResolvedValue(undefined);

      await bridge.renderSequence('seq-123', '/path/to/output.mp4', '/path/to/preset.epr');

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('listProjectItems()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should list all project items', async () => {
      const mockItems = [
        { id: 'item-1', name: 'video1.mp4', type: 'footage' },
        { id: 'item-2', name: 'video2.mp4', type: 'footage' }
      ];

      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: true, items: mockItems }));
      mockFs.unlink.mockResolvedValue(undefined);

      const result = await bridge.listProjectItems();

      expect(result).toEqual(mockItems);
    });

    it('should throw error if listing fails', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ ok: false, error: 'No project open' }));
      mockFs.unlink.mockResolvedValue(undefined);

      await expect(bridge.listProjectItems()).rejects.toThrow('No project open');
    });
  });

  describe('cleanup()', () => {
    beforeEach(async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.access.mockRejectedValue(new Error('Not found'));
      await bridge.initialize();
    });

    it('should clean up temp directory', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      await bridge.cleanup();

      expect(mockFs.rm).toHaveBeenCalledWith('/tmp/premiere-bridge', { recursive: true });
    });

    it('should not throw if cleanup fails', async () => {
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      await expect(bridge.cleanup()).resolves.not.toThrow();
    });
  });
});
