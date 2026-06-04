import { planStackedVideoTracks } from '../../../tools/conform/trackPlan.js';

describe('stacked conform track planning', () => {
  it('maps source picture tracks to upper target tracks without reusing offline tracks', () => {
    const plan = planStackedVideoTracks({
      sourceTrackIndices: [0, 1],
      existingVideoTrackCount: 2,
    });

    expect(plan.targetBySourceTrack).toEqual({ 0: 2, 1: 3 });
    expect(plan.tracksToCreate).toBe(2);
    expect(plan.warnings).toEqual([]);
  });

  it('preserves a caller-provided upper-track map after validating it', () => {
    const plan = planStackedVideoTracks({
      sourceTrackIndices: [0],
      existingVideoTrackCount: 3,
      requestedTargetBySourceTrack: { 0: 4 },
    });

    expect(plan.targetBySourceTrack).toEqual({ 0: 4 });
    expect(plan.tracksToCreate).toBe(2);
  });

  it('rejects target tracks that would overlap the offline source edit', () => {
    const plan = planStackedVideoTracks({
      sourceTrackIndices: [1],
      existingVideoTrackCount: 2,
      requestedTargetBySourceTrack: { 1: 1 },
    });

    expect(plan.safe).toBe(false);
    expect(plan.warnings).toContain('targetTrackOverlapsSourceTrack');
  });
});
