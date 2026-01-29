/**
 * Unit tests for PremiereProTools
 */

import { PremiereProTools } from '../../tools/index.js';
import { PremiereProBridge } from '../../bridge/index.js';

// Mock the bridge
jest.mock('../../bridge/index.js');

describe('PremiereProTools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  describe('getAvailableTools()', () => {
    it('should return array of tools', () => {
      const availableTools = tools.getAvailableTools();

      expect(Array.isArray(availableTools)).toBe(true);
      expect(availableTools.length).toBeGreaterThan(0);
    });

    it('should include all tool categories', () => {
      const availableTools = tools.getAvailableTools();
      const toolNames = availableTools.map(t => t.name);

      // Discovery Tools
      expect(toolNames).toContain('list_project_items');
      expect(toolNames).toContain('list_sequences');
      expect(toolNames).toContain('list_sequence_tracks');
      expect(toolNames).toContain('get_project_info');

      // Project Management
      expect(toolNames).toContain('create_project');
      expect(toolNames).toContain('open_project');
      expect(toolNames).toContain('save_project');
      expect(toolNames).toContain('save_project_as');

      // Media Management
      expect(toolNames).toContain('import_media');
      expect(toolNames).toContain('import_folder');
      expect(toolNames).toContain('create_bin');

      // Sequence Management
      expect(toolNames).toContain('create_sequence');
      expect(toolNames).toContain('duplicate_sequence');
      expect(toolNames).toContain('delete_sequence');

      // Timeline Operations
      expect(toolNames).toContain('add_to_timeline');
      expect(toolNames).toContain('remove_from_timeline');
      expect(toolNames).toContain('move_clip');
      expect(toolNames).toContain('trim_clip');
      expect(toolNames).toContain('split_clip');

      // Effects & Transitions
      expect(toolNames).toContain('apply_effect');
      expect(toolNames).toContain('remove_effect');
      expect(toolNames).toContain('add_transition');

      // Audio Operations
      expect(toolNames).toContain('adjust_audio_levels');
      expect(toolNames).toContain('add_audio_keyframes');
      expect(toolNames).toContain('mute_track');

      // Color Correction
      expect(toolNames).toContain('color_correct');
      expect(toolNames).toContain('apply_lut');

      // Export & Rendering
      expect(toolNames).toContain('export_sequence');
      expect(toolNames).toContain('export_frame');

      // Advanced Features
      expect(toolNames).toContain('create_multicam_sequence');
      expect(toolNames).toContain('create_proxy_media');
      expect(toolNames).toContain('stabilize_clip');
      expect(toolNames).toContain('speed_change');
    });

    it('should have valid tool structure', () => {
      const availableTools = tools.getAvailableTools();

      availableTools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
      });
    });
  });

  describe('executeTool()', () => {
    it('should return error for unknown tool', async () => {
      const result = await tools.executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    it('should validate arguments using schema', async () => {
      // This would typically throw a Zod validation error
      // The actual implementation might vary
      const result = await tools.executeTool('create_project', {});

      expect(result.success).toBe(false);
    });

    it('should handle tool execution errors gracefully', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Bridge error'));

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });
  });

  describe('Discovery Tools', () => {
    describe('list_project_items', () => {
      it('should list project items successfully', async () => {
        const mockResponse = {
          success: true,
          items: [
            { id: '1', name: 'clip1.mp4', type: 'footage' },
            { id: '2', name: 'clip2.mp4', type: 'footage' }
          ],
          bins: [],
          totalItems: 2,
          totalBins: 0
        };

        mockBridge.executeScript.mockResolvedValue(mockResponse);

        const result = await tools.executeTool('list_project_items', {
          includeBins: true,
          includeMetadata: false
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result).toEqual(mockResponse);
      });
    });

    describe('list_sequences', () => {
      it('should list all sequences', async () => {
        const mockResponse = {
          success: true,
          sequences: [
            { id: 'seq1', name: 'Sequence 01', frameRate: 29.97 }
          ]
        };

        mockBridge.executeScript.mockResolvedValue(mockResponse);

        const result = await tools.executeTool('list_sequences', {});

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result).toEqual(mockResponse);
      });
    });

    describe('get_project_info', () => {
      it('should get project information', async () => {
        const mockResponse = {
          success: true,
          name: 'Test Project',
          path: '/path/to/project.prproj'
        };

        mockBridge.executeScript.mockResolvedValue(mockResponse);

        const result = await tools.executeTool('get_project_info', {});

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result).toEqual(mockResponse);
      });
    });
  });

  describe('Project Management Tools', () => {
    describe('create_project', () => {
      it('should create a new project', async () => {
        const mockResponse = {
          success: true,
          projectId: 'proj-123'
        };

        mockBridge.createProject = jest.fn().mockResolvedValue(mockResponse);

        const result = await tools.executeTool('create_project', {
          name: 'New Project',
          location: '/path/to/projects'
        });

        expect(result.success).toBe(true);
      });
    });

    describe('open_project', () => {
      it('should open existing project', async () => {
        const mockResponse = {
          success: true,
          projectId: 'proj-456'
        };

        mockBridge.openProject = jest.fn().mockResolvedValue(mockResponse);

        const result = await tools.executeTool('open_project', {
          path: '/path/to/project.prproj'
        });

        expect(result.success).toBe(true);
      });
    });

    describe('save_project', () => {
      it('should save current project', async () => {
        mockBridge.saveProject = jest.fn().mockResolvedValue(undefined);

        const result = await tools.executeTool('save_project', {});

        expect(result.success).toBe(true);
      });
    });
  });

  describe('Media Management Tools', () => {
    describe('import_media', () => {
      it('should import media file', async () => {
        const mockResponse = {
          id: 'item-123',
          name: 'video.mp4',
          type: 'footage'
        };

        mockBridge.importMedia = jest.fn().mockResolvedValue(mockResponse);

        const result = await tools.executeTool('import_media', {
          filePath: '/path/to/video.mp4'
        });

        expect(result.success).toBe(true);
      });

      it('should import media into specific bin', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          itemId: 'item-456'
        });

        const result = await tools.executeTool('import_media', {
          filePath: '/path/to/video.mp4',
          binName: 'Raw Footage'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
      });
    });

    describe('create_bin', () => {
      it('should create a new bin', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          binId: 'bin-123'
        });

        const result = await tools.executeTool('create_bin', {
          name: 'New Bin'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Sequence Management Tools', () => {
    describe('create_sequence', () => {
      it('should create a new sequence', async () => {
        const mockResponse = {
          id: 'seq-123',
          name: 'Main Sequence',
          frameRate: 29.97
        };

        mockBridge.createSequence = jest.fn().mockResolvedValue(mockResponse);

        const result = await tools.executeTool('create_sequence', {
          name: 'Main Sequence'
        });

        expect(result.success).toBe(true);
      });
    });

    describe('delete_sequence', () => {
      it('should delete a sequence', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('delete_sequence', {
          sequenceId: 'seq-123'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Timeline Operations Tools', () => {
    describe('add_to_timeline', () => {
      it('should add clip to timeline', async () => {
        const mockResponse = {
          id: 'clip-123',
          name: 'video.mp4'
        };

        mockBridge.addToTimeline = jest.fn().mockResolvedValue(mockResponse);

        const result = await tools.executeTool('add_to_timeline', {
          sequenceId: 'seq-123',
          projectItemId: 'item-456',
          trackIndex: 0,
          time: 0
        });

        expect(result.success).toBe(true);
      });
    });

    describe('split_clip', () => {
      it('should split clip at time', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          clips: ['clip-123', 'clip-456']
        });

        const result = await tools.executeTool('split_clip', {
          clipId: 'clip-123',
          time: 5.5
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Effects & Transitions Tools', () => {
    describe('apply_effect', () => {
      it('should apply effect to clip', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          effectId: 'effect-123'
        });

        const result = await tools.executeTool('apply_effect', {
          clipId: 'clip-123',
          effectName: 'Gaussian Blur'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('add_transition', () => {
      it('should add transition between clips', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          transitionId: 'trans-123'
        });

        const result = await tools.executeTool('add_transition', {
          fromClipId: 'clip-1',
          toClipId: 'clip-2',
          transitionType: 'crossDissolve'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Audio Tools', () => {
    describe('adjust_audio_levels', () => {
      it('should adjust audio volume', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('adjust_audio_levels', {
          clipId: 'clip-123',
          volume: -3.0
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('mute_track', () => {
      it('should mute audio track', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('mute_track', {
          trackId: 'track-123',
          mute: true
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Color Correction Tools', () => {
    describe('color_correct', () => {
      it('should apply color correction', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('color_correct', {
          clipId: 'clip-123',
          brightness: 10,
          contrast: 5,
          saturation: 15
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('apply_lut', () => {
      it('should apply LUT to clip', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('apply_lut', {
          clipId: 'clip-123',
          lutPath: '/path/to/lut.cube'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Export Tools', () => {
    describe('export_sequence', () => {
      it('should export sequence to file', async () => {
        mockBridge.renderSequence = jest.fn().mockResolvedValue(undefined);

        const result = await tools.executeTool('export_sequence', {
          sequenceId: 'seq-123',
          outputPath: '/path/to/output.mp4',
          presetPath: '/path/to/preset.epr'
        });

        expect(result.success).toBe(true);
      });
    });

    describe('export_frame', () => {
      it('should export single frame', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          framePath: '/path/to/frame.png'
        });

        const result = await tools.executeTool('export_frame', {
          sequenceId: 'seq-123',
          time: 5.0,
          outputPath: '/path/to/frame.png'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Advanced Features Tools', () => {
    describe('create_multicam_sequence', () => {
      it('should create multicam sequence', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true,
          sequenceId: 'multi-seq-123'
        });

        const result = await tools.executeTool('create_multicam_sequence', {
          name: 'Multicam Edit',
          cameraFiles: ['/cam1.mp4', '/cam2.mp4', '/cam3.mp4'],
          syncMethod: 'audio'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('speed_change', () => {
      it('should change clip speed', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('speed_change', {
          clipId: 'clip-123',
          speed: 200,
          maintainAudio: false
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('stabilize_clip', () => {
      it('should stabilize video clip', async () => {
        mockBridge.executeScript.mockResolvedValue({
          success: true
        });

        const result = await tools.executeTool('stabilize_clip', {
          clipId: 'clip-123',
          method: 'warpStabilizer'
        });

        expect(mockBridge.executeScript).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle script execution errors', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Premiere Pro error'));

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });

    it('should include error details in response', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Connection lost'));

      const result = await tools.executeTool('save_project', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection lost');
      expect(result.tool).toBe('save_project');
    });
  });
});
