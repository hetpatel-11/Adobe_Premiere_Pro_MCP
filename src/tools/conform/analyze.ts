import type { ConformClipSnapshot, ConformMediaIdentity, FrameRate } from './types.js';
import { framesToSeconds, normalizeFrameRate } from './timecode.js';
import { matchOnlineCandidates, type MatchField, type MatchStatus } from './matching.js';
import { planStackedVideoTracks } from './trackPlan.js';

export interface SequenceConformSnapshot {
  sequence: {
    sequenceId: string;
    name?: string;
    frameRate?: FrameRate | number;
  };
  tracks: Array<{ trackType: 'video' | 'audio'; trackIndex: number; role?: string; clipCount?: number; warnings?: string[] }>;
  clips: ConformClipSnapshot[];
}

export interface AnalyzeStackedOnlineConformArgs {
  sequenceSnapshot: SequenceConformSnapshot;
  onlineMedia: ConformMediaIdentity[];
  sourceTrackIndices?: number[];
  targetTrackBySourceTrack?: Record<number, number>;
  matchFields?: MatchField[];
  toleranceFrames?: number;
  minConfidence?: number;
  strictFrameRate?: boolean;
}

export interface ConformPlacementPlanItem {
  offlineClipId: string;
  onlineProjectItemId?: string;
  sourceTrackIndex: number;
  targetTrackIndex: number;
  startTime: number;
  duration: number;
  sourceInPoint: number;
  sourceOutPoint: number;
  confidence: number;
  matchStatus: MatchStatus;
  safeToPlace: boolean;
  handleReport: unknown;
  matchedFields: MatchField[];
}

function normalizeSequenceFrameRate(input: SequenceConformSnapshot['sequence']['frameRate']): FrameRate | null {
  if (input === undefined || input === null) return null;
  try {
    return normalizeFrameRate(input);
  } catch (_) {
    return null;
  }
}

export function analyzeStackedOnlineConform(args: AnalyzeStackedOnlineConformArgs): any {
  const sequenceRate = normalizeSequenceFrameRate(args.sequenceSnapshot.sequence.frameRate);
  const pictureTracks = args.sequenceSnapshot.tracks
    .filter((track) => track.trackType === 'video' && track.role !== 'ignore' && track.role !== 'passthrough')
    .map((track) => track.trackIndex);
  const sourceTrackIndices = args.sourceTrackIndices && args.sourceTrackIndices.length > 0
    ? args.sourceTrackIndices
    : pictureTracks;
  const existingVideoTrackCount = Math.max(0, ...args.sequenceSnapshot.tracks.filter((track) => track.trackType === 'video').map((track) => track.trackIndex + 1));
  const trackPlan = planStackedVideoTracks({
    sourceTrackIndices,
    existingVideoTrackCount,
    ...(args.targetTrackBySourceTrack ? { requestedTargetBySourceTrack: args.targetTrackBySourceTrack } : {}),
  });

  const sourceTrackSet = new Set(sourceTrackIndices);
  const offlineClips = args.sequenceSnapshot.clips.filter((clip) => clip.trackType === 'video' && sourceTrackSet.has(clip.trackIndex));
  const placementPlan: ConformPlacementPlanItem[] = [];
  const reviewItems: any[] = [];
  const statusCounts: Record<string, number> = {
    matched: 0,
    missingHandles: 0,
    ambiguous: 0,
    reviewRequired: 0,
    unmatched: 0,
    frameRateMismatch: 0,
  };

  if (!sequenceRate) {
    const missingRateReviewItems = offlineClips.map((clip) => ({
      offlineClipId: clip.offlineClipId,
      status: 'reviewRequired',
      safeToPlace: false,
      targetTrackIndex: trackPlan.targetBySourceTrack[clip.trackIndex] ?? clip.trackIndex,
      best: undefined,
      candidates: [],
      warnings: [...trackPlan.warnings, 'missingSequenceFrameRate'],
    }));
    return {
      success: true,
      mutationPlanned: false,
      sequenceId: args.sequenceSnapshot.sequence.sequenceId,
      trackPlan,
      placementPlan: [],
      reviewItems: missingRateReviewItems,
      summary: {
        totalOfflineClips: offlineClips.length,
        matched: 0,
        missingHandles: 0,
        ambiguous: 0,
        reviewRequired: offlineClips.length,
        unmatched: 0,
        frameRateMismatch: 0,
        unsafe: missingRateReviewItems.length,
        safePlacements: 0,
      },
      warnings: [...trackPlan.warnings, 'missingSequenceFrameRate'],
    };
  }

  const safeSequenceRate = sequenceRate;

  for (const clip of offlineClips) {
    const match = matchOnlineCandidates(clip, args.onlineMedia, {
      ...(args.toleranceFrames !== undefined ? { toleranceFrames: args.toleranceFrames } : {}),
      ...(args.matchFields ? { matchFields: args.matchFields } : {}),
      ...(args.minConfidence !== undefined ? { minConfidence: args.minConfidence } : {}),
      ...(args.strictFrameRate !== undefined ? { strictFrameRate: args.strictFrameRate } : {}),
    });
    statusCounts[match.status] = (statusCounts[match.status] ?? 0) + 1;

    const targetTrackIndex = trackPlan.targetBySourceTrack[clip.trackIndex] ?? clip.trackIndex;
    const canPlace = match.status === 'matched' && match.best?.safeToPlace === true && Boolean(match.best.projectItemId) && trackPlan.safe;
    if (canPlace && match.best?.projectItemId) {
      const timelineStartFrame = clip.timelineStartFrame ?? 0;
      const durationFrames = clip.sourceDurationFrames
        ?? (typeof clip.timelineStartFrame === 'number' && typeof clip.timelineEndFrame === 'number' ? clip.timelineEndFrame - clip.timelineStartFrame : 0);
      placementPlan.push({
        offlineClipId: clip.offlineClipId,
        onlineProjectItemId: match.best.projectItemId,
        sourceTrackIndex: clip.trackIndex,
        targetTrackIndex,
        startTime: framesToSeconds(timelineStartFrame, safeSequenceRate),
        duration: framesToSeconds(durationFrames, safeSequenceRate),
        sourceInPoint: framesToSeconds(match.best.onlineSourceInFrame ?? 0, match.best.onlineFrameRate || safeSequenceRate),
        sourceOutPoint: framesToSeconds(match.best.onlineSourceOutFrame ?? ((match.best.onlineSourceInFrame ?? 0) + durationFrames), match.best.onlineFrameRate || safeSequenceRate),
        confidence: match.best.confidence,
        matchStatus: match.status,
        safeToPlace: true,
        handleReport: match.best.handleReport,
        matchedFields: match.best.matchedFields,
      });
    } else {
      reviewItems.push({
        offlineClipId: clip.offlineClipId,
        status: match.status,
        safeToPlace: false,
        targetTrackIndex,
        best: match.best,
        candidates: match.candidates,
        warnings: [...trackPlan.warnings, ...match.warnings],
      });
    }
  }

  const unsafe = reviewItems.length;
  return {
    success: true,
    mutationPlanned: false,
    sequenceId: args.sequenceSnapshot.sequence.sequenceId,
    trackPlan,
    placementPlan,
    reviewItems,
    summary: {
      totalOfflineClips: offlineClips.length,
      matched: statusCounts.matched,
      missingHandles: statusCounts.missingHandles,
      ambiguous: statusCounts.ambiguous,
      reviewRequired: statusCounts.reviewRequired,
      unmatched: statusCounts.unmatched,
      frameRateMismatch: statusCounts.frameRateMismatch,
      unsafe,
      safePlacements: placementPlan.length,
    },
    warnings: trackPlan.warnings,
  };
}
