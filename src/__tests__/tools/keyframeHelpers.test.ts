/**
 * Phase 7 keyframe helper tests.
 */

import { PremiereProTools } from '../../tools/index.js';
import { PremiereProBridge } from '../../bridge/index.js';

jest.mock('../../bridge/index.js');

describe('Phase 7 keyframe helper tools', () => {
  let tools: PremiereProTools;
  let mockBridge: jest.Mocked<PremiereProBridge>;

  beforeEach(() => {
    mockBridge = new PremiereProBridge() as jest.Mocked<PremiereProBridge>;
    tools = new PremiereProTools(mockBridge);
    jest.clearAllMocks();
  });

  it('exposes selector-based keyframe helper tools in the public catalog', () => {
    const toolNames = tools.getAvailableTools().map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining([
      'set_effect_keyframes',
      'set_keyframe_interpolation',
      'get_effect_value_at_time',
    ]));
  });

  it('rejects non-monotonic bulk keyframes before calling the bridge', async () => {
    const result = await tools.executeTool('set_effect_keyframes', {
      clipId: 'clip-123',
      componentName: 'Motion',
      propertyName: 'Scale',
      keyframes: [
        { time: 2, value: 125 },
        { time: 1, value: 100 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid arguments');
    expect(result.error).toContain('keyframes must be in strictly increasing time order');
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('rejects non-finite bulk keyframe values before calling the bridge', async () => {
    const result = await tools.executeTool('set_effect_keyframes', {
      clipId: 'clip-123',
      componentName: 'Motion',
      propertyName: 'Scale',
      keyframes: [
        { time: 0, value: Number.NaN },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid arguments');
    expect(mockBridge.executeScript).not.toHaveBeenCalled();
  });

  it('sets multiple numeric keyframes using sequence-aware component/property selectors', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      supported: true,
      clipId: 'clip-123',
      sequenceId: 'seq-456',
      keyframeCount: 2,
      keyframes: [
        { time: 0, value: 100 },
        { time: 1.5, value: 125 },
      ],
    });

    const result = await tools.executeTool('set_effect_keyframes', {
      clipId: 'clip-123',
      sequenceId: 'seq-456',
      componentMatchName: 'AE.ADBE Motion',
      propertyIndex: 1,
      keyframes: [
        { time: 0, value: 100 },
        { time: 1.5, value: 125 },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.keyframeCount).toBe(2);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('__findClip("clip-123", "seq-456")');
    expect(script).toContain('__findComponent');
    expect(script).toContain('__findEffectProperty');
    expect(script).toContain('areKeyframesSupported');
    expect(script).toContain('setTimeVarying(true)');
    expect(script).toContain('addKey(time)');
    expect(script).toContain('setValueAtKey(time, keyframe.value, true)');
    expect(script).toContain('getKeys');
    expect(script).toContain('componentMatchName');
    expect(script).toContain('propertyIndex');
  });

  it('guards keyframe interpolation support and maps friendly interpolation names', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      supported: true,
      interpolation: 'hold',
    });

    const result = await tools.executeTool('set_keyframe_interpolation', {
      clipId: 'clip-123',
      sequenceId: 'seq-456',
      componentName: 'Motion',
      propertyName: 'Scale',
      time: 1.5,
      interpolation: 'hold',
    });

    expect(result.success).toBe(true);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('__findClip("clip-123", "seq-456")');
    expect(script).toContain('setInterpolationTypeAtKey');
    expect(script).toContain('supported: false');
    expect(script).toContain('interpolationCode = 4');
  });

  it('reads an interpolated effect value at a requested time with selector diagnostics', async () => {
    mockBridge.executeScript.mockResolvedValue({
      success: true,
      supported: true,
      value: 112.5,
      time: 0.75,
    });

    const result = await tools.executeTool('get_effect_value_at_time', {
      clipId: 'clip-123',
      sequenceId: 'seq-456',
      componentIndex: 0,
      propertyMatchName: 'AE.ADBE Opacity',
      time: 0.75,
    });

    expect(result.success).toBe(true);
    expect(result.value).toBe(112.5);
    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).toContain('__findClip("clip-123", "seq-456")');
    expect(script).toContain('__findComponent');
    expect(script).toContain('__findEffectProperty');
    expect(script).toContain('getValueAtTime(time)');
    expect(script).toContain('availableProperties');
  });

  it('escapes line-separator characters in shared keyframe lookup script literals', async () => {
    const hostile = 'clip-\u2028-line-\u2029-end';
    mockBridge.executeScript.mockResolvedValue({ success: true, supported: true });

    await tools.executeTool('set_effect_keyframes', {
      clipId: hostile,
      sequenceId: hostile,
      componentName: `Motion-${hostile}`,
      propertyName: `Scale-${hostile}`,
      keyframes: [{ time: 0, value: 1 }],
    });

    const script = mockBridge.executeScript.mock.calls[0][0];
    expect(script).not.toContain('\u2028');
    expect(script).not.toContain('\u2029');
    expect(script).toContain('\\u2028');
    expect(script).toContain('\\u2029');
  });
});
