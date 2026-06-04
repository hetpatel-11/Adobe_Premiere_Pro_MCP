import { analyzeStackedOnlineConform } from '../../../tools/conform/analyze.js';
import { normalizeFrameRate } from '../../../tools/conform/timecode.js';

const rate = normalizeFrameRate(24);

describe('stacked online conform analyzer', () => {
  it('builds a dry-run placement plan with confidence, handles, and upper tracks', () => {
    const result = analyzeStackedOnlineConform({
      sequenceSnapshot: {
        sequence: { sequenceId: 'seq-1', name: 'Offline', frameRate: rate },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
        clips: [
          {
            offlineClipId: 'offline-1',
            trackType: 'video',
            trackIndex: 0,
            timelineStartFrame: 240,
            timelineEndFrame: 288,
            sourceInFrame: 24,
            sourceDurationFrames: 48,
            name: 'A001_C001_offline.mov',
            mediaIdentity: { reelName: 'A001', sourceStartFrame: 1000, frameRate: rate },
            warnings: [],
          },
        ],
      },
      onlineMedia: [
        { projectItemId: 'online-1', name: 'A001_C001.mov', reelName: 'A001', sourceStartFrame: 900, durationFrames: 500, frameRate: rate, warnings: [] },
      ],
      sourceTrackIndices: [0],
      matchFields: ['reelName', 'startTimecode', 'duration'],
      toleranceFrames: 1,
    });

    expect(result.success).toBe(true);
    expect(result.mutationPlanned).toBe(false);
    expect(result.summary).toMatchObject({ totalOfflineClips: 1, matched: 1, unsafe: 0 });
    expect(result.placementPlan[0]).toMatchObject({
      offlineClipId: 'offline-1',
      onlineProjectItemId: 'online-1',
      sourceTrackIndex: 0,
      targetTrackIndex: 1,
      startTime: 10,
      duration: 2,
      sourceInPoint: 124 / 24,
      matchStatus: 'matched',
      safeToPlace: true,
    });
  });

  it('reports ambiguous and missing-handle clips as unsafe', () => {
    const result = analyzeStackedOnlineConform({
      sequenceSnapshot: {
        sequence: { sequenceId: 'seq-1', name: 'Offline', frameRate: rate },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 2, warnings: [] }],
        clips: [
          { offlineClipId: 'ambiguous', trackType: 'video', trackIndex: 0, timelineStartFrame: 0, timelineEndFrame: 24, sourceInFrame: 0, sourceDurationFrames: 24, name: 'A.mov', mediaIdentity: { reelName: 'A', sourceStartFrame: 100, frameRate: rate }, warnings: [] },
          { offlineClipId: 'handles', trackType: 'video', trackIndex: 0, timelineStartFrame: 24, timelineEndFrame: 48, sourceInFrame: 20, sourceDurationFrames: 24, name: 'B.mov', mediaIdentity: { reelName: 'B', sourceStartFrame: 100, frameRate: rate }, warnings: [] },
        ],
      },
      onlineMedia: [
        { projectItemId: 'online-a1', name: 'A1.mov', reelName: 'A', sourceStartFrame: 100, durationFrames: 200, frameRate: rate, warnings: [] },
        { projectItemId: 'online-a2', name: 'A2.mov', reelName: 'A', sourceStartFrame: 100, durationFrames: 200, frameRate: rate, warnings: [] },
        { projectItemId: 'online-b', name: 'B.mov', reelName: 'B', sourceStartFrame: 130, durationFrames: 5, frameRate: rate, warnings: [] },
      ],
      sourceTrackIndices: [0],
      matchFields: ['reelName', 'startTimecode', 'duration'],
    });

    expect(result.summary.unsafe).toBe(2);
    expect(result.placementPlan).toHaveLength(0);
    expect(result.reviewItems.map((item: any) => item.status)).toEqual(['ambiguous', 'missingHandles']);
  });

  it('uses the matched online media frame rate for online source in seconds', () => {
    const onlineRate = normalizeFrameRate(23.976);
    const result = analyzeStackedOnlineConform({
      sequenceSnapshot: {
        sequence: { sequenceId: 'seq-1', name: 'Offline', frameRate: rate },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
        clips: [
          {
            offlineClipId: 'offline-1',
            trackType: 'video',
            trackIndex: 0,
            timelineStartFrame: 240,
            timelineEndFrame: 288,
            sourceInFrame: 24,
            sourceDurationFrames: 48,
            name: 'A001_C001_offline.mov',
            mediaIdentity: { reelName: 'A001', sourceStartFrame: 1000, frameRate: rate },
            warnings: [],
          },
        ],
      },
      onlineMedia: [
        { projectItemId: 'online-23976', name: 'A001_C001.mov', reelName: 'A001', sourceStartFrame: 900, durationFrames: 500, frameRate: onlineRate, warnings: [] },
      ],
      sourceTrackIndices: [0],
      matchFields: ['reelName', 'startTimecode', 'duration'],
    });

    expect(result.placementPlan[0].sourceInPoint).toBeCloseTo(124 / onlineRate.fps, 6);
    expect(result.placementPlan[0].sourceInPoint).not.toBeCloseTo(124 / rate.fps, 6);
  });

  it('uses the matched online media frame rate for online source out seconds', () => {
    const onlineRate = normalizeFrameRate(23.976);
    const result = analyzeStackedOnlineConform({
      sequenceSnapshot: {
        sequence: { sequenceId: 'seq-1', name: 'Offline', frameRate: rate },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
        clips: [
          {
            offlineClipId: 'offline-1',
            trackType: 'video',
            trackIndex: 0,
            timelineStartFrame: 240,
            timelineEndFrame: 288,
            sourceInFrame: 24,
            sourceDurationFrames: 48,
            name: 'A001_C001_offline.mov',
            mediaIdentity: { reelName: 'A001', sourceStartFrame: 1000, frameRate: rate },
            warnings: [],
          },
        ],
      },
      onlineMedia: [
        { projectItemId: 'online-23976', name: 'A001_C001.mov', reelName: 'A001', sourceStartFrame: 900, durationFrames: 500, frameRate: onlineRate, warnings: [] },
      ],
      sourceTrackIndices: [0],
      matchFields: ['reelName', 'startTimecode', 'duration'],
    });

    expect(result.placementPlan[0].sourceInPoint).toBeCloseTo(124 / onlineRate.fps, 6);
    expect(result.placementPlan[0].sourceOutPoint).toBeCloseTo(172 / onlineRate.fps, 6);
  });

  it('refuses to analyze placements when sequence frame rate metadata is missing', () => {
    const result = analyzeStackedOnlineConform({
      sequenceSnapshot: {
        sequence: { sequenceId: 'seq-1', name: 'Offline' },
        tracks: [{ trackType: 'video', trackIndex: 0, role: 'picture', clipCount: 1, warnings: [] }],
        clips: [
          {
            offlineClipId: 'offline-1',
            trackType: 'video',
            trackIndex: 0,
            timelineStartFrame: 240,
            timelineEndFrame: 288,
            sourceInFrame: 24,
            sourceDurationFrames: 48,
            name: 'A001_C001_offline.mov',
            mediaIdentity: { reelName: 'A001', sourceStartFrame: 1000, frameRate: rate },
            warnings: [],
          },
        ],
      },
      onlineMedia: [
        { projectItemId: 'online-1', name: 'A001_C001.mov', reelName: 'A001', sourceStartFrame: 900, durationFrames: 500, frameRate: rate, warnings: [] },
      ],
      sourceTrackIndices: [0],
      matchFields: ['reelName', 'startTimecode', 'duration'],
    });

    expect(result.placementPlan).toEqual([]);
    expect(result.summary.unsafe).toBe(1);
    expect(result.reviewItems[0].warnings).toContain('missingSequenceFrameRate');
  });
});
