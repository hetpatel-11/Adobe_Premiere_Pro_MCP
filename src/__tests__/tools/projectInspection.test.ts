/**
 * Project/media inspection tool tests.
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';

jest.mock('../../bridge/index.js');

describe('project and media inspection tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes read-only inspection helpers without destructive project/media tools', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'get_full_project_overview',
      'get_bin_contents',
      'get_project_item_info',
      'search_project_items'
    ]));
    expect(toolNames).toEqual(expect.arrayContaining([
      'list_project_items',
      'get_project_info',
      'scan_conform_media_metadata'
    ]));
    expect(toolNames).not.toEqual(expect.arrayContaining([
      'set_offline',
      'delete_bin',
      'close_project',
      'import_ae_comps',
      'execute_extendscript'
    ]));
  });

  it('rejects invalid inspection inputs before bridge execution', async () => {
    const emptyBin = await tools.executeTool('get_bin_contents', { binId: '' });
    const emptyItem = await tools.executeTool('get_project_item_info', { projectItemId: '' });
    const invalidSearchType = await tools.executeTool('search_project_items', { itemType: 'sequence' });
    const invalidSearchLimit = await tools.executeTool('search_project_items', { maxResults: 0 });
    const invalidLabel = await tools.executeTool('search_project_items', { colorLabel: 99 });

    expect(emptyBin.success).toBe(false);
    expect(emptyItem.success).toBe(false);
    expect(invalidSearchType.success).toBe(false);
    expect(invalidSearchLimit.success).toBe(false);
    expect(invalidLabel.success).toBe(false);
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('builds a full project overview script with recursive bins, sequence stats, and offline counts', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, totalItems: 0, sequences: [] });

    const result = await tools.executeTool('get_full_project_overview', {});

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __getFullProjectOverview()');
    expect(script).toContain('function __walkProjectBin');
    expect(script).toContain('function __countProjectItems');
    expect(script).toContain('project.sequences.numSequences');
    expect(script).toContain('mediaFileTypes');
    expect(script).toContain('offlineItems');
    expect(script).toContain('binTree');
    expect(script).not.toContain('app.project.delete');
    expect(script).not.toContain('setOffline');
  });

  it('reads bin contents by id/name/path with recursive item details', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, itemCount: 1, items: [] });

    const result = await tools.executeTool('get_bin_contents', { binId: 'Footage/Raw "A"', recursive: false });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __getBinContents()');
    expect(script).toContain('"binId":"Footage/Raw \\"A\\""');
    expect(script).toContain('function __findProjectBin');
    expect(script).toContain('function __itemInspectionSummary');
    expect(script).toContain('payload.recursive');
    expect(script).toContain('item.getFootageInterpretation()');
    expect(script).toContain('item.getMediaPath()');
    expect(script).toContain('item.isOffline()');
  });

  it('gets project item info with metadata/proxy/marker diagnostics', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, name: 'shot.mov' });

    const result = await tools.executeTool('get_project_item_info', { projectItemId: 'item-1' });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __getProjectItemInfo()');
    expect(script).toContain('__findProjectItem(payload.projectItemId)');
    expect(script).toContain('item.getProjectMetadata()');
    expect(script).toContain('item.getXMPMetadata()');
    expect(script).toContain('item.getFootageInterpretation()');
    expect(script).toContain('item.hasProxy()');
    expect(script).toContain('item.getMarkers()');
    expect(script).toContain('metadataTruncated');
  });

  it('searches project items with query, extension, offline, color, type, and max-result filters', async () => {
    mockBridge.executeScript.mockResolvedValue({ success: true, resultCount: 1, items: [] });

    const result = await tools.executeTool('search_project_items', {
      query: 'shot',
      extension: '.mov',
      offlineOnly: true,
      colorLabel: 5,
      itemType: 'clip',
      maxResults: 25
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('(function __searchProjectItems()');
    expect(script).toContain('"query":"shot"');
    expect(script).toContain('"extension":"mov"');
    expect(script).toContain('"offlineOnly":true');
    expect(script).toContain('"colorLabel":5');
    expect(script).toContain('"itemType":"clip"');
    expect(script).toContain('"maxResults":25');
    expect(script).toContain('if (results.length >= payload.maxResults) return;');
    expect(script).toContain('item.name.toLowerCase().indexOf(query) === -1');
    expect(script).toContain('item.getColorLabel() !== payload.colorLabel');
    expect(script).toContain('item.isOffline()');
  });
});
