import { analyzeTimelineCleanup } from '../../../tools/timelineCleanup/analyze.js';
import type { TimelineCleanupSnapshot } from '../../../tools/timelineCleanup/types.js';

function baseSnapshot(overrides: Partial<TimelineCleanupSnapshot> = {}): TimelineCleanupSnapshot {
  return {
    sequence: { sequenceId: 'seq-1', name: 'Messy Timeline' },
    tracks: [
      { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 1, warnings: [] },
      { trackType: 'video', trackIndex: 1, name: 'V2', clipCount: 0, warnings: [] },
    ],
    clips: [
      {
        clipId: 'clip-1',
        trackType: 'video',
        trackIndex: 0,
        clipIndex: 0,
        name: 'Picture.mov',
        startTime: 0,
        endTime: 10,
        duration: 10,
        enabled: true,
        riskFlags: [],
        warnings: [],
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe('timeline cleanup analyzer', () => {
  it('classifies truly empty tracks as safe_remove in conservative mode', () => {
    const result = analyzeTimelineCleanup({ cleanupSnapshot: baseSnapshot() });

    expect(result.success).toBe(true);
    expect(result.mutationPlanned).toBe(false);
    expect(result.trackClassifications).toContainEqual(expect.objectContaining({
      trackType: 'video',
      trackIndex: 1,
      classification: 'safe_remove',
      reason: expect.stringContaining('empty'),
    }));
    expect(result.actionPlan).toContainEqual(expect.objectContaining({ type: 'removeTrack', trackType: 'video', trackIndex: 1, classification: 'safe_remove' }));
    expect(result.actions).toBe(result.actionPlan);
    expect(result.actions).toContainEqual(expect.objectContaining({ type: 'removeTrack', trackType: 'video', trackIndex: 1, classification: 'safe_remove' }));
  });

  it('keeps one base track per media type even when every track is empty', () => {
    const result = analyzeTimelineCleanup({
      cleanupSnapshot: baseSnapshot({
        tracks: [
          { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 0, warnings: [] },
          { trackType: 'video', trackIndex: 1, name: 'V2', clipCount: 0, warnings: [] },
          { trackType: 'audio', trackIndex: 0, name: 'A1', clipCount: 0, warnings: [] },
        ],
        clips: [],
      }),
    });

    expect(result.trackClassifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackType: 'video', trackIndex: 0, classification: 'safe_remove' }),
      expect.objectContaining({ trackType: 'video', trackIndex: 1, classification: 'safe_remove' }),
      expect.objectContaining({ trackType: 'audio', trackIndex: 0, classification: 'safe_remove' }),
    ]));
    expect(result.actionPlan.filter((action: any) => action.type === 'removeTrack')).toEqual([
      expect.objectContaining({ trackType: 'video', trackIndex: 1 }),
    ]);
  });

  it('preserves disabled clips by default instead of deleting editorial material', () => {
    const snapshot = baseSnapshot({
      clips: [
        {
          clipId: 'disabled-clip',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Disabled alt take.mov',
          startTime: 0,
          endTime: 5,
          duration: 5,
          enabled: false,
          riskFlags: [],
          warnings: [],
        },
      ],
    });

    const result = analyzeTimelineCleanup({ cleanupSnapshot: snapshot });

    expect(result.clipClassifications).toContainEqual(expect.objectContaining({
      clipId: 'disabled-clip',
      classification: 'manual_review',
      reason: expect.stringContaining('disabled'),
    }));
    expect(result.actionPlan.some((action: any) => action.clipId === 'disabled-clip')).toBe(false);
  });

  it('only removes disabled clips when visual_noop mode explicitly allows it and no risks exist', () => {
    const snapshot = baseSnapshot({
      clips: [
        {
          clipId: 'disabled-clip',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Disabled alt take.mov',
          startTime: 0,
          endTime: 5,
          duration: 5,
          enabled: false,
          hasAudio: false,
          riskFlags: [],
          warnings: [],
        },
      ],
    });

    const result = analyzeTimelineCleanup({
      cleanupSnapshot: snapshot,
      mode: 'visual_noop',
      removeDisabledClips: true,
    });

    expect(result.clipClassifications).toContainEqual(expect.objectContaining({
      clipId: 'disabled-clip',
      classification: 'safe_remove',
    }));
    expect(result.actionPlan).toContainEqual(expect.objectContaining({ type: 'removeClip', clipId: 'disabled-clip', classification: 'safe_remove' }));
  });

  it('preserves disabled clips even with opt-in when audio linkage is unknown', () => {
    const snapshot = baseSnapshot({
      clips: [
        {
          clipId: 'disabled-linked',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Disabled linked take.mov',
          startTime: 0,
          endTime: 5,
          duration: 5,
          enabled: false,
          riskFlags: [],
          warnings: ['linkedAudioUnknown: video clip may have linked or synchronized audio'],
        },
      ],
    });

    const result = analyzeTimelineCleanup({
      cleanupSnapshot: snapshot,
      mode: 'visual_noop',
      removeDisabledClips: true,
    });

    expect(result.clipClassifications).toContainEqual(expect.objectContaining({
      clipId: 'disabled-linked',
      classification: 'manual_review',
      reason: expect.stringContaining('audio'),
    }));
    expect(result.actionPlan.some((action: any) => action.clipId === 'disabled-linked')).toBe(false);
  });

  it('preserves clips that are under masked or transparent upper layers', () => {
    const snapshot = baseSnapshot({
      tracks: [
        { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 1, warnings: [] },
        { trackType: 'video', trackIndex: 1, name: 'V2', clipCount: 1, warnings: [] },
      ],
      clips: [
        {
          clipId: 'lower',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Lower picture.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          riskFlags: [],
          warnings: [],
        },
        {
          clipId: 'upper-mask',
          trackType: 'video',
          trackIndex: 1,
          clipIndex: 0,
          name: 'Masked upper.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          coversFullFrame: true,
          opacity: 100,
          riskFlags: ['mask'],
          warnings: [],
        },
      ],
    });

    const result = analyzeTimelineCleanup({
      cleanupSnapshot: snapshot,
      mode: 'visual_noop',
      removeFullyCoveredClips: true,
    });

    expect(result.clipClassifications).toContainEqual(expect.objectContaining({
      clipId: 'lower',
      classification: 'preserve_visual_dependency',
      reason: expect.stringContaining('upper layer'),
    }));
    expect(result.actionPlan.some((action: any) => action.clipId === 'lower')).toBe(false);
  });

  it('does not remove empty tracks when any clip has track-index or matte dependencies', () => {
    const snapshot = baseSnapshot({
      tracks: [
        { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 1, warnings: [] },
        { trackType: 'video', trackIndex: 1, name: 'V2 empty but index-sensitive', clipCount: 0, warnings: [] },
      ],
      clips: [
        {
          clipId: 'track-matte-consumer',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Matte consumer.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          riskFlags: ['trackMatte'],
          trackMatteDependencies: [{ effectName: 'Track Matte Key', sourceTrackIndex: 1 }],
          warnings: [],
        },
      ],
    });

    const result = analyzeTimelineCleanup({ cleanupSnapshot: snapshot });

    expect(result.trackClassifications).toContainEqual(expect.objectContaining({
      trackType: 'video',
      trackIndex: 1,
      classification: 'manual_review',
      reason: expect.stringContaining('track-index'),
    }));
    expect(result.actionPlan.some((action: any) => action.type === 'removeTrack' && action.trackIndex === 1)).toBe(false);
  });

  it('allows a covered lower clip only when the upper coverage is opaque full-frame and dependency-free', () => {
    const snapshot = baseSnapshot({
      tracks: [
        { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 1, warnings: [] },
        { trackType: 'video', trackIndex: 1, name: 'V2', clipCount: 1, warnings: [] },
      ],
      clips: [
        {
          clipId: 'lower',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Lower picture.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          riskFlags: [],
          warnings: [],
        },
        {
          clipId: 'upper-opaque',
          trackType: 'video',
          trackIndex: 1,
          clipIndex: 0,
          name: 'Opaque upper.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          coversFullFrame: true,
          opacity: 100,
          blendMode: 'Normal',
          riskFlags: [],
          warnings: [],
        },
      ],
    });

    const result = analyzeTimelineCleanup({
      cleanupSnapshot: snapshot,
      mode: 'visual_noop',
      removeFullyCoveredClips: true,
    });

    expect(result.clipClassifications).toContainEqual(expect.objectContaining({ clipId: 'lower', classification: 'safe_remove' }));
    expect(result.actionPlan).toContainEqual(expect.objectContaining({ type: 'removeClip', clipId: 'lower', classification: 'safe_remove' }));
  });

  it('preserves fully covered lower clips when they may carry linked audio', () => {
    const snapshot = baseSnapshot({
      tracks: [
        { trackType: 'video', trackIndex: 0, name: 'V1', clipCount: 1, warnings: [] },
        { trackType: 'video', trackIndex: 1, name: 'V2', clipCount: 1, warnings: [] },
      ],
      clips: [
        {
          clipId: 'lower-with-audio',
          trackType: 'video',
          trackIndex: 0,
          clipIndex: 0,
          name: 'Lower picture with production audio.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          hasAudio: true,
          riskFlags: [],
          warnings: [],
        },
        {
          clipId: 'upper-opaque',
          trackType: 'video',
          trackIndex: 1,
          clipIndex: 0,
          name: 'Opaque upper.mov',
          startTime: 0,
          endTime: 10,
          duration: 10,
          enabled: true,
          coversFullFrame: true,
          opacity: 100,
          riskFlags: [],
          warnings: [],
        },
      ],
    });

    const result = analyzeTimelineCleanup({
      cleanupSnapshot: snapshot,
      mode: 'visual_noop',
      removeFullyCoveredClips: true,
    });

    expect(result.clipClassifications).toContainEqual(expect.objectContaining({
      clipId: 'lower-with-audio',
      classification: 'manual_review',
      reason: expect.stringContaining('audio'),
    }));
    expect(result.actionPlan.some((action: any) => action.clipId === 'lower-with-audio')).toBe(false);
  });

  it('preserves mattes, adjustment layers, nests, graphics, keyframes, and unsupported effects', () => {
    const riskyClips = ['matte', 'adjustment', 'nested', 'graphic', 'keyframed', 'unsupported'].map((clipId, index) => ({
      clipId,
      trackType: 'video' as const,
      trackIndex: index,
      clipIndex: 0,
      name: `${clipId}.mov`,
      startTime: 0,
      endTime: 5,
      duration: 5,
      enabled: true,
      riskFlags: [clipId === 'unsupported' ? 'unsupportedEffect' : clipId] as any[],
      warnings: [],
    }));

    const result = analyzeTimelineCleanup({
      cleanupSnapshot: baseSnapshot({
        tracks: riskyClips.map((clip, index) => ({ trackType: 'video' as const, trackIndex: index, name: `V${index + 1}`, clipCount: 1, warnings: [] })),
        clips: riskyClips,
      }),
      mode: 'visual_noop',
      removeFullyCoveredClips: true,
      removeDisabledClips: true,
    });

    for (const clipId of ['matte', 'adjustment', 'nested', 'graphic', 'keyframed', 'unsupported']) {
      expect(result.clipClassifications).toContainEqual(expect.objectContaining({
        clipId,
        classification: expect.stringMatching(/preserve_visual_dependency|unsupported/),
      }));
      expect(result.actionPlan.some((action: any) => action.clipId === clipId)).toBe(false);
    }
  });
});
