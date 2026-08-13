/**
 * set_sequence_settings used to compare width and height, write nothing at all,
 * and answer "Requested sequence settings already match the active Premiere
 * sequence" — which was false twice over: frameRate and pixelAspectRatio were
 * never examined, and the sequence being operated on is the resolved one, not
 * whatever happens to be active. Any frame-size change was refused outright on
 * the grounds that Premiere cannot resize a sequence after creation, which is
 * also untrue.
 *
 * Types verified against 26.0.2, because two of these fields reject or silently
 * corrupt the obvious value:
 *   videoFrameRate         a Time; must be assigned a STRING of ticks per frame.
 *                          Assigning the number is accepted and then reads back
 *                          as 2^63 ticks, i.e. a frame rate of 2.75e-08.
 *   videoPixelAspectRatio  an "N:M" string. A number throws "Illegal Parameter
 *                          type". Every ratio string tried was accepted verbatim.
 *   videoFrameWidth/Height plain numbers, and they really do resize the sequence.
 */

import { PremiereProTools } from '../../tools/index.js';

describe('set_sequence_settings', () => {
  let tools: PremiereProTools;
  let bridge: { executeScript: jest.Mock };

  beforeEach(() => {
    bridge = { executeScript: jest.fn().mockResolvedValue({ success: true }) };
    tools = new PremiereProTools(bridge as any);
  });

  const scriptFor = async (settings: Record<string, unknown>): Promise<string> => {
    await tools.executeTool('set_sequence_settings', { sequenceId: 'seq', settings });
    return bridge.executeScript.mock.calls[0][0] as string;
  };

  it('assigns the frame rate as a string of ticks, not a number', async () => {
    const script = await scriptFor({ frameRate: 25 });

    expect(script).toContain('settingsObject.videoFrameRate = String(');
    expect(script).not.toContain('settingsObject.videoFrameRate = Math.round(');
  });

  it('converts a numeric pixel aspect ratio to an N:M string', async () => {
    const script = await scriptFor({ pixelAspectRatio: 1.5 });

    expect(script).toContain('settingsObject.videoPixelAspectRatio = parText;');
    expect(script).toContain('parText.indexOf(":") === -1');
  });

  it('accepts a ratio string without mangling it', async () => {
    // z.number() alone rejected "16:9" at the schema before reaching the host.
    const result = await tools.executeTool('set_sequence_settings', {
      sequenceId: 'seq', settings: { pixelAspectRatio: '16:9' },
    });

    expect(result.success).not.toBe(false);
    expect(bridge.executeScript).toHaveBeenCalled();
  });

  it('writes the settings rather than only comparing them', async () => {
    const script = await scriptFor({ width: 1280, height: 720 });

    expect(script).toContain('sequence.setSettings(settingsObject)');
    expect(script).toContain('settingsObject.videoFrameWidth = Number(');
    expect(script).toContain('settingsObject.videoFrameHeight = Number(');
  });

  it('no longer claims frame size cannot be changed after creation', async () => {
    const script = await scriptFor({ width: 1280, height: 720 });

    // Match the emitted values, not the prose: the comment explaining what this
    // replaced quotes both of the old strings.
    expect(script).not.toContain('error: "set_sequence_settings: Sequence frame size cannot');
    expect(script).not.toContain('message: "Requested sequence settings already match');
  });

  it('reads the values back and reports any field that did not take', async () => {
    // Several of these accept an assignment and keep their old value, so the
    // write is not evidence that anything changed.
    const script = await scriptFor({ frameRate: 25 });

    expect(script).toContain('var after = readSettings(sequence);');
    expect(script).toContain('accepted the assignment but did not apply');
  });

  it('says so plainly when nothing recognisable was supplied', async () => {
    const script = await scriptFor({ nonsense: 1 });

    expect(script).toContain('No recognised settings were supplied');
    expect(script).toContain('supported: ["width", "height", "frameRate", "pixelAspectRatio"]');
  });
});
