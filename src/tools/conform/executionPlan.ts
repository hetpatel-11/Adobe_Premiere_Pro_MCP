export interface StackedConformPlacement {
  offlineClipId: string;
  onlineProjectItemId: string;
  sourceTrackIndex: number;
  targetTrackIndex: number;
  startTime: number;
  sourceInPoint: number;
  sourceOutPoint: number;
  duration: number;
  safeToPlace: boolean;
}

export interface StackedConformExecutionPlanArgs {
  sourceSequenceId: string;
  conformSequenceName: string;
  placementPlan: StackedConformPlacement[];
  existingVideoTrackCount?: number;
  duplicateSequence?: boolean;
  allowMutatingSourceSequence?: boolean;
}

export type StackedConformExecutionOperation =
  | { type: 'duplicateSequence'; sourceSequenceId: string; conformSequenceName: string }
  | { type: 'ensureVideoTrack'; trackIndex: number }
  | {
      type: 'placeOnlineClip';
      offlineClipId: string;
      onlineProjectItemId: string;
      targetTrackIndex: number;
      startTime: number;
      sourceInPoint: number;
      sourceOutPoint: number;
      duration: number;
    };

export interface StackedConformExecutionValidation {
  safe: boolean;
  errors: string[];
  warnings: string[];
  operations: StackedConformExecutionOperation[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sortedPlacements(placements: StackedConformPlacement[]): StackedConformPlacement[] {
  return [...placements].sort((a, b) => {
    if (a.targetTrackIndex !== b.targetTrackIndex) return a.targetTrackIndex - b.targetTrackIndex;
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    return a.offlineClipId.localeCompare(b.offlineClipId);
  });
}

export function validateStackedConformExecutionPlan(args: StackedConformExecutionPlanArgs): StackedConformExecutionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const operations: StackedConformExecutionOperation[] = [];
  const existingVideoTrackCount = args.existingVideoTrackCount;
  const hasExistingVideoTrackCount = typeof existingVideoTrackCount === 'number' && Number.isInteger(existingVideoTrackCount) && existingVideoTrackCount >= 0;

  if (!args.sourceSequenceId || typeof args.sourceSequenceId !== 'string') {
    errors.push('sourceSequenceId is required');
  }
  if (!args.conformSequenceName || typeof args.conformSequenceName !== 'string') {
    errors.push('conformSequenceName is required');
  }
  if (!Array.isArray(args.placementPlan) || args.placementPlan.length === 0) {
    errors.push('placementPlan must contain at least one safe placement');
  }
  if (args.duplicateSequence !== true) {
    errors.push('duplicateSequence must be true for non-destructive stacked conform execution');
  }
  if (existingVideoTrackCount !== undefined && (!Number.isInteger(existingVideoTrackCount) || existingVideoTrackCount < 0)) {
    errors.push('existingVideoTrackCount must be a non-negative integer when provided');
  }

  const placements = Array.isArray(args.placementPlan) ? args.placementPlan : [];
  placements.forEach((placement, index) => {
    if (placement.safeToPlace !== true) {
      errors.push(`placement[${index}].safeToPlace must be true`);
    }
    if (!placement.offlineClipId) {
      errors.push(`placement[${index}].offlineClipId is required`);
    }
    if (!placement.onlineProjectItemId) {
      errors.push(`placement[${index}].onlineProjectItemId is required`);
    }
    if (!Number.isInteger(placement.sourceTrackIndex) || placement.sourceTrackIndex < 0) {
      errors.push(`placement[${index}].sourceTrackIndex must be a non-negative integer`);
    }
    if (!Number.isInteger(placement.targetTrackIndex) || placement.targetTrackIndex < 0) {
      errors.push(`placement[${index}].targetTrackIndex must be a non-negative integer`);
    }
    if (Number.isInteger(placement.sourceTrackIndex) && Number.isInteger(placement.targetTrackIndex) && placement.targetTrackIndex <= placement.sourceTrackIndex) {
      errors.push(`placement[${index}].targetTrackIndex must be greater than sourceTrackIndex`);
    }
    if (hasExistingVideoTrackCount && Number.isInteger(placement.targetTrackIndex) && placement.targetTrackIndex < existingVideoTrackCount) {
      errors.push(`placement[${index}].targetTrackIndex targets pre-existing video track ${placement.targetTrackIndex}; conform placements must use newly created upper tracks`);
    }
    if (!isFiniteNumber(placement.startTime) || placement.startTime < 0) {
      errors.push(`placement[${index}].startTime must be a non-negative number`);
    }
    if (!isFiniteNumber(placement.sourceInPoint) || placement.sourceInPoint < 0) {
      errors.push(`placement[${index}].sourceInPoint must be a non-negative number`);
    }
    if (!isFiniteNumber(placement.sourceOutPoint)) {
      errors.push(`placement[${index}].sourceOutPoint is required`);
    } else if (placement.sourceOutPoint <= placement.sourceInPoint) {
      errors.push(`placement[${index}].sourceOutPoint must be greater than sourceInPoint`);
    }
    if (!isFiniteNumber(placement.duration) || placement.duration <= 0) {
      errors.push(`placement[${index}].duration must be greater than 0`);
    }
  });

  const placementsByTargetTrack = new Map<number, StackedConformPlacement[]>();
  for (const placement of placements) {
    if (!Number.isInteger(placement.targetTrackIndex) || !isFiniteNumber(placement.startTime) || !isFiniteNumber(placement.duration) || placement.duration <= 0) {
      continue;
    }
    const existing = placementsByTargetTrack.get(placement.targetTrackIndex) || [];
    existing.push(placement);
    placementsByTargetTrack.set(placement.targetTrackIndex, existing);
  }

  for (const [targetTrackIndex, trackPlacements] of placementsByTargetTrack.entries()) {
    const ordered = sortedPlacements(trackPlacements);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (current.startTime < previous.startTime + previous.duration) {
        errors.push(`target track ${targetTrackIndex} has overlapping placements: ${previous.offlineClipId} and ${current.offlineClipId}`);
      }
    }
  }

  const safe = errors.length === 0;
  if (safe) {
    if (args.duplicateSequence === true) {
      operations.push({ type: 'duplicateSequence', sourceSequenceId: args.sourceSequenceId, conformSequenceName: args.conformSequenceName });
    }

    const trackIndices = [...new Set(placements.map((placement) => placement.targetTrackIndex))].sort((a, b) => a - b);
    for (const trackIndex of trackIndices) {
      operations.push({ type: 'ensureVideoTrack', trackIndex });
    }

    for (const placement of sortedPlacements(placements)) {
      operations.push({
        type: 'placeOnlineClip',
        offlineClipId: placement.offlineClipId,
        onlineProjectItemId: placement.onlineProjectItemId,
        targetTrackIndex: placement.targetTrackIndex,
        startTime: placement.startTime,
        sourceInPoint: placement.sourceInPoint,
        sourceOutPoint: placement.sourceOutPoint,
        duration: placement.duration,
      });
    }
  }

  return { safe, errors, warnings, operations };
}
