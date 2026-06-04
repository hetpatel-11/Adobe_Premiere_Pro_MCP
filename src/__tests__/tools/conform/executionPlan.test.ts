import { validateStackedConformExecutionPlan } from '../../../tools/conform/executionPlan.js';

describe('stacked conform execution plan validation', () => {
  const basePlan = {
    sourceSequenceId: 'seq-1',
    conformSequenceName: 'Seq Online Conform',
    placementPlan: [
      {
        offlineClipId: 'offline-1',
        onlineProjectItemId: 'online-1',
        sourceTrackIndex: 0,
        targetTrackIndex: 1,
        startTime: 10,
        sourceInPoint: 5,
        sourceOutPoint: 7,
        duration: 2,
        safeToPlace: true,
      },
    ],
    duplicateSequence: true,
  };

  it('accepts safe plans that duplicate and stack online above offline', () => {
    const result = validateStackedConformExecutionPlan(basePlan);

    expect(result.safe).toBe(true);
    expect(result.operations).toEqual([
      { type: 'duplicateSequence', sourceSequenceId: 'seq-1', conformSequenceName: 'Seq Online Conform' },
      { type: 'ensureVideoTrack', trackIndex: 1 },
      { type: 'placeOnlineClip', offlineClipId: 'offline-1', onlineProjectItemId: 'online-1', targetTrackIndex: 1, startTime: 10, sourceInPoint: 5, sourceOutPoint: 7, duration: 2 },
    ]);
  });

  it('rejects plans that would place online media on or below the offline source track', () => {
    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      placementPlan: [{ ...basePlan.placementPlan[0], targetTrackIndex: 0 }],
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('placement[0].targetTrackIndex must be greater than sourceTrackIndex');
  });

  it('rejects non-duplicating execution by default', () => {
    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      duplicateSequence: false,
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('duplicateSequence must be true for non-destructive stacked conform execution');
  });

  it('rejects plans missing required online source out points', () => {
    const [{ sourceOutPoint, ...placementWithoutOutPoint }] = basePlan.placementPlan;

    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      placementPlan: [placementWithoutOutPoint as any],
    });

    expect(sourceOutPoint).toBe(7);
    expect(result.safe).toBe(false);
    expect(result.errors).toContain('placement[0].sourceOutPoint is required');
  });

  it('rejects the mutating source-sequence escape hatch for conform execution', () => {
    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      duplicateSequence: false,
      allowMutatingSourceSequence: true,
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('duplicateSequence must be true for non-destructive stacked conform execution');
  });

  it('rejects overlapping online placements on the same target track', () => {
    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      placementPlan: [
        basePlan.placementPlan[0],
        {
          ...basePlan.placementPlan[0],
          offlineClipId: 'offline-2',
          onlineProjectItemId: 'online-2',
          startTime: 11,
          duration: 3,
        },
      ],
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('target track 1 has overlapping placements: offline-1 and offline-2');
  });

  it('orders placement operations by target track and timeline start time', () => {
    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      placementPlan: [
        {
          ...basePlan.placementPlan[0],
          offlineClipId: 'offline-2',
          onlineProjectItemId: 'online-2',
          startTime: 20,
        },
        basePlan.placementPlan[0],
      ],
    });

    expect(result.safe).toBe(true);
    expect(result.operations.filter((op) => op.type === 'placeOnlineClip').map((op: any) => op.offlineClipId)).toEqual(['offline-1', 'offline-2']);
  });

  it('rejects placements targeting pre-existing video tracks unless the track is known to be newly created for conform', () => {
    const result = validateStackedConformExecutionPlan({
      ...basePlan,
      existingVideoTrackCount: 2,
      placementPlan: [{ ...basePlan.placementPlan[0], targetTrackIndex: 1 }],
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('placement[0].targetTrackIndex targets pre-existing video track 1; conform placements must use newly created upper tracks');
  });
});
