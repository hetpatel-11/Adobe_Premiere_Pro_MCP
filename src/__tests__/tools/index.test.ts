/**
 * Unit tests for PremiereProTools
 */

import { PremiereProTools } from '../../tools/index.js';
import { PremiereProBridge } from '../../bridge/index.js';

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
    it('returns the current tool catalog', () => {
      const availableTools = tools.getAvailableTools();
      const toolNames = availableTools.map((tool) => tool.name);

      expect(availableTools.length).toBeGreaterThan(50);
      expect(toolNames).toContain('list_project_items');
      expect(toolNames).toContain('build_motion_graphics_demo');
      expect(toolNames).toContain('assemble_product_spot');
      expect(toolNames).toContain('build_brand_spot_from_mogrt_and_assets');
      expect(toolNames).toContain('import_media');
      expect(toolNames).toContain('add_to_timeline');
      expect(toolNames).toContain('import_mogrt');
      expect(toolNames).not.toContain('create_nested_sequence');
      expect(toolNames).not.toContain('unnest_sequence');
    });

    it('returns valid tool metadata', () => {
      for (const tool of tools.getAvailableTools()) {
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  describe('executeTool()', () => {
    it('returns a clear error for unknown tools', async () => {
      const result = await tools.executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('validates tool arguments with zod', async () => {
      const result = await tools.executeTool('create_project', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('converts bridge exceptions into tool errors', async () => {
      mockBridge.executeScript.mockRejectedValue(new Error('Bridge error'));

      const result = await tools.executeTool('list_project_items', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed');
    });
  });

  describe('bridge-backed wrappers', () => {
    it('passes through successful imports', async () => {
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        success: true,
        id: 'item-123',
        name: 'video.mp4',
        type: 'footage',
        mediaPath: '/path/to/video.mp4'
      });

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(mockBridge.importMedia).toHaveBeenCalledWith('/path/to/video.mp4');
      expect(result.success).toBe(true);
      expect(result.id).toBe('item-123');
    });

    it('surfaces import failures instead of claiming success', async () => {
      mockBridge.importMedia = jest.fn().mockResolvedValue({
        success: false,
        error: 'Import failed'
      } as any);

      const result = await tools.executeTool('import_media', {
        filePath: '/path/to/video.mp4'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Import failed');
    });

    it('passes through successful timeline placement', async () => {
      mockBridge.addToTimeline = jest.fn().mockResolvedValue({
        success: true,
        id: 'clip-123',
        name: 'video.mp4'
      } as any);

      const result = await tools.executeTool('add_to_timeline', {
        sequenceId: 'seq-123',
        projectItemId: 'item-456',
        trackIndex: 0,
        time: 0
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe('clip-123');
    });

    it('surfaces timeline placement failures instead of claiming success', async () => {
      mockBridge.addToTimeline = jest.fn().mockResolvedValue({
        success: false,
        error: 'Track not found'
      } as any);

      const result = await tools.executeTool('add_to_timeline', {
        sequenceId: 'seq-123',
        projectItemId: 'item-456',
        trackIndex: 99,
        time: 0
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Track not found');
    });
  });

  describe('script-backed tools', () => {
    it('executes list_project_items', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        items: [],
        bins: [],
        totalItems: 0,
        totalBins: 0
      });

      const result = await tools.executeTool('list_project_items', {});

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('uses current argument names for split_clip', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        clips: ['clip-a', 'clip-b']
      });

      const result = await tools.executeTool('split_clip', {
        clipId: 'clip-123',
        splitTime: 5.5
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('supports razoring a timeline across multiple tracks', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        sequenceId: 'seq-123',
        time: 12.5,
        timecode: '00:00:12:15',
        cutVideoTracks: [0, 1],
        cutAudioTracks: [0, 2, 3]
      });

      const result = await tools.executeTool('razor_timeline_at_time', {
        sequenceId: 'seq-123',
        time: 12.5,
        videoTrackIndices: [0, 1],
        audioTrackIndices: [0, 2, 3]
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.cutVideoTracks).toEqual([0, 1]);
      expect(result.cutAudioTracks).toEqual([0, 2, 3]);
    });

    it('uses current argument names for add_transition', async () => {
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        transitionId: 'trans-123'
      });

      const result = await tools.executeTool('add_transition', {
        clipId1: 'clip-1',
        clipId2: 'clip-2',
        transitionName: 'Cross Dissolve',
        duration: 0.75
      });

      expect(mockBridge.executeScript).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('high-level workflow tools', () => {
    it('builds a motion graphics demo sequence', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-1',
        name: 'Demo Sequence'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-3', name: '03_finish.png' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-1', name: '01_focus.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-2', name: '02_precision.png' } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-3', name: '03_finish.png' } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_motion_graphics_demo', {
        sequenceName: 'Demo Sequence'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-1');
      expect(result.assets).toHaveLength(3);
      expect(mockBridge.importMedia).toHaveBeenCalledTimes(3);
      expect(mockBridge.addToTimeline).toHaveBeenCalledTimes(3);
    });

    it('assembles a product spot from provided assets', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-2',
        name: 'Product Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Product Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        clipDuration: 4,
        motionStyle: 'alternate'
      });

      expect(result.success).toBe(true);
      expect(result.sequence.id).toBe('seq-2');
      expect(result.imported).toHaveLength(2);
      expect(result.placements).toHaveLength(2);
    });

    it('supports directed clip plans without forcing template transitions or motion', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-2b',
        name: 'Directed Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 1.5, outPoint: 3.5 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 3.6, outPoint: 6.6 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('assemble_product_spot', {
        sequenceName: 'Directed Spot',
        assetPaths: ['/a.mp4', '/b.mp4'],
        clipPlan: [
          { assetIndex: 0, time: 1.5, trackIndex: 1, transitionAfter: { name: 'none' } },
          { assetIndex: 1, time: 3.6, trackIndex: 2 }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('directed clip plan');
      expect(result.transitions).toHaveLength(0);
      expect(result.animations).toHaveLength(0);
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(1, 'seq-2b', 'item-a', 1, 1.5);
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(2, 'seq-2b', 'item-b', 2, 3.6);
    });

    it('builds a brand spot from assets without requiring a mogrt', async () => {
      mockBridge.createSequence = jest.fn().mockResolvedValue({
        id: 'seq-3',
        name: 'Brand Spot'
      } as any);
      mockBridge.importMedia = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'item-a', name: 'a.mp4' } as any)
        .mockResolvedValueOnce({ success: true, id: 'item-b', name: 'b.mp4' } as any);
      mockBridge.addToTimeline = jest
        .fn()
        .mockResolvedValueOnce({ success: true, id: 'clip-a', name: 'a.mp4', inPoint: 0, outPoint: 4 } as any)
        .mockResolvedValueOnce({ success: true, id: 'clip-b', name: 'b.mp4', inPoint: 4, outPoint: 8 } as any);
      mockBridge.executeScript.mockResolvedValue({
        success: true,
        videoTracks: [],
        audioTracks: []
      });

      const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
        sequenceName: 'Brand Spot',
        assetPaths: ['/a.mp4', '/b.mp4']
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Brand spot assembled successfully');
      expect(result.sequence.id).toBe('seq-3');
      expect(result.overlays[0].skipped).toBe(true);
      expect(result.polish[0].skipped).toBe(true);
    });
  });
});
