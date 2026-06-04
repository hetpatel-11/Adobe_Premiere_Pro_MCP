/**
 * Track targeting and track info tool tests.
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';

jest.mock('../../bridge/index.js');

describe('track targeting tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes focused track targeting tools without adding duplicate raw/QE helpers', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'set_target_track',
      'get_target_tracks',
      'set_all_tracks_targeted',
      'rename_track',
      'get_track_info'
    ]));
    expect(toolNames).toContain('razor_timeline_at_time');
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'razor_all_tracks',
      'execute_extendscript',
      'evaluate_expression',
      'sendRawCommand'
    ]));
  });

  it('rejects invalid track targeting inputs before bridge execution', async () => {
    const emptySequenceId = await tools.executeTool('get_target_tracks', { sequenceId: '' });
    const invalidTrackType = await tools.executeTool('set_target_track', { trackType: 'subtitle', trackIndex: 0, targeted: true });
    const invalidTrackIndex = await tools.executeTool('set_target_track', { trackType: 'video', trackIndex: -1, targeted: true });
    const invalidAllTrackType = await tools.executeTool('set_all_tracks_targeted', { trackType: 'subtitle', targeted: true });
    const emptyName = await tools.executeTool('rename_track', { trackType: 'audio', trackIndex: 0, name: '' });

    expect(emptySequenceId.success).toBe(false);
    expect(invalidTrackType.success).toBe(false);
    expect(invalidTrackIndex.success).toBe(false);
    expect(invalidAllTrackType.success).toBe(false);
    expect(emptyName.success).toBe(false);
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('sets a target track with explicit sequence and readback diagnostics', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, targeted: true });

    const result = await tools.executeTool('set_target_track', {
      sequenceId: 'seq-1',
      trackType: 'video',
      trackIndex: 2,
      targeted: true
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __setTargetTrack()');
    expect(script).toContain('__resolveTrackSequence(payload.sequenceId)');
    expect(script).toContain('"trackType":"video"');
    expect(script).toContain('"trackIndex":2');
    expect(script).toContain('track.setTargeted(payload.targeted, payload.trackType === "video");');
    expect(script).toContain('track.isTargeted();');
  });

  it('reads target tracks and sets all tracks targeted using scoped track-type filters', async () => {
    mockBridge.executeScript
      .mockResolvedValueOnce({ success: true, video: [], audio: [] })
      .mockResolvedValueOnce({ success: true, affected: 2 });

    await tools.executeTool('get_target_tracks', { sequenceId: 'seq-1' });
    await tools.executeTool('set_all_tracks_targeted', { sequenceId: 'seq-1', trackType: 'audio', targeted: false });

    const getScript = mockBridge.executeScript.mock.calls[0][0];
    const setAllScript = mockBridge.executeScript.mock.calls[1][0];
    expect(getScript).toContain('(function __getTargetTracks()');
    expect(getScript).toContain('track.isTargeted();');
    expect(getScript).toContain('targets.video.push');
    expect(getScript).toContain('targets.audio.push');
    expect(setAllScript).toContain('(function __setAllTracksTargeted()');
    expect(setAllScript).toContain('payload.trackType !== "audio"');
    expect(setAllScript).toContain('payload.trackType !== "video"');
    expect(setAllScript).toContain('track.setTargeted(payload.targeted, isVideo);');
  });

  it('renames tracks with escaped names and verifies the postcondition', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, newName: 'Dialogue "A"' });

    const result = await tools.executeTool('rename_track', {
      sequenceId: 'seq-1',
      trackType: 'audio',
      trackIndex: 0,
      name: 'Dialogue "A"'
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __renameTrack()');
    expect(script).toContain('"name":"Dialogue \\"A\\""');
    expect(script).toContain('track.name = payload.name;');
    expect(script).toContain('postconditionVerified: verifiedName === payload.name');
  });

  it('gets detailed single-track info including clips, transitions, lock/mute, and targeting state', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, clipCount: 1 });

    const result = await tools.executeTool('get_track_info', {
      sequenceId: 'seq-1',
      trackType: 'video',
      trackIndex: 1
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __getTrackInfo()');
    expect(script).toContain('track.clips.numItems');
    expect(script).toContain('__ticksToSeconds(clip.start.ticks)');
    expect(script).toContain('track.isLocked()');
    expect(script).toContain('track.isMuted()');
    expect(script).toContain('track.isTargeted();');
    expect(script).toContain('track.transitions.numItems');
  });
});
