import { matchOnlineCandidates } from '../../../tools/conform/matching.js';
import { normalizeFrameRate } from '../../../tools/conform/timecode.js';

const rate = normalizeFrameRate(24);
const offlineClip = {
  offlineClipId: 'offline-1',
  trackType: 'video' as const,
  trackIndex: 0,
  timelineStartFrame: 240,
  timelineEndFrame: 288,
  sourceInFrame: 24,
  sourceDurationFrames: 48,
  name: 'A001_C001_offline.mov',
  mediaIdentity: {
    reelName: 'A001',
    sourceStartFrame: 1000,
    frameRate: rate,
  },
  warnings: [],
};

describe('conform candidate matching', () => {
  it('selects a reel/timecode candidate with a confident source range', () => {
    const result = matchOnlineCandidates(offlineClip, [
      {
        projectItemId: 'online-1',
        name: 'A001_C001.mov',
        reelName: 'A001',
        sourceStartFrame: 900,
        durationFrames: 500,
        frameRate: rate,
        warnings: [],
      },
    ], { toleranceFrames: 1, matchFields: ['reelName', 'startTimecode', 'duration'] });

    expect(result.status).toBe('matched');
    expect(result.best?.projectItemId).toBe('online-1');
    expect(result.best?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.best?.onlineSourceInFrame).toBe(124);
    expect(result.best?.handleReport.status).toBe('contained');
  });

  it('reports missing handles without pretending the match is safe', () => {
    const result = matchOnlineCandidates(offlineClip, [
      {
        projectItemId: 'online-short',
        name: 'A001_C001.mov',
        reelName: 'A001',
        sourceStartFrame: 1040,
        durationFrames: 20,
        frameRate: rate,
        warnings: [],
      },
    ], { toleranceFrames: 0, matchFields: ['reelName', 'startTimecode', 'duration'] });

    expect(result.status).toBe('missingHandles');
    expect(result.best?.handleReport.missingHeadFrames).toBe(16);
    expect(result.best?.handleReport.missingTailFrames).toBe(12);
    expect(result.best?.safeToPlace).toBe(false);
  });

  it('marks equal top scores as ambiguous', () => {
    const result = matchOnlineCandidates(offlineClip, [
      { projectItemId: 'online-a', name: 'A001_A.mov', reelName: 'A001', sourceStartFrame: 900, durationFrames: 500, frameRate: rate, warnings: [] },
      { projectItemId: 'online-b', name: 'A001_B.mov', reelName: 'A001', sourceStartFrame: 900, durationFrames: 500, frameRate: rate, warnings: [] },
    ], { toleranceFrames: 1, matchFields: ['reelName', 'startTimecode', 'duration'] });

    expect(result.status).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
    expect(result.best?.safeToPlace).toBe(false);
  });

  it('allows filename fallback but labels it as review-required', () => {
    const result = matchOnlineCandidates({ ...offlineClip, mediaIdentity: { sourceStartFrame: 1000, frameRate: rate } }, [
      { projectItemId: 'online-file', name: 'A001_C001.mov', durationFrames: 500, frameRate: rate, warnings: [] },
    ], { toleranceFrames: 1, matchFields: ['filename'] });

    expect(result.status).toBe('reviewRequired');
    expect(result.best?.matchedFields).toContain('filename');
    expect(result.best?.safeToPlace).toBe(false);
  });

  it('propagates drop-frame timecode diagnostics from parsed source timecodes', () => {
    const dfRate = normalizeFrameRate(29.97);
    const result = matchOnlineCandidates({
      ...offlineClip,
      sourceDurationFrames: 30,
      mediaIdentity: {
        reelName: 'DF001',
        sourceStartTimecode: '00:00:00;00',
        frameRate: dfRate,
      },
    }, [
      {
        projectItemId: 'online-df',
        name: 'DF001.mov',
        reelName: 'DF001',
        sourceStartTimecode: '00:00:00;00',
        durationFrames: 120,
        frameRate: dfRate,
        warnings: [],
      },
    ], { toleranceFrames: 1, matchFields: ['reelName', 'startTimecode', 'duration'] });

    expect(result.status).toBe('matched');
    expect(result.warnings).toContain('offlineSourceStartTimecode: dropFrameTimecode');
    expect(result.warnings).toContain('onlineSourceStartTimecode: dropFrameTimecode');
  });

  it('blocks placement and reports invalid parsed source timecodes', () => {
    const dfRate = normalizeFrameRate(29.97);
    const result = matchOnlineCandidates({
      ...offlineClip,
      mediaIdentity: {
        reelName: 'DF001',
        sourceStartTimecode: '00:01:00;01',
        frameRate: dfRate,
      },
    }, [
      {
        projectItemId: 'online-invalid-df',
        name: 'DF001.mov',
        reelName: 'DF001',
        sourceStartTimecode: '00:00:00;00',
        durationFrames: 120,
        frameRate: dfRate,
        warnings: [],
      },
    ], { toleranceFrames: 1, matchFields: ['reelName', 'startTimecode', 'duration'] });

    expect(result.status).toBe('missingHandles');
    expect(result.best?.safeToPlace).toBe(false);
    expect(result.warnings.join(' ')).toContain('offlineSourceStartTimecode parse failed: Invalid dropped frame label');
  });

  it('does not silently default missing online frame rate to 24fps for reel/timecode matching', () => {
    const result = matchOnlineCandidates(offlineClip, [
      {
        projectItemId: 'online-missing-rate',
        name: 'A001_C001.mov',
        reelName: 'A001',
        sourceStartFrame: 900,
        durationFrames: 500,
        warnings: [],
      },
    ], { toleranceFrames: 1, matchFields: ['reelName', 'startTimecode', 'duration'] });

    expect(result.status).toBe('missingHandles');
    expect(result.best?.safeToPlace).toBe(false);
    expect(result.warnings).toContain('missingOnlineFrameRate');
  });
});
