/**
 * Color management tools. The calls they make were proven live on Premiere
 * 26.5.2 while setting up HLG projects:
 *   Project.setLogColorManagement(1), setGraphicsWhiteLuminance(203) and
 *   setLUTInterpolationMethod(1) saved exactly the ColorManagementSettings of a
 *   hand-built HLG project; getSupportedGraphicsWhiteLuminances() returned
 *   100,203,300 and getSupportedLUTInterpolationMethods() 0,1.
 *   Sequence workingColorSpace is a ColorSpace object chosen from
 *   workingColorSpaceList ("Rec. 709", "Rec. 2100 HLG", "Rec. 2100 PQ", "ACEScct").
 */

import { PremiereProTools } from '../../tools/index.js';

describe('color management tools', () => {
  let tools: PremiereProTools;
  let bridge: { executeScript: jest.Mock };

  beforeEach(() => {
    bridge = { executeScript: jest.fn().mockResolvedValue({ success: true }) };
    tools = new PremiereProTools(bridge as any);
  });

  const scriptFor = async (name: string, args: Record<string, unknown>): Promise<string> => {
    await tools.executeTool(name, args);
    return bridge.executeScript.mock.calls[0][0] as string;
  };

  it('picks the working color space object from the list by name', async () => {
    const script = await scriptFor('set_sequence_color_settings', { sequenceId: 'seq', workingColorSpace: 'Rec. 2100 HLG' });

    expect(script).toContain('String(list[i].name) === wantSpace');
    expect(script).toContain('settings.workingColorSpace = match;');
    expect(script).not.toContain('settings.workingColorSpace = wantSpace');
  });

  it('reads sequence settings back and reports what did not apply', async () => {
    const script = await scriptFor('set_sequence_color_settings', { sequenceId: 'seq', compositeLinearColor: false, autoToneMapEnabled: true });

    expect(script).toContain('var after = readSequenceColor(sequence);');
    expect(script).toContain('notApplied.push("autoToneMapEnabled")');
    expect(script).toContain('var wantLinear = false;');
    expect(script).toContain('var wantToneMap = true;');
  });

  it('maps tetrahedral to LUT interpolation 1 and verifies it', async () => {
    const script = await scriptFor('set_project_color_management', { lutInterpolation: 'tetrahedral', graphicsWhiteLuminance: 203 });

    expect(script).toContain('var lut = 1;');
    expect(script).toContain('var white = 203;');
    expect(script).toContain('project.getLUTInterpolationMethod()) === lut');
    expect(script).toContain('getSupportedGraphicsWhiteLuminances()');
  });

  it('says log color management is not verifiable rather than claiming it was', async () => {
    const script = await scriptFor('set_project_color_management', { logColorManagement: 1 });

    expect(script).toContain('project.setLogColorManagement(log);');
    expect(script).toContain('logColorManagementVerified: false');
  });

  it('rejects graphics white values Premiere does not offer before reaching the host', async () => {
    const result = await tools.executeTool('set_project_color_management', { graphicsWhiteLuminance: 250 });

    expect(result.success).toBe(false);
    expect(bridge.executeScript).not.toHaveBeenCalled();
  });

  it('reports a project item\'s color spaces and Input LUT id when asked', async () => {
    const script = await scriptFor('get_color_management', { projectItemId: 'C4681.MP4' });

    expect(script).toContain('item.getOriginalColorSpace()');
    expect(script).toContain('item.getOverrideColorSpace()');
    expect(script).toContain('item.getInputLUTID()');
  });
});
