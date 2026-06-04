import { validateTimelineCleanupExecutionPlan } from '../../../tools/timelineCleanup/executionPlan.js';

const safeRemoveClipAction = {
  type: 'removeClip' as const,
  clipId: 'disabled-clip',
  trackType: 'video' as const,
  trackIndex: 0,
  classification: 'safe_remove' as const,
  reason: 'disabled clip explicitly allowed by visual_noop analysis',
};

const basePlan = {
  sourceSequenceId: 'seq-1',
  cleanSequenceName: 'Messy Timeline CLEAN',
  duplicateSequence: true,
  analysisId: 'analysis-1',
  actions: [safeRemoveClipAction],
};

describe('timeline cleanup execution plan validation', () => {
  it('accepts safe cleanup plans that duplicate before removing approved clips', () => {
    const result = validateTimelineCleanupExecutionPlan(basePlan);

    expect(result.safe).toBe(true);
    expect(result.operations).toEqual([
      { type: 'duplicateSequence', sourceSequenceId: 'seq-1', cleanSequenceName: 'Messy Timeline CLEAN' },
      safeRemoveClipAction,
    ]);
  });

  it('rejects any plan that does not duplicate the source sequence', () => {
    const result = validateTimelineCleanupExecutionPlan({ ...basePlan, duplicateSequence: false });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('duplicateSequence must be true for non-destructive timeline cleanup');
  });

  it('rejects the mutating source-sequence escape hatch', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      duplicateSequence: false,
      allowMutatingSourceSequence: true,
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('allowMutatingSourceSequence is not supported for timeline cleanup');
  });

  it('rejects manual-review or preserved actions even if the caller includes them', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      actions: [
        {
          ...safeRemoveClipAction,
          clipId: 'matte-source',
          classification: 'preserve_visual_dependency',
          reason: 'track matte source',
        } as any,
      ],
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('actions[0] classification preserve_visual_dependency is not executable');
    expect(result.operations).toEqual([]);
  });

  it('rejects removeTrack actions unless the track was classified safe_remove', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      actions: [
        {
          type: 'removeTrack',
          trackType: 'video',
          trackIndex: 3,
          classification: 'manual_review',
          reason: 'track may have index dependencies',
        } as any,
      ],
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('actions[0] classification manual_review is not executable');
  });

  it('rejects plans without an analysis id so live execution must follow a dry-run analysis', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      analysisId: undefined,
    });

    expect(result.safe).toBe(false);
    expect(result.errors).toContain('analysisId is required for timeline cleanup execution provenance');
  });

  it('orders duplicateSequence before every cleanup mutation', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      actions: [
        { type: 'removeTrack', trackType: 'video', trackIndex: 3, classification: 'safe_remove', reason: 'empty track' },
        safeRemoveClipAction,
      ],
    });

    expect(result.safe).toBe(true);
    expect(result.operations[0]).toEqual({ type: 'duplicateSequence', sourceSequenceId: 'seq-1', cleanSequenceName: 'Messy Timeline CLEAN' });
    expect(result.operations.slice(1).map((op: any) => op.type)).toEqual(['removeClip', 'removeTrack']);
  });

  it('preserves classification and reason metadata on executable operations for downstream QC', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      actions: [
        { type: 'removeTrack', trackType: 'video', trackIndex: 1, classification: 'safe_remove', reason: 'empty track' },
      ],
    });

    expect(result.safe).toBe(true);
    expect(result.operations[1]).toEqual(expect.objectContaining({
      type: 'removeTrack',
      trackType: 'video',
      trackIndex: 1,
      classification: 'safe_remove',
      reason: 'empty track',
    }));
  });

  it('orders multiple track removals descending to avoid track-index shifts', () => {
    const result = validateTimelineCleanupExecutionPlan({
      ...basePlan,
      actions: [
        { type: 'removeTrack' as const, trackType: 'video' as const, trackIndex: 2, classification: 'safe_remove' as const, reason: 'empty track' },
        { type: 'removeTrack' as const, trackType: 'video' as const, trackIndex: 5, classification: 'safe_remove' as const, reason: 'empty track' },
        safeRemoveClipAction,
      ],
    });

    expect(result.safe).toBe(true);
    expect(result.operations.slice(1)).toEqual([
      safeRemoveClipAction,
      { type: 'removeTrack', trackType: 'video', trackIndex: 5, classification: 'safe_remove', reason: 'empty track' },
      { type: 'removeTrack', trackType: 'video', trackIndex: 2, classification: 'safe_remove', reason: 'empty track' },
    ]);
  });
});
