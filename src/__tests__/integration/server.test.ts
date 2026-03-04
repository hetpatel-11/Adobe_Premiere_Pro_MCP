/**
 * Integration tests for the MCP building blocks
 */

import { PremiereProBridge } from '../../bridge/index.js';
import { PremiereProTools } from '../../tools/index.js';
import { PremiereProResources } from '../../resources/index.js';
import { PremiereProPrompts } from '../../prompts/index.js';

jest.mock('../../bridge/index.js');

describe('MCP Adobe Premiere Pro Integration', () => {
  let mockBridge: jest.Mocked<PremiereProBridge>;
  let tools: PremiereProTools;
  let resources: PremiereProResources;
  let prompts: PremiereProPrompts;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    resources = new PremiereProResources(mockBridge);
    prompts = new PremiereProPrompts();
    jest.clearAllMocks();
  });

  it('exposes a healthy tool, resource, and prompt catalog', () => {
    expect(tools.getAvailableTools().length).toBeGreaterThan(50);
    expect(resources.getAvailableResources().length).toBe(12);
    expect(prompts.getAvailablePrompts().length).toBe(10);
  });

  it('executes a read-only tool through the shared bridge', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      items: [],
      bins: [],
      totalItems: 0,
      totalBins: 0
    });

    const result = await tools.executeTool('list_project_items', {});

    expect(result.success).toBe(true);
    expect(mockBridge.executeScript).toHaveBeenCalled();
  });

  it('supports the high-level motion graphics demo workflow', async () => {
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
    mockBridge.executeScript.mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

    const result = await tools.executeTool('build_motion_graphics_demo', {
      sequenceName: 'Demo Sequence'
    });

    expect(result.success).toBe(true);
    expect(result.sequence.id).toBe('seq-1');
    expect(result.placements).toHaveLength(3);
  });

  it('supports assembling a product spot from real assets', async () => {
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
    mockBridge.executeScript.mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

    const result = await tools.executeTool('assemble_product_spot', {
      sequenceName: 'Product Spot',
      assetPaths: ['/a.mp4', '/b.mp4'],
      clipDuration: 4
    });

    expect(result.success).toBe(true);
    expect(result.placements).toHaveLength(2);
  });

  it('supports assembling a brand spot from assets without a mogrt', async () => {
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
    mockBridge.executeScript.mockResolvedValue({ success: true, videoTracks: [], audioTracks: [] });

    const result = await tools.executeTool('build_brand_spot_from_mogrt_and_assets', {
      sequenceName: 'Brand Spot',
      assetPaths: ['/a.mp4', '/b.mp4']
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Brand spot assembled successfully');
    expect(result.overlays[0].skipped).toBe(true);
  });

  it('reads resources through the shared bridge', async () => {
    mockBridge.executeScript.mockResolvedValue({
      id: 'proj-123',
      name: 'Test Project'
    });

    const result = await resources.readResource('premiere://project/info');

    expect(result.name).toBe('Test Project');
  });

  it('generates prompts', async () => {
    const result = await prompts.getPrompt('create_video_project', {
      project_type: 'commercial'
    });

    expect(result.description).toBeTruthy();
    expect(result.messages.length).toBeGreaterThan(0);
  });
});
