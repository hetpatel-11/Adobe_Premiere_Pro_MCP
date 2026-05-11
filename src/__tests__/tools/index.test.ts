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
      expect(toolNames).toContain('setup_ducking');
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
    it('surfaces create_project bridge failures instead of claiming success', async () => {
      mockBridge.createProject = jest.fn().mockResolvedValue({
        success: false,
        error: 'Premiere Pro did not create or activate the requested project',
        projectPath: '/tmp/Test.prproj'
      } as any);

      const result = await tools.executeTool('create_project', {
        name: 'Test',
        location: '/tmp'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('did not create');
      expect(result.projectPath).toBe('/tmp/Test.prproj');
    });

    it('surfaces open_project bridge failures instead of claiming success', async () => {
      mockBridge.openProject = jest.fn().mockResolvedValue({
        success: false,
        error: 'Premiere Pro did not activate the requested project',
        projectPath: '/tmp/Target.prproj',
        actualPath: '/tmp/AlreadyOpen.prproj'
      } as any);

      const result = await tools.executeTool('open_project', {
        path: '/tmp/Target.prproj'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('did not activate');
      expect(result.actualPath).toBe('/tmp/AlreadyOpen.prproj');
    });

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

    it('looks up clip properties in the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, properties: {} });

      const result = await tools.executeTool('get_clip_properties', {
        clipId: 'clip-123',
        sequenceId: 'seq-456'
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__findClip("clip-123", "seq-456")'));
    });

    it('removes clips from the requested sequence', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, clipId: 'clip-123' });

      const result = await tools.executeTool('remove_from_timeline', {
        clipId: 'clip-123',
        sequenceId: 'seq-456',
        deleteMode: 'lift'
      });

      expect(result.success).toBe(true);
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('__findClip("clip-123", "seq-456")'));
      expect(mockBridge.executeScript).toHaveBeenCalledWith(expect.stringContaining('var isRipple = "lift" === "ripple";'));
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
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(1, 'seq-2b', 'item-a', 1, 1.5, true);
      expect(mockBridge.addToTimeline).toHaveBeenNthCalledWith(2, 'seq-2b', 'item-b', 2, 3.6, true);
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

  describe('setup_ducking', () => {
    it('emits 4 keyframes per duck window plus boundaries (sustained-base curve)', async () => {
      // Bridge.executeScript is what addAudioKeyframes ultimately invokes; capture and inspect.
      mockBridge.executeScript.mockResolvedValue({ success: true, addedKeyframes: [], failedKeyframes: [] });

      const result = await tools.executeTool('setup_ducking', {
        clipId: 'music-1',
        baseDb: -25,
        duckingWindows: [
          { startTime: 40.5, endTime: 41.4, duckedDb: -38 },
          { startTime: 60.0, endTime: 61.5, duckedDb: -38 },
        ],
        fadeSeconds: 0.2,
        clipStartTime: 0,
        clipEndTime: 132,
      });

      // Expected keyframe times (sorted, deduped): 0, 40.3, 40.5, 41.4, 41.6, 59.8, 60.0, 61.5, 61.7, 132
      // → 10 keyframes total: 2 boundaries + 4×2 duck windows = 10
      expect(result.keyframes_emitted).toBe(10);
      expect(result.ducking_windows).toBe(2);
      expect(result.fade_seconds).toBe(0.2);
      expect(result.base_db).toBe(-25);

      const computed = result.computed_keyframes as Array<{ time: number; level: number }>;
      const times = computed.map((k) => k.time);

      // Boundaries sit at baseDb
      expect(computed[0]).toEqual({ time: 0, level: -25 });
      expect(computed[computed.length - 1]).toEqual({ time: 132, level: -25 });

      // Duck-in/out points sit at duckedDb
      const at = (t: number) => computed.find((k) => Math.abs(k.time - t) < 1e-9);
      expect(at(40.5)?.level).toBe(-38);
      expect(at(41.4)?.level).toBe(-38);
      expect(at(60.0)?.level).toBe(-38);
      expect(at(61.5)?.level).toBe(-38);

      // Fade points sit at baseDb
      expect(at(40.3)?.level).toBe(-25);
      expect(at(41.6)?.level).toBe(-25);
      expect(at(59.8)?.level).toBe(-25);
      expect(at(61.7)?.level).toBe(-25);

      // Times are monotonic
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeGreaterThan(times[i - 1]!);
      }
    });

    it('handles empty duckingWindows (sustained baseDb only, 2 boundary keyframes)', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, addedKeyframes: [], failedKeyframes: [] });

      const result = await tools.executeTool('setup_ducking', {
        clipId: 'music-empty',
        baseDb: -22,
        duckingWindows: [],
        clipStartTime: 0,
        clipEndTime: 60,
      });

      expect(result.keyframes_emitted).toBe(2);
      expect(result.computed_keyframes).toEqual([
        { time: 0, level: -22 },
        { time: 60, level: -22 },
      ]);
    });

    it('clamps pre-fade to clipStartTime when window starts before fadeSeconds', async () => {
      mockBridge.executeScript.mockResolvedValue({ success: true, addedKeyframes: [], failedKeyframes: [] });

      const result = await tools.executeTool('setup_ducking', {
        clipId: 'music-clamp',
        baseDb: -25,
        duckingWindows: [{ startTime: 0.1, endTime: 1.0, duckedDb: -38 }], // fade 0.2 would push pre-fade to -0.1
        fadeSeconds: 0.2,
        clipStartTime: 0,
        clipEndTime: 5,
      });

      const computed = result.computed_keyframes as Array<{ time: number; level: number }>;
      // The dedup map collapses pre-fade@0 with boundary@0 — both want baseDb so it's fine
      const at = (t: number) => computed.find((k) => Math.abs(k.time - t) < 1e-9);
      expect(at(0)?.level).toBe(-25); // boundary + pre-fade collapsed
      expect(at(0.1)?.level).toBe(-38); // duck-in
      expect(at(1.0)?.level).toBe(-38); // duck-out
      expect(at(1.2)?.level).toBe(-25); // post-fade
    });
  });

  describe('export_sequence', () => {
    // Pre-fix bugs (commit 6 of PR #14):
    //   1. Wrapper accepted no presetPath and silently substituted "H.264" / "ProRes"
    //      string literals — Adobe encodeSequence requires absolute .epr path.
    //   2. Wrapper unconditionally returned {success:true} even when bridge.renderSequence
    //      reported {success:false} — false-positive that hid AME-never-received errors.

    it('rejects calls without presetPath instead of substituting a string literal', async () => {
      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/presetPath required/);
      expect(result.hint).toMatch(/\.epr/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('rejects calls without presetPath even when format is "mp4" (no H.264 fallback)', async () => {
      // Pre-fix: format=mp4 → defaultPreset="H.264" string literal sent to encodeSequence.
      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        format: 'mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/presetPath required/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('propagates bridge {success:false} response instead of claiming success', async () => {
      mockBridge.renderSequence.mockResolvedValue({
        success: false,
        error: 'encodeSequence returned no jobID — preset path may be invalid or AME not connected',
        outputPath: '/tmp/out.mp4',
        presetPath: '/path/that/does/not/exist.epr',
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        presetPath: '/path/that/does/not/exist.epr',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/encodeSequence returned no jobID/);
      expect(result.sequenceId).toBe('seq-1');
    });

    it('returns success with jobID when bridge confirms AME queue accepted', async () => {
      mockBridge.renderSequence.mockResolvedValue({
        success: true,
        queued: true,
        jobID: 'job-abc-123',
        outputPath: '/tmp/out.mp4',
        presetPath: '/Users/me/preset.epr',
      });

      const result = await tools.executeTool('export_sequence', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        presetPath: '/Users/me/preset.epr',
      });

      expect(result.success).toBe(true);
      expect(result.jobID).toBe('job-abc-123');
      expect(result.queued).toBe(true);
      expect(result.message).toMatch(/queued in Adobe Media Encoder/);
      expect(mockBridge.renderSequence).toHaveBeenCalledWith(
        'seq-1',
        '/tmp/out.mp4',
        '/Users/me/preset.epr',
      );
    });
  });

  describe('add_to_render_queue', () => {
    // add_to_render_queue delegates to exportSequence — same fixes apply transitively.
    it('rejects calls without presetPath (delegates to exportSequence guard)', async () => {
      const result = await tools.executeTool('add_to_render_queue', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/presetPath required/);
      expect(mockBridge.renderSequence).not.toHaveBeenCalled();
    });

    it('propagates bridge failure responses through the delegation', async () => {
      mockBridge.renderSequence.mockResolvedValue({
        success: false,
        error: 'app.encoder not available in this Premiere build',
      });

      const result = await tools.executeTool('add_to_render_queue', {
        sequenceId: 'seq-1',
        outputPath: '/tmp/out.mp4',
        presetPath: '/Users/me/preset.epr',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/app.encoder not available/);
    });
  });
});
