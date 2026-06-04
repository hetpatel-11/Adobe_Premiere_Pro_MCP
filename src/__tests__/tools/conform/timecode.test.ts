import {
  framesToSeconds,
  framesToTimecode,
  normalizeFrameRate,
  parseTimecodeToFrames,
} from '../../../tools/conform/timecode.js';

describe('conform timecode helpers', () => {
  it('parses non-drop HH:MM:SS:FF timecode into integer frames', () => {
    const rate = normalizeFrameRate({ numerator: 24, denominator: 1 });

    expect(parseTimecodeToFrames('01:00:00:00', rate)).toEqual({
      success: true,
      frames: 86400,
      dropFrame: false,
      warnings: [],
    });
    expect(parseTimecodeToFrames('01:00:10:12', rate).frames).toBe(86652);
  });

  it('round-trips integer frames to non-drop timecode text', () => {
    const rate = normalizeFrameRate(24);

    expect(framesToTimecode(86400, rate)).toBe('01:00:00:00');
    expect(framesToTimecode(86652, rate)).toBe('01:00:10:12');
  });

  it('keeps 23.976 as rational metadata while using integer nominal frames for timecode labels', () => {
    const rate = normalizeFrameRate({ numerator: 24000, denominator: 1001 });

    expect(rate.numerator).toBe(24000);
    expect(rate.denominator).toBe(1001);
    expect(rate.fps).toBeCloseTo(23.976, 3);
    expect(rate.nominalFps).toBe(24);
    expect(parseTimecodeToFrames('00:00:10:12', rate).frames).toBe(252);
    expect(framesToSeconds(24000, rate)).toBeCloseTo(1001, 9);
  });

  it('normalizes numeric 23.976 as a rational rate instead of rounding to 24fps for seconds math', () => {
    const rate = normalizeFrameRate(23.976);

    expect(rate.numerator).toBe(24000);
    expect(rate.denominator).toBe(1001);
    expect(framesToSeconds(24000, rate)).toBeCloseTo(1001, 9);
  });

  it('rejects malformed and out-of-range timecodes', () => {
    const rate = normalizeFrameRate(24);

    expect(parseTimecodeToFrames('bad', rate)).toMatchObject({ success: false });
    expect(parseTimecodeToFrames('00:00:00:24', rate)).toMatchObject({ success: false });
    expect(parseTimecodeToFrames('-01:00:00:00', rate)).toMatchObject({ success: false });
  });

  it('parses standard semicolon drop-frame notation with an explicit diagnostic warning', () => {
    const rate = normalizeFrameRate({ numerator: 30000, denominator: 1001, dropFrame: true });

    const parsed = parseTimecodeToFrames('01:00:00;00', rate);

    expect(parsed.success).toBe(true);
    expect(parsed.dropFrame).toBe(true);
    expect(parsed.frames).toBe(107892);
    expect(parsed.warnings).toContain('dropFrameTimecode');
  });

  it('warns but does not apply NTSC drop-frame math for semicolon timecode at non-NTSC rates', () => {
    const rate = normalizeFrameRate({ numerator: 24000, denominator: 1001, dropFrame: true });

    const parsed = parseTimecodeToFrames('00:01:00;00', rate);

    expect(parsed.success).toBe(true);
    expect(parsed.dropFrame).toBe(true);
    expect(parsed.frames).toBe(1440);
    expect(parsed.warnings).toContain('dropFrameTimecodeAtNonNtscRate');
    expect(parsed.warnings).not.toContain('dropFrameTimecode');
  });

  it('rejects illegal dropped frame labels at non-tenth minute boundaries', () => {
    const rate = normalizeFrameRate({ numerator: 30000, denominator: 1001, dropFrame: true });

    expect(parseTimecodeToFrames('00:01:00;00', rate)).toMatchObject({ success: false });
    expect(parseTimecodeToFrames('00:01:00;01', rate)).toMatchObject({ success: false });
    expect(parseTimecodeToFrames('00:10:00;00', rate)).toMatchObject({ success: true });
  });
});
