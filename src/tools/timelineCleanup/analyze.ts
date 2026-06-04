import type {
  TimelineCleanupAction,
  TimelineCleanupAnalysisResult,
  TimelineCleanupClassification,
  TimelineCleanupClipClassification,
  TimelineCleanupClipSnapshot,
  TimelineCleanupMode,
  TimelineCleanupSnapshot,
  TimelineCleanupTrackClassification,
  TimelineCleanupTrackSnapshot,
} from './types.js';

export interface AnalyzeTimelineCleanupArgs {
  cleanupSnapshot: TimelineCleanupSnapshot;
  mode?: TimelineCleanupMode;
  removeDisabledClips?: boolean;
  removeFullyCoveredClips?: boolean;
  organizeGraphics?: boolean;
}

const EPSILON_SECONDS = 0.001;

function normalizeMode(mode?: TimelineCleanupMode): TimelineCleanupMode {
  return mode || 'conservative';
}

function hasTextMatching(values: Array<string | undefined>, pattern: RegExp): boolean {
  return values.some((value) => typeof value === 'string' && pattern.test(value));
}

function clipRiskNames(clip: TimelineCleanupClipSnapshot): string[] {
  const risks = new Set<string>();
  for (const flag of clip.riskFlags || []) risks.add(String(flag));
  if (clip.isAdjustmentLayer) risks.add('adjustmentLayer');
  if (clip.isGraphic) risks.add('graphic');
  if (clip.isTitle) risks.add('title');
  if (clip.isNestedSequence) risks.add('nestedSequence');
  if (clip.hasAlpha) risks.add('alpha');
  if (clip.hasMasks) risks.add('mask');
  if (clip.hasKeyframes) risks.add('keyframe');
  if ((clip.trackMatteDependencies || []).length > 0) risks.add('trackMatte');
  if ((clip.unsupportedFeatures || []).length > 0) risks.add('unsupportedEffect');
  if (clip.opacity !== undefined && clip.opacity < 100) risks.add('opacity');
  if (clip.blendMode !== undefined && clip.blendMode !== null && String(clip.blendMode).toLowerCase() !== 'normal' && String(clip.blendMode) !== '0') {
    risks.add('blendMode');
  }
  if (hasTextMatching(clip.effects || [], /matte|mask|set matte|track matte/i)) risks.add('matte');
  if (hasTextMatching(clip.componentNames || [], /matte|mask|opacity|crop|motion|transform/i)) risks.add('effect');
  if (hasTextMatching(clip.warnings || [], /unsupported|effectInspection|componentsUnavailable|matte|mask|keyframe|blend|opacity/i)) risks.add('unsupportedEffect');
  return Array.from(risks);
}

function hasUnsupportedRisk(risks: string[]): boolean {
  return risks.some((risk) => /unsupported|unknown/i.test(risk));
}

function hasVisualDependencyRisk(risks: string[]): boolean {
  return risks.some((risk) => /mask|matte|adjustment|nested|graphic|title|keyframe|opacity|blend|alpha|motion|effect/i.test(risk));
}

function hasGlobalTrackIndexDependency(snapshot: TimelineCleanupSnapshot): boolean {
  if ((snapshot.warnings || []).some((warning) => /matte|track.?index|dependency|unknown|unsupported|inspection/i.test(warning))) return true;
  return snapshot.clips.some((clip) => (
    (clip.trackMatteDependencies || []).length > 0
    || hasTextMatching(clip.riskFlags || [], /matte|track.?index|dependency/i)
    || hasTextMatching(clip.effects || [], /track matte|set matte|matte/i)
    || hasTextMatching(clip.componentNames || [], /track matte|set matte|matte/i)
    || hasTextMatching(clip.warnings || [], /matte|track.?index|dependency|unknown|unsupported/i)
  ));
}

function clipMayCarryAudio(clip: TimelineCleanupClipSnapshot): boolean {
  return clip.trackType === 'audio'
    || clip.hasAudio === true
    || hasTextMatching(clip.warnings || [], /audio|link|sync/i)
    || hasTextMatching(clip.riskFlags || [], /audio|link|sync/i);
}

function isOpaqueFullFrameCoverage(clip: TimelineCleanupClipSnapshot): boolean {
  const risks = clipRiskNames(clip);
  if (clip.enabled === false) return false;
  if (clip.trackType !== 'video') return false;
  if (clip.coversFullFrame !== true) return false;
  if (clip.opacity !== undefined && clip.opacity < 100) return false;
  if (clip.blendMode !== undefined && clip.blendMode !== null && String(clip.blendMode).toLowerCase() !== 'normal' && String(clip.blendMode) !== '0') return false;
  return risks.length === 0;
}

function findCoveringUpperClips(clip: TimelineCleanupClipSnapshot, clips: TimelineCleanupClipSnapshot[]): TimelineCleanupClipSnapshot[] {
  if (clip.trackType !== 'video') return [];
  return clips.filter((candidate) => (
    candidate.trackType === 'video'
    && candidate.trackIndex > clip.trackIndex
    && candidate.enabled !== false
    && candidate.startTime <= clip.startTime + EPSILON_SECONDS
    && candidate.endTime >= clip.endTime - EPSILON_SECONDS
  ));
}

function classifyTrack(track: TimelineCleanupTrackSnapshot, clips: TimelineCleanupClipSnapshot[], hasTrackIndexDependency: boolean): TimelineCleanupTrackClassification {
  const warnings = track.warnings || [];
  const clipsOnTrack = clips.filter((clip) => clip.trackType === track.trackType && clip.trackIndex === track.trackIndex);
  const clipCount = track.clipCount ?? clipsOnTrack.length;
  if (clipCount === 0 && clipsOnTrack.length === 0) {
    if (warnings.some((warning) => /matte|track.?index|dependency|unknown|unsupported/i.test(warning))) {
      return {
        trackType: track.trackType,
        trackIndex: track.trackIndex,
        classification: 'manual_review',
        reason: 'empty track has warnings that may indicate track-index dependencies',
        warnings,
      };
    }
    if (hasTrackIndexDependency) {
      return {
        trackType: track.trackType,
        trackIndex: track.trackIndex,
        classification: 'manual_review',
        reason: 'empty track preserved because timeline has track-index or matte dependencies elsewhere',
        warnings,
      };
    }
    return {
      trackType: track.trackType,
      trackIndex: track.trackIndex,
      classification: 'safe_remove',
      reason: 'track is empty and has no dependency warnings',
      warnings,
    };
  }
  return {
    trackType: track.trackType,
    trackIndex: track.trackIndex,
    classification: 'preserve_visual_dependency',
    reason: 'track contains clips or may carry timeline structure',
    warnings,
  };
}

function classifyClip(clip: TimelineCleanupClipSnapshot, args: Required<Pick<AnalyzeTimelineCleanupArgs, 'mode' | 'removeDisabledClips' | 'removeFullyCoveredClips' | 'organizeGraphics'>>, allClips: TimelineCleanupClipSnapshot[]): TimelineCleanupClipClassification {
  const risks = clipRiskNames(clip);
  const warnings = [...(clip.warnings || []), ...(clip.unsupportedFeatures || [])];
  const base = { clipId: clip.clipId, trackType: clip.trackType, trackIndex: clip.trackIndex, warnings };

  if (hasUnsupportedRisk(risks)) {
    return { ...base, classification: 'unsupported', reason: `unsupported cleanup inspection risk: ${risks.join(', ')}` };
  }

  if (hasVisualDependencyRisk(risks)) {
    return { ...base, classification: 'preserve_visual_dependency', reason: `clip has visual dependency risk: ${risks.join(', ')}` };
  }

  if (clip.enabled === false) {
    if (args.mode === 'visual_noop' && args.removeDisabledClips) {
      if (clipMayCarryAudio(clip)) {
        return { ...base, classification: 'manual_review', reason: 'disabled clip is preserved because it may carry linked or timeline audio' };
      }
      return { ...base, classification: 'safe_remove', reason: 'disabled clip explicitly allowed for visual_noop cleanup and no risks were detected' };
    }
    return { ...base, classification: 'manual_review', reason: 'disabled clip is preserved by default because it may be editorial reference material' };
  }

  const upperCoveringClips = findCoveringUpperClips(clip, allClips);
  if (args.mode === 'visual_noop' && args.removeFullyCoveredClips && upperCoveringClips.length > 0) {
    if (clipMayCarryAudio(clip)) {
      return { ...base, classification: 'manual_review', reason: 'fully covered clip is preserved because it may carry linked or timeline audio' };
    }
    const unsafeUpper = upperCoveringClips.find((upper) => !isOpaqueFullFrameCoverage(upper));
    if (unsafeUpper) {
      return {
        ...base,
        classification: 'preserve_visual_dependency',
        reason: `upper layer ${unsafeUpper.clipId} is not proven opaque/full-frame dependency-free`,
      };
    }
    return {
      ...base,
      classification: 'safe_remove',
      reason: 'clip is fully covered for its duration by opaque full-frame dependency-free upper layer(s)',
    };
  }

  if (args.mode === 'organize_only' && args.organizeGraphics && (clip.isGraphic || clip.isTitle)) {
    return { ...base, classification: 'safe_reorganize', reason: 'graphic/title clip can be organized without deletion when track order is preserved' };
  }

  return { ...base, classification: 'preserve_visual_dependency', reason: 'active clip may contribute to visual or audio output' };
}

function actionForClip(classification: TimelineCleanupClipClassification): TimelineCleanupAction | null {
  if (classification.classification === 'safe_remove') {
    return {
      type: 'removeClip',
      clipId: classification.clipId,
      trackType: classification.trackType,
      trackIndex: classification.trackIndex,
      classification: classification.classification,
      reason: classification.reason,
    };
  }
  if (classification.classification === 'safe_reorganize') {
    return {
      type: 'reorganizeClip',
      clipId: classification.clipId,
      trackType: classification.trackType,
      trackIndex: classification.trackIndex,
      classification: classification.classification,
      reason: classification.reason,
    };
  }
  return null;
}

function actionForTrack(classification: TimelineCleanupTrackClassification): TimelineCleanupAction | null {
  if (classification.classification !== 'safe_remove') return null;
  return {
    type: 'removeTrack',
    trackType: classification.trackType,
    trackIndex: classification.trackIndex,
    classification: classification.classification,
    reason: classification.reason,
  };
}

function actionsForTracks(trackClassifications: TimelineCleanupTrackClassification[]): TimelineCleanupAction[] {
  const actions: TimelineCleanupAction[] = [];
  for (const trackType of ['video', 'audio'] as const) {
    const tracksOfType = trackClassifications.filter((track) => track.trackType === trackType);
    const removable = tracksOfType
      .filter((track) => track.classification === 'safe_remove')
      .sort((a, b) => b.trackIndex - a.trackIndex);
    const maxRemovable = Math.max(0, tracksOfType.length - 1);
    for (const track of removable.slice(0, maxRemovable)) {
      const action = actionForTrack(track);
      if (action) actions.push(action);
    }
  }
  return actions;
}

function countByClassification(items: Array<{ classification: TimelineCleanupClassification }>, classification: TimelineCleanupClassification): number {
  return items.filter((item) => item.classification === classification).length;
}

export function analyzeTimelineCleanup(input: AnalyzeTimelineCleanupArgs): TimelineCleanupAnalysisResult {
  const mode = normalizeMode(input.mode);
  const args = {
    mode,
    removeDisabledClips: input.removeDisabledClips ?? false,
    removeFullyCoveredClips: input.removeFullyCoveredClips ?? false,
    organizeGraphics: input.organizeGraphics ?? false,
  };
  const snapshot = input.cleanupSnapshot;
  const hasTrackIndexDependency = hasGlobalTrackIndexDependency(snapshot);
  const trackClassifications = snapshot.tracks.map((track) => classifyTrack(track, snapshot.clips, hasTrackIndexDependency));
  const clipClassifications = snapshot.clips.map((clip) => classifyClip(clip, args, snapshot.clips));
  const actionPlan = [
    ...clipClassifications.map(actionForClip).filter((action): action is TimelineCleanupAction => action !== null),
    ...actionsForTracks(trackClassifications),
  ];
  const allClassifications = [...clipClassifications, ...trackClassifications];
  return {
    success: true,
    mutationPlanned: false,
    analysisId: `${snapshot.sequence.sequenceId}:timeline-cleanup:${mode}`,
    sequenceId: snapshot.sequence.sequenceId,
    mode,
    clipClassifications,
    trackClassifications,
    actionPlan,
    actions: actionPlan,
    manualReviewItems: allClassifications.filter((item) => item.classification === 'manual_review'),
    preservedItems: allClassifications.filter((item) => item.classification === 'preserve_visual_dependency'),
    unsupportedItems: allClassifications.filter((item) => item.classification === 'unsupported'),
    summary: {
      clips: snapshot.clips.length,
      tracks: snapshot.tracks.length,
      safeRemove: countByClassification(allClassifications, 'safe_remove'),
      safeReorganize: countByClassification(allClassifications, 'safe_reorganize'),
      preserveVisualDependency: countByClassification(allClassifications, 'preserve_visual_dependency'),
      manualReview: countByClassification(allClassifications, 'manual_review'),
      unsupported: countByClassification(allClassifications, 'unsupported'),
      actions: actionPlan.length,
    },
    warnings: snapshot.warnings || [],
  };
}
