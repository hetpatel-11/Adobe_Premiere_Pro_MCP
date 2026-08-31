import { PremiereProTools } from '../../tools/index.js';
import { executeExpandedTool } from '../../tools/expanded.js';
import { PremiereProBridge } from '../../bridge/index.js';

jest.mock('../../bridge/index.js');

describe('clip replace, move, and sequence-from-clips scripts', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('restores trim, enabled, and Motion when replace_clip preserveEffects is default true', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, replaced: true });
    await tools.executeTool('replace_clip', {
      clipId: 'clip-1',
      newProjectItemId: 'item-2',
    });
    const script = mockBridge.executeScript.mock.calls[0][0] as string;
    expect(script).toContain('clip.remove(false, true)');
    expect(script).toContain('destTrack.overwriteClip(newItem, saved.start)');
    expect(script).toContain('writeMotion(placed, saved.motion)');
    expect(script).toContain('placed.inPoint = timeFromSeconds(saved.inPoint)');
    expect(script).toContain('placed.disabled = saved.disabled');
    expect(script).not.toContain('_preserveEffects');
  });

  it('does not restore settings when replace_clip preserveEffects is false', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, replaced: true });
    await tools.executeTool('replace_clip', {
      clipId: 'clip-1',
      newProjectItemId: 'item-2',
      preserveEffects: false,
    });
    const script = mockBridge.executeScript.mock.calls[0][0] as string;
    expect(script).toContain('if (false)');
    expect(script).toContain('preserveEffects: false');
  });

  it('refuses an occupied destination and restores trim in move_clip_to_track', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true });
    await executeExpandedTool(mockBridge, 'move_clip_to_track', {
      clipId: 'clip-1',
      trackIndex: 2,
    });
    const script = mockBridge.executeScript.mock.calls[0][0] as string;
    expect(script).toContain('if (__idsMatch(other.nodeId, moveTrackClip.clip.nodeId)) continue');
    expect(script).toContain('Pass overwrite:true');
    expect(script).toContain('destTrack.overwriteClip(moveItem, moveStart)');
    expect(script).toContain('placed.inPoint = secondsToTime(moveIn)');
    expect(script).not.toContain('moveTrackClip.sequence.overwriteClip');
    expect(script).not.toContain('beforeTargetCount');
  });

  it('parses JSON-encoded clip id arrays for create_sequence_from_clips', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true });
    await executeExpandedTool(mockBridge, 'create_sequence_from_clips', {
      clipIds: '["000f4241","000f4242"]',
      name: 'From clips',
    });
    const script = mockBridge.executeScript.mock.calls[0][0] as string;
    expect(script).toContain('function expandIdList(value) {');
    expect(script).toContain('return __expandIdList(value);');
    expect(script).toContain('mergeIds(args.clipIds)');
  });
});
