export interface StackedTrackPlanArgs {
  sourceTrackIndices: number[];
  existingVideoTrackCount: number;
  requestedTargetBySourceTrack?: Record<number, number>;
}

export interface StackedTrackPlan {
  safe: boolean;
  targetBySourceTrack: Record<number, number>;
  tracksToCreate: number;
  warnings: string[];
}

export function planStackedVideoTracks(args: StackedTrackPlanArgs): StackedTrackPlan {
  const sourceTrackIndices = [...new Set(args.sourceTrackIndices)].sort((a, b) => a - b);
  const targetBySourceTrack: Record<number, number> = {};
  const warnings: string[] = [];
  let safe = true;

  for (let offset = 0; offset < sourceTrackIndices.length; offset++) {
    const sourceTrackIndex = sourceTrackIndices[offset]!;
    const requested = args.requestedTargetBySourceTrack?.[sourceTrackIndex];
    const targetTrackIndex = requested ?? args.existingVideoTrackCount + offset;
    targetBySourceTrack[sourceTrackIndex] = targetTrackIndex;

    if (targetTrackIndex <= sourceTrackIndex || targetTrackIndex < args.existingVideoTrackCount) {
      warnings.push('targetTrackOverlapsSourceTrack');
      safe = false;
    }
  }

  const maxTargetTrack = Math.max(args.existingVideoTrackCount - 1, ...Object.values(targetBySourceTrack));
  const tracksToCreate = Math.max(0, maxTargetTrack - args.existingVideoTrackCount + 1);

  return {
    safe,
    targetBySourceTrack,
    tracksToCreate,
    warnings: [...new Set(warnings)],
  };
}
