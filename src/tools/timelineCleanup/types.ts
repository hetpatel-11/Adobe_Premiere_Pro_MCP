export type TimelineCleanupTrackType = 'video' | 'audio';

export type TimelineCleanupMode = 'conservative' | 'visual_noop' | 'organize_only';

export type TimelineCleanupClassification =
  | 'safe_remove'
  | 'safe_reorganize'
  | 'preserve_visual_dependency'
  | 'manual_review'
  | 'unsupported';

export type TimelineCleanupRiskFlag =
  | 'mask'
  | 'matte'
  | 'trackMatte'
  | 'adjustment'
  | 'adjustmentLayer'
  | 'nested'
  | 'nestedSequence'
  | 'graphic'
  | 'title'
  | 'keyframe'
  | 'keyframed'
  | 'opacity'
  | 'blendMode'
  | 'alpha'
  | 'motion'
  | 'effect'
  | 'unsupported'
  | 'unsupportedEffect'
  | string;

export interface TimelineCleanupSequenceSnapshot {
  sequenceId: string;
  name?: string;
  frameRate?: number | { fps?: number; numerator?: number; denominator?: number; nominalFps?: number; dropFrame?: boolean };
}

export interface TimelineCleanupTrackSnapshot {
  trackType: TimelineCleanupTrackType;
  trackIndex: number;
  name?: string;
  role?: string;
  clipCount?: number;
  locked?: boolean;
  muted?: boolean;
  visible?: boolean;
  warnings?: string[];
}

export interface TimelineCleanupClipSnapshot {
  clipId: string;
  trackType: TimelineCleanupTrackType;
  trackIndex: number;
  clipIndex?: number;
  name?: string;
  startTime: number;
  endTime: number;
  duration: number;
  enabled?: boolean;
  opacity?: number;
  blendMode?: string | number | null;
  coversFullFrame?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  isAdjustmentLayer?: boolean;
  isGraphic?: boolean;
  isTitle?: boolean;
  isNestedSequence?: boolean;
  hasAlpha?: boolean;
  hasMasks?: boolean;
  hasKeyframes?: boolean;
  effects?: string[];
  componentNames?: string[];
  trackMatteDependencies?: Array<{ targetTrackIndex?: number; sourceTrackIndex?: number; effectName?: string }>;
  riskFlags?: TimelineCleanupRiskFlag[];
  unsupportedFeatures?: string[];
  warnings?: string[];
}

export interface TimelineCleanupSnapshot {
  sequence: TimelineCleanupSequenceSnapshot;
  tracks: TimelineCleanupTrackSnapshot[];
  clips: TimelineCleanupClipSnapshot[];
  warnings?: string[];
}

export interface TimelineCleanupClassificationBase {
  classification: TimelineCleanupClassification;
  reason: string;
  warnings?: string[];
}

export interface TimelineCleanupClipClassification extends TimelineCleanupClassificationBase {
  clipId: string;
  trackType: TimelineCleanupTrackType;
  trackIndex: number;
}

export interface TimelineCleanupTrackClassification extends TimelineCleanupClassificationBase {
  trackType: TimelineCleanupTrackType;
  trackIndex: number;
}

export type TimelineCleanupAction =
  | {
      type: 'removeClip';
      clipId: string;
      trackType: TimelineCleanupTrackType;
      trackIndex: number;
      classification: TimelineCleanupClassification;
      reason: string;
    }
  | {
      type: 'removeTrack';
      trackType: TimelineCleanupTrackType;
      trackIndex: number;
      classification: TimelineCleanupClassification;
      reason: string;
    }
  | {
      type: 'reorganizeClip';
      clipId: string;
      trackType: TimelineCleanupTrackType;
      trackIndex: number;
      targetTrackIndex?: number;
      targetTrackName?: string;
      classification: TimelineCleanupClassification;
      reason: string;
    };

export interface TimelineCleanupAnalysisResult {
  success: boolean;
  mutationPlanned: false;
  analysisId: string;
  sequenceId: string;
  mode: TimelineCleanupMode;
  clipClassifications: TimelineCleanupClipClassification[];
  trackClassifications: TimelineCleanupTrackClassification[];
  actionPlan: TimelineCleanupAction[];
  /** Alias for actionPlan, matching create_clean_timeline_sequence input naming. */
  actions: TimelineCleanupAction[];
  manualReviewItems: Array<TimelineCleanupClipClassification | TimelineCleanupTrackClassification>;
  preservedItems: Array<TimelineCleanupClipClassification | TimelineCleanupTrackClassification>;
  unsupportedItems: Array<TimelineCleanupClipClassification | TimelineCleanupTrackClassification>;
  summary: {
    clips: number;
    tracks: number;
    safeRemove: number;
    safeReorganize: number;
    preserveVisualDependency: number;
    manualReview: number;
    unsupported: number;
    actions: number;
  };
  warnings: string[];
}
