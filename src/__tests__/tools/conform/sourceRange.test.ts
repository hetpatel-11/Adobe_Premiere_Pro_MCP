import { calculateOnlineSourceRange } from '../../../tools/conform/sourceRange.js';
import { normalizeFrameRate } from '../../../tools/conform/timecode.js';

describe('conform source range math', () => {
  const rate = normalizeFrameRate(24);

  it('calculates online source in/out when online media starts before the needed offline range', () => {
    const result = calculateOnlineSourceRange({
      offlineSourceStartFrame: 1000,
      offlineSourceInFrame: 48,
      offlineDurationFrames: 96,
      onlineSourceStartFrame: 900,
      onlineDurationFrames: 500,
      offlineFrameRate: rate,
      onlineFrameRate: rate,
      toleranceFrames: 0,
    });

    expect(result).toMatchObject({
      status: 'contained',
      onlineSourceInFrame: 148,
      onlineSourceOutFrame: 244,
      missingHeadFrames: 0,
      missingTailFrames: 0,
    });
  });

  it('returns source in zero when online starts exactly at the needed range', () => {
    const result = calculateOnlineSourceRange({
      offlineSourceStartFrame: 1000,
      offlineSourceInFrame: 48,
      offlineDurationFrames: 96,
      onlineSourceStartFrame: 1048,
      onlineDurationFrames: 300,
      offlineFrameRate: rate,
      onlineFrameRate: rate,
    });

    expect(result.status).toBe('contained');
    expect(result.onlineSourceInFrame).toBe(0);
    expect(result.onlineSourceOutFrame).toBe(96);
  });

  it('reports missing head handles separately from an unmatched range', () => {
    const result = calculateOnlineSourceRange({
      offlineSourceStartFrame: 1000,
      offlineSourceInFrame: 48,
      offlineDurationFrames: 96,
      onlineSourceStartFrame: 1060,
      onlineDurationFrames: 300,
      offlineFrameRate: rate,
      onlineFrameRate: rate,
    });

    expect(result.status).toBe('missingHandles');
    expect(result.missingHeadFrames).toBe(12);
    expect(result.missingTailFrames).toBe(0);
  });

  it('reports missing tail handles', () => {
    const result = calculateOnlineSourceRange({
      offlineSourceStartFrame: 1000,
      offlineSourceInFrame: 48,
      offlineDurationFrames: 96,
      onlineSourceStartFrame: 900,
      onlineDurationFrames: 230,
      offlineFrameRate: rate,
      onlineFrameRate: rate,
    });

    expect(result.status).toBe('missingHandles');
    expect(result.missingHeadFrames).toBe(0);
    expect(result.missingTailFrames).toBe(14);
  });

  it('warns on mixed frame rates and rejects them in strict mode', () => {
    const onlineRate = normalizeFrameRate({ numerator: 30000, denominator: 1001 });

    const reportOnly = calculateOnlineSourceRange({
      offlineSourceStartFrame: 1000,
      offlineSourceInFrame: 0,
      offlineDurationFrames: 24,
      onlineSourceStartFrame: 1000,
      onlineDurationFrames: 240,
      offlineFrameRate: rate,
      onlineFrameRate: onlineRate,
      strictFrameRate: false,
    });
    expect(reportOnly.warnings).toContain('frameRateMismatch');

    const strict = calculateOnlineSourceRange({
      offlineSourceStartFrame: 1000,
      offlineSourceInFrame: 0,
      offlineDurationFrames: 24,
      onlineSourceStartFrame: 1000,
      onlineDurationFrames: 240,
      offlineFrameRate: rate,
      onlineFrameRate: onlineRate,
      strictFrameRate: true,
    });
    expect(strict.status).toBe('frameRateMismatch');
  });
});
