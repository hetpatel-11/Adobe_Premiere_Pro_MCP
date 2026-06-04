/**
 * Source Monitor tool tests.
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';

jest.mock('../../bridge/index.js');

describe('source monitor tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes the source monitor tool catalog without exposing raw scripting tools', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'open_in_source_monitor',
      'close_source_monitor',
      'close_all_source_clips',
      'set_source_monitor_in_out',
      'insert_source_monitor_clip',
      'overwrite_source_monitor_clip',
      'get_source_monitor_info'
    ]));
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'execute_extendscript',
      'evaluate_expression',
      'inspect_dom_object',
      'sendRawCommand'
    ]));
  });

  it('rejects invalid source monitor in/out requests before bridge execution', async () => {
    const noPoints = await tools.executeTool('set_source_monitor_in_out', {});
    const negativeIn = await tools.executeTool('set_source_monitor_in_out', { inSeconds: -1 });
    const invertedRange = await tools.executeTool('set_source_monitor_in_out', { inSeconds: 5, outSeconds: 4 });

    expect(noPoints.success).toBe(false);
    expect(negativeIn.success).toBe(false);
    expect(invertedRange.success).toBe(false);
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('opens a project item in the Source Monitor by project item id with escaped payload data', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, opened: true, projectItemId: 'item-1' });
    const projectItemId = 'item-"quoted"\nnext';

    const result = await tools.executeTool('open_in_source_monitor', { projectItemId });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __openInSourceMonitor()');
    expect(script).toContain('var payload = {"projectItemId":"item-\\"quoted\\"\\nnext"};');
    expect(script).toContain('__findProjectItem(payload.projectItemId)');
    expect(script).toContain('app.sourceMonitor.openProjectItem(item)');
  });

  it('sets Source Monitor in/out points with Premiere Time objects and media-type targeting', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, inSet: true, outSet: true });

    const result = await tools.executeTool('set_source_monitor_in_out', { inSeconds: 1.25, outSeconds: 3.5 });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __setSourceMonitorInOut()');
    expect(script).toContain('app.sourceMonitor.getProjectItem()');
    expect(script).toContain('inTime.seconds = payload.inSeconds;');
    expect(script).toContain('item.setInPoint(inTime.ticks, 4);');
    expect(script).toContain('outTime.seconds = payload.outSeconds;');
    expect(script).toContain('item.setOutPoint(outTime.ticks, 4);');
  });

  it('inserts and overwrites Source Monitor clips with explicit sequence, track, and time payloads', async () => {
    mockBridge.executeScript
      .mockResolvedValueOnce({ success: true, operation: 'insert' })
      .mockResolvedValueOnce({ success: true, operation: 'overwrite' });

    await tools.executeTool('insert_source_monitor_clip', {
      sequenceId: 'seq-1',
      videoTrackIndex: 2,
      audioTrackIndex: 1,
      time: 12.5
    });
    await tools.executeTool('overwrite_source_monitor_clip', {
      sequenceId: 'seq-1',
      videoTrackIndex: 0,
      audioTrackIndex: 0,
      time: 2
    });

    const insertScript = mockBridge.executeScript.mock.calls[0][0];
    const overwriteScript = mockBridge.executeScript.mock.calls[1][0];
    expect(insertScript).toContain('__findSequence(payload.sequenceId)');
    expect(insertScript).toContain('position.seconds = payload.time;');
    expect(insertScript).toContain('seq.insertClip(item, position.ticks, payload.videoTrackIndex, payload.audioTrackIndex);');
    expect(insertScript).toContain('operation: "insert"');
    expect(overwriteScript).toContain('seq.overwriteClip(item, position.ticks, payload.videoTrackIndex, payload.audioTrackIndex);');
    expect(overwriteScript).toContain('operation: "overwrite"');
  });

  it('builds close and info Source Monitor scripts through dedicated host APIs', async () => {
    mockBridge.executeScript
      .mockResolvedValueOnce({ success: true, closed: true })
      .mockResolvedValueOnce({ success: true, closedAll: true })
      .mockResolvedValueOnce({ success: true, loaded: false });

    await tools.executeTool('close_source_monitor', {});
    await tools.executeTool('close_all_source_clips', {});
    await tools.executeTool('get_source_monitor_info', { includeMetadata: true });

    expect(mockBridge.executeScript.mock.calls[0][0]).toContain('app.sourceMonitor.closeClip()');
    expect(mockBridge.executeScript.mock.calls[1][0]).toContain('app.sourceMonitor.closeAllClips()');
    const infoScript = mockBridge.executeScript.mock.calls[2][0];
    expect(infoScript).toContain('app.sourceMonitor.getProjectItem()');
    expect(infoScript).toContain('includeMetadata');
    expect(infoScript).toContain('item.getMediaPath()');
  });
});
