import type { ConformClipSnapshot, ConformMediaIdentity, FrameRate } from './types.js';
import { calculateOnlineSourceRange, type OnlineSourceRangeResult } from './sourceRange.js';
import { frameRatesCompatible, normalizeFrameRate, parseTimecodeToFrames } from './timecode.js';

export type MatchStatus = 'matched' | 'missingHandles' | 'ambiguous' | 'reviewRequired' | 'unmatched' | 'frameRateMismatch';
export type MatchField = 'reelName' | 'startTimecode' | 'duration' | 'filename';

export interface CandidateMatch {
  projectItemId: string | undefined;
  name: string | undefined;
  confidence: number;
  matchedFields: MatchField[];
  warnings: string[];
  safeToPlace: boolean;
  handleReport: OnlineSourceRangeResult;
  onlineSourceInFrame: number | undefined;
  onlineSourceOutFrame: number | undefined;
  onlineFrameRate?: FrameRate;
}

export interface CandidateMatchResult {
  status: MatchStatus;
  best?: CandidateMatch;
  candidates: CandidateMatch[];
  warnings: string[];
}

export interface MatchOptions {
  toleranceFrames?: number;
  matchFields?: MatchField[];
  minConfidence?: number;
  strictFrameRate?: boolean;
}

function clipFrameRate(clip: ConformClipSnapshot): FrameRate | undefined {
  const rate = clip.mediaIdentity?.frameRate as FrameRate | undefined;
  return rate ? normalizeFrameRate(rate) : undefined;
}

function mediaFrameRate(media: ConformMediaIdentity): FrameRate | undefined {
  return media.frameRate ? normalizeFrameRate(media.frameRate) : undefined;
}

function appendTimecodeDiagnostics(prefix: string, parsed: ReturnType<typeof parseTimecodeToFrames>, warnings: string[]): void {
  warnings.push(...parsed.warnings.map((warning) => `${prefix}: ${warning}`));
  if (!parsed.success && parsed.error) {
    warnings.push(`${prefix} parse failed: ${parsed.error}`);
  }
}

function mediaSourceStartFrame(media: ConformMediaIdentity, rate: FrameRate, warnings: string[]): number | undefined {
  if (typeof media.sourceStartFrame === 'number') return media.sourceStartFrame;
  if (media.sourceStartTimecode) {
    const parsed = parseTimecodeToFrames(media.sourceStartTimecode, rate);
    appendTimecodeDiagnostics('onlineSourceStartTimecode', parsed, warnings);
    if (parsed.success) return parsed.frames;
  }
  return undefined;
}

function clipSourceStartFrame(clip: ConformClipSnapshot, rate: FrameRate, warnings: string[]): number | undefined {
  const identity = clip.mediaIdentity || {};
  if (typeof identity.sourceStartFrame === 'number') return identity.sourceStartFrame;
  if (identity.sourceStartTimecode) {
    const parsed = parseTimecodeToFrames(identity.sourceStartTimecode, rate);
    appendTimecodeDiagnostics('offlineSourceStartTimecode', parsed, warnings);
    if (parsed.success) return parsed.frames;
  }
  return undefined;
}

function normalizedName(value?: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/_offline|offline|proxy|lowres|low_res/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function reelName(clip: ConformClipSnapshot): string | undefined {
  return clip.mediaIdentity?.reelName || clip.mediaIdentity?.tapeName || clip.mediaIdentity?.cameraRoll;
}

function sameReel(offline?: string, online?: string): boolean {
  return Boolean(offline && online && offline.toLowerCase() === online.toLowerCase());
}

export function scoreOnlineCandidate(
  offlineClip: ConformClipSnapshot,
  onlineMedia: ConformMediaIdentity,
  options: MatchOptions = {}
): CandidateMatch {
  const matchFields = options.matchFields || ['reelName', 'startTimecode', 'duration'];
  const toleranceFrames = options.toleranceFrames ?? 0;
  const offlineRate = clipFrameRate(offlineClip);
  const onlineRate = mediaFrameRate(onlineMedia);
  const warnings: string[] = [...(onlineMedia.warnings || [])];
  if (!offlineRate) warnings.push('missingOfflineFrameRate');
  if (!onlineRate) warnings.push('missingOnlineFrameRate');
  const matchedFields: MatchField[] = [];
  let confidence = 0;

  const offlineSourceStart = offlineRate ? clipSourceStartFrame(offlineClip, offlineRate, warnings) : undefined;
  const onlineSourceStart = onlineRate ? mediaSourceStartFrame(onlineMedia, onlineRate, warnings) : undefined;
  const offlineDuration = offlineClip.sourceDurationFrames
    ?? (typeof offlineClip.timelineStartFrame === 'number' && typeof offlineClip.timelineEndFrame === 'number'
      ? offlineClip.timelineEndFrame - offlineClip.timelineStartFrame
      : undefined);
  const onlineDuration = onlineMedia.durationFrames ?? (onlineMedia.durationSeconds && onlineRate ? Math.round(onlineMedia.durationSeconds * onlineRate.fps) : undefined);
  const offlineSourceIn = offlineClip.sourceInFrame ?? 0;

  if (matchFields.includes('reelName') && sameReel(reelName(offlineClip), onlineMedia.reelName || onlineMedia.tapeName || onlineMedia.cameraRoll)) {
    confidence += 0.45;
    matchedFields.push('reelName');
  }

  const rangeInputsAvailable = typeof offlineSourceStart === 'number'
    && typeof onlineSourceStart === 'number'
    && typeof offlineDuration === 'number'
    && typeof onlineDuration === 'number';

  let handleReport: OnlineSourceRangeResult;
  if (rangeInputsAvailable && offlineRate && onlineRate) {
    handleReport = calculateOnlineSourceRange({
      offlineSourceStartFrame: offlineSourceStart,
      offlineSourceInFrame: offlineSourceIn,
      offlineDurationFrames: offlineDuration,
      onlineSourceStartFrame: onlineSourceStart,
      onlineDurationFrames: onlineDuration,
      offlineFrameRate: offlineRate,
      onlineFrameRate: onlineRate,
      toleranceFrames,
      strictFrameRate: options.strictFrameRate === true,
    });
    warnings.push(...handleReport.warnings);
    if (matchFields.includes('startTimecode')) {
      confidence += 0.35;
      matchedFields.push('startTimecode');
    }
    if (matchFields.includes('duration') && onlineDuration + toleranceFrames >= offlineDuration) {
      confidence += 0.15;
      matchedFields.push('duration');
    }
  } else {
    handleReport = {
      status: offlineRate && onlineRate && !frameRatesCompatible(offlineRate, onlineRate) ? 'frameRateMismatch' : 'missingHandles',
      offlineNeededStartFrame: (offlineSourceStart ?? 0) + offlineSourceIn,
      offlineNeededEndFrame: (offlineSourceStart ?? 0) + offlineSourceIn + (offlineDuration ?? 0),
      missingHeadFrames: rangeInputsAvailable ? 0 : 1,
      missingTailFrames: rangeInputsAvailable ? 0 : 1,
      warnings: ['insufficientSourceRangeMetadata'],
    };
    warnings.push('insufficientSourceRangeMetadata');
  }

  if (matchFields.includes('filename') && normalizedName(offlineClip.name).length > 0 && normalizedName(onlineMedia.name).includes(normalizedName(offlineClip.name))) {
    confidence += 0.25;
    matchedFields.push('filename');
  }

  confidence = Math.min(1, Number(confidence.toFixed(4)));
  const safeToPlace = confidence >= (options.minConfidence ?? 0.7)
    && handleReport.status === 'contained'
    && matchedFields.includes('startTimecode')
    && (matchedFields.includes('reelName') || !matchFields.includes('reelName'));

  return {
    projectItemId: onlineMedia.projectItemId,
    name: onlineMedia.name,
    confidence,
    matchedFields,
    warnings,
    safeToPlace,
    handleReport,
    onlineSourceInFrame: handleReport.onlineSourceInFrame,
    onlineSourceOutFrame: handleReport.onlineSourceOutFrame,
    ...(onlineRate ? { onlineFrameRate: onlineRate } : {}),
  };
}

export function matchOnlineCandidates(
  offlineClip: ConformClipSnapshot,
  onlineMedia: ConformMediaIdentity[],
  options: MatchOptions = {}
): CandidateMatchResult {
  const minConfidence = options.minConfidence ?? 0.7;
  const candidates = onlineMedia
    .map((media) => scoreOnlineCandidate(offlineClip, media, options))
    .filter((candidate) => candidate.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    return { status: 'unmatched', candidates: [], warnings: ['noCandidatesMatched'] };
  }

  const best = candidates[0]!;
  const tied = candidates.filter((candidate) => Math.abs(candidate.confidence - best.confidence) < 0.0001);
  if (tied.length > 1 && best.confidence >= minConfidence) {
    return {
      status: 'ambiguous',
      best: { ...best, safeToPlace: false, warnings: [...best.warnings, 'ambiguousCandidates'] },
      candidates: tied.map((candidate) => ({ ...candidate, safeToPlace: false })),
      warnings: ['ambiguousCandidates'],
    };
  }

  if (best.matchedFields.includes('filename') && !best.matchedFields.includes('startTimecode')) {
    return { status: 'reviewRequired', best: { ...best, safeToPlace: false }, candidates, warnings: [...best.warnings, 'filenameOnlyMatch'] };
  }

  if (best.handleReport.status === 'frameRateMismatch') {
    return { status: 'frameRateMismatch', best: { ...best, safeToPlace: false }, candidates, warnings: best.warnings };
  }

  if (best.handleReport.status === 'missingHandles') {
    return { status: 'missingHandles', best: { ...best, safeToPlace: false }, candidates, warnings: best.warnings };
  }

  if (best.safeToPlace) {
    return { status: 'matched', best, candidates, warnings: best.warnings };
  }

  return { status: 'reviewRequired', best: { ...best, safeToPlace: false }, candidates, warnings: best.warnings };
}
