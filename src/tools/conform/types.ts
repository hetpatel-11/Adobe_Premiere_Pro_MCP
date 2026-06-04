export interface FrameRate {
  numerator: number;
  denominator: number;
  fps: number;
  nominalFps: number;
  dropFrame?: boolean;
}

export interface TimecodeParseResult {
  success: boolean;
  frames?: number;
  dropFrame: boolean;
  warnings: string[];
  error?: string;
}

export interface ConformMediaIdentity {
  projectItemId?: string;
  name?: string;
  mediaPath?: string;
  type?: string;
  isOffline?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  width?: number;
  height?: number;
  pixelAspectRatio?: number;
  frameRate?: FrameRate;
  durationFrames?: number;
  durationSeconds?: number;
  sourceStartTimecode?: string;
  sourceStartFrame?: number;
  sourceEndTimecode?: string;
  sourceEndFrame?: number;
  reelName?: string;
  tapeName?: string;
  cameraRoll?: string;
  clipName?: string;
  metadataConfidence?: number;
  warnings: string[];
}

export interface ConformClipSnapshot {
  offlineClipId: string;
  trackIndex: number;
  trackType: 'video' | 'audio';
  clipIndex?: number;
  timelineStartFrame?: number;
  timelineEndFrame?: number;
  timelineDurationFrames?: number;
  sourceInFrame?: number;
  sourceOutFrame?: number;
  sourceDurationFrames?: number;
  projectItemId?: string;
  name?: string;
  mediaPath?: string;
  mediaIdentity?: Partial<ConformMediaIdentity>;
  effectsSnapshot?: unknown;
  keyframeSummary?: unknown;
  unsupportedFeatures?: string[];
  warnings: string[];
}
