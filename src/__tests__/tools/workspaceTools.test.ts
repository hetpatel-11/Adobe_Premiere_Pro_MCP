/**
 * Phase 8 workspace utility tests.
 */

import { PremiereProTools } from '../../tools/index.js';
import { PremiereProBridge } from '../../bridge/index.js';

jest.mock('../../bridge/index.js');

describe('Phase 8 workspace utility tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes non-destructive workspace tools in the public catalog', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'get_workspaces',
      'set_workspace',
    ]));
  });

  it('lists workspaces with capability-honest unsupported diagnostics', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      supported: true,
      workspaces: ['Editing', 'Color'],
      count: 2,
    });

    const result = await tools.executeTool('get_workspaces', {});

    expect(result.success).toBe(true);
    expect(result.workspaces).toEqual(['Editing', 'Color']);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('typeof app.getWorkspaces !== "function"');
    expect(script).toContain('supported: false');
    expect(script).toContain('app.getWorkspaces()');
  });

  it('requires a workspace name before calling the bridge', async () => {
    const result = await tools.executeTool('set_workspace', { name: '' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid arguments');
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('sets a workspace only through the verified app workspace API', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      supported: true,
      workspace: 'Editing',
      availableWorkspaces: ['Editing', 'Color'],
      mutationAttempted: true,
      postconditionVerified: false,
      readbackSupported: false,
    });

    const result = await tools.executeTool('set_workspace', { name: 'Editing' });

    expect(result.success).toBe(true);
    expect(result.workspace).toBe('Editing');
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('typeof app.setWorkspace !== "function"');
    expect(script).toContain('success: false');
    expect(script).toContain('supported: false');
    expect(script).toContain('app.setWorkspace("Editing")');
    expect(script).toContain('availableWorkspaces');
    expect(script).toContain('requestedWorkspaceAvailable');
    expect(script).toContain('availableWorkspaces.length === 0');
    expect(script).toContain('mutationAttempted: false');
    expect(script).toContain('postconditionVerified');
    expect(script).toContain('readbackSupported');
  });
});
