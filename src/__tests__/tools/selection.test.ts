/**
 * Timeline selection tool tests.
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';

jest.mock('../../bridge/index.js');

describe('timeline selection tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes selection tools in the catalog without exposing raw scripting tools', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'select_clips_by_name',
      'select_all_clips',
      'deselect_all_clips',
      'select_clips_in_range',
      'select_clips_by_color',
      'invert_selection'
    ]));
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'execute_extendscript',
      'evaluate_expression',
      'inspect_dom_object',
      'sendRawCommand'
    ]));
  });

  it('rejects invalid selection inputs before bridge execution', async () => {
    const invalidTrackType = await tools.executeTool('select_all_clips', { trackType: 'subtitle' });
    const invalidTrackIndex = await tools.executeTool('select_clips_by_name', { name: 'clip', trackIndex: -1 });
    const invalidRange = await tools.executeTool('select_clips_in_range', { startTime: 5, endTime: 5 });
    const negativeRange = await tools.executeTool('select_clips_in_range', { startTime: -1, endTime: 1 });
    const invalidColor = await tools.executeTool('select_clips_by_color', { colorIndex: 16 });
    const emptySequenceId = await tools.executeTool('invert_selection', { sequenceId: '' });

    expect(invalidTrackType.success).toBe(false);
    expect(invalidTrackIndex.success).toBe(false);
    expect(invalidRange.success).toBe(false);
    expect(negativeRange.success).toBe(false);
    expect(invalidColor.success).toBe(false);
    expect(emptySequenceId.success).toBe(false);
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('selects clips by name with explicit sequence, matching options, and escaped payload data', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, selected: 2 });

    const result = await tools.executeTool('select_clips_by_name', {
      sequenceId: 'seq-1',
      name: 'Scene "A"\nTake',
      trackType: 'video',
      trackIndex: 1,
      addToSelection: true,
      caseSensitive: true
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __selectClipsByName()');
    expect(script).toContain('__resolveSelectionSequence(payload.sequenceId)');
    expect(script).toContain('"name":"Scene \\"A\\"\\nTake"');
    expect(script).toContain('payload.trackType !== "audio"');
    expect(script).toContain('clip.setSelected(true, true);');
    expect(script).toContain('clip.setSelected(false, true);');
    expect(script).toContain('haystack.indexOf(needle) !== -1');
  });

  it('builds select-all, deselect-all, and invert-selection scripts with sequence and track filters', async () => {
    mockBridge.executeScript
      .mockResolvedValueOnce({ success: true, selected: 3 })
      .mockResolvedValueOnce({ success: true, deselected: 3 })
      .mockResolvedValueOnce({ success: true, nowSelected: 1, nowDeselected: 2 });

    await tools.executeTool('select_all_clips', { sequenceId: 'seq-1', trackType: 'audio', trackIndex: 0 });
    await tools.executeTool('deselect_all_clips', { sequenceId: 'seq-1', trackType: 'both' });
    await tools.executeTool('invert_selection', { sequenceId: 'seq-1', trackType: 'video' });

    const selectAllScript = mockBridge.executeScript.mock.calls[0][0];
    const deselectAllScript = mockBridge.executeScript.mock.calls[1][0];
    const invertScript = mockBridge.executeScript.mock.calls[2][0];

    expect(selectAllScript).toContain('(function __selectAllClips()');
    expect(selectAllScript).toContain('clip.setSelected(true, true);');
    expect(selectAllScript).toContain('payload.trackType !== "video"');
    expect(deselectAllScript).toContain('(function __deselectAllClips()');
    expect(deselectAllScript).toContain('clip.setSelected(false, true);');
    expect(invertScript).toContain('(function __invertSelection()');
    expect(invertScript).toContain('clip.isSelected()');
    expect(invertScript).toContain('clip.setSelected(!selected, true);');
  });

  it('selects clips in a time range using overlap semantics', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, selected: 1 });

    const result = await tools.executeTool('select_clips_in_range', {
      sequenceId: 'seq-1',
      startTime: 10,
      endTime: 12,
      trackType: 'both',
      addToSelection: false
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __selectClipsInRange()');
    expect(script).toContain('clipStartSeconds < payload.endTime && clipEndSeconds > payload.startTime');
    expect(script).toContain('clip.setSelected(true, true);');
    expect(script).toContain('clip.setSelected(false, true);');
  });

  it('selects clips by color label and returns per-track selection counts', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, selected: 2, selectedVideo: 1, selectedAudio: 1 });

    const result = await tools.executeTool('select_clips_by_color', {
      sequenceId: 'seq-1',
      colorIndex: 5,
      trackType: 'both',
      addToSelection: false
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __selectClipsByColor()');
    expect(script).toContain('clip.projectItem.getColorLabel()');
    expect(script).toContain('colorLabel === payload.colorIndex');
    expect(script).toContain('selectedVideo');
    expect(script).toContain('selectedAudio');
  });
});
