import type { FrameRate } from './types.js';
import { frameRatesCompatible } from './timecode.js';

export type SourceRangeStatus = 'contained' | 'missingHandles' | 'frameRateMismatch';

export interface CalculateOnlineSourceRangeArgs {
  offlineSourceStartFrame: number;
  offlineSourceInFrame: number;
  offlineDurationFrames: number;
  onlineSourceStartFrame: number;
  onlineDurationFrames: number;
  offlineFrameRate: FrameRate;
  onlineFrameRate: FrameRate;
  toleranceFrames?: number;
  strictFrameRate?: boolean;
}

export interface OnlineSourceRangeResult {
  status: SourceRangeStatus;
  offlineNeededStartFrame: number;
  offlineNeededEndFrame: number;
  onlineSourceInFrame?: number;
  onlineSourceOutFrame?: number;
  missingHeadFrames: number;
  missingTailFrames: number;
  warnings: string[];
}

export function calculateOnlineSourceRange(args: CalculateOnlineSourceRangeArgs): OnlineSourceRangeResult {
  const toleranceFrames = args.toleranceFrames ?? 0;
  const warnings: string[] = [];

  if (!frameRatesCompatible(args.offlineFrameRate, args.onlineFrameRate)) {
    warnings.push('frameRateMismatch');
    if (args.strictFrameRate) {
      return {
        status: 'frameRateMismatch',
        offlineNeededStartFrame: args.offlineSourceStartFrame + args.offlineSourceInFrame,
        offlineNeededEndFrame: args.offlineSourceStartFrame + args.offlineSourceInFrame + args.offlineDurationFrames,
        missingHeadFrames: 0,
        missingTailFrames: 0,
        warnings,
      };
    }
  }

  const offlineNeededStartFrame = args.offlineSourceStartFrame + args.offlineSourceInFrame;
  const offlineNeededEndFrame = offlineNeededStartFrame + args.offlineDurationFrames;
  const onlineSourceEndFrame = args.onlineSourceStartFrame + args.onlineDurationFrames;

  const missingHeadFrames = Math.max(0, args.onlineSourceStartFrame - offlineNeededStartFrame - toleranceFrames);
  const missingTailFrames = Math.max(0, offlineNeededEndFrame - onlineSourceEndFrame - toleranceFrames);
  const hasMissingHandles = missingHeadFrames > 0 || missingTailFrames > 0;

  return {
    status: hasMissingHandles ? 'missingHandles' : 'contained',
    offlineNeededStartFrame,
    offlineNeededEndFrame,
    onlineSourceInFrame: Math.max(0, offlineNeededStartFrame - args.onlineSourceStartFrame),
    onlineSourceOutFrame: Math.max(0, offlineNeededEndFrame - args.onlineSourceStartFrame),
    missingHeadFrames,
    missingTailFrames,
    warnings,
  };
}
