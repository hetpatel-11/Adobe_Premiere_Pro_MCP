/**
 * MCP Tools for Adobe Premiere Pro
 * 
 * This module provides tools that can be called by AI agents to perform
 * various video editing operations in Adobe Premiere Pro.
 */

import { z } from 'zod';
import { execFile } from 'child_process';
import { constants, promises as fs } from 'fs';
import type { Dirent, Stats } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { promisify } from 'util';
import type { PremiereProBridgeDiagnostics, PremiereProTransport } from '../bridge/types.js';
import { Logger } from '../utils/logger.js';
import { createMotionDemoAssets } from '../utils/demoAssets.js';
import {
  formatCaptionEntries,
  parseSrt,
  parseVtt,
  qcCaptions as runCaptionQc,
  searchCaptions as runCaptionSearch,
  serializeCsv,
  serializeJson,
  serializeSrt,
  serializeVtt,
} from './captions/sidecar.js';
import type { CaptionEntry, CaptionQcFinding, CaptionQcOptions } from './captions/sidecar.js';
import { analyzeStackedOnlineConform } from './conform/analyze.js';
import { buildEffectCopyPlan, normalizeEffectSnapshots } from './conform/effects.js';
import type { BuildEffectCopyPlanArgs, RasterDimensions } from './conform/effects.js';
import { validateStackedConformExecutionPlan } from './conform/executionPlan.js';
import type { StackedConformExecutionPlanArgs } from './conform/executionPlan.js';
import { planStackedConformQc } from './conform/qc.js';
import type { PlanStackedConformQcArgs } from './conform/qc.js';
import type { MatchField } from './conform/matching.js';
import { analyzeTimelineCleanup } from './timelineCleanup/analyze.js';
import { validateTimelineCleanupExecutionPlan } from './timelineCleanup/executionPlan.js';
import { planTimelineCleanupQc } from './timelineCleanup/qc.js';
import type { TimelineCleanupAction, TimelineCleanupMode, TimelineCleanupSnapshot } from './timelineCleanup/types.js';
import { buildPremiereScript, literalForExtendScript } from './extendscript.js';

const execFileAsync = promisify(execFile);

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
}

type MotionStyle = 'push_in' | 'pull_out' | 'alternate' | 'none';
type InsertMode = 'overwrite' | 'insert';
type ClipScaleMode = 'fit' | 'fill' | 'stretch';

interface ClipPlanTransition {
  name?: string;
  duration?: number;
}

interface ClipPlanMotion {
  style?: MotionStyle;
  from?: number;
  to?: number;
  startTime?: number;
  endTime?: number;
  componentName?: string;
  paramName?: string;
}

interface ClipPlanTrim {
  inPoint?: number;
  outPoint?: number;
  duration?: number;
}

interface ClipPlanColor {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hue?: number;
  temperature?: number;
  tint?: number;
  highlights?: number;
  shadows?: number;
}

interface ClipPlanStep {
  assetIndex?: number;
  time?: number;
  trackIndex?: number;
  insertMode?: InsertMode;
  transitionAfter?: ClipPlanTransition;
  motion?: ClipPlanMotion;
  trim?: ClipPlanTrim;
  effects?: string[];
  color?: ClipPlanColor;
}

interface AssembleProductSpotArgs {
  sequenceName: string;
  assetPaths: string[];
  clipDuration?: number;
  videoTrackIndex?: number;
  transitionName?: string;
  transitionDuration?: number;
  motionStyle?: MotionStyle;
  clipPlan?: ClipPlanStep[];
}

interface AssembleFromEditPlanArgs {
  sequenceName: string;
  assetPaths: string[];
  clipDuration?: number;
  videoTrackIndex?: number;
  transitionName?: string;
  transitionDuration?: number;
  clipPlan?: ClipPlanStep[];
  dryRun?: boolean;
  includePostcondition?: boolean;
}

interface BuildBrandSpotArgs extends AssembleProductSpotArgs {
  mogrtPath?: string;
  titleTrackIndex?: number;
  titleStartTime?: number;
  applyDefaultPolish?: boolean;
}

interface LiveToolSweepSafeArgs {
  scratchProjectName?: string;
  scratchProjectDir: string;
  reportPath?: string;
  mode?: 'smoke';
}

interface ListExportPresetsArgs {
  searchRoots?: string[];
  includeAdobeDefaults?: boolean;
  query?: string;
}

interface ExportPresetInfo {
  name: string;
  path: string;
  source: string;
  mtimeMs: number;
  sizeBytes: number;
}

interface QcRenderedMediaArgs {
  filePath: string;
  expectedDurationSeconds?: number;
  durationToleranceSeconds?: number;
  minSizeBytes?: number;
}

interface CaptureFrameArgs {
  sequenceId: string;
  time: number;
  outputPath?: string;
  format?: 'png' | 'jpg' | 'tiff';
  deleteAfterRead?: boolean;
}

interface ExportOmfArgs {
  sequenceId: string;
  outputPath: string;
  title?: string;
  sampleRate?: number;
  bitsPerSample?: number;
  audioEncapsulated?: boolean;
  audioFileFormat?: 'wav' | 'aiff';
  trimAudioFiles?: boolean;
  handleFrames?: number;
  dryRun?: boolean;
  overwrite?: boolean;
}

interface ScanConformMediaMetadataArgs {
  projectItemIds?: string[];
  mediaPaths?: string[];
  binId?: string;
  includeOffline?: boolean;
  includeSequences?: boolean;
  includeXmp?: boolean;
  metadataFields?: string[];
}

interface SnapshotSequenceForConformArgs {
  sequenceId: string;
  trackRoles?: {
    video?: Record<string, 'picture' | 'passthrough' | 'ignore'>;
    audio?: Record<string, 'audio' | 'ignore'>;
  };
  includeEffects?: boolean;
  includeKeyframes?: boolean;
  includeDisabled?: boolean;
}

interface AnalyzeStackedOnlineConformToolArgs {
  sequenceId?: string;
  sequenceSnapshot?: any;
  onlineMedia: any[];
  sourceTrackIndices?: number[];
  targetTrackBySourceTrack?: Record<number, number>;
  matchFields?: MatchField[];
  toleranceFrames?: number;
  minConfidence?: number;
  strictFrameRate?: boolean;
}

interface CreateStackedOnlineConformSequenceArgs extends StackedConformExecutionPlanArgs {
  dryRun?: boolean;
}

interface CopyConformClipEffectsArgs extends Omit<BuildEffectCopyPlanArgs, 'sourceEffects'> {
  sequenceId?: string;
  sourceEffects?: unknown[];
  dryRun?: boolean;
}

interface QcStackedOnlineConformArgs extends PlanStackedConformQcArgs {
  dryRun?: boolean;
}

interface ScanTimelineCleanupStateArgs {
  sequenceId: string;
  includeDisabled?: boolean;
  includeEffects?: boolean;
  includeKeyframes?: boolean;
}

interface AnalyzeTimelineCleanupToolArgs {
  sequenceId?: string;
  cleanupSnapshot?: TimelineCleanupSnapshot;
  mode?: TimelineCleanupMode;
  removeDisabledClips?: boolean;
  removeFullyCoveredClips?: boolean;
  organizeGraphics?: boolean;
}

interface CreateCleanTimelineSequenceArgs {
  sourceSequenceId: string;
  cleanSequenceName: string;
  duplicateSequence?: boolean;
  allowMutatingSourceSequence?: boolean;
  analysisId?: string;
  actions: TimelineCleanupAction[];
  mode?: TimelineCleanupMode;
  removeDisabledClips?: boolean;
  removeFullyCoveredClips?: boolean;
  organizeGraphics?: boolean;
  dryRun?: boolean;
}

interface QcTimelineCleanupArgs {
  sourceSequenceId: string;
  cleanSequenceId?: string;
  outputDir: string;
  allowedOutputRoot?: string;
  cleanupResult: any;
  sampleTimes?: number[];
  format?: 'png' | 'jpg' | 'tiff';
  dryRun?: boolean;
}

interface RemoveCaptionTracksArgs {
  sequenceId?: string;
  dryRun?: boolean;
}

interface DuplicateSequenceWithoutCaptionsArgs {
  sequenceId: string;
  newName?: string;
  dryRun?: boolean;
}

const nonEmptyStringArraySchema = z.array(z.string().min(1)).min(1);

const captionCueSchema = z.object({
  start: z.number().finite().min(0).describe('Caption cue start time in seconds.'),
  end: z.number().finite().min(0).describe('Caption cue end time in seconds.'),
  text: z.string().describe('Caption cue text. Empty strings are allowed so QC can report them.'),
  id: z.string().min(1).optional().describe('Optional stable cue identifier.'),
  index: z.number().finite().int().min(0).optional().describe('Optional zero- or one-based cue index from the source sidecar.')
}).refine((cue) => cue.end > cue.start, {
  message: 'end must be greater than start',
  path: ['end']
});

const captionCueArraySchema = z.array(captionCueSchema).min(1).describe('Caption cues with start/end seconds and text.');
const captionSidecarFormatSchema = z.enum(['srt', 'vtt', 'json', 'csv']);
const premiereCaptionFormatSchema = z.enum(['subtitle', 'cea-608', 'cea-708', 'teletext']).describe('Premiere caption format key. Supported values: subtitle, cea-608, cea-708, teletext.');

const probeNativeTranscriptionCapabilitiesSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to include in native Adobe/Premiere transcription capability diagnostics.'),
  includeDiagnostics: z.boolean().optional().describe('When true, include extra capability diagnostics where Premiere exposes them. No transcription is started.')
});

const generateSequenceTranscriptSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID. Defaults to the active sequence when native Premiere transcription support is implemented.'),
  dryRun: z.boolean().optional().describe('When true, only report the planned native Adobe/Premiere transcription request; no transcript generation should be started.'),
  poll: z.boolean().optional().describe('When true, later implementation may poll the native Premiere transcription job to completion instead of returning immediately.')
});

const generateCaptionsFromPremiereTranscriptSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID whose existing native Premiere transcript should be used. Defaults to the active sequence when implemented.'),
  dryRun: z.boolean().optional().describe('When true, only report the planned native Adobe/Premiere caption-generation request; no captions should be created.'),
  captionFormat: premiereCaptionFormatSchema.optional(),
  maxCharsPerLine: z.number().finite().int().positive().optional().describe('Maximum caption characters per line requested from native Premiere caption generation.'),
  maxLines: z.number().finite().int().positive().optional().describe('Maximum lines per caption requested from native Premiere caption generation.')
});

const captionsSourceSchema = {
  captions: captionCueArraySchema.optional(),
  inputPath: z.string().min(1).optional().describe('Optional caption sidecar input path to read when captions are not supplied inline.'),
  sequenceId: z.string().min(1).optional().describe('Optional Premiere sequence ID to read existing sequence captions when captions/inputPath are not supplied.')
};

function hasCaptionSource(value: { captions?: unknown; inputPath?: unknown; sequenceId?: unknown }): boolean {
  return Boolean(value.captions || value.inputPath || value.sequenceId);
}

const formatCaptionsSchema = z.object({
  ...captionsSourceSchema,
  outputPath: z.string().min(1).optional().describe('Optional output sidecar path for formatted captions.'),
  format: captionSidecarFormatSchema.optional().describe('Optional output sidecar format.'),
  overwrite: z.boolean().optional().describe('Whether an existing outputPath may be overwritten.'),
  maxCharsPerLine: z.number().finite().int().positive().optional().describe('Maximum characters per formatted line.'),
  maxLines: z.number().finite().int().positive().optional().describe('Maximum lines per formatted caption cue.'),
  mergeGapSeconds: z.number().finite().min(0).optional().describe('Merge adjacent non-overlapping cues separated by no more than this gap.'),
  trimWhitespace: z.boolean().optional().describe('Trim and normalize whitespace in caption text.'),
  splitLongLines: z.boolean().optional().describe('Split long caption text according to maxCharsPerLine/maxLines when possible.')
}).refine(hasCaptionSource, {
  message: 'Provide captions, inputPath, or sequenceId',
  path: ['captions']
});

const qcCaptionsSchema = z.object({
  ...captionsSourceSchema,
  outputPath: z.string().min(1).optional().describe('Optional path for a QC report sidecar.'),
  format: captionSidecarFormatSchema.optional().describe('Optional input sidecar format when inputPath does not make it obvious.'),
  overwrite: z.boolean().optional().describe('Whether an existing outputPath may be overwritten.'),
  maxCharsPerLine: z.number().finite().int().positive().optional().describe('Maximum allowed characters per caption line.'),
  maxLines: z.number().finite().int().positive().optional().describe('Maximum allowed lines per caption cue.'),
  minDurationSeconds: z.number().finite().min(0).optional().describe('Minimum allowed cue duration in seconds.'),
  maxDurationSeconds: z.number().finite().min(0).optional().describe('Maximum allowed cue duration in seconds.'),
  maxReadingCps: z.number().finite().positive().optional().describe('Maximum reading speed in characters per second.'),
  allowOverlaps: z.boolean().optional().describe('Whether overlapping caption cues should be allowed.'),
  requireNonEmptyText: z.boolean().optional().describe('Whether empty/whitespace-only text should be reported as a QC failure.'),
  bannedTerms: z.array(z.string().min(1)).optional().describe('Terms that should be flagged when present in caption text.'),
  caseSensitiveBannedTerms: z.boolean().optional().describe('Use case-sensitive banned-term matching.')
}).refine(hasCaptionSource, {
  message: 'Provide captions, inputPath, or sequenceId',
  path: ['captions']
}).refine((value) =>
  value.minDurationSeconds === undefined ||
  value.maxDurationSeconds === undefined ||
  value.maxDurationSeconds >= value.minDurationSeconds,
  { message: 'maxDurationSeconds must be greater than or equal to minDurationSeconds', path: ['maxDurationSeconds'] }
);

const searchCaptionsSchema = z.object({
  ...captionsSourceSchema,
  outputPath: z.string().min(1).optional().describe('Optional path for a search results sidecar/report.'),
  format: captionSidecarFormatSchema.optional().describe('Optional input sidecar format when inputPath does not make it obvious.'),
  overwrite: z.boolean().optional().describe('Whether an existing outputPath may be overwritten.'),
  query: z.string().min(1).describe('Search query or regular expression, depending on useRegex.'),
  useRegex: z.boolean().optional().describe('Treat query as a regular expression.'),
  caseSensitive: z.boolean().optional().describe('Use case-sensitive search matching.'),
  contextCues: z.number().finite().int().min(0).optional().describe('Number of neighboring cues to include before and after each hit.')
}).refine(hasCaptionSource, {
  message: 'Provide captions, inputPath, or sequenceId',
  path: ['captions']
});

const exportCaptionsSchema = z.object({
  ...captionsSourceSchema,
  outputPath: z.string().min(1).describe('Required output sidecar path.'),
  format: captionSidecarFormatSchema.describe('Output caption sidecar format.'),
  overwrite: z.boolean().optional().describe('Whether an existing outputPath may be overwritten.'),
  includeMetadata: z.boolean().optional().describe('Whether to include supported metadata in formats that can carry it.')
}).refine(hasCaptionSource, {
  message: 'Provide captions, inputPath, or sequenceId',
  path: ['captions']
});

const importCaptionsToSequenceSchema = z.object({
  sequenceId: z.string().min(1).describe('Sequence ID that should receive the imported caption sidecar.'),
  filePath: z.string().min(1).describe('Caption sidecar file path to import into the sequence.'),
  startTime: z.number().finite().min(0).optional().describe('Timeline start time in seconds for the imported captions.'),
  captionFormat: premiereCaptionFormatSchema.optional(),
  verifyReadback: z.boolean().optional().describe('After import, read back sequence captions to verify the resulting caption clips when supported.')
});

const removeCaptionTracksSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID. Defaults to the active sequence.'),
  dryRun: z.boolean().default(true).describe('When true, reports native caption track count without mutating Premiere. Defaults to true.')
});

const duplicateSequenceWithoutCaptionsSchema = z.object({
  sequenceId: z.string().min(1).describe('Source sequence ID to duplicate before caption track removal.'),
  newName: z.string().min(1).optional().describe('Optional name for the duplicated captionless sequence.'),
  dryRun: z.boolean().default(true).describe('When true, reports the intended duplicate name without touching Premiere. Defaults to true.')
});

const scanConformMediaMetadataSchema = z.object({
  projectItemIds: nonEmptyStringArraySchema.optional().describe('Project item IDs to scan. Omit to scan project/bin media.'),
  mediaPaths: nonEmptyStringArraySchema.optional().describe('Absolute media paths to match against imported project items.'),
  binId: z.string().min(1).optional().describe('Optional bin project item ID to scan recursively.'),
  includeOffline: z.boolean().optional().describe('Whether to include offline media in the scan. Defaults to false.'),
  includeSequences: z.boolean().optional().describe('Whether to include sequence project items. Defaults to false.'),
  includeXmp: z.boolean().optional().describe('Whether to include raw XMP metadata in diagnostics. Defaults to false.'),
  metadataFields: nonEmptyStringArraySchema.optional().describe('Optional metadata field names to highlight in the raw metadata summary.')
});

const snapshotSequenceForConformSchema = z.object({
  sequenceId: z.string().min(1).describe('Sequence ID to snapshot. Required; this tool does not silently fall back to the active sequence.'),
  trackRoles: z.object({
    video: z.record(z.enum(['picture', 'passthrough', 'ignore'])).optional(),
    audio: z.record(z.enum(['audio', 'ignore'])).optional()
  }).optional().describe('Explicit track roles by zero-based track index.'),
  includeEffects: z.boolean().optional().describe('Whether to include effect/property summaries. Defaults to true.'),
  includeKeyframes: z.boolean().optional().describe('Whether to include keyframe summaries where available. Defaults to false for safety/performance.'),
  includeDisabled: z.boolean().optional().describe('Whether disabled clips should be included. Defaults to true.')
});

const analyzeStackedOnlineConformSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Sequence ID to snapshot before analysis when sequenceSnapshot is not provided.'),
  sequenceSnapshot: z.any().optional().describe('Read-only sequence snapshot from snapshot_sequence_for_conform. Supplying this avoids a Premiere bridge call.'),
  onlineMedia: z.array(z.any()).min(1).describe('Normalized online media records from scan_conform_media_metadata or caller-provided metadata.'),
  sourceTrackIndices: z.array(z.number().int().min(0)).optional().describe('Offline picture track indices to conform. Defaults to picture-role video tracks.'),
  targetTrackBySourceTrack: z.record(z.number().int().min(0)).optional().describe('Optional explicit upper video-track mapping by source track index.'),
  matchFields: z.array(z.enum(['reelName', 'startTimecode', 'duration', 'filename'])).optional().describe('Fields to use for candidate scoring.'),
  toleranceFrames: z.number().int().min(0).optional().describe('Frame tolerance for source range and duration matching.'),
  minConfidence: z.number().min(0).max(1).optional().describe('Minimum confidence required to create a safe placement.'),
  strictFrameRate: z.boolean().optional().describe('When true, frame-rate mismatches are rejected as unsafe.')
}).refine((value) => Boolean(value.sequenceId || value.sequenceSnapshot), {
  message: 'Either sequenceId or sequenceSnapshot is required',
  path: ['sequenceId']
});

const stackedConformPlacementSchema = z.object({
  offlineClipId: z.string().min(1).describe('Offline source timeline clip ID from the conform snapshot/analyzer.'),
  onlineProjectItemId: z.string().min(1).describe('Online media project item ID to stack above the offline edit.'),
  sourceTrackIndex: z.number().int().min(0).describe('Offline source video track index.'),
  targetTrackIndex: z.number().int().min(0).describe('Upper video track index where the online clip should be placed.'),
  startTime: z.number().min(0).describe('Timeline start time in seconds.'),
  sourceInPoint: z.number().min(0).describe('Online media source in point in seconds.'),
  sourceOutPoint: z.number().min(0).describe('Online media source out point in seconds.'),
  duration: z.number().positive().describe('Timeline duration in seconds.'),
  safeToPlace: z.literal(true).describe('Analyzer safety gate; only true placements can be executed.')
}).refine((placement) => placement.sourceOutPoint > placement.sourceInPoint, {
  message: 'sourceOutPoint must be greater than sourceInPoint',
  path: ['sourceOutPoint'],
});

const createStackedOnlineConformSequenceSchema = z.object({
  sourceSequenceId: z.string().min(1).describe('Offline/source sequence ID to duplicate before stacking online clips.'),
  conformSequenceName: z.string().min(1).describe('Name for the duplicated online conform sequence.'),
  placementPlan: z.array(stackedConformPlacementSchema).min(1).describe('Safe placementPlan items from analyze_stacked_online_conform.'),
  existingVideoTrackCount: z.number().int().min(0).optional().describe('Optional count of video tracks in the source sequence before conform execution; when provided, target tracks must be newly created above this count.'),
  duplicateSequence: z.boolean().default(true).describe('Must remain true for non-destructive conform execution.'),
  allowMutatingSourceSequence: z.boolean().optional().describe('Deprecated escape hatch; rejected by validation for non-destructive conform execution.'),
  dryRun: z.boolean().default(true).describe('When true, validates and returns operations without mutating Premiere. Defaults to true.')
});

const rasterDimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
});

const copyConformClipEffectsSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Sequence ID containing both source and target clips.'),
  sourceClipId: z.string().min(1).describe('Offline/source timeline clip ID whose supported effects should be copied.'),
  targetClipId: z.string().min(1).describe('Online stacked timeline clip ID that receives supported effects.'),
  sourceEffects: z.array(z.any()).optional().describe('Optional effect snapshot from snapshot_sequence_for_conform. Required for dry-run planning without bridge access.'),
  offlineSourceRaster: rasterDimensionsSchema.optional().describe('Offline media source raster for resolution-aware Motion conversion.'),
  onlineSourceRaster: rasterDimensionsSchema.optional().describe('Online media source raster for resolution-aware Motion conversion.'),
  supportedComponents: z.array(z.string().min(1)).optional().describe('Supported component display names. Defaults to Motion, Opacity, and Crop.'),
  dryRun: z.boolean().default(true).describe('When true, returns the copy plan without mutating Premiere. Defaults to true.')
});

const qcStackedOnlineComparisonSchema = z.object({
  offlineClipId: z.string().min(1),
  onlineClipId: z.string().min(1).optional(),
  sourceTrackIndex: z.number().int().min(0),
  targetTrackIndex: z.number().int().min(0),
  startTime: z.number().min(0),
  duration: z.number().positive(),
  actualStartTime: z.number().min(0).optional().describe('Observed online clip start time for structural QC drift reporting.'),
  actualDuration: z.number().positive().optional().describe('Observed online clip duration for structural QC drift reporting.'),
  expectedSourceInPoint: z.number().min(0).optional().describe('Expected online source in-point in seconds.'),
  actualSourceInPoint: z.number().min(0).optional().describe('Observed online source in-point in seconds.'),
  expectedSourceOutPoint: z.number().min(0).optional().describe('Expected online source out-point in seconds.'),
  actualSourceOutPoint: z.number().min(0).optional().describe('Observed online source out-point in seconds.'),
  unsupportedEffects: z.array(z.string().min(1)).optional().describe('Unsupported effect/component names carried forward from conform effect-copy planning.')
});

const qcStackedOnlineConformSchema = z.object({
  sequenceId: z.string().min(1).describe('Stacked conform sequence ID to QC.'),
  outputDir: z.string().min(1).describe('Directory where paired QC frame exports should be written.'),
  allowedOutputRoot: z.string().min(1).optional().describe('Optional containment root; outputDir must resolve inside this directory before live QC export can run.'),
  comparisons: z.array(qcStackedOnlineComparisonSchema).min(1).describe('Offline/online clip pairs to compare.'),
  sampleOffsets: z.array(z.number().min(0).max(1)).optional().describe('Normalized offsets inside each clip duration. Defaults to midpoint [0.5].'),
  format: z.enum(['png', 'jpg', 'tiff']).optional().describe('QC frame format. Defaults to png.'),
  dryRun: z.boolean().default(true).describe('When true, returns a frame-export plan without touching Premiere. Defaults to true.')
});

const timelineCleanupModeSchema = z.enum(['conservative', 'visual_noop', 'organize_only']);
const timelineCleanupClassificationSchema = z.enum(['safe_remove', 'safe_reorganize', 'preserve_visual_dependency', 'manual_review', 'unsupported']);
const timelineCleanupTrackTypeSchema = z.enum(['video', 'audio']);

const scanTimelineCleanupStateSchema = z.object({
  sequenceId: z.string().min(1).describe('Sequence ID to scan. Required; no silent active-sequence fallback for cleanup safety.'),
  includeDisabled: z.boolean().optional().describe('Include disabled timeline clips in the dependency audit. Defaults to true.'),
  includeEffects: z.boolean().optional().describe('Inspect clip components/effects for masks, mattes, blend, opacity, and unsupported dependencies. Defaults to true.'),
  includeKeyframes: z.boolean().optional().describe('Attempt keyframe/dependency detection on effect properties where supported. Defaults to false.')
});

const analyzeTimelineCleanupSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Sequence ID to scan before analysis when cleanupSnapshot is not provided.'),
  cleanupSnapshot: z.any().optional().describe('Read-only result from scan_timeline_cleanup_state. Supplying this avoids a Premiere bridge call.'),
  mode: timelineCleanupModeSchema.optional().describe('Cleanup mode. conservative preserves uncertain items; visual_noop permits explicit visual-noop removals; organize_only plans supported organization only.'),
  removeDisabledClips: z.boolean().optional().describe('Only effective in visual_noop mode. Defaults to false; disabled clips are preserved/manual-review by default.'),
  removeFullyCoveredClips: z.boolean().optional().describe('Only effective in visual_noop mode when upper coverage is proven opaque/full-frame/dependency-free. Defaults to false.'),
  organizeGraphics: z.boolean().optional().describe('Plan graphic/title organization only when analyzer can prove it is safe. Defaults to false.')
}).refine((value) => Boolean(value.sequenceId || value.cleanupSnapshot), {
  message: 'Either sequenceId or cleanupSnapshot is required',
  path: ['sequenceId']
});

const timelineCleanupActionSchema = z.union([
  z.object({
    type: z.literal('removeClip'),
    clipId: z.string().min(1),
    trackType: timelineCleanupTrackTypeSchema,
    trackIndex: z.number().int().min(0),
    classification: timelineCleanupClassificationSchema,
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal('removeTrack'),
    trackType: timelineCleanupTrackTypeSchema,
    trackIndex: z.number().int().min(0),
    classification: timelineCleanupClassificationSchema,
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal('reorganizeClip'),
    clipId: z.string().min(1),
    trackType: timelineCleanupTrackTypeSchema,
    trackIndex: z.number().int().min(0),
    targetTrackIndex: z.number().int().min(0).optional(),
    targetTrackName: z.string().min(1).optional(),
    classification: timelineCleanupClassificationSchema,
    reason: z.string().min(1)
  })
]);

const createCleanTimelineSequenceSchema = z.object({
  sourceSequenceId: z.string().min(1).describe('Source sequence ID to duplicate before any cleanup mutation.'),
  cleanSequenceName: z.string().min(1).describe('Name for the duplicated clean/organized sequence.'),
  duplicateSequence: z.boolean().default(true).describe('Must be true for non-destructive timeline cleanup.'),
  allowMutatingSourceSequence: z.boolean().optional().describe('Unsupported; cleanup always duplicates first.'),
  analysisId: z.string().min(1).optional().describe('Required for live execution: analysis ID returned by analyze_timeline_cleanup.'),
  actions: z.array(timelineCleanupActionSchema).describe('Executable safe_remove/safe_reorganize actions returned by analyze_timeline_cleanup.'),
  mode: timelineCleanupModeSchema.optional().describe('Cleanup mode used for the prior analysis. Live execution re-scans and re-analyzes with this mode before mutating.'),
  removeDisabledClips: z.boolean().optional().describe('Must match the prior analysis option for live execution.'),
  removeFullyCoveredClips: z.boolean().optional().describe('Must match the prior analysis option for live execution.'),
  organizeGraphics: z.boolean().optional().describe('Must match the prior analysis option for live execution.'),
  dryRun: z.boolean().default(true).describe('When true, validates and returns operations without mutating Premiere. Defaults to true.')
});

const qcTimelineCleanupSchema = z.object({
  sourceSequenceId: z.string().min(1).describe('Original/source sequence ID for before/after QC.'),
  cleanSequenceId: z.string().min(1).optional().describe('Duplicated clean sequence ID. Required directly or via cleanupResult.cleanSequenceId.'),
  outputDir: z.string().min(1).describe('Directory where before/after QC frames should be written.'),
  allowedOutputRoot: z.string().min(1).optional().describe('Required for live exports; outputDir must resolve inside this root.'),
  cleanupResult: z.any().describe('Result from create_clean_timeline_sequence, including actionsApplied/preservedItems for structural QC.'),
  sampleTimes: z.array(z.number().finite().min(0)).optional().describe('Absolute timeline sample times in seconds. Defaults to [0].'),
  format: z.enum(['png', 'jpg', 'tiff']).optional().describe('QC frame format. Defaults to png.'),
  dryRun: z.boolean().default(true).describe('When true, returns a frame-export plan without touching Premiere. Defaults to true.')
});

interface EffectPropertySelectorArgs {
  clipId: string;
  sequenceId?: string;
  componentName?: string;
  componentMatchName?: string;
  componentIndex?: number;
  propertyName?: string;
  propertyMatchName?: string;
  propertyIndex?: number;
}

interface SetEffectParameterArgs extends EffectPropertySelectorArgs {
  value: any;
}

type KeyframeInterpolation = 'linear' | 'hold' | 'bezier';

interface EffectKeyframe {
  time: number;
  value: number;
}

interface SetEffectKeyframesArgs extends EffectPropertySelectorArgs {
  keyframes: EffectKeyframe[];
}

interface SetKeyframeInterpolationArgs extends EffectPropertySelectorArgs {
  time: number;
  interpolation: KeyframeInterpolation;
}

interface GetEffectValueAtTimeArgs extends EffectPropertySelectorArgs {
  time: number;
}

interface BatchClipPropertyOperation {
  label: string;
  componentName: string;
  propertyName?: string;
  propertyIndex?: number;
  value: any;
}

interface BatchClipPropertiesArgs {
  clipId: string;
  sequenceId?: string;
  properties: {
    opacity?: number;
    blendMode?: number;
    blendModePropertyIndex?: number;
    scale?: number;
    scaleWidth?: number;
    uniformScale?: boolean;
    position?: { x: number; y: number };
    rotation?: number;
    anchorPoint?: { x: number; y: number };
    antiFlickerFilter?: number;
    crop?: {
      left?: number;
      top?: number;
      right?: number;
      bottom?: number;
    };
    speed?: {
      percent: number;
      maintainAudioPitch?: boolean;
    };
  };
}

interface SetClipScaleModeArgs {
  clipId: string;
  sequenceId?: string;
  mode: ClipScaleMode;
  sourceWidth?: number;
  sourceHeight?: number;
  sequenceWidth?: number;
  sequenceHeight?: number;
}

interface SetClipSpeedSettingsArgs {
  clipId: string;
  sequenceId?: string;
  sourceInPointSeconds?: number;
  sourceOutPointSeconds?: number;
  sourceDurationSeconds?: number;
  speedPercent?: number;
  maintainAudioPitch?: boolean;
}

interface ClipTimeRemapKeyframe {
  timeSeconds: number;
  speedPercent: number;
}

interface SetClipTimeRemapSettingsArgs {
  clipId: string;
  sequenceId?: string;
  staticSpeedPercent?: number;
  keyframes?: ClipTimeRemapKeyframe[];
}

const effectPropertySelectorBaseSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to inspect or modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
  componentName: z.string().min(1).optional().describe('Component/effect display name, e.g. "Motion" or "Opacity"'),
  componentMatchName: z.string().min(1).optional().describe('Component/effect matchName, e.g. "AE.ADBE Motion"'),
  componentIndex: z.number().int().min(0).optional().describe('Component/effect index from list_clip_effects'),
  propertyName: z.string().min(1).optional().describe('Property display name, e.g. "Scale" or "Opacity"'),
  propertyMatchName: z.string().min(1).optional().describe('Property matchName from list_clip_effects'),
  propertyIndex: z.number().int().min(0).optional().describe('Property index within the selected component')
});

const hasComponentSelector = (args: Record<string, unknown>): boolean =>
  args.componentName !== undefined || args.componentMatchName !== undefined || args.componentIndex !== undefined;

const hasPropertySelector = (args: Record<string, unknown>): boolean =>
  args.propertyName !== undefined || args.propertyMatchName !== undefined || args.propertyIndex !== undefined;

const setEffectParameterSchema = effectPropertySelectorBaseSchema.extend({
  value: z.any().refine((value) => value !== undefined, { message: 'value is required' }).describe('Value to write with Premiere property.setValue')
})
  .refine(hasComponentSelector, { message: 'Provide componentName, componentMatchName, or componentIndex' })
  .refine(hasPropertySelector, { message: 'Provide propertyName, propertyMatchName, or propertyIndex' });

const effectKeyframeSchema = z.object({
  time: z.number().finite().min(0).describe('Keyframe time in seconds.'),
  value: z.number().finite().describe('Numeric value at the keyframe.')
});

const setEffectKeyframesSchema = effectPropertySelectorBaseSchema.extend({
  keyframes: z.array(effectKeyframeSchema).min(1).describe('Strictly increasing numeric keyframes to add or update in one bridge roundtrip.')
})
  .refine(hasComponentSelector, { message: 'Provide componentName, componentMatchName, or componentIndex' })
  .refine(hasPropertySelector, { message: 'Provide propertyName, propertyMatchName, or propertyIndex' })
  .refine((args) => {
    for (let i = 1; i < args.keyframes.length; i++) {
      const current = args.keyframes[i];
      const previous = args.keyframes[i - 1];
      if (current === undefined || previous === undefined || current.time <= previous.time) return false;
    }
    return true;
  }, { message: 'keyframes must be in strictly increasing time order' });

const keyframeInterpolationSchema = z.enum(['linear', 'hold', 'bezier']);

const setKeyframeInterpolationSchema = effectPropertySelectorBaseSchema.extend({
  time: z.number().finite().min(0).describe('Time in seconds of the keyframe.'),
  interpolation: keyframeInterpolationSchema.describe('Interpolation type to apply to the keyframe.')
})
  .refine(hasComponentSelector, { message: 'Provide componentName, componentMatchName, or componentIndex' })
  .refine(hasPropertySelector, { message: 'Provide propertyName, propertyMatchName, or propertyIndex' });

const getEffectValueAtTimeSchema = effectPropertySelectorBaseSchema.extend({
  time: z.number().finite().min(0).describe('Time in seconds to query the property value at.')
})
  .refine(hasComponentSelector, { message: 'Provide componentName, componentMatchName, or componentIndex' })
  .refine(hasPropertySelector, { message: 'Provide propertyName, propertyMatchName, or propertyIndex' });

const setClipOpacitySchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
  opacity: z.number().finite().min(0).max(100).describe('Opacity percentage to set, from 0 to 100')
});

const setClipBlendModeSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
  blendMode: z.number().finite().int().min(0).describe('Numeric Opacity > Blend Mode value. Use list_clip_effects to inspect current values; Premiere exposes blend modes as numbers through ExtendScript.'),
  blendModePropertyIndex: z.number().finite().int().min(1).optional().describe('Component property index for Opacity > Blend Mode. Defaults to 1, the first Blend Mode property after Opacity in Premiere 2026.')
});

const setClipScaleSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
  scale: z.number().finite().min(0).describe('Motion scale percentage to set. 100 preserves source size; values above 100 zoom in.')
});

const clipScaleModeSchema = z.enum(['fit', 'fill', 'stretch']);

const setClipScaleModeSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. Required for predictable edits when clip IDs came from a non-active sequence.'),
  mode: clipScaleModeSchema.describe('Scale mode to apply: fit preserves the whole source, fill covers the sequence, stretch uses non-uniform width/height scaling.'),
  sourceWidth: z.number().finite().positive().optional().describe('Source media width in pixels. Required for computation; omitted dimensions return supported:false without mutating.'),
  sourceHeight: z.number().finite().positive().optional().describe('Source media height in pixels. Required for computation; omitted dimensions return supported:false without mutating.'),
  sequenceWidth: z.number().finite().positive().optional().describe('Target sequence width in pixels. Required for computation; omitted dimensions return supported:false without mutating.'),
  sequenceHeight: z.number().finite().positive().optional().describe('Target sequence height in pixels. Required for computation; omitted dimensions return supported:false without mutating.')
});

const setClipPositionSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
  x: z.number().finite().describe('Motion position X value. Premiere may expose this as a normalized coordinate for the current sequence/clip.'),
  y: z.number().finite().describe('Motion position Y value. Premiere may expose this as a normalized coordinate for the current sequence/clip.')
});

const clipPointSchema = z.object({
  x: z.number().finite().describe('X value. Premiere may expose Motion coordinates as normalized values.'),
  y: z.number().finite().describe('Y value. Premiere may expose Motion coordinates as normalized values.')
});

const clipCropSchema = z.object({
  left: z.number().finite().min(0).max(100).optional().describe('Crop Left percentage'),
  top: z.number().finite().min(0).max(100).optional().describe('Crop Top percentage'),
  right: z.number().finite().min(0).max(100).optional().describe('Crop Right percentage'),
  bottom: z.number().finite().min(0).max(100).optional().describe('Crop Bottom percentage')
}).refine((crop) =>
  crop.left !== undefined || crop.top !== undefined || crop.right !== undefined || crop.bottom !== undefined,
  { message: 'Provide at least one crop side' }
);

const batchClipPropertyValuesSchema = z.object({
  opacity: z.number().finite().min(0).max(100).optional().describe('Opacity percentage to set, from 0 to 100'),
  blendMode: z.number().finite().int().min(0).optional().describe('Numeric Opacity > Blend Mode value. Use list_clip_effects to inspect current values.'),
  blendModePropertyIndex: z.number().finite().int().min(1).optional().describe('Which duplicated Opacity > Blend Mode property index to set. Defaults to 1.'),
  scale: z.number().finite().min(0).optional().describe('Motion > Scale percentage'),
  scaleWidth: z.number().finite().min(0).optional().describe('Motion > Scale Width percentage for non-uniform scaling'),
  uniformScale: z.boolean().optional().describe('Motion > Uniform Scale toggle'),
  position: clipPointSchema.optional().describe('Motion > Position X/Y value'),
  rotation: z.number().finite().optional().describe('Motion > Rotation degrees'),
  anchorPoint: clipPointSchema.optional().describe('Motion > Anchor Point X/Y value'),
  antiFlickerFilter: z.number().finite().min(0).optional().describe('Motion > Anti-flicker Filter value'),
  crop: clipCropSchema.optional().describe('Motion crop percentages'),
  speed: z.object({
    percent: z.number().finite().positive().describe('Positive QE clip speed percentage to attempt. 100 is normal speed; 50 is half speed. Use reverse_clip for reverse playback until reverse-speed behavior is live-verified.'),
    maintainAudioPitch: z.boolean().optional().describe('Whether to maintain audio pitch. Defaults to true.')
  }).optional().describe('Optional clip speed settings applied through QE DOM after component properties')
}).refine((properties) => properties.blendMode !== undefined || properties.blendModePropertyIndex === undefined, {
  message: 'blendModePropertyIndex requires blendMode'
}).refine((properties) =>
  properties.opacity !== undefined ||
  properties.blendMode !== undefined ||
  properties.scale !== undefined ||
  properties.scaleWidth !== undefined ||
  properties.uniformScale !== undefined ||
  properties.position !== undefined ||
  properties.rotation !== undefined ||
  properties.anchorPoint !== undefined ||
  properties.antiFlickerFilter !== undefined ||
  properties.crop !== undefined ||
  properties.speed !== undefined,
  { message: 'Provide at least one clip property to set' }
);

const batchSetClipPropertiesSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. Required for predictable edits when clip IDs came from a non-active sequence.'),
  properties: batchClipPropertyValuesSchema.describe('Clip properties to set in one bridge roundtrip')
});

const setClipSpeedSettingsSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. Required for predictable edits when clip IDs came from a non-active sequence.'),
  sourceInPointSeconds: z.number().finite().min(0).optional().describe('Optional source in point in seconds, assigned through a Premiere Time object.'),
  sourceOutPointSeconds: z.number().finite().min(0).optional().describe('Optional source out point in seconds, assigned through a Premiere Time object.'),
  sourceDurationSeconds: z.number().finite().positive().optional().describe('Optional source duration in seconds. Sets source out point to source in point plus this duration.'),
  speedPercent: z.number().finite().positive().optional().describe('Optional positive QE speed percentage to attempt. 100 is normal speed. Use reverse_clip for reverse playback until reverse-speed behavior is live-verified.'),
  maintainAudioPitch: z.boolean().optional().describe('Whether to maintain audio pitch for speed attempts. Defaults to true.')
}).refine((settings) =>
  settings.sourceInPointSeconds !== undefined ||
  settings.sourceOutPointSeconds !== undefined ||
  settings.sourceDurationSeconds !== undefined ||
  settings.speedPercent !== undefined,
  { message: 'Provide sourceInPointSeconds, sourceOutPointSeconds, sourceDurationSeconds, or speedPercent' }
).refine((settings) =>
  settings.sourceDurationSeconds === undefined || settings.sourceOutPointSeconds === undefined,
  { message: 'sourceDurationSeconds and sourceOutPointSeconds are mutually exclusive' }
).refine((settings) =>
  settings.sourceInPointSeconds === undefined ||
  settings.sourceOutPointSeconds === undefined ||
  settings.sourceInPointSeconds < settings.sourceOutPointSeconds,
  { message: 'sourceInPointSeconds must be less than sourceOutPointSeconds' }
).refine((settings) =>
  settings.maintainAudioPitch === undefined || settings.speedPercent !== undefined,
  { message: 'maintainAudioPitch requires speedPercent' }
);

const clipTimeRemapKeyframeSchema = z.object({
  timeSeconds: z.number().finite().min(0).describe('Keyframe time in seconds for Premiere component keyframing.'),
  speedPercent: z.number().finite().positive().describe('Positive Time Remapping > Speed percentage. Use reverse_clip for reverse playback until reverse time-remap behavior is live-verified.')
});

const setClipTimeRemapSettingsSchema = z.object({
  clipId: z.string().min(1).describe('The ID of the timeline clip to modify'),
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID to search. Required for predictable edits when clip IDs came from a non-active sequence.'),
  staticSpeedPercent: z.number().finite().positive().optional().describe('Optional positive Time Remapping > Speed percentage to set if Premiere exposes the property.'),
  keyframes: z.array(clipTimeRemapKeyframeSchema).min(1).optional().describe('Optional ascending Time Remapping > Speed keyframes to set if Premiere exposes the property.')
}).refine((settings) =>
  settings.staticSpeedPercent !== undefined || settings.keyframes !== undefined,
  { message: 'Provide staticSpeedPercent or keyframes' }
).refine((settings) => {
  const keyframes = settings.keyframes;
  if (keyframes === undefined) return true;
  for (let i = 1; i < keyframes.length; i++) {
    const current = keyframes[i];
    const previous = keyframes[i - 1];
    if (current === undefined || previous === undefined || current.timeSeconds <= previous.timeSeconds) return false;
  }
  return true;
}, { message: 'keyframes must be in strictly increasing timeSeconds order' });

const motionStyleSchema = z.enum(['push_in', 'pull_out', 'alternate', 'none']);

const clipPlanSchema = z.object({
  assetIndex: z.number().int().min(0).optional().describe('Index in assetPaths to place for this step. Defaults to the current step index.'),
  time: z.number().optional().describe('Timeline position in seconds for this step.'),
  trackIndex: z.number().int().min(0).optional().describe('Video track index for this step. Defaults to videoTrackIndex.'),
  insertMode: z.enum(['overwrite', 'insert']).optional().describe('Placement mode for this step.'),
  transitionAfter: z.object({
    name: z.string().optional().describe('Transition to apply after this clip. Set "none" to skip this boundary.'),
    duration: z.number().optional().describe('Transition duration in seconds.')
  }).optional(),
  motion: z.object({
    style: motionStyleSchema.optional().describe('Simple motion style for this clip.'),
    from: z.number().optional().describe('Starting keyframe value.'),
    to: z.number().optional().describe('Ending keyframe value.'),
    startTime: z.number().optional().describe('Start time for keyframe animation in seconds.'),
    endTime: z.number().optional().describe('End time for keyframe animation in seconds.'),
    componentName: z.string().optional().describe('Component name for keyframing. Defaults to "Motion".'),
    paramName: z.string().optional().describe('Parameter name for keyframing. Defaults to "Scale".')
  }).optional(),
  trim: z.object({
    inPoint: z.number().optional().describe('Clip in point in seconds.'),
    outPoint: z.number().optional().describe('Clip out point in seconds.'),
    duration: z.number().optional().describe('Target clip duration in seconds.')
  }).optional(),
  effects: z.array(z.string()).optional().describe('Effect names to apply to this clip.'),
  color: z.object({
    brightness: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
    hue: z.number().optional(),
    temperature: z.number().optional(),
    tint: z.number().optional(),
    highlights: z.number().optional(),
    shadows: z.number().optional()
  }).optional()
});

const assembleFromEditPlanSchema = z.object({
  sequenceName: z.string().min(1).describe('Name for the new sequence'),
  assetPaths: z.array(z.string().min(1)).min(1).describe('Absolute paths to video or image assets in edit-plan order'),
  clipDuration: z.number().finite().positive().optional().describe('Default placement duration in seconds for omitted clipPlan times. Defaults to 4.0.'),
  videoTrackIndex: z.number().int().min(0).optional().describe('Default video track index. Defaults to 0.'),
  transitionName: z.string().optional().describe('Default transition when clipPlan does not override it.'),
  transitionDuration: z.number().finite().min(0).optional().describe('Transition duration in seconds. Defaults to 0.5.'),
  clipPlan: z.array(clipPlanSchema).optional().describe('Optional explicit edit plan. Each step can override timing, track, transition, motion, trim, effects, and color.'),
  dryRun: z.boolean().optional().describe('When true, returns the normalized plan without touching Premiere.'),
  includePostcondition: z.boolean().optional().describe('When true, attaches a list_sequence_tracks postcondition after assembly. Defaults to true.')
});

const workspaceNameSchema = z.object({
  name: z.string().min(1).describe('Name of the workspace to activate. Use get_workspaces first to discover available workspaces.')
});

const sourceMonitorInOutSchema = z.object({
  inSeconds: z.number().finite().min(0).optional().describe('Source Monitor in point in seconds.'),
  outSeconds: z.number().finite().min(0).optional().describe('Source Monitor out point in seconds.')
}).refine(
  (settings) => settings.inSeconds !== undefined || settings.outSeconds !== undefined,
  { message: 'Provide inSeconds or outSeconds' }
).refine(
  (settings) => settings.inSeconds === undefined || settings.outSeconds === undefined || settings.outSeconds > settings.inSeconds,
  { message: 'outSeconds must be greater than inSeconds' }
);

const sourceMonitorEditSchema = z.object({
  sequenceId: z.string().optional().describe('Optional sequence ID. Defaults to the active sequence.'),
  videoTrackIndex: z.number().int().min(0).optional().describe('Target video track index. Defaults to 0.'),
  audioTrackIndex: z.number().int().min(0).optional().describe('Target audio track index. Defaults to 0.'),
  time: z.number().finite().min(0).optional().describe('Timeline time in seconds. Defaults to the current playhead position.')
});

const selectionTrackTypeSchema = z.enum(['video', 'audio', 'both']);

const selectionScopeSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID. Defaults to the active sequence.'),
  trackType: selectionTrackTypeSchema.optional().describe('Track type to select. Defaults to both.'),
  trackIndex: z.number().int().min(0).optional().describe('Optional zero-based track index to scope the selection operation.')
});

const selectClipsByNameSchema = selectionScopeSchema.extend({
  name: z.string().min(1).describe('Clip name substring to match.'),
  addToSelection: z.boolean().optional().describe('When true, matching clips are added to the existing selection. Defaults to false.'),
  caseSensitive: z.boolean().optional().describe('When true, performs case-sensitive substring matching. Defaults to false.')
});

const selectClipsInRangeSchema = selectionScopeSchema.extend({
  startTime: z.number().finite().min(0).describe('Start of selection range in seconds.'),
  endTime: z.number().finite().min(0).describe('End of selection range in seconds.'),
  addToSelection: z.boolean().optional().describe('When true, matching clips are added to the existing selection. Defaults to false.')
}).refine(
  (settings) => settings.endTime > settings.startTime,
  { message: 'endTime must be greater than startTime' }
);

const selectClipsByColorSchema = selectionScopeSchema.extend({
  colorIndex: z.number().int().min(0).max(15).describe('Premiere color label index, 0 through 15.'),
  addToSelection: z.boolean().optional().describe('When true, matching clips are added to the existing selection. Defaults to false.')
});

const trackTargetTypeSchema = z.enum(['video', 'audio']);
const trackTargetScopeSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID. Defaults to the active sequence.'),
  trackType: trackTargetTypeSchema.describe('Track type to inspect or target.'),
  trackIndex: z.number().int().min(0).describe('Zero-based track index.')
});

const setTargetTrackSchema = trackTargetScopeSchema.extend({
  targeted: z.boolean().describe('Whether the track should be targeted for editing.')
});

const getTargetTracksSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID. Defaults to the active sequence.')
});

const setAllTracksTargetedSchema = z.object({
  sequenceId: z.string().min(1).optional().describe('Optional sequence ID. Defaults to the active sequence.'),
  trackType: selectionTrackTypeSchema.optional().describe('Track type to target or untarget. Defaults to both.'),
  targeted: z.boolean().describe('Whether all matching tracks should be targeted for editing.')
});

const renameTrackSchema = trackTargetScopeSchema.extend({
  name: z.string().min(1).describe('New track name. The operation verifies the name by reading it back.')
});

const getBinContentsSchema = z.object({
  binId: z.string().min(1).describe('Bin name, node ID, or slash-delimited path, for example Footage/Raw.'),
  recursive: z.boolean().optional().describe('When true, includes nested sub-bin items recursively. Defaults to true.')
});

const getProjectItemInfoSchema = z.object({
  projectItemId: z.string().min(1).describe('Project item node ID or exact name to inspect.')
});

const searchProjectItemsSchema = z.object({
  query: z.string().min(1).optional().describe('Optional case-insensitive item-name substring to match.'),
  extension: z.string().min(1).optional().transform((value) => value ? value.replace(/^\./, '').toLowerCase() : value).describe('Optional media file extension filter, with or without a leading dot.'),
  offlineOnly: z.boolean().optional().describe('When true, only returns offline/missing media items.'),
  colorLabel: z.number().int().min(0).max(15).optional().describe('Optional Premiere project-item color label index, 0 through 15.'),
  itemType: z.enum(['clip', 'bin', 'all']).optional().describe('Optional item type filter. Defaults to all.'),
  maxResults: z.number().int().min(1).max(1000).optional().describe('Maximum results to return. Defaults to 100.')
});

type CaptionSidecarFormat = z.infer<typeof captionSidecarFormatSchema>;
type PremiereCaptionFormat = z.infer<typeof premiereCaptionFormatSchema>;

interface CaptionSourceArgs {
  captions?: CaptionEntry[];
  inputPath?: string;
  sequenceId?: string;
  format?: CaptionSidecarFormat;
}

interface LoadedCaptionSource {
  captions: CaptionEntry[];
  source: 'inline' | 'sidecar' | 'sequence';
  inputPath?: string;
  sequenceId?: string;
  format?: CaptionSidecarFormat;
}

interface SourceMonitorInOutArgs {
  inSeconds?: number;
  outSeconds?: number;
}

interface SourceMonitorEditArgs {
  sequenceId?: string;
  videoTrackIndex?: number;
  audioTrackIndex?: number;
  time?: number;
}

type SelectionScopeArgs = z.infer<typeof selectionScopeSchema>;
type SelectClipsByNameArgs = z.infer<typeof selectClipsByNameSchema>;
type SelectClipsInRangeArgs = z.infer<typeof selectClipsInRangeSchema>;
type SelectClipsByColorArgs = z.infer<typeof selectClipsByColorSchema>;
type TrackTargetScopeArgs = z.infer<typeof trackTargetScopeSchema>;
type SetTargetTrackArgs = z.infer<typeof setTargetTrackSchema>;
type GetTargetTracksArgs = z.infer<typeof getTargetTracksSchema>;
type SetAllTracksTargetedArgs = z.infer<typeof setAllTracksTargetedSchema>;
type RenameTrackArgs = z.infer<typeof renameTrackSchema>;
type GetBinContentsArgs = z.infer<typeof getBinContentsSchema>;
type GetProjectItemInfoArgs = z.infer<typeof getProjectItemInfoSchema>;
type SearchProjectItemsArgs = z.infer<typeof searchProjectItemsSchema>;

export class PremiereProTools {
  private bridge: PremiereProTransport;
  private logger: Logger;

  constructor(bridge: PremiereProTransport) {
    this.bridge = bridge;
    this.logger = new Logger('PremiereProTools');
  }

  getAvailableTools(): MCPTool[] {
    return [
      // Discovery Tools (NEW)
      {
        name: 'test_connection',
        description: 'Fast smoke test for the Premiere bridge. Returns Premiere version, active project, active sequence, and round-trip status without mutating the project.',
        inputSchema: z.object({})
      },
      {
        name: 'bridge_health_report',
        description: 'Non-mutating diagnostics for the Premiere bridge: temp directory, stale command/response files, Premiere install, CEP extension paths, and live round-trip status.',
        inputSchema: z.object({
          staleAfterSeconds: z.number().int().min(1).optional().describe('Age in seconds after which command/response files are considered stale. Defaults to 300.')
        })
      },
      {
        name: 'get_workspaces',
        description: 'Lists available Premiere workspace layouts when the host exposes app.getWorkspaces; returns supported:false diagnostics otherwise.',
        inputSchema: z.object({})
      },
      {
        name: 'set_workspace',
        description: 'Switches to a named Premiere workspace layout through the host workspace API with readback diagnostics. Use get_workspaces first; note that changing workspaces may hide extension panels including the MCP Bridge until reopened.',
        inputSchema: workspaceNameSchema
      },
      {
        name: 'live_tool_sweep_safe',
        description: 'Creates a disposable scratch Premiere project, runs a bounded live tool sweep inside that project, and writes a JSON report. Use instead of broad live sweeps on working projects.',
        inputSchema: z.object({
          scratchProjectName: z.string().optional().describe('Optional scratch project name. Defaults to a timestamped Premiere MCP Safe Sweep name. Must be a plain file name, not a path.'),
          scratchProjectDir: z.string().min(1).describe('Required directory where the disposable scratch project will be created. This is the containment root for the project and report.'),
          reportPath: z.string().optional().describe('Optional JSON report output path. Relative paths resolve inside scratchProjectDir; absolute paths must also stay inside scratchProjectDir.'),
          mode: z.enum(['smoke']).optional().describe('Sweep breadth. P0 supports smoke only: create the scratch project, verify bridge connectivity, and run read-only inventory checks. Defaults to smoke.')
        })
      },
      {
        name: 'list_project_items',
        description: 'Lists all media items, bins, and assets in the current Premiere Pro project. Use this to discover available media before performing operations.',
        inputSchema: z.object({
          includeBins: z.boolean().optional().describe('Whether to include bin information in the results'),
          includeMetadata: z.boolean().optional().describe('Whether to include detailed metadata for each item')
        })
      },
      {
        name: 'get_full_project_overview',
        description: 'Read-only project overview: recursive bin tree, sequence summaries, media file type counts, offline count, and active sequence.',
        inputSchema: z.object({})
      },
      {
        name: 'get_bin_contents',
        description: 'Read-only recursive inspection of one project bin by node ID, name, or slash-delimited bin path.',
        inputSchema: getBinContentsSchema
      },
      {
        name: 'get_project_item_info',
        description: 'Read-only detailed inspection of one project item, including media path, offline state, footage interpretation, metadata, proxy, markers, and bin child counts.',
        inputSchema: getProjectItemInfoSchema
      },
      {
        name: 'search_project_items',
        description: 'Read-only project item search by name substring, extension, offline state, color label, and item type.',
        inputSchema: searchProjectItemsSchema
      },
      {
        name: 'list_sequences',
        description: 'Lists all sequences in the current Premiere Pro project with their IDs, names, and basic properties.',
        inputSchema: z.object({})
      },
      {
        name: 'list_sequence_tracks',
        description: 'Lists all video and audio tracks in a sequence with their properties and clips. If sequenceId is provided it must resolve; otherwise the active sequence is used.',
        inputSchema: z.object({
          sequenceId: z.string().optional().describe('Optional sequence ID to list tracks for. If provided and not found, the tool fails instead of falling back to the active sequence.')
        })
      },

      // Source Monitor
      {
        name: 'open_in_source_monitor',
        description: 'Opens a project item in the Premiere Source Monitor for preview, trimming, and insert/overwrite edits.',
        inputSchema: z.object({
          projectItemId: z.string().min(1).describe('Project item node ID to open in the Source Monitor.')
        })
      },
      {
        name: 'close_source_monitor',
        description: 'Closes the clip currently open in the Source Monitor when the host exposes the Source Monitor close API.',
        inputSchema: z.object({})
      },
      {
        name: 'close_all_source_clips',
        description: 'Closes all Source Monitor clips when the host exposes the Source Monitor close-all API.',
        inputSchema: z.object({})
      },
      {
        name: 'set_source_monitor_in_out',
        description: 'Sets Source Monitor in and/or out points on the currently open source clip using Premiere Time objects.',
        inputSchema: sourceMonitorInOutSchema
      },
      {
        name: 'insert_source_monitor_clip',
        description: 'Inserts the clip currently loaded in the Source Monitor into a sequence at an explicit time or the current playhead.',
        inputSchema: sourceMonitorEditSchema
      },
      {
        name: 'overwrite_source_monitor_clip',
        description: 'Overwrites timeline material with the clip currently loaded in the Source Monitor at an explicit time or the current playhead.',
        inputSchema: sourceMonitorEditSchema
      },
      {
        name: 'get_source_monitor_info',
        description: 'Reads information about the clip currently loaded in the Source Monitor without mutating the project.',
        inputSchema: z.object({
          includeMetadata: z.boolean().optional().describe('When true, attempts low-cost project/XMP metadata reads for the loaded source item.')
        })
      },
      {
        name: 'get_project_info',
        description: 'Gets comprehensive information about the current project including name, path, settings, and status.',
        inputSchema: z.object({})
      },
      {
        name: 'build_motion_graphics_demo',
        description: 'Generates clean demo stills, creates a sequence, lays the shots out on the timeline, adds dissolves, and applies subtle scale animation for a polished minimalist ad-style demo.',
        inputSchema: z.object({
          sequenceName: z.string().optional().describe('Optional sequence name. Defaults to "Apple Like Motion Demo".')
        })
      },
      {
        name: 'assemble_product_spot',
        description: 'Builds a production-oriented promo timeline from real media assets. Supports either template defaults or an explicit clipPlan for LLM-directed pacing, transitions, motion, trims, and per-clip effects.',
        inputSchema: z.object({
          sequenceName: z.string().describe('Name for the new sequence'),
          assetPaths: z.array(z.string()).min(1).describe('Absolute paths to video or image assets in playback order'),
          clipDuration: z.number().optional().describe('Default placement duration in seconds for stills and rough spacing for assets. Defaults to 4.0'),
          videoTrackIndex: z.number().optional().describe('Target video track index. Defaults to 0'),
          transitionName: z.string().optional().describe('Default transition when clipPlan does not override it. Defaults to "Cross Dissolve" in template mode.'),
          transitionDuration: z.number().optional().describe('Transition duration in seconds. Defaults to 0.5'),
          motionStyle: motionStyleSchema.optional().describe('Fallback motion style when clipPlan does not override it. Defaults to "alternate" in template mode.'),
          clipPlan: z.array(clipPlanSchema).optional().describe('Optional explicit edit plan. When provided, each step can override timing, track, transition, motion, trim, effects, and color.')
        })
      },
      {
        name: 'assemble_from_edit_plan',
        description: 'Generic edit-plan assembly wrapper around assemble_product_spot. Supports dry-run plan normalization and optional list_sequence_tracks postcondition after assembly.',
        inputSchema: assembleFromEditPlanSchema
      },
      {
        name: 'build_brand_spot_from_mogrt_and_assets',
        description: 'Builds a branded ad assembly from real media assets, supports optional MOGRT overlay, and allows explicit clipPlan control. Default polish is optional so creative direction can come from LLM planning instead of hardcoded passes.',
        inputSchema: z.object({
          sequenceName: z.string().describe('Name for the new sequence'),
          assetPaths: z.array(z.string()).min(1).describe('Absolute paths to source assets in edit order'),
          mogrtPath: z.string().optional().describe('Optional absolute path to a .mogrt title or branding template'),
          clipDuration: z.number().optional().describe('Default spacing in seconds for asset placement. Defaults to 4.0'),
          videoTrackIndex: z.number().optional().describe('Base video track for the main assets. Defaults to 0'),
          titleTrackIndex: z.number().optional().describe('Video track for the optional MOGRT overlay. Defaults to 1'),
          titleStartTime: z.number().optional().describe('Timeline start time in seconds for the optional MOGRT. Defaults to 0.4'),
          transitionName: z.string().optional().describe('Default transition when clipPlan does not override it. Defaults to "Cross Dissolve" in template mode.'),
          transitionDuration: z.number().optional().describe('Transition duration in seconds. Defaults to 0.5'),
          motionStyle: motionStyleSchema.optional().describe('Fallback motion style when clipPlan does not override it. Defaults to "alternate" in template mode.'),
          clipPlan: z.array(clipPlanSchema).optional().describe('Optional explicit edit plan. Reuses assemble_product_spot clipPlan semantics.'),
          applyDefaultPolish: z.boolean().optional().describe('Whether to apply the legacy light polish pass (blur + small color tweak). Defaults to false.')
        })
      },

      // Project Management
      {
        name: 'create_project',
        description: 'Creates a new Adobe Premiere Pro project. Use this when the user wants to start a new video editing project from scratch.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new project, e.g., "My Summer Vacation"'),
          location: z.string().describe('The absolute directory path where the project file should be saved, e.g., "/Users/user/Documents/Videos"')
        })
      },
      {
        name: 'open_project',
        description: 'Opens an existing Adobe Premiere Pro project from a specified file path.',
        inputSchema: z.object({
          path: z.string().describe('The absolute path to the .prproj file to open')
        })
      },
      {
        name: 'save_project',
        description: 'Saves the currently active Adobe Premiere Pro project.',
        inputSchema: z.object({})
      },
      {
        name: 'save_project_as',
        description: 'Saves the current project with a new name and location.',
        inputSchema: z.object({
          name: z.string().describe('The new name for the project'),
          location: z.string().describe('The absolute directory path where the project should be saved')
        })
      },

      // Media Management
      {
        name: 'import_media',
        description: 'Imports a media file (video, audio, image) into the current Premiere Pro project.',
        inputSchema: z.object({
          filePath: z.string().describe('The absolute path to the media file to import'),
          binName: z.string().optional().describe('The name of the bin to import the media into. If not provided, it will be imported into the root.')
        })
      },
      {
        name: 'import_fcp_xml',
        description: 'Imports a Final Cut Pro 7 XML (XMEML) file into the current project. Premiere creates a new sequence with the cuts/clips defined in the XML, atomically. Use for importing pre-built timelines from external tools (NOT for FCPXML 1.x modern format from Final Cut Pro X — only legacy FCP7 XML is supported by app.openFCPXML).',
        inputSchema: z.object({
          filePath: z.string().describe('The absolute path to the FCP7 XML file (.xml extension typical)')
        })
      },
      {
        name: 'import_edl',
        description: 'Imports a CMX 3600 EDL file into the current project. Premiere prompts for sequence settings and source media, then creates a new sequence with all cuts applied atomically. Use for atomic timeline import from cut-list-based pipelines. Note: the resulting sequence inherits its timebase/video standard from the project defaults or from the interactive sequence-settings dialog Premiere shows on import — `app.importEDL` does not accept a video-standard argument.',
        inputSchema: z.object({
          filePath: z.string().describe('The absolute path to the .edl file')
        })
      },
      {
        name: 'import_folder',
        description: 'Imports all media files from a folder into the current Premiere Pro project.',
        inputSchema: z.object({
          folderPath: z.string().describe('The absolute path to the folder containing media files'),
          binName: z.string().optional().describe('The name of the bin to import the media into'),
          recursive: z.boolean().optional().describe('Whether to import from subfolders recursively')
        })
      },
      {
        name: 'create_bin',
        description: 'Creates a new bin (folder) in the project panel to organize media.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new bin'),
          parentBinName: z.string().optional().describe('The name of the parent bin to create this bin inside')
        })
      },

      // Sequence Management
      {
        name: 'create_sequence',
        description: 'Creates a new sequence in the project. A sequence is a timeline where you edit clips.',
        inputSchema: z.object({
          name: z.string().describe('The name for the new sequence'),
          presetPath: z.string().optional().describe('Currently unsupported by Premiere ExtendScript createNewSequence; rejected to avoid opening native New Sequence dialog'),
          width: z.number().optional().describe('Currently unsupported during create_sequence; use set_sequence_settings/duplicate templates after creation where live-verified'),
          height: z.number().optional().describe('Currently unsupported during create_sequence; use set_sequence_settings/duplicate templates after creation where live-verified'),
          frameRate: z.number().optional().describe('Currently unsupported during create_sequence; use set_sequence_settings/duplicate templates after creation where live-verified'),
          sampleRate: z.number().optional().describe('Currently unsupported during create_sequence; use set_sequence_settings/duplicate templates after creation where live-verified')
        })
      },
      {
        name: 'duplicate_sequence',
        description: 'Creates a copy of an existing sequence with a new name.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to duplicate'),
          newName: z.string().describe('The name for the new sequence copy')
        })
      },
      {
        name: 'delete_sequence',
        description: 'Deletes a sequence from the project.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to delete')
        })
      },

      // Timeline Operations
      {
        name: 'add_to_timeline',
        description: 'Adds a media clip from the project panel to a sequence timeline at a specific track and time.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence (timeline) to add the clip to'),
          projectItemId: z.string().describe('The ID of the project item (clip) to add'),
          trackIndex: z.number().describe('The index of the video or audio track (0-based)'),
          time: z.number().describe('The time in seconds where the clip should be placed on the timeline'),
          insertMode: z.enum(['overwrite', 'insert']).optional().describe('Whether to overwrite existing content or insert and shift'),
          linkAudio: z.boolean().optional().describe('When false, removes the auto-linked audio counterpart that Premiere places on audio tracks for video-track clips. Useful for video overlays whose source media (e.g. Remotion .mov outputs) carry silent PCM that would overwrite existing audio. Default true (preserves Premiere\'s native linking behavior).')
        })
      },
      {
        name: 'remove_from_timeline',
        description: 'Removes a clip from the timeline. Pass sequenceId when the clip ID came from list_sequence_tracks for a non-active sequence.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip on the timeline to remove'),
          sequenceId: z.string().optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.'),
          deleteMode: z.enum(['ripple', 'lift']).optional().describe('Whether to ripple delete (close gap) or lift (leave gap)')
        })
      },
      {
        name: 'move_clip',
        description: 'Moves a clip to a different position on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to move'),
          newTime: z.number().describe('The new time position in seconds'),
          newTrackIndex: z.number().optional().describe('The new track index (if moving to different track)')
        })
      },
      {
        name: 'trim_clip',
        description: 'Adjusts the in and out points of a clip on the timeline, effectively shortening it.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip on the timeline to trim'),
          inPoint: z.number().optional().describe('The new in point in seconds from the start of the clip'),
          outPoint: z.number().optional().describe('The new out point in seconds from the start of the clip'),
          duration: z.number().optional().describe('Alternative: set the desired duration in seconds')
        })
      },
      {
        name: 'split_clip',
        description: 'Splits a clip at a specific time point, creating two separate clips.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to split'),
          splitTime: z.number().describe('The time in seconds where to split the clip')
        })
      },
      {
        name: 'razor_timeline_at_time',
        description: 'Cuts across multiple tracks in a sequence at an absolute timeline time. If no track arrays are provided, all video and audio tracks are cut.',
        inputSchema: z.object({
          sequenceId: z.string().optional().describe('Optional sequence ID. Defaults to the active sequence.'),
          time: z.number().describe('Absolute timeline time in seconds where the cut should occur.'),
          videoTrackIndices: z.array(z.number().int().min(0)).optional().describe('Optional video track indices to cut. Defaults to all video tracks.'),
          audioTrackIndices: z.array(z.number().int().min(0)).optional().describe('Optional audio track indices to cut. Defaults to all audio tracks.')
        })
      },
      {
        name: 'set_target_track',
        description: 'Sets a single video or audio track targeted/untargeted for Source Monitor insert/overwrite edits, with readback diagnostics.',
        inputSchema: setTargetTrackSchema
      },
      {
        name: 'get_target_tracks',
        description: 'Reads currently targeted video and audio tracks for the active or specified sequence.',
        inputSchema: getTargetTracksSchema
      },
      {
        name: 'set_all_tracks_targeted',
        description: 'Targets or untargets all tracks, optionally scoped to video or audio tracks.',
        inputSchema: setAllTracksTargetedSchema
      },
      {
        name: 'rename_track',
        description: 'Renames a video or audio sequence track and verifies the renamed value by reading it back.',
        inputSchema: renameTrackSchema
      },
      {
        name: 'get_track_info',
        description: 'Gets detailed information for a single sequence track, including clip ranges, transitions, lock/mute state, and targeting diagnostics.',
        inputSchema: trackTargetScopeSchema
      },

      // Effects and Transitions
      {
        name: 'apply_effect',
        description: 'Applies a visual or audio effect to a specific clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to apply the effect to'),
          effectName: z.string().describe('The name of the effect to apply (e.g., "Gaussian Blur", "Lumetri Color")'),
          parameters: z.record(z.any()).optional().describe('Key-value pairs for the effect\'s parameters')
        })
      },
      {
        name: 'crop_clip',
        description: 'Crops a timeline clip using Premiere Pro\'s built-in Crop video effect. Reuses an existing Crop effect on the clip when present; otherwise adds one. Omitted parameters keep their current/default values.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the timeline video clip to crop'),
          left: z.number().min(0).max(100).optional().describe('Percent to crop from the left edge (0-100)'),
          right: z.number().min(0).max(100).optional().describe('Percent to crop from the right edge (0-100)'),
          top: z.number().min(0).max(100).optional().describe('Percent to crop from the top edge (0-100)'),
          bottom: z.number().min(0).max(100).optional().describe('Percent to crop from the bottom edge (0-100)'),
          zoom: z.boolean().optional().describe('Crop effect Zoom toggle: scales the cropped image back up to fill the frame'),
          edgeFeather: z.number().min(0).optional().describe('Edge Feather amount in pixels')
        })
      },
      {
        name: 'list_clip_effects',
        description: 'Lists components/effects applied to a timeline clip, including component match names and best-effort property values. Pass sequenceId when the clip ID came from a non-active sequence.',
        inputSchema: z.object({
          clipId: z.string().min(1).describe('The ID of the timeline clip to inspect'),
          sequenceId: z.string().optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.')
        })
      },
      {
        name: 'set_effect_parameter',
        description: 'Sets an existing clip component/effect property by component and property name, matchName, or index. Use list_clip_effects first to discover selectors.',
        inputSchema: setEffectParameterSchema
      },
      {
        name: 'set_clip_opacity',
        description: 'Sets a timeline clip opacity percentage (0-100) via the built-in Opacity component. Pass sequenceId for clips outside the active sequence.',
        inputSchema: setClipOpacitySchema
      },
      {
        name: 'set_clip_blend_mode',
        description: 'Sets a timeline clip Opacity > Blend Mode numeric value. Use list_clip_effects first to inspect current Blend Mode values; defaults to property index 1 because Premiere exposes duplicate Blend Mode properties.',
        inputSchema: setClipBlendModeSchema
      },
      {
        name: 'set_clip_scale',
        description: 'Sets a timeline clip Motion > Scale percentage. Pass sequenceId for clips outside the active sequence.',
        inputSchema: setClipScaleSchema
      },
      {
        name: 'set_clip_scale_mode',
        description: 'Computes and applies Motion scaling for fit, fill, or non-uniform stretch from explicit source and sequence dimensions. Returns supported:false without mutating when dimensions are missing.',
        inputSchema: setClipScaleModeSchema
      },
      {
        name: 'set_clip_position',
        description: 'Sets a timeline clip Motion > Position using X/Y values. Premiere may expose these as normalized coordinates; use list_clip_effects first to inspect current values. Pass sequenceId for clips outside the active sequence.',
        inputSchema: setClipPositionSchema
      },
      {
        name: 'batch_set_clip_properties',
        description: 'Sets multiple clip properties in one bridge roundtrip: opacity, Opacity > Blend Mode, Motion scale/scale width/uniform scale/position/rotation/anchor/anti-flicker/crop, and optional positive QE speed percent. Uses preflight checks before mutating component properties. Use reverse_clip for reverse playback.',
        inputSchema: batchSetClipPropertiesSchema
      },
      {
        name: 'set_clip_speed_settings',
        description: 'Sets live-supported clip source timing controls (source in/out/duration via Premiere Time objects) and optionally attempts positive QE speed percent with explicit success/error reporting. Use reverse_clip for reverse playback and this instead of legacy speed_change.',
        inputSchema: setClipSpeedSettingsSchema
      },
      {
        name: 'set_clip_time_remap_settings',
        description: 'Sets Time Remapping > Speed static values/keyframes only when Premiere exposes a real Time Remapping component property; otherwise returns supported:false without mutating. Use reverse_clip for reverse playback.',
        inputSchema: setClipTimeRemapSettingsSchema
      },
      {
        name: 'add_transition',
        description: 'Adds a transition (e.g., cross dissolve) between two adjacent clips on the timeline.',
        inputSchema: z.object({
          clipId1: z.string().describe('The ID of the first clip (outgoing)'),
          clipId2: z.string().describe('The ID of the second clip (incoming)'),
          transitionName: z.string().describe('The name of the transition to add (e.g., "Cross Dissolve")'),
          duration: z.number().describe('The duration of the transition in seconds')
        })
      },
      {
        name: 'add_transition_to_clip',
        description: 'Adds a transition to the beginning or end of a single clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          transitionName: z.string().describe('The name of the transition'),
          position: z.enum(['start', 'end']).describe('Whether to add the transition at the start or end of the clip'),
          duration: z.number().describe('The duration of the transition in seconds')
        })
      },

      // Audio Operations
      {
        name: 'adjust_audio_levels',
        description: 'Adjusts the volume (gain) of an audio clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the audio clip to adjust'),
          level: z.number().describe('The new audio level in decibels (dB). Can be positive or negative.')
        })
      },
      {
        name: 'add_audio_keyframes',
        description: 'Adds keyframes to audio levels for dynamic volume changes.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the audio clip'),
          keyframes: z.array(z.object({
            time: z.number().describe('Time in seconds'),
            level: z.number().describe('Audio level in dB')
          })).describe('Array of keyframe data')
        })
      },
      {
        name: 'setup_ducking',
        description:
          'High-level wrapper around add_audio_keyframes that builds a ducking curve from a base level + ducking windows. ' +
          'Computes 4 keyframes per window (pre-fade, duck-in, duck-out, post-fade) plus boundary keyframes at clip start/end. ' +
          'Replaces the manual "8 keyframes per video" pattern from Sprint 3. Times are clip-source-time absolute (same convention as add_audio_keyframes).',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the music/SFX clip to apply ducking to'),
          baseDb: z.number().describe('Sustained level in dB (e.g. -25 for music bed under voice)'),
          duckingWindows: z
            .array(
              z.object({
                startTime: z.number().describe('When to begin ducking, in seconds (clip-source-time absolute)'),
                endTime: z.number().describe('When to recover from ducking, in seconds'),
                duckedDb: z.number().describe('Lower level in dB during this window (e.g. -38 for narrative pause)'),
              })
            )
            .describe('Windows where the clip should duck below baseDb. Empty array = sustained baseDb only.'),
          fadeSeconds: z
            .number()
            .optional()
            .describe('Ramp time for each transition (default 0.2s = 6 frames @30fps)'),
          clipStartTime: z
            .number()
            .optional()
            .describe('Clip start time anchor for first keyframe (default 0)'),
          clipEndTime: z
            .number()
            .optional()
            .describe('Clip end time anchor for last keyframe; if omitted, last duck window endTime + 1s is used'),
        }),
      },
      {
        name: 'mute_track',
        description: 'Mutes or unmutes an entire audio track.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackIndex: z.number().describe('The index of the audio track'),
          muted: z.boolean().describe('Whether to mute (true) or unmute (false) the track')
        })
      },

      // Text and Graphics
      {
        name: 'add_text_overlay',
        description: 'Adds a text layer (title) over the video timeline. Requires a MOGRT (.mogrt) template file path. Supports up to 4 text fields (text, text2, text3, text4) — each populates the Nth "AE.ADBE Text" component in the MOGRT (e.g., for Basic Lower Third: text=main title, text2=subtitle).',
        inputSchema: z.object({
          text: z.string().describe('Text for the first AE text component in the MOGRT (typically the main title)'),
          text2: z.string().optional().describe('Text for the second AE text component (e.g., subtitle of a lower third)'),
          text3: z.string().optional().describe('Text for the third AE text component (if present)'),
          text4: z.string().optional().describe('Text for the fourth AE text component (if present)'),
          sequenceId: z.string().describe('The sequence to add the text to'),
          trackIndex: z.number().describe('The video track to place the text on (0-indexed; create the track first via add_track if needed)'),
          startTime: z.number().describe('The time in seconds when the text should appear'),
          duration: z.number().describe('How long the text should remain on screen in seconds (best-effort; the MOGRT\'s natural duration may take precedence)'),
          mogrtPath: z.string().optional().describe('Absolute path to a .mogrt template file (required for text overlays)'),
          textPropertyName: z.string().optional().describe('Override: explicit displayName of the property to write into. When set, only `text` is written (text2/text3/text4 are ignored) and the call fails if no property with that displayName exists. Use only when auto-detection picks the wrong field.')
        })
      },

      // Color Correction
      {
        name: 'color_correct',
        description: 'Applies basic color correction adjustments to a video clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to color correct'),
          brightness: z.number().optional().describe('Brightness adjustment (-100 to 100)'),
          contrast: z.number().optional().describe('Contrast adjustment (-100 to 100)'),
          saturation: z.number().optional().describe('Saturation adjustment (-100 to 100)'),
          hue: z.number().optional().describe('Hue adjustment in degrees (-180 to 180)'),
          highlights: z.number().optional().describe('Adjustment for the brightest parts of the image (-100 to 100)'),
          shadows: z.number().optional().describe('Adjustment for the darkest parts of the image (-100 to 100)'),
          temperature: z.number().optional().describe('Color temperature adjustment (-100 to 100)'),
          tint: z.number().optional().describe('Tint adjustment (-100 to 100)')
        })
      },
      {
        name: 'apply_lut',
        description: 'Applies a Look-Up Table (LUT) to a clip for color grading.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          lutPath: z.string().describe('The absolute path to the .cube or .3dl LUT file'),
          intensity: z.number().optional().describe('LUT intensity (0-100)')
        })
      },

      // Export and Rendering
      {
        name: 'export_sequence',
        description: 'Renders and exports a sequence to a video file. This is for creating the final video.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to export'),
          outputPath: z.string().describe('The absolute path where the final video file will be saved'),
          presetPath: z.string().optional().describe('Optional path to an export preset file (.epr) for specific settings'),
          format: z.enum(['mp4', 'mov', 'avi', 'h264', 'prores']).optional().describe('The export format or codec'),
          quality: z.enum(['low', 'medium', 'high', 'maximum']).optional().describe('Export quality setting'),
          resolution: z.string().optional().describe('Export resolution (e.g., "1920x1080", "3840x2160")')
        })
      },
      {
        name: 'list_export_presets',
        description: 'Lists .epr export presets from common Adobe/AME preset folders and optional filesystem roots without contacting Premiere.',
        inputSchema: z.object({
          searchRoots: z.array(z.string().min(1)).optional().describe('Additional directories or .epr files to scan for export presets.'),
          includeAdobeDefaults: z.boolean().optional().default(true).describe('Whether to include common macOS Adobe/AME preset directories. Defaults to true.'),
          query: z.string().optional().describe('Optional case-insensitive filter matched against preset name or path.')
        })
      },
      {
        name: 'qc_rendered_media',
        description: 'Checks a rendered media file on disk using stat and ffprobe when available; does not contact Premiere.',
        inputSchema: z.object({
          filePath: z.string().min(1).describe('Path to the rendered media file to inspect.'),
          expectedDurationSeconds: z.number().finite().min(0).optional().describe('Optional expected duration in seconds.'),
          durationToleranceSeconds: z.number().finite().min(0).optional().describe('Allowed duration difference in seconds. Defaults to 0.5.'),
          minSizeBytes: z.number().int().min(0).optional().describe('Minimum acceptable file size in bytes. Defaults to 1.')
        })
      },
      {
        name: 'export_frame',
        description: 'Exports a single frame from a sequence as an image file.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          time: z.number().describe('The time in seconds to export the frame from'),
          outputPath: z.string().describe('The absolute path where the image file will be saved'),
          format: z.enum(['png', 'jpg', 'tiff']).optional().describe('The image format')
        })
      },
      {
        name: 'capture_frame',
        description: 'Exports a frame from a sequence, reads it back as base64 image data, and optionally deletes the temporary frame file for visual QC.',
        inputSchema: z.object({
          sequenceId: z.string().min(1).describe('The ID of the sequence to capture from'),
          time: z.number().finite().min(0).describe('Timeline time in seconds to capture'),
          outputPath: z.string().min(1).refine((value) => isAbsolute(value), 'outputPath must be absolute when provided').optional().describe('Optional absolute frame path. Defaults to a temporary file; explicit paths are preserved unless deleteAfterRead is true.'),
          format: z.enum(['png', 'jpg', 'tiff']).optional().default('png').describe('Frame image format'),
          deleteAfterRead: z.boolean().optional().describe('Delete the frame file after reading it into base64. Defaults to true only for internally generated temporary paths, false for explicit outputPath values.')
        })
      },
      {
        name: 'export_omf',
        description: 'Exports a sequence as OMF for audio post when Premiere exposes app.project.exportOMF. Defaults to dry-run capability diagnostics before live export.',
        inputSchema: z.object({
          sequenceId: z.string().min(1).describe('The ID of the sequence to export'),
          outputPath: z.string()
            .min(1)
            .refine((value) => isAbsolute(value), 'outputPath must be absolute')
            .refine((value) => extname(value).toLowerCase() === '.omf', 'outputPath must end with .omf')
            .describe('Absolute .omf output path'),
          title: z.string().min(1).optional().describe('OMF title metadata. Defaults to the sequence name.'),
          sampleRate: z.number().int().min(1).optional().describe('Audio sample rate. Defaults to 48000.'),
          bitsPerSample: z.number().int().min(1).optional().describe('Audio bit depth. Defaults to 16.'),
          audioEncapsulated: z.boolean().optional().describe('Embed audio in OMF. Defaults to true.'),
          audioFileFormat: z.enum(['wav', 'aiff']).optional().describe('Audio file format for OMF media. Defaults to wav.'),
          trimAudioFiles: z.boolean().optional().describe('Trim audio files to used ranges. Defaults to true.'),
          handleFrames: z.number().int().min(0).optional().describe('Audio handle length in frames when trimming. Defaults to 1000.'),
          dryRun: z.boolean().optional().default(true).describe('When true, report host capability and planned settings without exporting. Defaults to true.'),
          overwrite: z.boolean().optional().default(false).describe('Allow Premiere to overwrite an existing .omf path during live export. Defaults to false; the tool never pre-deletes existing files.')
        })
      },

      // Markers
      {
        name: 'add_marker',
        description: 'Adds a marker to the timeline for navigation or notes.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to add the marker to'),
          time: z.number().describe('The time in seconds where the marker should be placed'),
          name: z.string().describe('The name/label for the marker'),
          comment: z.string().optional().describe('Optional comment or description for the marker'),
          color: z.string().optional().describe('Marker color (e.g., "red", "green", "blue")'),
          duration: z.number().optional().describe('Duration in seconds for a span marker (0 for point marker)')
        })
      },
      {
        name: 'delete_marker',
        description: 'Deletes a marker from the timeline.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          markerId: z.string().describe('The ID of the marker to delete')
        })
      },
      {
        name: 'update_marker',
        description: 'Updates an existing marker\'s properties.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          markerId: z.string().describe('The ID of the marker to update'),
          name: z.string().optional().describe('New name for the marker'),
          comment: z.string().optional().describe('New comment'),
          color: z.string().optional().describe('New color')
        })
      },
      {
        name: 'list_markers',
        description: 'Lists all markers in a sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },

      // Track Management
      {
        name: 'add_track',
        description: 'Adds a new video or audio track to the sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio']).describe('Type of track to add'),
          position: z.enum(['above', 'below']).optional().describe('Where to add the track relative to existing tracks')
        })
      },
      {
        name: 'delete_track',
        description: 'Deletes a video or audio track from the sequence. Caption track deletion is accepted by the schema but returns an explicit unsupported result because Premiere Pro exposes no caption-track delete/read API to scripting.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio', 'caption']).describe('Type of track'),
          trackIndex: z.number().int().min(0).describe('The index of the track to delete')
        })
      },
      {
        name: 'lock_track',
        description: 'Locks or unlocks a track to prevent/allow editing.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio']).describe('Type of track'),
          trackIndex: z.number().describe('The index of the track'),
          locked: z.boolean().describe('Whether to lock (true) or unlock (false)')
        })
      },
      {
        name: 'toggle_track_visibility',
        description: 'Shows or hides a video track.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackIndex: z.number().describe('The index of the video track'),
          visible: z.boolean().describe('Whether to show (true) or hide (false)')
        })
      },

      {
        name: 'link_audio_video',
        description: 'Links or unlinks audio and video components of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          linked: z.boolean().describe('Whether to link (true) or unlink (false)')
        })
      },
      {
        name: 'apply_audio_effect',
        description: 'Applies an audio effect to a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the audio clip'),
          effectName: z.string().describe('Name of the audio effect (e.g., "Compressor", "EQ", "Reverb")'),
          parameters: z.record(z.any()).optional().describe('Effect parameters')
        })
      },
      {
        name: 'apply_audio_effect_to_all_clips',
        description: 'Bulk: applies a single audio effect to ALL audio clips of a sequence in one ExtendScript call. Returns per-clip results. Saves N MCP roundtrips when calibrating or applying same chain.',
        inputSchema: z.object({
          sequenceId: z.string().describe('Target sequence ID (must be the active sequence in Premiere)'),
          effectName: z.string().describe('Audio effect display name (e.g., "Limitador forzado", "Compresor multibanda")'),
          parameters: z.record(z.any()).optional().describe('Effect parameters by displayName (exact or normalized)')
        })
      },

      // Additional Clip Operations
      {
        name: 'duplicate_clip',
        description: 'Duplicates a clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to duplicate'),
          offset: z.number().optional().describe('Time offset in seconds for the duplicate (default: places immediately after original)')
        })
      },
      {
        name: 'reverse_clip',
        description: 'Reverses the playback of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to reverse'),
          maintainAudioPitch: z.boolean().optional().describe('Whether to maintain audio pitch (default: true)')
        })
      },
      {
        name: 'enable_disable_clip',
        description: 'Enables or disables a clip on the timeline.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          enabled: z.boolean().describe('Whether to enable (true) or disable (false)')
        })
      },
      {
        name: 'replace_clip',
        description: 'Replaces a clip on the timeline with another media item.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to replace'),
          newProjectItemId: z.string().describe('The ID of the new project item to use'),
          preserveEffects: z.boolean().optional().describe('Whether to keep effects and settings (default: true)')
        })
      },

      // Project Settings
      {
        name: 'get_sequence_settings',
        description: 'Gets the settings for a sequence (resolution, framerate, etc.).',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },
      {
        name: 'set_sequence_settings',
        description: 'Updates sequence settings.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          settings: z.object({
            width: z.number().optional().describe('Frame width'),
            height: z.number().optional().describe('Frame height'),
            frameRate: z.number().optional().describe('Frame rate'),
            pixelAspectRatio: z.number().optional().describe('Pixel aspect ratio')
          }).describe('Settings to update')
        })
      },
      {
        name: 'get_clip_properties',
        description: 'Gets detailed properties of a clip. Pass sequenceId when the clip ID came from list_sequence_tracks for a non-active sequence.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          sequenceId: z.string().optional().describe('Optional sequence ID to search. If omitted, searches the active sequence first, then all sequences.')
        })
      },
      {
        name: 'scan_conform_media_metadata',
        description: 'Read-only conform diagnostic: scans project/bin media metadata into normalized reel/timecode/raster records for offline-to-online matching.',
        inputSchema: scanConformMediaMetadataSchema
      },
      {
        name: 'snapshot_sequence_for_conform',
        description: 'Read-only conform diagnostic: snapshots a sequence into frame-based track/clip/effect summaries with explicit picture/passthrough/ignore roles.',
        inputSchema: snapshotSequenceForConformSchema
      },
      {
        name: 'analyze_stacked_online_conform',
        description: 'Dry-run stacked online conform analyzer: matches offline sequence clips to online media, reports confidence/handles, and plans upper-track placements without mutation.',
        inputSchema: analyzeStackedOnlineConformSchema
      },
      {
        name: 'create_stacked_online_conform_sequence',
        description: 'Executes a safe stacked online conform plan by duplicating the source sequence, ensuring upper video tracks, and placing online clips above the offline edit. Defaults to dry-run.',
        inputSchema: createStackedOnlineConformSequenceSchema
      },
      {
        name: 'copy_conform_clip_effects',
        description: 'Copies supported offline clip effects/transforms to a stacked online clip with resolution-aware Motion scale conversion and explicit unsupported-component reporting. Defaults to dry-run.',
        inputSchema: copyConformClipEffectsSchema
      },
      {
        name: 'qc_stacked_online_conform',
        description: 'Plans or executes paired QC frame exports for stacked online conform clips, restoring track visibility after live exports. Defaults to dry-run.',
        inputSchema: qcStackedOnlineConformSchema
      },
      {
        name: 'scan_timeline_cleanup_state',
        description: 'Read-only timeline cleanup dependency audit: scans tracks, clips, components, mattes/masks, graphics/titles, adjustment layers, nests, and unsupported visual risks without mutating Premiere.',
        inputSchema: scanTimelineCleanupStateSchema
      },
      {
        name: 'analyze_timeline_cleanup',
        description: 'Dry-run timeline cleanup classifier: builds prove-safe-or-preserve actions and manual-review buckets from a cleanup snapshot without mutating Premiere.',
        inputSchema: analyzeTimelineCleanupSchema
      },
      {
        name: 'create_clean_timeline_sequence',
        description: 'Executes a validated timeline cleanup action plan by duplicating the source sequence first, then applying only safe_remove/safe_reorganize actions on the duplicate. Defaults to dry-run.',
        inputSchema: createCleanTimelineSequenceSchema
      },
      {
        name: 'qc_timeline_cleanup',
        description: 'Plans or executes before/after frame exports for timeline cleanup QC, with structural checks for unsafe removals and output containment. Defaults to dry-run.',
        inputSchema: qcTimelineCleanupSchema
      },
      {
        name: 'set_clip_properties',
        description: 'Sets properties of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          properties: z.object({
            opacity: z.number().optional().describe('Opacity 0-100'),
            scale: z.number().optional().describe('Scale percentage'),
            rotation: z.number().optional().describe('Rotation in degrees'),
            position: z.object({
              x: z.number().optional(),
              y: z.number().optional()
            }).optional().describe('Position coordinates')
          }).describe('Properties to set')
        })
      },

      // Render Queue
      {
        name: 'add_to_render_queue',
        description: 'Adds a sequence to the Adobe Media Encoder render queue.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to render'),
          outputPath: z.string().describe('Output file path'),
          presetPath: z.string().optional().describe('Export preset file path'),
          startImmediately: z.boolean().optional().describe('Whether to start rendering immediately (default: false)')
        })
      },
      {
        name: 'get_render_queue_status',
        description: 'Reports whether render queue monitoring is available. This currently returns guidance for Adobe Media Encoder rather than live queue telemetry.',
        inputSchema: z.object({})
      },

      // Advanced Features
      {
        name: 'stabilize_clip',
        description: 'Applies video stabilization to reduce camera shake.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip to stabilize'),
          method: z.enum(['warp', 'subspace']).optional().describe('Stabilization method'),
          smoothness: z.number().optional().describe('Stabilization smoothness (0-100)')
        })
      },
      {
        name: 'speed_change',
        description: 'Changes the playback speed of a clip.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          speed: z.number().describe('Speed multiplier (0.1 = 10% speed, 2.0 = 200% speed)'),
          maintainAudio: z.boolean().optional().describe('Whether to maintain audio pitch when changing speed')
        })
      },

      // Playhead & Work Area
      {
        name: 'get_playhead_position',
        description: 'Gets the current playhead (CTI) position in the specified sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },
      {
        name: 'set_playhead_position',
        description: 'Sets the playhead (CTI) position in the specified sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          time: z.number().describe('The time in seconds to move the playhead to')
        })
      },
      {
        name: 'get_selected_clips',
        description: 'Gets all currently selected clips in the specified sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },
      {
        name: 'select_clips_by_name',
        description: 'Selects timeline clips whose names contain a substring, optionally scoped by sequence, track type, and track index.',
        inputSchema: selectClipsByNameSchema
      },
      {
        name: 'select_all_clips',
        description: 'Selects all clips in the active or specified sequence, optionally scoped by track type and track index.',
        inputSchema: selectionScopeSchema
      },
      {
        name: 'deselect_all_clips',
        description: 'Deselects clips in the active or specified sequence, optionally scoped by track type and track index.',
        inputSchema: selectionScopeSchema
      },
      {
        name: 'select_clips_in_range',
        description: 'Selects clips that overlap a timeline time range using clip.start < end && clip.end > start semantics.',
        inputSchema: selectClipsInRangeSchema
      },
      {
        name: 'select_clips_by_color',
        description: 'Selects timeline clips whose source project item has a specific Premiere color label index.',
        inputSchema: selectClipsByColorSchema
      },
      {
        name: 'invert_selection',
        description: 'Inverts clip selection in the active or specified sequence, optionally scoped by track type and track index.',
        inputSchema: selectionScopeSchema
      },

      // Effect & Transition Discovery
      {
        name: 'list_available_effects',
        description: 'Lists all available video effects in Premiere Pro.',
        inputSchema: z.object({})
      },
      {
        name: 'list_available_transitions',
        description: 'Lists all available video transitions in Premiere Pro.',
        inputSchema: z.object({})
      },
      {
        name: 'list_available_audio_effects',
        description: 'Lists all available audio effects in Premiere Pro.',
        inputSchema: z.object({})
      },
      {
        name: 'list_available_audio_transitions',
        description: 'Lists all available audio transitions in Premiere Pro.',
        inputSchema: z.object({})
      },

      // Keyframes
      {
        name: 'add_keyframe',
        description: 'Adds a keyframe to a clip component parameter at a specific time.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          componentName: z.string().describe('The display name of the component (e.g., "Motion", "Opacity")'),
          paramName: z.string().describe('The display name of the parameter (e.g., "Position", "Scale")'),
          time: z.number().describe('The time in seconds for the keyframe'),
          value: z.number().describe('The value to set at this keyframe')
        })
      },
      {
        name: 'remove_keyframe',
        description: 'Removes a keyframe from a clip component parameter at a specific time.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          componentName: z.string().describe('The display name of the component'),
          paramName: z.string().describe('The display name of the parameter'),
          time: z.number().describe('The time in seconds of the keyframe to remove')
        })
      },
      {
        name: 'get_keyframes',
        description: 'Gets all keyframes for a clip component parameter.',
        inputSchema: z.object({
          clipId: z.string().describe('The ID of the clip'),
          componentName: z.string().describe('The display name of the component'),
          paramName: z.string().describe('The display name of the parameter')
        })
      },
      {
        name: 'set_effect_keyframes',
        description: 'Bulk-add/update numeric keyframes on an existing effect/component property using list_clip_effects-style selectors. Requires strictly increasing times.',
        inputSchema: setEffectKeyframesSchema
      },
      {
        name: 'set_keyframe_interpolation',
        description: 'Sets keyframe interpolation on an existing effect/component property when Premiere exposes interpolation APIs; otherwise returns supported:false.',
        inputSchema: setKeyframeInterpolationSchema
      },
      {
        name: 'get_effect_value_at_time',
        description: 'Reads an effect/component property value at a specific time using list_clip_effects-style selectors and capability-honest diagnostics.',
        inputSchema: getEffectValueAtTimeSchema
      },

      // Work Area
      {
        name: 'set_work_area',
        description: 'Sets the work area in/out points for a sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          inPoint: z.number().describe('The in point in seconds'),
          outPoint: z.number().describe('The out point in seconds')
        })
      },
      {
        name: 'get_work_area',
        description: 'Gets the work area in/out points for a sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },

      // Batch Operations
      {
        name: 'batch_add_transitions',
        description: 'Adds a transition to all clip boundaries on a track. Useful for quickly adding cross dissolves or other transitions between every clip.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackIndex: z.number().describe('The video track index (0-based)'),
          transitionName: z.string().describe('The name of the transition (e.g., "Cross Dissolve")'),
          duration: z.number().describe('The duration of each transition in seconds')
        })
      },

      // Project Item Discovery & Management
      {
        name: 'find_project_item_by_name',
        description: 'Searches for project items by name. Useful for finding media files, sequences, or bins.',
        inputSchema: z.object({
          name: z.string().describe('The name to search for (case-insensitive partial match)'),
          type: z.enum(['footage', 'sequence', 'bin', 'any']).optional().describe('Filter by item type')
        })
      },
      {
        name: 'move_item_to_bin',
        description: 'Moves a project item into a different bin (folder).',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item to move'),
          targetBinId: z.string().describe('The ID of the destination bin')
        })
      },

      // Active Sequence Management
      {
        name: 'set_active_sequence',
        description: 'Sets the active sequence in the project.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to activate')
        })
      },
      {
        name: 'get_active_sequence',
        description: 'Gets information about the currently active sequence.',
        inputSchema: z.object({})
      },

      // Clip Lookup
      {
        name: 'get_clip_at_position',
        description: 'Gets the clip at a specific time position on a track.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          trackType: z.enum(['video', 'audio']).describe('The type of track'),
          trackIndex: z.number().describe('The track index (0-based)'),
          time: z.number().describe('The time position in seconds')
        })
      },

      // Auto Reframe
      {
        name: 'auto_reframe_sequence',
        description: 'Automatically reframes a sequence to a new aspect ratio using AI-powered motion tracking.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to reframe'),
          numerator: z.number().describe('Aspect ratio numerator (e.g., 9 for 9:16)'),
          denominator: z.number().describe('Aspect ratio denominator (e.g., 16 for 9:16)'),
          motionPreset: z.enum(['slower', 'default', 'faster']).optional().describe('Motion tracking speed preset'),
          newName: z.string().optional().describe('Name for the reframed sequence')
        })
      },

      // Scene Edit Detection
      {
        name: 'detect_scene_edits',
        description: 'Detects scene changes in selected clips and optionally adds cuts or markers.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          action: z.enum(['ApplyCuts', 'CreateMarkers']).optional().describe('Action to take at detected edit points'),
          applyCutsToLinkedAudio: z.boolean().optional().describe('Whether to apply cuts to linked audio'),
          sensitivity: z.string().optional().describe('Detection sensitivity (e.g., "Low", "Medium", "High")')
        })
      },

      // Captions
      {
        name: 'probe_native_transcription_capabilities',
        description: 'Diagnostic-only native transcription/caption surface probe. Reports supported:false plus observed Adobe/Premiere method-name/type diagnostics; does not treat speculative method names as live-supported APIs and does not call external speech-to-text services.',
        inputSchema: probeNativeTranscriptionCapabilitiesSchema
      },
      {
        name: 'generate_sequence_transcript',
        description: 'Catalog entry for generating a sequence transcript with Adobe/Premiere native transcription only. No third-party STT is used; implementation will report host capability limits instead of pretending unsupported hosts can transcribe.',
        inputSchema: generateSequenceTranscriptSchema
      },
      {
        name: 'generate_captions_from_premiere_transcript',
        description: 'Catalog entry for creating captions from an existing Adobe/Premiere native transcript. Uses Premiere native caption generation only, no third-party STT, and does not perform external speech-to-text.',
        inputSchema: generateCaptionsFromPremiereTranscriptSchema
      },
      {
        name: 'format_captions',
        description: 'Formats inline or sidecar caption cues into caption sidecar-friendly structure. This is a sidecar caption utility, not speech-to-text.',
        inputSchema: formatCaptionsSchema
      },
      {
        name: 'qc_captions',
        description: 'Runs sidecar caption quality-control checks such as timing, reading speed, overlaps, line length, and empty text. This does not transcribe audio.',
        inputSchema: qcCaptionsSchema
      },
      {
        name: 'search_captions',
        description: 'Searches inline or sidecar caption cues by text query or regex and returns matching cue time ranges. This does not transcribe audio.',
        inputSchema: searchCaptionsSchema
      },
      {
        name: 'export_captions',
        description: 'Exports inline or sidecar caption cues to a requested caption sidecar format. This does not use speech-to-text.',
        inputSchema: exportCaptionsSchema
      },
      {
        name: 'import_captions_to_sequence',
        description: 'Catalog entry for importing a caption sidecar into a Premiere sequence using native Adobe/Premiere caption import where available. This does not transcribe audio.',
        inputSchema: importCaptionsToSequenceSchema
      },
      {
        name: 'create_caption_track',
        description: 'Creates a caption track on a sequence from an imported caption/subtitle file (e.g. an .srt imported via import_media). Pass the SRT project item ID directly.',
        inputSchema: z.object({
          sequenceId: z.string().min(1).describe('The ID of the sequence'),
          projectItemId: z.string().min(1).describe('The ID of the caption file project item'),
          startTime: z.number().finite().min(0).optional().describe('Start time in seconds for the captions'),
          captionFormat: premiereCaptionFormatSchema.optional()
        })
      },
      {
        name: 'read_sequence_captions',
        description: 'Reads all caption tracks of a sequence and returns each caption clip as { start, end, text }, with timestamps in seconds. Use this to find the timecodes of specific spoken phrases.',
        inputSchema: z.object({
          sequenceId: z.string().optional().describe('Optional sequence ID. Defaults to the active sequence.')
        })
      },
      {
        name: 'remove_caption_tracks',
        description: 'Capability-honest native caption cleanup: reports or removes caption tracks only through Premiere caption track collections when public remove/delete APIs are exposed. Defaults to dry-run.',
        inputSchema: removeCaptionTracksSchema
      },
      {
        name: 'duplicate_sequence_without_captions',
        description: 'Duplicates a sequence and removes native caption tracks from the duplicate when Premiere exposes public caption removal APIs. Defaults to dry-run.',
        inputSchema: duplicateSequenceWithoutCaptionsSchema
      },
      {
        name: 'rename_project_item',
        description: 'Renames a project item (sequence, bin, clip) by setting its name. Use this when duplicate_sequence does not propagate the new name to the project panel.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item to rename'),
          newName: z.string().describe('The new name for the project item')
        })
      },

      // Subclip
      {
        name: 'create_subclip',
        description: 'Creates a subclip from a project item with specified in/out points.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the source project item'),
          name: z.string().describe('Name for the subclip'),
          startTime: z.number().describe('In point in seconds'),
          endTime: z.number().describe('Out point in seconds'),
          hasHardBoundaries: z.boolean().optional().describe('Whether boundaries are hard (cannot be extended)'),
          takeAudio: z.boolean().optional().describe('Whether to include audio (default: true)'),
          takeVideo: z.boolean().optional().describe('Whether to include video (default: true)')
        })
      },

      // Media Management - Relink & Metadata
      {
        name: 'relink_media',
        description: 'Relinks an offline or moved media file to a new file path.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item to relink'),
          newFilePath: z.string().describe('The new absolute file path to relink to')
        })
      },
      {
        name: 'set_color_label',
        description: 'Sets the color label on a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item'),
          colorIndex: z.number().describe('Color label index 0-15 (0=Violet, 1=Iris, 2=Caribbean, 3=Lavender, 4=Cerulean, 5=Forest, 6=Rose, 7=Mango, 8=Purple, 9=Blue, 10=Teal, 11=Magenta, 12=Tan, 13=Green, 14=Brown, 15=Yellow)')
        })
      },
      {
        name: 'get_color_label',
        description: 'Gets the color label index of a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item')
        })
      },
      {
        name: 'get_metadata',
        description: 'Gets project metadata and XMP metadata for a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item')
        })
      },
      {
        name: 'set_metadata',
        description: 'Sets a project metadata value on a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item'),
          key: z.string().describe('The metadata key/field name'),
          value: z.string().describe('The metadata value to set')
        })
      },
      {
        name: 'get_footage_interpretation',
        description: 'Gets the footage interpretation settings (frame rate, pixel aspect ratio, field type, etc.) for a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item')
        })
      },
      {
        name: 'set_footage_interpretation',
        description: 'Sets footage interpretation settings (frame rate, pixel aspect ratio) for a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item'),
          frameRate: z.number().optional().describe('Override frame rate'),
          pixelAspectRatio: z.number().optional().describe('Override pixel aspect ratio')
        })
      },
      {
        name: 'check_offline_media',
        description: 'Checks all project items and returns a list of any that are offline (missing media).',
        inputSchema: z.object({})
      },
      {
        name: 'export_as_fcp_xml',
        description: 'Exports a sequence as Final Cut Pro XML.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to export'),
          outputPath: z.string().describe('The absolute file path for the exported XML file')
        })
      },
      {
        name: 'undo',
        description: 'Performs an undo operation in Premiere Pro.',
        inputSchema: z.object({})
      },
      {
        name: 'set_sequence_in_out_points',
        description: 'Sets the in and/or out points on a sequence timeline.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          inPoint: z.number().optional().describe('The in point in seconds'),
          outPoint: z.number().optional().describe('The out point in seconds')
        })
      },
      {
        name: 'get_sequence_in_out_points',
        description: 'Gets the in and out points of a sequence timeline.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence')
        })
      },
      {
        name: 'export_aaf',
        description: 'Exports a sequence as an AAF file for interchange with other editing/audio applications.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence to export'),
          outputPath: z.string().describe('The absolute file path for the exported AAF file'),
          mixDownVideo: z.boolean().optional().describe('Whether to mix down video (default: true)'),
          explodeToMono: z.boolean().optional().describe('Whether to explode audio to mono (default: false)'),
          sampleRate: z.number().optional().describe('Audio sample rate (default: 48000)'),
          bitsPerSample: z.number().optional().describe('Audio bits per sample (default: 16)')
        })
      },
      {
        name: 'consolidate_duplicates',
        description: 'Consolidates duplicate media items in the project.',
        inputSchema: z.object({})
      },
      {
        name: 'refresh_media',
        description: 'Refreshes the media for a project item, reloading it from disk.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item to refresh')
        })
      },
      {
        name: 'import_sequences_from_project',
        description: 'Imports sequences from another Premiere Pro project file.',
        inputSchema: z.object({
          projectPath: z.string().describe('The absolute path to the source .prproj file'),
          sequenceIds: z.array(z.string()).describe('Array of sequence IDs to import from the source project')
        })
      },
      {
        name: 'create_subsequence',
        description: 'Creates a subsequence from the in/out points of a sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the source sequence'),
          ignoreTrackTargeting: z.boolean().optional().describe('Whether to ignore track targeting (default: false)')
        })
      },
      {
        name: 'import_mogrt',
        description: 'Imports a Motion Graphics Template (.mogrt) file into a sequence.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          mogrtPath: z.string().describe('The absolute path to the .mogrt file'),
          time: z.number().describe('The time in seconds where the MOGRT should be placed'),
          videoTrackIndex: z.number().optional().describe('The video track index (default: 0)'),
          audioTrackIndex: z.number().optional().describe('The audio track index (default: 0)')
        })
      },
      {
        name: 'import_mogrt_from_library',
        description: 'Imports a Motion Graphics Template from a Creative Cloud Library.',
        inputSchema: z.object({
          sequenceId: z.string().describe('The ID of the sequence'),
          libraryName: z.string().describe('The name of the Creative Cloud Library'),
          mogrtName: z.string().describe('The name of the MOGRT in the library'),
          time: z.number().describe('The time in seconds where the MOGRT should be placed'),
          videoTrackIndex: z.number().optional().describe('The video track index (default: 0)'),
          audioTrackIndex: z.number().optional().describe('The audio track index (default: 0)')
        })
      },
      {
        name: 'manage_proxies',
        description: 'Checks proxy status, attaches a proxy file, or gets the proxy path for a project item.',
        inputSchema: z.object({
          projectItemId: z.string().describe('The ID of the project item'),
          action: z.enum(['check', 'attach', 'get_path']).describe('The proxy action: check status, attach a proxy, or get proxy path'),
          proxyPath: z.string().optional().describe('The absolute path to the proxy file (required for attach action)')
        })
      }
    ];
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.getAvailableTools().find(t => t.name === name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`,
        availableTools: this.getAvailableTools().map(t => t.name)
      };
    }

    // Validate input arguments
    try {
      tool.inputSchema.parse(args);
    } catch (error) {
      return {
        success: false,
        error: `Invalid arguments for tool '${name}': ${error}`,
        expectedSchema: tool.inputSchema.description
      };
    }

    this.logger.info(`Executing tool: ${name} with args:`, args);
    
    try {
      switch (name) {
        // Discovery Tools
        case 'test_connection':
          return await this.testConnection();
        case 'bridge_health_report':
          return await this.bridgeHealthReport(args.staleAfterSeconds);
        case 'get_workspaces':
          return await this.getWorkspaces();
        case 'set_workspace':
          return await this.setWorkspace(args.name);
        case 'live_tool_sweep_safe':
          return await this.liveToolSweepSafe(args as LiveToolSweepSafeArgs);
        case 'list_project_items':
          return await this.listProjectItems(args.includeBins, args.includeMetadata);
        case 'get_full_project_overview':
          return await this.getFullProjectOverview();
        case 'get_bin_contents':
          return await this.getBinContents(args as GetBinContentsArgs);
        case 'get_project_item_info':
          return await this.getProjectItemInfo(args as GetProjectItemInfoArgs);
        case 'search_project_items':
          return await this.searchProjectItems(args as SearchProjectItemsArgs);
        case 'list_sequences':
          return await this.listSequences();
        case 'list_sequence_tracks':
          return await this.listSequenceTracks(args.sequenceId);
        case 'open_in_source_monitor':
          return await this.openInSourceMonitor(args.projectItemId);
        case 'close_source_monitor':
          return await this.closeSourceMonitor();
        case 'close_all_source_clips':
          return await this.closeAllSourceClips();
        case 'set_source_monitor_in_out':
          return await this.setSourceMonitorInOut(args as SourceMonitorInOutArgs);
        case 'insert_source_monitor_clip':
          return await this.editSourceMonitorClip('insert', args as SourceMonitorEditArgs);
        case 'overwrite_source_monitor_clip':
          return await this.editSourceMonitorClip('overwrite', args as SourceMonitorEditArgs);
        case 'get_source_monitor_info':
          return await this.getSourceMonitorInfo(args.includeMetadata);
        case 'scan_conform_media_metadata':
          return await this.scanConformMediaMetadata(args as ScanConformMediaMetadataArgs);
        case 'snapshot_sequence_for_conform':
          return await this.snapshotSequenceForConform(args as SnapshotSequenceForConformArgs);
        case 'analyze_stacked_online_conform':
          return await this.analyzeStackedOnlineConformTool(args as AnalyzeStackedOnlineConformToolArgs);
        case 'create_stacked_online_conform_sequence':
          return await this.createStackedOnlineConformSequence(args as CreateStackedOnlineConformSequenceArgs);
        case 'copy_conform_clip_effects':
          return await this.copyConformClipEffects(args as CopyConformClipEffectsArgs);
        case 'qc_stacked_online_conform':
          return await this.qcStackedOnlineConform(args as QcStackedOnlineConformArgs);
        case 'scan_timeline_cleanup_state':
          return await this.scanTimelineCleanupState(args as ScanTimelineCleanupStateArgs);
        case 'analyze_timeline_cleanup':
          return await this.analyzeTimelineCleanupTool(args as AnalyzeTimelineCleanupToolArgs);
        case 'create_clean_timeline_sequence':
          return await this.createCleanTimelineSequence(args as CreateCleanTimelineSequenceArgs);
        case 'qc_timeline_cleanup':
          return await this.qcTimelineCleanup(args as QcTimelineCleanupArgs);
        case 'get_project_info':
          return await this.getProjectInfo();
        case 'build_motion_graphics_demo':
          return await this.buildMotionGraphicsDemo(args.sequenceName);
        case 'assemble_product_spot':
          return await this.assembleProductSpot(args as AssembleProductSpotArgs);
        case 'assemble_from_edit_plan':
          return await this.assembleFromEditPlan(args as AssembleFromEditPlanArgs);
        case 'build_brand_spot_from_mogrt_and_assets':
          return await this.buildBrandSpotFromMogrtAndAssets(args as BuildBrandSpotArgs);

        // Project Management
        case 'create_project':
          return await this.createProject(args.name, args.location);
        case 'open_project':
          return await this.openProject(args.path);
        case 'save_project':
          return await this.saveProject();
        case 'save_project_as':
          return await this.saveProjectAs(args.name, args.location);

        // Media Management
        case 'import_media':
          return await this.importMedia(args.filePath, args.binName);
        case 'import_fcp_xml':
          return await this.importFcpXml(args.filePath);
        case 'import_edl':
          return await this.importEdl(args.filePath);
        case 'import_folder':
          return await this.importFolder(args.folderPath, args.binName, args.recursive);
        case 'create_bin':
          return await this.createBin(args.name, args.parentBinName);

        // Sequence Management
        case 'create_sequence':
          return await this.createSequence(args.name, args.presetPath, args.width, args.height, args.frameRate, args.sampleRate);
        case 'duplicate_sequence':
          return await this.duplicateSequence(args.sequenceId, args.newName);
        case 'delete_sequence':
          return await this.deleteSequence(args.sequenceId);
        case 'read_sequence_captions':
          return await this.readSequenceCaptions(args.sequenceId);
        case 'remove_caption_tracks':
          return await this.removeCaptionTracks(args as RemoveCaptionTracksArgs);
        case 'duplicate_sequence_without_captions':
          return await this.duplicateSequenceWithoutCaptions(args as DuplicateSequenceWithoutCaptionsArgs);
        case 'probe_native_transcription_capabilities':
          return await this.probeNativeTranscriptionCapabilities(args.sequenceId, args.includeDiagnostics);
        case 'generate_sequence_transcript':
          return await this.generateSequenceTranscript(args);
        case 'generate_captions_from_premiere_transcript':
          return await this.generateCaptionsFromPremiereTranscript(args);
        case 'format_captions':
          return await this.formatCaptions(args);
        case 'qc_captions':
          return await this.qcCaptionsTool(args);
        case 'search_captions':
          return await this.searchCaptionsTool(args);
        case 'export_captions':
          return await this.exportCaptions(args);
        case 'import_captions_to_sequence':
          return await this.importCaptionsToSequence(args);
        case 'rename_project_item':
          return await this.renameProjectItem(args.projectItemId, args.newName);

        // Timeline Operations
        case 'add_to_timeline':
          return await this.addToTimeline(args.sequenceId, args.projectItemId, args.trackIndex, args.time, args.insertMode, args.linkAudio);
        case 'remove_from_timeline':
          return await this.removeFromTimeline(args.clipId, args.sequenceId, args.deleteMode);
        case 'move_clip':
          return await this.moveClip(args.clipId, args.newTime, args.newTrackIndex);
        case 'trim_clip':
          return await this.trimClip(args.clipId, args.inPoint, args.outPoint, args.duration);
        case 'split_clip':
          return await this.splitClip(args.clipId, args.splitTime);
        case 'razor_timeline_at_time':
          return await this.razorTimelineAtTime(args.sequenceId, args.time, args.videoTrackIndices, args.audioTrackIndices);
        case 'set_target_track':
          return await this.setTargetTrack(args as SetTargetTrackArgs);
        case 'get_target_tracks':
          return await this.getTargetTracks(args as GetTargetTracksArgs);
        case 'set_all_tracks_targeted':
          return await this.setAllTracksTargeted(args as SetAllTracksTargetedArgs);
        case 'rename_track':
          return await this.renameTrack(args as RenameTrackArgs);
        case 'get_track_info':
          return await this.getTrackInfo(args as TrackTargetScopeArgs);

        // Effects and Transitions
        case 'apply_effect':
          return await this.applyEffect(args.clipId, args.effectName, args.parameters);
        case 'crop_clip':
          return await this.cropClip(args.clipId, {
            left: args.left,
            right: args.right,
            top: args.top,
            bottom: args.bottom,
            zoom: args.zoom,
            edgeFeather: args.edgeFeather
          });
        case 'list_clip_effects':
          return await this.listClipEffects(args.clipId, args.sequenceId);
        case 'set_effect_parameter':
          return await this.setEffectParameter(args as SetEffectParameterArgs);
        case 'set_clip_opacity':
          return await this.setClipOpacity(args.clipId, args.opacity, args.sequenceId);
        case 'set_clip_blend_mode':
          return await this.setClipBlendMode(args.clipId, args.blendMode, args.blendModePropertyIndex, args.sequenceId);
        case 'set_clip_scale':
          return await this.setClipScale(args.clipId, args.scale, args.sequenceId);
        case 'set_clip_scale_mode':
          return await this.setClipScaleMode(args as SetClipScaleModeArgs);
        case 'set_clip_position':
          return await this.setClipPosition(args.clipId, args.x, args.y, args.sequenceId);
        case 'batch_set_clip_properties':
          return await this.batchSetClipProperties(args as BatchClipPropertiesArgs);
        case 'set_clip_speed_settings':
          return await this.setClipSpeedSettings(args as SetClipSpeedSettingsArgs);
        case 'set_clip_time_remap_settings':
          return await this.setClipTimeRemapSettings(args as SetClipTimeRemapSettingsArgs);
        case 'remove_effect':
          return await this.removeEffect(args.clipId, args.effectName);
        case 'add_transition':
          return await this.addTransition(args.clipId1, args.clipId2, args.transitionName, args.duration);
        case 'add_transition_to_clip':
          return await this.addTransitionToClip(args.clipId, args.transitionName, args.position, args.duration);

        // Audio Operations
        case 'adjust_audio_levels':
          return await this.adjustAudioLevels(args.clipId, args.level);
        case 'add_audio_keyframes':
          return await this.addAudioKeyframes(args.clipId, args.keyframes);
        case 'setup_ducking':
          return await this.setupDucking(
            args.clipId,
            args.baseDb,
            args.duckingWindows,
            args.fadeSeconds,
            args.clipStartTime,
            args.clipEndTime
          );
        case 'mute_track':
          return await this.muteTrack(args.sequenceId, args.trackIndex, args.muted);

        // Text and Graphics
        case 'add_text_overlay':
          return await this.addTextOverlay(args);

        // Color Correction
        case 'color_correct':
          return await this.colorCorrect(args.clipId, args);
        case 'apply_lut':
          return await this.applyLut(args.clipId, args.lutPath, args.intensity);

        // Export and Rendering
        case 'export_sequence':
          return await this.exportSequence(args.sequenceId, args.outputPath, args.presetPath, args.format, args.quality, args.resolution);
        case 'list_export_presets':
          return await this.listExportPresets(args as ListExportPresetsArgs);
        case 'qc_rendered_media':
          return await this.qcRenderedMedia(args as QcRenderedMediaArgs);
        case 'export_frame':
          return await this.exportFrame(args.sequenceId, args.time, args.outputPath, args.format);
        case 'capture_frame':
          return await this.captureFrame(args as CaptureFrameArgs);
        case 'export_omf':
          return await this.exportOmf(args as ExportOmfArgs);

        // Markers
        case 'add_marker':
          return await this.addMarker(args.sequenceId, args.time, args.name, args.comment, args.color, args.duration);
        case 'delete_marker':
          return await this.deleteMarker(args.sequenceId, args.markerId);
        case 'update_marker':
          return await this.updateMarker(args.sequenceId, args.markerId, args);
        case 'list_markers':
          return await this.listMarkers(args.sequenceId);

        // Track Management
        case 'add_track':
          return await this.addTrack(args.sequenceId, args.trackType, args.position);
        case 'delete_track':
          return await this.deleteTrack(args.sequenceId, args.trackType, args.trackIndex);
        case 'lock_track':
          return await this.lockTrack(args.sequenceId, args.trackType, args.trackIndex, args.locked);
        case 'toggle_track_visibility':
          return await this.toggleTrackVisibility(args.sequenceId, args.trackIndex, args.visible);

        case 'link_audio_video':
          return await this.linkAudioVideo(args.clipId, args.linked);
        case 'apply_audio_effect':
          return await this.applyAudioEffect(args.clipId, args.effectName, args.parameters);
        case 'apply_audio_effect_to_all_clips':
          return await this.applyAudioEffectToAllClips(args.sequenceId, args.effectName, args.parameters);

        // Nested Sequences
        case 'create_nested_sequence':
          return await this.createNestedSequence(args.clipIds, args.name);
        case 'unnest_sequence':
          return await this.unnestSequence(args.nestedSequenceClipId);

        // Additional Clip Operations
        case 'duplicate_clip':
          return await this.duplicateClip(args.clipId, args.offset);
        case 'reverse_clip':
          return await this.reverseClip(args.clipId, args.maintainAudioPitch);
        case 'enable_disable_clip':
          return await this.enableDisableClip(args.clipId, args.enabled);
        case 'replace_clip':
          return await this.replaceClip(args.clipId, args.newProjectItemId, args.preserveEffects);

        // Project Settings
        case 'get_sequence_settings':
          return await this.getSequenceSettings(args.sequenceId);
        case 'set_sequence_settings':
          return await this.setSequenceSettings(args.sequenceId, args.settings);
        case 'get_clip_properties':
          return await this.getClipProperties(args.clipId, args.sequenceId);
        case 'set_clip_properties':
          return await this.setClipProperties(args.clipId, args.properties);

        // Render Queue
        case 'add_to_render_queue':
          return await this.addToRenderQueue(args.sequenceId, args.outputPath, args.presetPath, args.startImmediately);
        case 'get_render_queue_status':
          return await this.getRenderQueueStatus();

        // Advanced Features
        case 'stabilize_clip':
          return await this.stabilizeClip(args.clipId, args.method, args.smoothness);
        case 'speed_change':
          return await this.speedChange(args.clipId, args.speed, args.maintainAudio);

        // Playhead & Work Area
        case 'get_playhead_position':
          return await this.getPlayheadPosition(args.sequenceId);
        case 'set_playhead_position':
          return await this.setPlayheadPosition(args.sequenceId, args.time);
        case 'get_selected_clips':
          return await this.getSelectedClips(args.sequenceId);
        case 'select_clips_by_name':
          return await this.selectClipsByName(args as SelectClipsByNameArgs);
        case 'select_all_clips':
          return await this.setSelectionForAllClips('select_all_clips', args as SelectionScopeArgs);
        case 'deselect_all_clips':
          return await this.setSelectionForAllClips('deselect_all_clips', args as SelectionScopeArgs);
        case 'select_clips_in_range':
          return await this.selectClipsInRange(args as SelectClipsInRangeArgs);
        case 'select_clips_by_color':
          return await this.selectClipsByColor(args as SelectClipsByColorArgs);
        case 'invert_selection':
          return await this.invertSelection(args as SelectionScopeArgs);

        // Effect & Transition Discovery
        case 'list_available_effects':
          return await this.listAvailableEffects();
        case 'list_available_transitions':
          return await this.listAvailableTransitions();
        case 'list_available_audio_effects':
          return await this.listAvailableAudioEffects();
        case 'list_available_audio_transitions':
          return await this.listAvailableAudioTransitions();

        // Keyframes
        case 'add_keyframe':
          return await this.addKeyframe(args.clipId, args.componentName, args.paramName, args.time, args.value);
        case 'remove_keyframe':
          return await this.removeKeyframe(args.clipId, args.componentName, args.paramName, args.time);
        case 'get_keyframes':
          return await this.getKeyframes(args.clipId, args.componentName, args.paramName);
        case 'set_effect_keyframes':
          return await this.setEffectKeyframes(args as SetEffectKeyframesArgs);
        case 'set_keyframe_interpolation':
          return await this.setKeyframeInterpolation(args as SetKeyframeInterpolationArgs);
        case 'get_effect_value_at_time':
          return await this.getEffectValueAtTime(args as GetEffectValueAtTimeArgs);

        // Work Area
        case 'set_work_area':
          return await this.setWorkArea(args.sequenceId, args.inPoint, args.outPoint);
        case 'get_work_area':
          return await this.getWorkArea(args.sequenceId);

        // Batch Operations
        case 'batch_add_transitions':
          return await this.batchAddTransitions(args.sequenceId, args.trackIndex, args.transitionName, args.duration);

        // Project Item Discovery & Management
        case 'find_project_item_by_name':
          return await this.findProjectItemByName(args.name, args.type);
        case 'move_item_to_bin':
          return await this.moveItemToBin(args.projectItemId, args.targetBinId);

        // Active Sequence Management
        case 'set_active_sequence':
          return await this.setActiveSequence(args.sequenceId);
        case 'get_active_sequence':
          return await this.getActiveSequence();

        // Clip Lookup
        case 'get_clip_at_position':
          return await this.getClipAtPosition(args.sequenceId, args.trackType, args.trackIndex, args.time);

        // Auto Reframe
        case 'auto_reframe_sequence':
          return await this.autoReframeSequence(args.sequenceId, args.numerator, args.denominator, args.motionPreset, args.newName);

        // Scene Edit Detection
        case 'detect_scene_edits':
          return await this.detectSceneEdits(args.sequenceId, args.action, args.applyCutsToLinkedAudio, args.sensitivity);

        // Captions
        case 'create_caption_track':
          return await this.createCaptionTrack(args.sequenceId, args.projectItemId, args.startTime, args.captionFormat);

        // Subclip
        case 'create_subclip':
          return await this.createSubclip(args.projectItemId, args.name, args.startTime, args.endTime, args.hasHardBoundaries, args.takeAudio, args.takeVideo);

        // Media Management - Relink & Metadata
        case 'relink_media':
          return await this.relinkMedia(args.projectItemId, args.newFilePath);
        case 'set_color_label':
          return await this.setColorLabel(args.projectItemId, args.colorIndex);
        case 'get_color_label':
          return await this.getColorLabel(args.projectItemId);
        case 'get_metadata':
          return await this.getMetadata(args.projectItemId);
        case 'set_metadata':
          return await this.setMetadata(args.projectItemId, args.key, args.value);
        case 'get_footage_interpretation':
          return await this.getFootageInterpretation(args.projectItemId);
        case 'set_footage_interpretation':
          return await this.setFootageInterpretation(args.projectItemId, args.frameRate, args.pixelAspectRatio);
        case 'check_offline_media':
          return await this.checkOfflineMedia();
        case 'export_as_fcp_xml':
          return await this.exportAsFcpXml(args.sequenceId, args.outputPath);
        case 'undo':
          return await this.undo();
        case 'set_sequence_in_out_points':
          return await this.setSequenceInOutPoints(args.sequenceId, args.inPoint, args.outPoint);
        case 'get_sequence_in_out_points':
          return await this.getSequenceInOutPoints(args.sequenceId);
        case 'export_aaf':
          return await this.exportAaf(args.sequenceId, args.outputPath, args.mixDownVideo, args.explodeToMono, args.sampleRate, args.bitsPerSample);
        case 'consolidate_duplicates':
          return await this.consolidateDuplicates();
        case 'refresh_media':
          return await this.refreshMedia(args.projectItemId);
        case 'import_sequences_from_project':
          return await this.importSequencesFromProject(args.projectPath, args.sequenceIds);
        case 'create_subsequence':
          return await this.createSubsequence(args.sequenceId, args.ignoreTrackTargeting);
        case 'import_mogrt':
          return await this.importMogrt(args.sequenceId, args.mogrtPath, args.time, args.videoTrackIndex, args.audioTrackIndex);
        case 'import_mogrt_from_library':
          return await this.importMogrtFromLibrary(args.sequenceId, args.libraryName, args.mogrtName, args.time, args.videoTrackIndex, args.audioTrackIndex);
        case 'manage_proxies':
          return await this.manageProxies(args.projectItemId, args.action, args.proxyPath);

        default:
          return {
            success: false,
            error: `Tool '${name}' not implemented`,
            availableTools: this.getAvailableTools().map(t => t.name)
          };
      }
    } catch (error) {
      this.logger.error(`Error executing tool ${name}:`, error);
      return {
        success: false,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        tool: name,
        args: args
      };
    }
  }

  private async openInSourceMonitor(projectItemId: string): Promise<any> {
    const payload = literalForExtendScript({ projectItemId });
    const script = buildPremiereScript(`
      var payload = ${payload};
      if (!app.project) return { success: false, error: 'No project is open' };
      if (!app.sourceMonitor || typeof app.sourceMonitor.openProjectItem !== 'function') {
        return { success: false, supported: false, error: 'app.sourceMonitor.openProjectItem is not available on this Premiere host' };
      }
      var item = __findProjectItem(payload.projectItemId);
      if (!item) return { success: false, error: 'Project item not found: ' + payload.projectItemId };
      var openResult = app.sourceMonitor.openProjectItem(item);
      return {
        success: true,
        supported: true,
        opened: true,
        projectItemId: item.nodeId || payload.projectItemId,
        name: item.name || null,
        openResult: openResult
      };
    `, '__openInSourceMonitor');

    return await this.bridge.executeScript(script);
  }

  private async closeSourceMonitor(): Promise<any> {
    const script = buildPremiereScript(`
      if (!app.sourceMonitor || typeof app.sourceMonitor.closeClip !== 'function') {
        return { success: false, supported: false, error: 'app.sourceMonitor.closeClip is not available on this Premiere host' };
      }
      var closeResult = app.sourceMonitor.closeClip();
      return { success: true, supported: true, closed: true, closeResult: closeResult };
    `, '__closeSourceMonitor');

    return await this.bridge.executeScript(script);
  }

  private async closeAllSourceClips(): Promise<any> {
    const script = buildPremiereScript(`
      if (!app.sourceMonitor || typeof app.sourceMonitor.closeAllClips !== 'function') {
        return { success: false, supported: false, error: 'app.sourceMonitor.closeAllClips is not available on this Premiere host' };
      }
      var closeResult = app.sourceMonitor.closeAllClips();
      return { success: true, supported: true, closedAll: true, closeResult: closeResult };
    `, '__closeAllSourceClips');

    return await this.bridge.executeScript(script);
  }

  private async setSourceMonitorInOut(args: SourceMonitorInOutArgs): Promise<any> {
    const payload = literalForExtendScript(args);
    const script = buildPremiereScript(`
      var payload = ${payload};
      if (!app.sourceMonitor || typeof app.sourceMonitor.getProjectItem !== 'function') {
        return { success: false, supported: false, error: 'app.sourceMonitor.getProjectItem is not available on this Premiere host' };
      }
      var item = app.sourceMonitor.getProjectItem();
      if (!item) return { success: false, supported: true, error: 'No clip is open in the Source Monitor' };
      var shouldSetIn = typeof payload.inSeconds === 'number';
      var shouldSetOut = typeof payload.outSeconds === 'number';
      if (shouldSetIn && typeof item.setInPoint !== 'function') {
        return { success: false, supported: false, error: 'ProjectItem.setInPoint is not available for the Source Monitor item' };
      }
      if (shouldSetOut && typeof item.setOutPoint !== 'function') {
        return { success: false, supported: false, error: 'ProjectItem.setOutPoint is not available for the Source Monitor item' };
      }
      var inSet = false;
      var outSet = false;
      if (shouldSetIn) {
        var inTime = new Time();
        inTime.seconds = payload.inSeconds;
        item.setInPoint(inTime.ticks, 4);
        inSet = true;
      }
      if (shouldSetOut) {
        var outTime = new Time();
        outTime.seconds = payload.outSeconds;
        item.setOutPoint(outTime.ticks, 4);
        outSet = true;
      }
      var info = {
        success: true,
        supported: true,
        itemName: item.name || null,
        projectItemId: item.nodeId || null,
        inSet: inSet,
        outSet: outSet
      };
      try { info.inSeconds = __ticksToSeconds(item.getInPoint().ticks); } catch (inReadError) {}
      try { info.outSeconds = __ticksToSeconds(item.getOutPoint().ticks); } catch (outReadError) {}
      return info;
    `, '__setSourceMonitorInOut');

    return await this.bridge.executeScript(script);
  }

  private async editSourceMonitorClip(operation: 'insert' | 'overwrite', args: SourceMonitorEditArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      videoTrackIndex: args.videoTrackIndex ?? 0,
      audioTrackIndex: args.audioTrackIndex ?? 0,
      time: args.time ?? null
    });
    const methodName = operation === 'insert' ? 'insertClip' : 'overwriteClip';
    const functionName = operation === 'insert' ? '__insertSourceMonitorClip' : '__overwriteSourceMonitorClip';
    const script = buildPremiereScript(`
      var payload = ${payload};
      if (!app.project) return { success: false, error: 'No project is open' };
      if (!app.sourceMonitor || typeof app.sourceMonitor.getProjectItem !== 'function') {
        return { success: false, supported: false, error: 'app.sourceMonitor.getProjectItem is not available on this Premiere host' };
      }
      var seq = payload.sequenceId ? __findSequence(payload.sequenceId) : app.project.activeSequence;
      if (!seq) return { success: false, supported: true, error: payload.sequenceId ? 'Sequence not found by id: ' + payload.sequenceId : 'No active sequence' };
      if (typeof seq.${methodName} !== 'function') {
        return { success: false, supported: false, error: 'Sequence.${methodName} is not available on this Premiere host' };
      }
      var item = app.sourceMonitor.getProjectItem();
      if (!item) return { success: false, supported: true, error: 'No clip is open in the Source Monitor' };
      var position = new Time();
      if (typeof payload.time === 'number') {
        position.seconds = payload.time;
      } else if (seq.getPlayerPosition) {
        position.ticks = seq.getPlayerPosition().ticks;
      } else {
        position.seconds = 0;
      }
      var editResult = seq.${methodName}(item, position.ticks, payload.videoTrackIndex, payload.audioTrackIndex);
      return {
        success: true,
        supported: true,
        operation: "${operation}",
        projectItemId: item.nodeId || null,
        itemName: item.name || null,
        sequenceId: seq.sequenceID || payload.sequenceId || null,
        sequenceName: seq.name || null,
        timeSeconds: __ticksToSeconds(position.ticks),
        videoTrackIndex: payload.videoTrackIndex,
        audioTrackIndex: payload.audioTrackIndex,
        editResult: editResult
      };
    `, functionName);

    return await this.bridge.executeScript(script);
  }

  private async getSourceMonitorInfo(includeMetadata?: boolean): Promise<any> {
    const payload = literalForExtendScript({ includeMetadata: includeMetadata === true });
    const script = buildPremiereScript(`
      var payload = ${payload};
      if (!app.sourceMonitor || typeof app.sourceMonitor.getProjectItem !== 'function') {
        return { success: false, supported: false, error: 'app.sourceMonitor.getProjectItem is not available on this Premiere host' };
      }
      var item = app.sourceMonitor.getProjectItem();
      if (!item) return { success: true, supported: true, loaded: false, includeMetadata: payload.includeMetadata };
      var info = {
        success: true,
        supported: true,
        loaded: true,
        includeMetadata: payload.includeMetadata,
        projectItemId: item.nodeId || null,
        name: item.name || null
      };
      try { info.mediaPath = item.getMediaPath(); } catch (mediaPathError) {}
      try { info.inSeconds = __ticksToSeconds(item.getInPoint().ticks); } catch (inReadError) {}
      try { info.outSeconds = __ticksToSeconds(item.getOutPoint().ticks); } catch (outReadError) {}
      if (payload.includeMetadata) {
        info.metadata = {};
        try { info.metadata.projectMetadata = item.getProjectMetadata(); } catch (projectMetadataError) { info.metadata.projectMetadataError = projectMetadataError.toString(); }
        try { info.metadata.xmp = item.getXMPMetadata(); } catch (xmpError) { info.metadata.xmpError = xmpError.toString(); }
      }
      return info;
    `, '__getSourceMonitorInfo');

    return await this.bridge.executeScript(script);
  }

  private normalizeCaptionEntries(captions: CaptionEntry[]): CaptionEntry[] {
    return captions.map((caption) => {
      const start = Number(caption.start);
      const end = Number(caption.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
        throw new Error(`Invalid caption timing: ${caption.start} -> ${caption.end}`);
      }

      const normalized: CaptionEntry = {
        start,
        end,
        text: String(caption.text ?? '')
      };
      if (caption.id !== undefined) normalized.id = String(caption.id);
      if (caption.index !== undefined) normalized.index = Number(caption.index);
      return normalized;
    });
  }

  private getPremiereCaptionFormatDescriptor(format?: PremiereCaptionFormat): { key: PremiereCaptionFormat; constantName: string; numericFallback?: number } {
    const key = format ?? 'subtitle';
    const mapping: Record<PremiereCaptionFormat, { constantName: string; numericFallback?: number }> = {
      subtitle: { constantName: 'CAPTION_FORMAT_SUBTITLE', numericFallback: 11 },
      'cea-608': { constantName: 'CAPTION_FORMAT_608', numericFallback: 1 },
      'cea-708': { constantName: 'CAPTION_FORMAT_708', numericFallback: 2 },
      teletext: { constantName: 'CAPTION_FORMAT_TELETEXT', numericFallback: 3 }
    };
    return { key, ...mapping[key] };
  }

  private inferCaptionFormat(filePath: string): CaptionSidecarFormat {
    const extension = extname(filePath).replace(/^\./, '').toLowerCase();
    const supportedFormats: CaptionSidecarFormat[] = ['srt', 'vtt', 'json', 'csv'];
    if (supportedFormats.includes(extension as CaptionSidecarFormat)) {
      return extension as CaptionSidecarFormat;
    }
    throw new Error(`Could not infer caption format from path: ${filePath}`);
  }

  private splitCsvLine(line: string): string[] {
    const fields: string[] = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        fields.push(field);
        field = '';
      } else if (char !== undefined) {
        field += char;
      }
    }
    fields.push(field);
    return fields;
  }

  private splitCsvRecords(source: string): string[] {
    const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const records: string[] = [];
    let record = '';
    let quoted = false;

    for (let index = 0; index < normalized.length; index += 1) {
      const char = normalized[index];
      const next = normalized[index + 1];
      if (char === '"') {
        record += char;
        if (quoted && next === '"') {
          record += next;
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === '\n' && !quoted) {
        if (record.trim().length > 0) records.push(record);
        record = '';
      } else if (char !== undefined) {
        record += char;
      }
    }

    if (quoted) throw new Error('CSV caption sidecar has an unterminated quoted field');
    if (record.trim().length > 0) records.push(record);
    return records;
  }

  private parseCsvCaptions(source: string): CaptionEntry[] {
    const lines = this.splitCsvRecords(source);
    if (lines.length < 2) return [];
    const header = this.splitCsvLine(lines[0] ?? '').map((field) => field.trim().toLowerCase());
    const startIndex = header.indexOf('start');
    const endIndex = header.indexOf('end');
    const textIndex = header.indexOf('text');
    const idIndex = header.indexOf('id');
    if (startIndex < 0 || endIndex < 0 || textIndex < 0) {
      throw new Error('CSV caption sidecar must include start,end,text columns');
    }

    return this.normalizeCaptionEntries(lines.slice(1).map((line, rowIndex) => {
      const fields = this.splitCsvLine(line);
      const entry: CaptionEntry = {
        index: rowIndex + 1,
        start: this.parseCaptionTimeField(fields[startIndex] ?? ''),
        end: this.parseCaptionTimeField(fields[endIndex] ?? ''),
        text: fields[textIndex] ?? ''
      };
      if (idIndex >= 0 && fields[idIndex] !== undefined && fields[idIndex] !== '') {
        entry.id = fields[idIndex];
      }
      return entry;
    }));
  }

  private parseCaptionTimeField(value: string): number {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const normalized = trimmed.replace(',', '.');
    const pieces = normalized.split(':');
    if (pieces.length < 2 || pieces.length > 3) {
      throw new Error(`Invalid caption time field: ${value}`);
    }
    const secondsPart = Number(pieces[pieces.length - 1]);
    const minutesPart = Number(pieces[pieces.length - 2]);
    const hoursPart = pieces.length === 3 ? Number(pieces[0]) : 0;
    if (!Number.isFinite(secondsPart) || !Number.isFinite(minutesPart) || !Number.isFinite(hoursPart)) {
      throw new Error(`Invalid caption time field: ${value}`);
    }
    return hoursPart * 3600 + minutesPart * 60 + secondsPart;
  }

  private parseCaptionJson(source: string): CaptionEntry[] {
    const parsed = JSON.parse(source) as unknown;
    const cues = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { captions?: unknown }).captions)
        ? (parsed as { captions: unknown[] }).captions
        : null;
    if (cues === null) {
      throw new Error('JSON caption sidecar must be an array or an object with a captions array');
    }
    return this.normalizeCaptionEntries(cues.map((cue) => cue as CaptionEntry));
  }

  private parseCaptionSidecar(source: string, format: CaptionSidecarFormat): CaptionEntry[] {
    switch (format) {
      case 'srt':
        return this.normalizeCaptionEntries(parseSrt(source));
      case 'vtt':
        return this.normalizeCaptionEntries(parseVtt(source));
      case 'json':
        return this.parseCaptionJson(source);
      case 'csv':
        return this.parseCsvCaptions(source);
      default:
        throw new Error(`Caption format '${format}' is not supported by the sidecar parser yet. Supported parse formats: srt, vtt, json, csv.`);
    }
  }

  private serializeCaptionSidecar(captions: CaptionEntry[], format: CaptionSidecarFormat): string {
    switch (format) {
      case 'srt':
        return serializeSrt(captions);
      case 'vtt':
        return serializeVtt(captions);
      case 'json':
        return `${serializeJson(captions)}\n`;
      case 'csv':
        return `${serializeCsv(captions)}\n`;
      default:
        throw new Error(`Caption format '${format}' is not supported by sidecar export yet. Supported export formats: srt, vtt, json, csv.`);
    }
  }

  private mergeCaptionEntries(entries: CaptionEntry[], mergeGapSeconds?: number): CaptionEntry[] {
    if (mergeGapSeconds === undefined) return entries;
    if (entries.length === 0) return [];

    const sorted = [...entries].sort((left, right) => left.start - right.start || left.end - right.end);
    const merged: CaptionEntry[] = [];
    let current: CaptionEntry = { ...(sorted[0] as CaptionEntry) };

    for (const next of sorted.slice(1)) {
      const gap = next.start - current.end;
      if (gap >= 0 && gap <= mergeGapSeconds) {
        current = {
          ...current,
          end: Math.max(current.end, next.end),
          text: [current.text, next.text].filter((text) => text.trim().length > 0).join(' ')
        };
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
    return merged;
  }

  private async loadCaptionSource(args: CaptionSourceArgs): Promise<LoadedCaptionSource> {
    if (args.captions !== undefined) {
      return {
        captions: this.normalizeCaptionEntries(args.captions),
        source: 'inline'
      };
    }

    if (args.inputPath !== undefined) {
      const format = args.format ?? this.inferCaptionFormat(args.inputPath);
      const source = await fs.readFile(args.inputPath, 'utf8');
      return {
        captions: this.parseCaptionSidecar(source, format),
        source: 'sidecar',
        inputPath: args.inputPath,
        format
      };
    }

    if (args.sequenceId !== undefined) {
      const readback = await this.readSequenceCaptions(args.sequenceId);
      if (!readback.success || readback.supported === false) {
        const reason = readback.error ?? readback.message ?? 'Premiere did not expose readable native caption data for this sequence';
        throw new Error(`Failed to read captions from sequence ${args.sequenceId}: ${reason}`);
      }
      const rawCaptions = Array.isArray(readback.captions) ? readback.captions as CaptionEntry[] : [];
      return {
        captions: this.normalizeCaptionEntries(rawCaptions),
        source: 'sequence',
        sequenceId: args.sequenceId
      };
    }

    throw new Error('Provide captions, inputPath, or sequenceId');
  }

  private async writeCaptionOutput(outputPath: string, content: string, overwrite = false): Promise<void> {
    if (!overwrite && await this.pathExists(outputPath)) {
      throw new Error(`Output caption file already exists: ${outputPath}`);
    }
    await fs.mkdir(dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, content, 'utf8');
  }

  private async formatCaptions(args: Record<string, any>): Promise<any> {
    const loaded = await this.loadCaptionSource(args as CaptionSourceArgs);
    const merged = this.mergeCaptionEntries(loaded.captions, args.mergeGapSeconds);
    const captions = formatCaptionEntries(merged, {
      maxCharsPerLine: args.splitLongLines === false ? undefined : args.maxCharsPerLine,
      maxLines: args.maxLines,
      normalizeWhitespace: args.trimWhitespace !== false
    });
    const result: Record<string, any> = {
      success: true,
      source: loaded.source,
      captionCount: captions.length,
      captions
    };

    if (args.outputPath !== undefined) {
      const format = (args.format as CaptionSidecarFormat | undefined) ?? this.inferCaptionFormat(args.outputPath);
      await this.writeCaptionOutput(args.outputPath, this.serializeCaptionSidecar(captions, format), args.overwrite === true);
      result.outputPath = args.outputPath;
      result.format = format;
    }

    return result;
  }

  private async qcCaptionsTool(args: Record<string, any>): Promise<any> {
    const loaded = await this.loadCaptionSource(args as CaptionSourceArgs);
    const options: CaptionQcOptions = {};
    if (args.minDurationSeconds !== undefined) options.minDuration = args.minDurationSeconds;
    if (args.maxDurationSeconds !== undefined) options.maxDuration = args.maxDurationSeconds;
    if (args.maxReadingCps !== undefined) options.maxCps = args.maxReadingCps;
    if (args.maxCharsPerLine !== undefined) options.maxCharsPerLine = args.maxCharsPerLine;
    if (args.maxLines !== undefined) options.maxLines = args.maxLines;
    if (Array.isArray(args.bannedTerms)) options.bannedTerms = args.bannedTerms;
    if (args.caseSensitiveBannedTerms !== undefined) options.caseSensitiveBannedTerms = args.caseSensitiveBannedTerms;

    let findings: CaptionQcFinding[] = runCaptionQc(loaded.captions, options);
    if (args.allowOverlaps === true) findings = findings.filter((finding) => finding.code !== 'overlap');
    if (args.requireNonEmptyText === false) findings = findings.filter((finding) => finding.code !== 'emptyText');

    const summary = {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length
    };
    const result = {
      success: true,
      source: loaded.source,
      captionCount: loaded.captions.length,
      findingCount: findings.length,
      summary,
      findings
    };

    if (args.outputPath !== undefined) {
      await this.writeCaptionOutput(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, args.overwrite === true);
    }

    return args.outputPath === undefined ? result : { ...result, outputPath: args.outputPath };
  }

  private async searchCaptionsTool(args: Record<string, any>): Promise<any> {
    const loaded = await this.loadCaptionSource(args as CaptionSourceArgs);
    const contextCues = args.contextCues ?? 0;
    const matches = runCaptionSearch(loaded.captions, args.query, {
      regex: args.useRegex === true,
      caseSensitive: args.caseSensitive === true,
      before: contextCues,
      after: contextCues
    });
    const result = {
      success: true,
      source: loaded.source,
      captionCount: loaded.captions.length,
      matchCount: matches.length,
      matches
    };

    if (args.outputPath !== undefined) {
      await this.writeCaptionOutput(args.outputPath, `${JSON.stringify(result, null, 2)}\n`, args.overwrite === true);
    }

    return args.outputPath === undefined ? result : { ...result, outputPath: args.outputPath };
  }

  private async exportCaptions(args: Record<string, any>): Promise<any> {
    const loaded = await this.loadCaptionSource(args as CaptionSourceArgs);
    const outputPath = String(args.outputPath);
    if (args.overwrite !== true && await this.pathExists(outputPath)) {
      return {
        success: false,
        error: `Output caption file already exists: ${outputPath}`,
        outputPath
      };
    }

    const format = args.format as CaptionSidecarFormat;
    await this.writeCaptionOutput(outputPath, this.serializeCaptionSidecar(loaded.captions, format), args.overwrite === true);
    return {
      success: true,
      source: loaded.source,
      outputPath,
      format,
      captionCount: loaded.captions.length
    };
  }

  private async importCaptionsToSequence(args: Record<string, any>): Promise<any> {
    const filePath = String(args.filePath);
    if (!await this.pathExists(filePath)) {
      return { success: false, error: `Caption sidecar file not found: ${filePath}`, filePath };
    }

    let sidecarFormat: CaptionSidecarFormat;
    try {
      sidecarFormat = this.inferCaptionFormat(filePath);
    } catch (_error) {
      return {
        success: false,
        error: `Unsupported caption sidecar format for Premiere import: ${filePath}. Supported native import sidecar formats are srt and vtt.`,
        filePath
      };
    }
    if (!['srt', 'vtt'].includes(sidecarFormat)) {
      return {
        success: false,
        error: `Unsupported caption sidecar format for Premiere import: ${sidecarFormat}. Supported native import sidecar formats are srt and vtt.`,
        filePath,
        format: sidecarFormat
      };
    }

    const importResult = await this.importMedia(filePath);
    if (!importResult.success) {
      return { ...importResult, success: false, filePath };
    }

    const projectItemId = importResult.id ?? importResult.projectItemId ?? importResult.itemId;
    if (typeof projectItemId !== 'string' || projectItemId.length === 0) {
      return {
        success: false,
        error: 'Caption sidecar imported, but Premiere did not return a project item ID for createCaptionTrack.',
        importResult,
        filePath
      };
    }

    const createResult = await this.createCaptionTrack(String(args.sequenceId), projectItemId, args.startTime, args.captionFormat);
    if (!createResult.success) {
      return { ...createResult, success: false, importResult, projectItemId, filePath };
    }

    const result: Record<string, any> = {
      ...createResult,
      success: true,
      message: 'Caption sidecar imported and caption track created',
      sequenceId: args.sequenceId,
      projectItemId,
      filePath,
      importResult
    };

    if (args.verifyReadback === true) {
      result.readback = await this.readSequenceCaptions(String(args.sequenceId));
    }

    return result;
  }

  private buildNativeCapabilityProbeScript(sequenceId?: string, includeDiagnostics?: boolean): string {
    const request = JSON.stringify({ sequenceId: sequenceId ?? null, includeDiagnostics: includeDiagnostics === true });
    return `
      (function __probeNativeTranscriptionCapabilities() {
        try {
          var request = ${request};
          var diagnosticTranscriptMethods = ['createTranscript', 'generateTranscript', 'transcribe', 'transcribeSequence', 'startTranscription'];
          var diagnosticSpeechMethods = ['speechToText', 'analyzeSpeech', 'createSpeechTranscript'];
          var diagnosticCaptionMethods = ['createCaptionsFromTranscript', 'generateCaptionsFromTranscript', 'createCaptions', 'generateCaptions'];
          var probedMethodTypes = {
            transcript: diagnosticTranscriptMethods,
            speech: diagnosticSpeechMethods,
            caption: diagnosticCaptionMethods
          };
          function findSequence(sequenceId) {
            if (!app.project) return null;
            if (sequenceId && typeof __findSequence === 'function') return __findSequence(sequenceId);
            return app.project.activeSequence || null;
          }
          function inspectObject(target, label, methods, category) {
            var matches = [];
            if (!target) return matches;
            for (var i = 0; i < methods.length; i++) {
              var name = methods[i];
              try {
                var valueType = typeof target[name];
                if (valueType === 'function') matches.push({ label: label, method: name, category: category, valueType: valueType });
              } catch (inspectError) {
                matches.push({ label: label, method: name, category: category, valueType: 'unavailable', error: inspectError.toString() });
              }
            }
            return matches;
          }
          var sequence = findSequence(request.sequenceId);
          var candidates = [];
          candidates = candidates.concat(inspectObject(sequence, 'sequence', diagnosticTranscriptMethods, 'transcript'));
          candidates = candidates.concat(inspectObject(sequence, 'sequence', diagnosticSpeechMethods, 'speech'));
          candidates = candidates.concat(inspectObject(sequence, 'sequence', diagnosticCaptionMethods, 'caption'));
          candidates = candidates.concat(inspectObject(app.project, 'project', diagnosticTranscriptMethods, 'transcript'));
          candidates = candidates.concat(inspectObject(app, 'app', diagnosticSpeechMethods, 'speech'));
          candidates = candidates.concat(inspectObject(app, 'app', diagnosticCaptionMethods, 'caption'));
          var diagnostics = {
            premiereVersion: app.version || null,
            sequenceFound: !!sequence,
            sequenceId: sequence ? sequence.sequenceID || null : null,
            sequenceName: sequence ? sequence.name || null : null,
            candidates: candidates,
            probedMethodTypes: probedMethodTypes,
            liveVerifiedPublicApi: false
          };
          if (!request.includeDiagnostics) {
            diagnostics = { candidates: candidates, probedMethodTypes: probedMethodTypes, liveVerifiedPublicApi: false };
          }
          return JSON.stringify({
            success: true,
            supported: false,
            transcriptSupported: false,
            captionSupported: false,
            speechAnalysisSupported: false,
            diagnosticOnly: true,
            liveVerifiedPublicApi: false,
            nativeAdobeOnly: true,
            noExternalSpeechToText: true,
            message: 'Native transcription probing is diagnostic-only. Method-name matches are not treated as support until a public API is live-verified.',
            diagnostics: diagnostics
          });
        } catch (e) {
          return JSON.stringify({ success: false, supported: false, error: e.toString() });
        }
      })();
    `;
  }

  private async probeNativeTranscriptionCapabilities(sequenceId?: string, includeDiagnostics?: boolean): Promise<any> {
    return await this.bridge.executeScript(this.buildNativeCapabilityProbeScript(sequenceId, includeDiagnostics));
  }

  private buildGenerateSequenceTranscriptScript(args: Record<string, any>): string {
    const request = JSON.stringify({ sequenceId: args.sequenceId ?? null, dryRun: args.dryRun === true, poll: args.poll === true });
    return `
      (function __generateSequenceTranscriptNative() {
        try {
          var request = ${request};
          var diagnosticTranscriptMethods = ['createTranscript', 'generateTranscript', 'transcribe', 'transcribeSequence', 'startTranscription'];
          function findSequence(sequenceId) {
            if (!app.project) return null;
            if (sequenceId && typeof __findSequence === 'function') return __findSequence(sequenceId);
            return app.project.activeSequence || null;
          }
          function findDiagnosticCandidates(sequence) {
            var candidates = [];
            var targets = [{ target: sequence, label: 'sequence' }, { target: app.project, label: 'project' }, { target: app, label: 'app' }];
            for (var t = 0; t < targets.length; t++) {
              var current = targets[t];
              if (!current.target) continue;
              for (var i = 0; i < diagnosticTranscriptMethods.length; i++) {
                var method = diagnosticTranscriptMethods[i];
                try {
                  if (typeof current.target[method] === 'function') candidates.push({ label: current.label, method: method });
                } catch (_) {}
              }
            }
            return candidates;
          }
          var sequence = findSequence(request.sequenceId);
          if (!sequence) return JSON.stringify({ success: false, supported: false, error: 'Sequence not found for native transcript generation' });
          var candidates = findDiagnosticCandidates(sequence);
          return JSON.stringify({
            success: true,
            supported: false,
            dryRun: request.dryRun,
            nativeAdobeOnly: true,
            noExternalSpeechToText: true,
            message: 'Premiere Speech to Text / Transcribe Sequence is not exposed as a public live-verified ExtendScript API in this MCP implementation. Use the Premiere UI to transcribe, then process exported/readable captions with sidecar tools.',
            diagnostics: { sequenceId: sequence.sequenceID || null, sequenceName: sequence.name || null, diagnosticTranscriptMethods: diagnosticTranscriptMethods, candidates: candidates, pollRequested: request.poll }
          });
        } catch (e) {
          return JSON.stringify({ success: false, supported: false, error: e.toString() });
        }
      })();
    `;
  }

  private async generateSequenceTranscript(args: Record<string, any>): Promise<any> {
    return await this.bridge.executeScript(this.buildGenerateSequenceTranscriptScript(args));
  }

  private buildGenerateCaptionsFromTranscriptScript(args: Record<string, any>): string {
    const request = JSON.stringify({
      sequenceId: args.sequenceId ?? null,
      dryRun: args.dryRun === true,
      captionFormat: args.captionFormat ?? null,
      maxCharsPerLine: args.maxCharsPerLine ?? null,
      maxLines: args.maxLines ?? null
    });
    return `
      (function __generateCaptionsFromPremiereTranscriptNative() {
        try {
          var request = ${request};
          var diagnosticCaptionMethods = ['createCaptionsFromTranscript', 'generateCaptionsFromTranscript', 'createCaptions', 'generateCaptions', 'createCaptionTrackFromTranscript'];
          function findSequence(sequenceId) {
            if (!app.project) return null;
            if (sequenceId && typeof __findSequence === 'function') return __findSequence(sequenceId);
            return app.project.activeSequence || null;
          }
          function findDiagnosticCandidates(sequence) {
            var candidates = [];
            var targets = [{ target: sequence, label: 'sequence' }, { target: app.project, label: 'project' }, { target: app, label: 'app' }];
            for (var t = 0; t < targets.length; t++) {
              var current = targets[t];
              if (!current.target) continue;
              for (var i = 0; i < diagnosticCaptionMethods.length; i++) {
                var method = diagnosticCaptionMethods[i];
                try {
                  if (typeof current.target[method] === 'function') candidates.push({ label: current.label, method: method });
                } catch (_) {}
              }
            }
            return candidates;
          }
          var sequence = findSequence(request.sequenceId);
          if (!sequence) return JSON.stringify({ success: false, supported: false, error: 'Sequence not found for native caption generation from transcript' });
          var candidates = findDiagnosticCandidates(sequence);
          var options = { captionFormat: request.captionFormat, maxCharsPerLine: request.maxCharsPerLine, maxLines: request.maxLines };
          return JSON.stringify({
            success: true,
            supported: false,
            dryRun: request.dryRun,
            nativeAdobeOnly: true,
            noExternalSpeechToText: true,
            message: 'Premiere caption generation from transcript is not exposed as a public live-verified ExtendScript API in this MCP implementation. Use the Premiere UI to generate captions, then process exported/readable captions with sidecar tools.',
            options: options,
            diagnostics: { sequenceId: sequence.sequenceID || null, sequenceName: sequence.name || null, diagnosticCaptionMethods: diagnosticCaptionMethods, candidates: candidates }
          });
        } catch (e) {
          return JSON.stringify({ success: false, supported: false, error: e.toString() });
        }
      })();
    `;
  }

  private async generateCaptionsFromPremiereTranscript(args: Record<string, any>): Promise<any> {
    return await this.bridge.executeScript(this.buildGenerateCaptionsFromTranscriptScript(args));
  }

  // Discovery Tools Implementation
  private async testConnection(): Promise<any> {
    const script = `
      try {
        var project = app.project;
        var activeSequence = project && project.activeSequence ? project.activeSequence : null;
        return JSON.stringify({
          success: true,
          connected: true,
          premiereVersion: app.version || null,
          project: project ? {
            name: project.name || null,
            path: project.path || null
          } : null,
          activeSequence: activeSequence ? {
            id: activeSequence.sequenceID || null,
            name: activeSequence.name || null
          } : null,
          bridge: {
            mode: "cep-extendscript",
            reachable: true
          }
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          connected: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async getWorkspaces(): Promise<any> {
    const script = buildPremiereScript(`
      if (typeof app.getWorkspaces !== "function") {
        return {
          success: true,
          supported: false,
          workspaces: [],
          count: 0,
          reason: 'Premiere host does not expose app.getWorkspaces'
        };
      }

      var rawWorkspaces = app.getWorkspaces();
      var workspaces = [];
      if (rawWorkspaces) {
        for (var i = 0; i < rawWorkspaces.length; i++) {
          workspaces.push(String(rawWorkspaces[i]));
        }
      }

      return {
        success: true,
        supported: true,
        workspaces: workspaces,
        count: workspaces.length
      };
    `);

    return await this.bridge.executeScript(script);
  }

  private async setWorkspace(name: string): Promise<any> {
    const workspaceName = literalForExtendScript(name);
    const script = buildPremiereScript(`
      var availableWorkspaces = [];
      if (typeof app.getWorkspaces === "function") {
        var rawWorkspaces = app.getWorkspaces();
        if (rawWorkspaces) {
          for (var i = 0; i < rawWorkspaces.length; i++) {
            availableWorkspaces.push(String(rawWorkspaces[i]));
          }
        }
      }

      var requestedWorkspaceAvailable = availableWorkspaces.length === 0;
      for (var wi = 0; wi < availableWorkspaces.length; wi++) {
        if (availableWorkspaces[wi] === ${workspaceName}) {
          requestedWorkspaceAvailable = true;
          break;
        }
      }

      if (typeof app.setWorkspace !== "function") {
        return {
          success: false,
          supported: false,
          workspace: ${workspaceName},
          availableWorkspaces: availableWorkspaces,
          requestedWorkspaceAvailable: requestedWorkspaceAvailable,
          mutationAttempted: false,
          postconditionVerified: false,
          error: "Premiere host does not expose app.setWorkspace"
        };
      }

      if (!requestedWorkspaceAvailable) {
        return {
          success: false,
          supported: true,
          workspace: ${workspaceName},
          availableWorkspaces: availableWorkspaces,
          mutationAttempted: false,
          readbackSupported: false,
          postconditionVerified: false,
          error: 'Requested workspace is not present in app.getWorkspaces()'
        };
      }

      var setResult = app.setWorkspace(${workspaceName});
      if (setResult === false) {
        return {
          success: false,
          supported: true,
          workspace: ${workspaceName},
          availableWorkspaces: availableWorkspaces,
          mutationAttempted: true,
          readbackSupported: false,
          postconditionVerified: false,
          error: 'Premiere rejected the requested workspace'
        };
      }

      var readbackSupported = false;
      var activeWorkspace = null;
      var postconditionVerified = false;
      try {
        if (typeof app.getCurrentWorkspace === "function") {
          activeWorkspace = String(app.getCurrentWorkspace());
          readbackSupported = true;
        } else if (typeof app.getWorkspace === "function") {
          activeWorkspace = String(app.getWorkspace());
          readbackSupported = true;
        }
      } catch (readbackError) {
        activeWorkspace = null;
      }
      if (readbackSupported) {
        postconditionVerified = activeWorkspace === ${workspaceName};
        if (!postconditionVerified) {
          return {
            success: false,
            supported: true,
            workspace: ${workspaceName},
            activeWorkspace: activeWorkspace,
            availableWorkspaces: availableWorkspaces,
            mutationAttempted: true,
            readbackSupported: true,
            postconditionVerified: false,
            error: 'Workspace set call returned but readback did not match requested workspace'
          };
        }
      }

      return {
        success: true,
        supported: true,
        workspace: ${workspaceName},
        activeWorkspace: activeWorkspace,
        availableWorkspaces: availableWorkspaces,
        mutationAttempted: true,
        readbackSupported: readbackSupported,
        postconditionVerified: postconditionVerified
      };
    `);

    return await this.bridge.executeScript(script);
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch (_error) {
      return false;
    }
  }

  private async firstExistingPath(paths: string[]): Promise<string | null> {
    for (const candidatePath of paths) {
      if (await this.pathExists(candidatePath)) {
        return candidatePath;
      }
    }
    return null;
  }

  private getBridgeDiagnostics(): PremiereProBridgeDiagnostics | null {
    const bridgeWithDiagnostics = this.bridge as PremiereProTransport & {
      getDiagnostics?: () => PremiereProBridgeDiagnostics;
    };
    return bridgeWithDiagnostics.getDiagnostics ? bridgeWithDiagnostics.getDiagnostics() : null;
  }

  private async bridgeHealthReport(staleAfterSeconds = 300): Promise<any> {
    const warnings: string[] = [];
    const now = Date.now();
    const bridgeDiagnostics = this.getBridgeDiagnostics();
    const fallbackTempDir = process.env.PREMIERE_TEMP_DIR || '/tmp/premiere-mcp-bridge';
    const tempDir = (bridgeDiagnostics?.tempDir || fallbackTempDir).replace(/\/$/, '');
    const tempDirCheck = {
      path: tempDir,
      exists: false,
      readable: false,
      writable: false,
      commandFiles: 0,
      responseFiles: 0,
      staleCommandFiles: 0,
      staleResponseFiles: 0
    };

    try {
      await fs.access(tempDir);
      tempDirCheck.exists = true;
    } catch (_error) {
      warnings.push(`Bridge temp directory does not exist: ${tempDir}`);
    }

    if (tempDirCheck.exists) {
      try {
        await fs.access(tempDir, constants.R_OK);
        tempDirCheck.readable = true;
      } catch (_error) {
        warnings.push(`Bridge temp directory is not readable: ${tempDir}`);
      }

      try {
        await fs.access(tempDir, constants.W_OK);
        tempDirCheck.writable = true;
      } catch (_error) {
        warnings.push(`Bridge temp directory is not writable: ${tempDir}`);
      }

      try {
        const entries = await fs.readdir(tempDir);
        const commandFiles = entries.filter((entry) => /^command-.*\.json$/.test(entry));
        const responseFiles = entries.filter((entry) => /^response-.*\.json$/.test(entry));
        tempDirCheck.commandFiles = commandFiles.length;
        tempDirCheck.responseFiles = responseFiles.length;

        for (const entry of commandFiles) {
          const stat = await fs.stat(join(tempDir, entry));
          if ((now - stat.mtimeMs) / 1000 > staleAfterSeconds) tempDirCheck.staleCommandFiles += 1;
        }
        for (const entry of responseFiles) {
          const stat = await fs.stat(join(tempDir, entry));
          if ((now - stat.mtimeMs) / 1000 > staleAfterSeconds) tempDirCheck.staleResponseFiles += 1;
        }
      } catch (error) {
        warnings.push(`Could not inspect bridge temp directory: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (tempDirCheck.staleCommandFiles > 0 || tempDirCheck.staleResponseFiles > 0) {
      warnings.push(`Found stale bridge files: ${tempDirCheck.staleCommandFiles} command, ${tempDirCheck.staleResponseFiles} response`);
    }

    const defaultPremierePath = '/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app';
    const commonPremierePaths = [
      defaultPremierePath,
      '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app',
      '/Applications/Adobe Premiere Pro 2024/Adobe Premiere Pro 2024.app',
      '/Applications/Adobe Premiere Pro 2023/Adobe Premiere Pro 2023.app'
    ];
    const premierePaths = Array.from(new Set([
      bridgeDiagnostics?.premierePath || null,
      ...commonPremierePaths
    ].filter((candidatePath): candidatePath is string => Boolean(candidatePath))));
    const foundPremierePath = await this.firstExistingPath(premierePaths);
    if (!foundPremierePath) {
      warnings.push('Adobe Premiere Pro was not found in known macOS install paths');
    }

    const homeDir = process.env.HOME || '';
    const preferredPremierePath = bridgeDiagnostics?.premierePath || foundPremierePath || defaultPremierePath;
    const cepAppBundlePath = join(preferredPremierePath, 'Contents/CEP/extensions/MCPBridgeCEP');
    const cepUserPath = homeDir ? join(homeDir, 'Library/Application Support/Adobe/CEP/extensions/MCPBridgeCEP') : null;
    const cepExtension = {
      appBundlePath: cepAppBundlePath,
      appBundleExists: await this.pathExists(cepAppBundlePath),
      userPath: cepUserPath,
      userExists: cepUserPath ? await this.pathExists(cepUserPath) : false,
      recommendedPath: cepAppBundlePath
    };
    if (!cepExtension.appBundleExists && !cepExtension.userExists) {
      warnings.push('CEP bridge extension was not found in the selected app bundle path or user-level CEP path');
    }

    let roundTrip: any;
    try {
      roundTrip = await this.testConnection();
    } catch (error) {
      roundTrip = {
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    if (!roundTrip.success || !roundTrip.connected) {
      warnings.push(`Premiere bridge round trip failed: ${roundTrip.error || 'unknown error'}`);
    }

    return {
      success: tempDirCheck.exists && tempDirCheck.readable && tempDirCheck.writable && Boolean(roundTrip.success && roundTrip.connected),
      generatedAt: new Date().toISOString(),
      checks: {
        bridge: bridgeDiagnostics || {
          tempDir,
          communicationMethod: 'unknown',
          usesExternalTempDir: Boolean(process.env.PREMIERE_TEMP_DIR),
          isInitialized: null,
          sessionId: null,
          premierePath: null
        },
        tempDir: tempDirCheck,
        premiereInstallation: {
          found: Boolean(foundPremierePath),
          foundPath: foundPremierePath,
          bridgeReportedPath: bridgeDiagnostics?.premierePath || null,
          checkedPaths: premierePaths
        },
        cepExtension,
        roundTrip
      },
      warnings
    };
  }

  private summarizeLiveSweepResult(result: any): any {
    if (result == null || typeof result !== 'object') {
      return result;
    }

    const summary: Record<string, any> = {};
    for (const key of ['success', 'message', 'error', 'name', 'path', 'projectPath', 'sequenceId', 'id', 'connected', 'premiereVersion']) {
      if (key in result) {
        summary[key] = result[key];
      }
    }
    if (result.project && typeof result.project === 'object') {
      summary.project = {
        name: result.project.name,
        path: result.project.path
      };
    }
    if (result.sequence && typeof result.sequence === 'object') {
      summary.sequence = {
        id: result.sequence.id,
        name: result.sequence.name
      };
    }
    if (Array.isArray(result.sequences)) summary.sequenceCount = result.sequences.length;
    if (Array.isArray(result.items)) summary.itemCount = result.items.length;
    if (Array.isArray(result.bins)) summary.binCount = result.bins.length;
    return summary;
  }

  private countSweepResults(results: Array<{ status: string }>): Record<string, number> {
    return {
      total: results.length,
      executed: results.filter((entry) => entry.status === 'executed').length,
      runtime_failure: results.filter((entry) => entry.status === 'runtime_failure').length,
      skipped: results.filter((entry) => entry.status === 'skipped').length
    };
  }

  private isPathInside(parentPath: string, childPath: string): boolean {
    const parent = resolve(parentPath);
    const child = resolve(childPath);
    const childRelativeToParent = relative(parent, child);
    return childRelativeToParent === '' || (
      childRelativeToParent !== '' &&
      !childRelativeToParent.startsWith('..') &&
      !isAbsolute(childRelativeToParent)
    );
  }

  private validateScratchProjectName(name: string): void {
    if (!name.trim()) {
      throw new Error('scratchProjectName must not be empty');
    }
    if (name.includes('/') || name.includes('\\') || name === '.' || name === '..' || name.split(/[\\/]/).includes('..')) {
      throw new Error('scratchProjectName must be a plain project name, not a path');
    }
  }

  private resolveSafeSweepReportPath(scratchProjectDir: string, requestedReportPath: string | undefined, runId: number): string {
    const defaultReportPath = join(scratchProjectDir, `live-tool-sweep-safe-${runId}.json`);
    const reportPath = requestedReportPath
      ? (isAbsolute(requestedReportPath) ? resolve(requestedReportPath) : resolve(scratchProjectDir, requestedReportPath))
      : defaultReportPath;

    if (!this.isPathInside(scratchProjectDir, reportPath)) {
      throw new Error('reportPath must resolve inside scratchProjectDir');
    }
    return reportPath;
  }

  private async prepareSafeSweepReportPath(scratchProjectDir: string, reportPath: string): Promise<void> {
    const scratchRealPath = await fs.realpath(scratchProjectDir);
    const reportDir = dirname(reportPath);
    const relativeReportDir = relative(scratchProjectDir, reportDir);

    if (relativeReportDir && (isAbsolute(relativeReportDir) || relativeReportDir === '..' || relativeReportDir.startsWith(`..${sep}`) || relativeReportDir.split(/[\\/]+/).includes('..'))) {
      throw new Error('reportPath must resolve inside scratchProjectDir');
    }

    let currentDir = scratchProjectDir;
    const reportDirParts = relativeReportDir.split(/[\\/]+/).filter(Boolean);
    for (const part of reportDirParts) {
      currentDir = join(currentDir, part);
      try {
        const directoryStat = await fs.lstat(currentDir);
        if (directoryStat.isSymbolicLink()) {
          throw new Error('reportPath parent directories must not contain symbolic links');
        }
        if (!directoryStat.isDirectory()) {
          throw new Error('reportPath parent must be a directory');
        }
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
        await fs.mkdir(currentDir, { mode: 0o700 });
        const directoryStat = await fs.lstat(currentDir);
        if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
          throw new Error('reportPath parent must be a real directory');
        }
      }

      const currentDirRealPath = await fs.realpath(currentDir);
      if (!this.isPathInside(scratchRealPath, currentDirRealPath)) {
        throw new Error('reportPath must stay inside scratchProjectDir after resolving symlinks');
      }
    }

    const reportDirRealPath = await fs.realpath(reportDir);
    if (!this.isPathInside(scratchRealPath, reportDirRealPath)) {
      throw new Error('reportPath must stay inside scratchProjectDir after resolving symlinks');
    }

    try {
      const reportFileStat = await fs.lstat(reportPath);
      if (reportFileStat.isSymbolicLink()) {
        throw new Error('reportPath must not be a symbolic link');
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async writeSafeSweepReport(scratchProjectDir: string, reportPath: string, report: Record<string, any>): Promise<void> {
    await this.prepareSafeSweepReportPath(scratchProjectDir, reportPath);
    const noFollowFlag = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
    const handle = await fs.open(
      reportPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollowFlag,
      0o600
    );
    try {
      await handle.writeFile(JSON.stringify(report, null, 2));
    } finally {
      await handle.close();
    }
  }

  private async liveToolSweepSafe(args: LiveToolSweepSafeArgs): Promise<any> {
    const runId = Date.now();
    const mode = args.mode || 'smoke';
    const scratchProjectDir = resolve(args.scratchProjectDir);
    const scratchProjectName = args.scratchProjectName || `Premiere MCP Safe Sweep ${runId}`;
    this.validateScratchProjectName(scratchProjectName);
    const reportPath = this.resolveSafeSweepReportPath(scratchProjectDir, args.reportPath, runId);
    const results: any[] = [];

    const record = (name: string, toolArgs: Record<string, any>, result: any, note?: string) => {
      results.push({
        name,
        status: result?.success === false ? 'runtime_failure' : 'executed',
        args: toolArgs,
        note,
        result: this.summarizeLiveSweepResult(result)
      });
    };

    const invoke = async (name: string, toolArgs: Record<string, any>, fn: () => Promise<any>, note?: string) => {
      try {
        const result = await fn();
        record(name, toolArgs, result, note);
        return result;
      } catch (error) {
        const result = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
        record(name, toolArgs, result, note);
        return result;
      }
    };

    const writeReport = async (extra: Record<string, any> = {}) => {
      const counts = this.countSweepResults(results);
      const report = {
        success: counts.runtime_failure === 0,
        runId,
        mode,
        scratchProjectName,
        scratchProjectDir,
        scratchProjectPath: extra.scratchProjectPath || null,
        reportPath,
        counts,
        results,
        ...extra
      };
      await this.writeSafeSweepReport(scratchProjectDir, reportPath, report);
      return report;
    };

    await fs.mkdir(scratchProjectDir, { recursive: true });
    await this.prepareSafeSweepReportPath(scratchProjectDir, reportPath);

    const createArgs = { name: scratchProjectName, location: scratchProjectDir };
    const createdProject = await invoke(
      'create_project',
      createArgs,
      () => this.createProject(scratchProjectName, scratchProjectDir),
      'create disposable scratch project before running any mutating sweep steps'
    );
    const scratchProjectPath = createdProject.projectPath || join(scratchProjectDir, `${scratchProjectName}.prproj`);

    if (!createdProject.success) {
      const report = await writeReport({
        success: false,
        stage: 'create_project',
        error: createdProject.error || 'Scratch project creation failed',
        scratchProjectPath
      });
      return report;
    }

    await invoke('test_connection', {}, () => this.testConnection(), 'verify bridge round trip in the scratch project');
    await invoke('list_sequences', {}, () => this.listSequences(), 'verify scratch sequence inventory is readable');
    await invoke('list_project_items', {}, () => this.listProjectItems(), 'verify scratch project inventory is readable');

    return await writeReport({ scratchProjectPath });
  }

  private async listProjectItems(includeBins = true, _includeMetadata = false): Promise<any> {
    const script = `
      try {
        function walkItems(parent, results, bins) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            var info = {
              id: item.nodeId,
              name: item.name,
              type: item.type === 2 ? 'bin' : (item.isSequence() ? 'sequence' : 'footage'),
              treePath: item.treePath
            };
            try { info.mediaPath = item.getMediaPath(); } catch(e) {}
            if (item.type === 2) {
              bins.push(info);
              walkItems(item, results, bins);
            } else {
              results.push(info);
            }
          }
        }
        var items = []; var bins = [];
        walkItems(app.project.rootItem, items, bins);
        return JSON.stringify({
          success: true,
          items: items,
          bins: ${includeBins} ? bins : [],
          totalItems: items.length,
          totalBins: bins.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private buildProjectInspectionHelpersScript(): string {
    return `
      function __projectItemType(item) {
        try {
          if (item.type === 2) return 'bin';
          if (item.type === 3) return 'root';
          if (item.type === 4) return 'file';
          if (item.isSequence && item.isSequence()) return 'sequence';
        } catch (_) {}
        return item && item.type === 1 ? 'clip' : 'unknown';
      }

      function __safeProjectItemString(value) {
        try {
          if (value === null || value === undefined) return null;
          return String(value);
        } catch (_) {
          return null;
        }
      }

      function __safeProjectItemSeconds(timeObj) {
        try {
          if (!timeObj) return null;
          if (typeof timeObj.seconds === 'number') return timeObj.seconds;
          if (timeObj.seconds !== undefined && timeObj.seconds !== null) {
            var numericSeconds = Number(timeObj.seconds);
            return isFinite(numericSeconds) ? numericSeconds : null;
          }
          if (timeObj.ticks !== undefined && timeObj.ticks !== null) return __ticksToSeconds(timeObj.ticks);
        } catch (_) {}
        return null;
      }

      function __findProjectItem(identifier) {
        if (!identifier && identifier !== 0) return null;
        var wanted = String(identifier);
        function walk(parent) {
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            try {
              if (String(item.nodeId) === wanted || item.name === wanted || item.treePath === wanted) return item;
            } catch (_) {}
            if (item.type === 2) {
              var found = walk(item);
              if (found) return found;
            }
          }
          return null;
        }
        return walk(app.project.rootItem);
      }

      function __findProjectBin(binId) {
        if (!binId && binId !== 0) return null;
        var wanted = String(binId);
        function byIdOrName(parent) {
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            if (item.type !== 2) continue;
            try {
              if (String(item.nodeId) === wanted || item.name === wanted || item.treePath === wanted) return item;
            } catch (_) {}
            var nested = byIdOrName(item);
            if (nested) return nested;
          }
          return null;
        }

        var direct = byIdOrName(app.project.rootItem);
        if (direct) return direct;

        var parts = wanted.split('/');
        var current = app.project.rootItem;
        for (var p = 0; p < parts.length; p++) {
          var part = parts[p];
          if (!part) continue;
          var matched = null;
          for (var c = 0; c < current.children.numItems; c++) {
            var child = current.children[c];
            if (child.type === 2 && child.name === part) {
              matched = child;
              break;
            }
          }
          if (!matched) return null;
          current = matched;
        }
        return current !== app.project.rootItem ? current : null;
      }

      function __itemInspectionSummary(item) {
        var info = {
          nodeId: __safeProjectItemString(item.nodeId),
          id: __safeProjectItemString(item.nodeId),
          name: __safeProjectItemString(item.name),
          type: __projectItemType(item),
          treePath: __safeProjectItemString(item.treePath)
        };
        try { info.mediaPath = item.getMediaPath(); } catch (_) {}
        try { info.offline = item.isOffline(); } catch (_) {}
        try { info.colorLabel = item.getColorLabel(); } catch (_) {}
        try { info.canChangeMediaPath = item.canChangeMediaPath(); } catch (_) {}
        try {
          var interp = item.getFootageInterpretation();
          if (interp) {
            info.footageInterpretation = {
              frameRate: interp.frameRate,
              pixelAspectRatio: interp.pixelAspectRatio,
              fieldType: interp.fieldType,
              alphaUsage: interp.alphaUsage,
              ignoreAlpha: interp.ignoreAlpha,
              invertAlpha: interp.invertAlpha
            };
            info.frameRate = interp.frameRate;
            info.pixelAspectRatio = interp.pixelAspectRatio;
          }
        } catch (_) {}
        try { info.inPoint = __safeProjectItemSeconds(item.getInPoint()); } catch (_) {}
        try { info.outPoint = __safeProjectItemSeconds(item.getOutPoint()); } catch (_) {}
        return info;
      }

      function __readProjectItemMetadata(item, info) {
        try {
          var projectMetadata = item.getProjectMetadata();
          if (projectMetadata && projectMetadata.length > 10000) {
            info.projectMetadataLength = projectMetadata.length;
            info.metadataTruncated = true;
          } else if (projectMetadata) {
            info.projectMetadata = projectMetadata;
          }
        } catch (projectMetadataError) {
          info.projectMetadataError = projectMetadataError.toString();
        }
        try {
          var xmpMetadata = item.getXMPMetadata();
          if (xmpMetadata && xmpMetadata.length > 10000) {
            info.xmpMetadataLength = xmpMetadata.length;
            info.metadataTruncated = true;
          } else if (xmpMetadata) {
            info.xmpMetadata = xmpMetadata;
          }
        } catch (xmpMetadataError) {
          info.xmpMetadataError = xmpMetadataError.toString();
        }
      }

      function __readProjectItemMarkers(item) {
        var markers = [];
        try {
          var markerCollection = item.getMarkers();
          if (markerCollection) {
            var marker = markerCollection.getFirstMarker();
            while (marker) {
              markers.push({
                name: __safeProjectItemString(marker.name),
                comments: __safeProjectItemString(marker.comments),
                startSeconds: __safeProjectItemSeconds(marker.start),
                endSeconds: __safeProjectItemSeconds(marker.end)
              });
              marker = markerCollection.getNextMarker(marker);
            }
          }
        } catch (_) {}
        return markers;
      }

      function __walkProjectBin(bin, recursive) {
        var items = [];
        if (!bin || !bin.children) return items;
        for (var i = 0; i < bin.children.numItems; i++) {
          var item = bin.children[i];
          var info = __itemInspectionSummary(item);
          if (item.type === 2 && recursive) {
            info.children = __walkProjectBin(item, true);
            info.childCount = info.children.length;
          } else if (item.type === 2) {
            try { info.childCount = item.children.numItems; } catch (_) {}
          }
          items.push(info);
        }
        return items;
      }

      function __countProjectItems(bin, stats) {
        if (!bin || !bin.children) return stats;
        for (var i = 0; i < bin.children.numItems; i++) {
          var item = bin.children[i];
          stats.totalItems++;
          if (item.type === 2) stats.totalBins++;
          try { if (item.isOffline()) stats.offlineItems++; } catch (_) {}
          try {
            var mediaPath = item.getMediaPath();
            if (mediaPath) {
              var extension = mediaPath.split('.').pop().toLowerCase();
              if (extension) stats.mediaFileTypes[extension] = (stats.mediaFileTypes[extension] || 0) + 1;
            }
          } catch (_) {}
          if (item.type === 2) __countProjectItems(item, stats);
        }
        return stats;
      }
    `;
  }

  private async getFullProjectOverview(): Promise<any> {
    const script = buildPremiereScript(`
      ${this.buildProjectInspectionHelpersScript()}
      return (function __getFullProjectOverview() {
        var project = app.project;
        if (!project) return { success: false, error: 'No project is open' };
        var stats = __countProjectItems(project.rootItem, { totalItems: 0, totalBins: 0, offlineItems: 0, mediaFileTypes: {} });
        var sequences = [];
        for (var i = 0; i < project.sequences.numSequences; i++) {
          var seq = project.sequences[i];
          var clipCount = 0;
          try {
            for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) clipCount += seq.videoTracks[vt].clips.numItems;
            for (var at = 0; at < seq.audioTracks.numTracks; at++) clipCount += seq.audioTracks[at].clips.numItems;
          } catch (_) {}
          sequences.push({
            id: __safeProjectItemString(seq.sequenceID),
            name: __safeProjectItemString(seq.name),
            width: seq.frameSizeHorizontal,
            height: seq.frameSizeVertical,
            durationSeconds: __safeProjectItemSeconds(seq.end),
            videoTracks: seq.videoTracks.numTracks,
            audioTracks: seq.audioTracks.numTracks,
            totalClips: clipCount
          });
        }
        var activeSequence = null;
        if (project.activeSequence) {
          activeSequence = {
            id: __safeProjectItemString(project.activeSequence.sequenceID),
            name: __safeProjectItemString(project.activeSequence.name)
          };
        }
        return {
          success: true,
          projectName: project.name,
          projectPath: project.path,
          totalItems: stats.totalItems,
          totalBins: stats.totalBins,
          offlineItems: stats.offlineItems,
          sequenceCount: sequences.length,
          mediaFileTypes: stats.mediaFileTypes,
          activeSequence: activeSequence,
          sequences: sequences,
          binTree: __walkProjectBin(project.rootItem, true)
        };
      })();
    `);
    return await this.bridge.executeScript(script);
  }

  private async getBinContents(args: GetBinContentsArgs): Promise<any> {
    const payload = literalForExtendScript({ binId: args.binId, recursive: args.recursive !== false });
    const script = buildPremiereScript(`
      ${this.buildProjectInspectionHelpersScript()}
      var payload = ${payload};
      return (function __getBinContents() {
        if (!app.project) return { success: false, error: 'No project is open' };
        var bin = __findProjectBin(payload.binId);
        if (!bin) return { success: false, error: 'Bin not found: ' + payload.binId, binId: payload.binId };
        var items = __walkProjectBin(bin, payload.recursive);
        return {
          success: true,
          binName: bin.name,
          binNodeId: __safeProjectItemString(bin.nodeId),
          binPath: __safeProjectItemString(bin.treePath),
          recursive: payload.recursive,
          itemCount: items.length,
          items: items
        };
      })();
    `);
    return await this.bridge.executeScript(script);
  }

  private async getProjectItemInfo(args: GetProjectItemInfoArgs): Promise<any> {
    const payload = literalForExtendScript({ projectItemId: args.projectItemId });
    const script = buildPremiereScript(`
      ${this.buildProjectInspectionHelpersScript()}
      var payload = ${payload};
      return (function __getProjectItemInfo() {
        if (!app.project) return { success: false, error: 'No project is open' };
        var item = __findProjectItem(payload.projectItemId);
        if (!item) return { success: false, error: 'Project item not found: ' + payload.projectItemId, projectItemId: payload.projectItemId };
        var info = __itemInspectionSummary(item);
        try { info.hasProxy = item.hasProxy(); } catch (_) {}
        __readProjectItemMetadata(item, info);
        info.markers = __readProjectItemMarkers(item);
        if (item.type === 2) {
          try { info.childCount = item.children.numItems; } catch (_) {}
        }
        return { success: true, item: info, nodeId: info.nodeId, name: info.name, type: info.type };
      })();
    `);
    return await this.bridge.executeScript(script);
  }

  private async searchProjectItems(args: SearchProjectItemsArgs): Promise<any> {
    const payload = literalForExtendScript({
      query: args.query ?? null,
      extension: args.extension ? args.extension.replace(/^\./, '').toLowerCase() : null,
      offlineOnly: args.offlineOnly === true,
      colorLabel: args.colorLabel ?? null,
      itemType: args.itemType ?? 'all',
      maxResults: args.maxResults ?? 100
    });
    const script = buildPremiereScript(`
      ${this.buildProjectInspectionHelpersScript()}
      var payload = ${payload};
      return (function __searchProjectItems() {
        if (!app.project) return { success: false, error: 'No project is open' };
        var results = [];
        var query = payload.query ? String(payload.query).toLowerCase() : null;
        function searchBin(bin) {
          if (results.length >= payload.maxResults) return;
          for (var i = 0; i < bin.children.numItems; i++) {
            if (results.length >= payload.maxResults) return;
            var item = bin.children[i];
            if (payload.itemType === 'clip' && item.type === 2) {
              searchBin(item);
              continue;
            }
            if (payload.itemType === 'bin' && item.type !== 2) {
              continue;
            }
            var match = true;
            if (query && item.name.toLowerCase().indexOf(query) === -1) match = false;
            if (match && payload.extension) {
              try {
                var mediaPath = item.getMediaPath();
                if (!mediaPath || mediaPath.split('.').pop().toLowerCase() !== payload.extension) match = false;
              } catch (_) {
                match = false;
              }
            }
            if (match && payload.offlineOnly) {
              try { if (!item.isOffline()) match = false; } catch (_) { match = false; }
            }
            if (match && payload.colorLabel !== null) {
              try { if (item.getColorLabel() !== payload.colorLabel) match = false; } catch (_) { match = false; }
            }
            if (match) results.push(__itemInspectionSummary(item));
            if (item.type === 2) searchBin(item);
          }
        }
        searchBin(app.project.rootItem);
        return { success: true, resultCount: results.length, maxResults: payload.maxResults, items: results };
      })();
    `);
    return await this.bridge.executeScript(script);
  }

  private async listSequences(): Promise<any> {
    const script = `
      try {
        var sequences = [];

        for (var i = 0; i < app.project.sequences.numSequences; i++) {
          var seq = app.project.sequences[i];
          sequences.push({
            id: seq.sequenceID,
            name: seq.name,
            duration: __ticksToSeconds(seq.end),
            width: seq.frameSizeHorizontal,
            height: seq.frameSizeVertical,
            timebase: seq.timebase,
            videoTrackCount: seq.videoTracks.numTracks,
            audioTrackCount: seq.audioTracks.numTracks
          });
        }

        return JSON.stringify({
          success: true,
          sequences: sequences,
          count: sequences.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async listSequenceTracks(sequenceId?: string): Promise<any> {
    const sequenceIdJson = sequenceId ? JSON.stringify(sequenceId) : 'null';
    const script = `
      try {
        var requestedSequenceId = ${sequenceIdJson};
        var sequence = requestedSequenceId ? __findSequence(requestedSequenceId) : app.project.activeSequence;
        var warnings = [];
        if (requestedSequenceId && !sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found by id: " + requestedSequenceId,
            requestedSequenceId: requestedSequenceId,
            warnings: warnings
          });
        }
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence found",
            requestedSequenceId: requestedSequenceId,
            warnings: warnings
          });
        }

        function __safeString(value) {
          try {
            if (value === null || value === undefined) return null;
            return String(value);
          } catch (_) {
            return null;
          }
        }

        function __safeSeconds(timeObj, label, clipWarnings) {
          try {
            if (timeObj && typeof timeObj.seconds === "number") return timeObj.seconds;
            if (timeObj && timeObj.seconds !== undefined && timeObj.seconds !== null) {
              var numberValue = Number(timeObj.seconds);
              return isFinite(numberValue) ? numberValue : null;
            }
          } catch (timeError) {
            clipWarnings.push(label + " unavailable: " + timeError.toString());
          }
          return null;
        }

        function __clipEnabled(clip, clipWarnings) {
          try {
            if (clip && typeof clip.isEnabled === "function") return !!clip.isEnabled();
            if (clip && clip.disabled !== undefined) return !clip.disabled;
            if (clip && clip.enabled !== undefined) return !!clip.enabled;
          } catch (enabledError) {
            clipWarnings.push("enabled unavailable: " + enabledError.toString());
          }
          return null;
        }

        function __clipLinked(clip, clipWarnings) {
          try {
            if (clip && typeof clip.isLinked === "function") return !!clip.isLinked();
            if (clip && clip.linked !== undefined) return !!clip.linked;
          } catch (linkedError) {
            clipWarnings.push("linked unavailable: " + linkedError.toString());
          }
          return null;
        }

        function __clipProjectItemSummary(clip, clipWarnings) {
          var item = null;
          try {
            item = clip && clip.projectItem ? clip.projectItem : null;
          } catch (projectItemError) {
            clipWarnings.push("projectItem unavailable: " + projectItemError.toString());
          }

          var projectItemId = null;
          var projectItemName = null;
          var mediaPath = null;
          if (item) {
            try { projectItemId = item.nodeId !== undefined && item.nodeId !== null ? String(item.nodeId) : null; } catch (idError) { clipWarnings.push("projectItemId unavailable: " + idError.toString()); }
            try { projectItemName = item.name !== undefined && item.name !== null ? String(item.name) : null; } catch (nameError) { clipWarnings.push("projectItemName unavailable: " + nameError.toString()); }
            try {
              if (typeof item.getMediaPath === "function") mediaPath = item.getMediaPath();
            } catch (mediaPathError) {
              clipWarnings.push("mediaPath unavailable: " + mediaPathError.toString());
            }
          }

          return {
            projectItemId: projectItemId,
            projectItemName: projectItemName,
            mediaPath: mediaPath
          };
        }

        function __clipSummary(clip, trackType, trackIndex, clipIndex) {
          var clipWarnings = [];
          var itemSummary = __clipProjectItemSummary(clip, clipWarnings);
          return {
            id: __safeString(clip.nodeId),
            name: __safeString(clip.name),
            startTime: __safeSeconds(clip.start, "startTime", clipWarnings),
            endTime: __safeSeconds(clip.end, "endTime", clipWarnings),
            duration: __safeSeconds(clip.duration, "duration", clipWarnings),
            inPoint: __safeSeconds(clip.inPoint, "inPoint", clipWarnings),
            outPoint: __safeSeconds(clip.outPoint, "outPoint", clipWarnings),
            trackType: trackType,
            trackIndex: trackIndex,
            clipIndex: clipIndex,
            enabled: __clipEnabled(clip, clipWarnings),
            linked: __clipLinked(clip, clipWarnings),
            projectItemId: itemSummary.projectItemId,
            projectItemName: itemSummary.projectItemName,
            mediaPath: itemSummary.mediaPath,
            warnings: clipWarnings
          };
        }

        var videoTracks = [];
        var audioTracks = [];

        for (var i = 0; i < sequence.videoTracks.numTracks; i++) {
          var videoTrack = sequence.videoTracks[i];
          var videoClips = [];

          for (var j = 0; j < videoTrack.clips.numItems; j++) {
            var videoClip = videoTrack.clips[j];
            videoClips.push(__clipSummary(videoClip, "video", i, j));
          }

          videoTracks.push({
            index: i,
            trackType: "video",
            name: videoTrack.name || "Video " + (i + 1),
            clips: videoClips,
            clipCount: videoClips.length
          });
        }

        for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
          var audioTrack = sequence.audioTracks[a];
          var audioClips = [];

          for (var c = 0; c < audioTrack.clips.numItems; c++) {
            var audioClip = audioTrack.clips[c];
            audioClips.push(__clipSummary(audioClip, "audio", a, c));
          }

          audioTracks.push({
            index: a,
            trackType: "audio",
            name: audioTrack.name || "Audio " + (a + 1),
            clips: audioClips,
            clipCount: audioClips.length
          });
        }

        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID || requestedSequenceId,
          requestedSequenceId: requestedSequenceId,
          sequenceName: sequence.name,
          videoTracks: videoTracks,
          audioTracks: audioTracks,
          totalVideoTracks: videoTracks.length,
          totalAudioTracks: audioTracks.length,
          warnings: warnings
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async scanConformMediaMetadata(args: ScanConformMediaMetadataArgs): Promise<any> {
    const payload = literalForExtendScript({
      projectItemIds: args.projectItemIds || [],
      mediaPaths: args.mediaPaths || [],
      binId: args.binId || null,
      includeOffline: args.includeOffline === true,
      includeSequences: args.includeSequences === true,
      includeXmp: args.includeXmp === true,
      metadataFields: args.metadataFields || []
    });

    const script = `
      function __scanConformMediaMetadata() {
        try {
          var payload = ${payload};
          var requestedIds = payload.projectItemIds || [];
          var requestedPaths = payload.mediaPaths || [];
          var requestedPathMap = {};
          for (var rp = 0; rp < requestedPaths.length; rp++) {
            requestedPathMap[String(requestedPaths[rp])] = true;
          }

          function __findProjectItem(id) {
            function walk(parent) {
              if (!parent || !parent.children) return null;
              for (var i = 0; i < parent.children.numItems; i++) {
                var child = parent.children[i];
                if (String(child.nodeId) === String(id)) return child;
                var found = walk(child);
                if (found) return found;
              }
              return null;
            }
            return walk(app.project.rootItem);
          }

          function __walkProjectItems(parent, items) {
            if (!parent || !parent.children) return;
            for (var i = 0; i < parent.children.numItems; i++) {
              var child = parent.children[i];
              items.push(child);
              __walkProjectItems(child, items);
            }
          }

          function __safeSeconds(timeObj) {
            try {
              if (timeObj && typeof timeObj.seconds === 'number') return timeObj.seconds;
            } catch (ignored) {}
            return null;
          }

          function __readMetadata(item) {
            var metadata = { project: null, xmp: null, selectedFields: {}, warnings: [] };
            try { metadata.project = item.getProjectMetadata(); } catch (e) { metadata.warnings.push('getProjectMetadata unavailable: ' + e.toString()); }
            if (payload.includeXmp) {
              try { metadata.xmp = item.getXMPMetadata(); } catch (e2) { metadata.warnings.push('getXMPMetadata unavailable: ' + e2.toString()); }
            }
            for (var f = 0; f < payload.metadataFields.length; f++) {
              var field = payload.metadataFields[f];
              var haystack = String(metadata.project || '') + '\\n' + String(metadata.xmp || '');
              var index = haystack.indexOf(field);
              metadata.selectedFields[field] = index >= 0 ? index : null;
            }
            return metadata;
          }

          function __metadataValue(raw, patterns) {
            var text = String(raw || '');
            for (var p = 0; p < patterns.length; p++) {
              var match = patterns[p].exec(text);
              if (match && match[1]) return match[1];
            }
            return null;
          }

          function __safeNumber(value) {
            var numberValue = Number(value);
            return isFinite(numberValue) ? numberValue : null;
          }

          function __isoTimestamp() {
            var now = new Date();
            try {
              if (typeof now.toISOString === 'function') return now.toISOString();
            } catch (isoError) {}
            function pad(value, width) {
              var text = String(value);
              while (text.length < width) text = '0' + text;
              return text;
            }
            return String(now.getUTCFullYear()) + '-' +
              pad(now.getUTCMonth() + 1, 2) + '-' +
              pad(now.getUTCDate(), 2) + 'T' +
              pad(now.getUTCHours(), 2) + ':' +
              pad(now.getUTCMinutes(), 2) + ':' +
              pad(now.getUTCSeconds(), 2) + '.' +
              pad(now.getUTCMilliseconds(), 3) + 'Z';
          }

          function __readFootageInterpretation(item, warnings) {
            try {
              if (!item || !item.getFootageInterpretation) return null;
              var interp = item.getFootageInterpretation();
              return {
                frameRate: __safeNumber(interp.frameRate),
                pixelAspectRatio: __safeNumber(interp.pixelAspectRatio),
                fieldType: interp.fieldType !== undefined ? interp.fieldType : null,
                removePulldown: interp.removePulldown !== undefined ? interp.removePulldown : null,
                alphaUsage: interp.alphaUsage !== undefined ? interp.alphaUsage : null
              };
            } catch (footageError) {
              warnings.push('getFootageInterpretation unavailable: ' + footageError.toString());
              return null;
            }
          }

          function __isNtscDropFrameRate(frameRate) {
            return Math.abs(frameRate - 29.97) < 0.02 || Math.abs(frameRate - 59.94) < 0.02;
          }

          function __timecodeToFrames(timecode, frameRate, warnings) {
            if (!timecode) return null;
            if (!frameRate) {
              if (warnings) warnings.push('missingSourceFrameRateForSourceTimecode');
              return null;
            }
            var match = String(timecode).match(/^([0-9]{2})([:;])([0-9]{2})([:;])([0-9]{2})([:;])([0-9]{2})$/);
            if (!match) {
              if (warnings) warnings.push('invalidSourceStartTimecode: invalid format');
              return null;
            }
            var hours = Number(match[1]);
            var minutes = Number(match[3]);
            var seconds = Number(match[5]);
            var frames = Number(match[7]);
            var fps = Math.round(frameRate);
            if (minutes > 59 || seconds > 59 || frames >= fps) {
              if (warnings) warnings.push('invalidSourceStartTimecode: fields out of range');
              return null;
            }
            var totalFrames = (((hours * 60 + minutes) * 60 + seconds) * fps) + frames;
            if (String(timecode).indexOf(';') >= 0) {
              if (!__isNtscDropFrameRate(frameRate)) {
                if (warnings) warnings.push('dropFrameTimecodeAtNonNtscRate');
                return totalFrames;
              }
              var dropFrames = Math.round(fps * 0.0666666667);
              if ((minutes % 10) !== 0 && seconds === 0 && frames < dropFrames) {
                if (warnings) warnings.push('invalidSourceStartTimecode: Invalid dropped frame label');
                return null;
              }
              var totalMinutes = hours * 60 + minutes;
              totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
            }
            return totalFrames;
          }

          function __itemToConformRecord(item) {
            var warnings = [];
            var mediaPath = null;
            try { mediaPath = item.getMediaPath(); } catch (e) { warnings.push('mediaPath unavailable: ' + e.toString()); }
            var projectMetadata = null;
            var xmpMetadata = null;
            try { projectMetadata = item.getProjectMetadata(); } catch (pm) {}
            if (payload.includeXmp) {
              try { xmpMetadata = item.getXMPMetadata(); } catch (xm) {}
            }
            var metadataText = String(projectMetadata || '') + '\\n' + String(xmpMetadata || '');
            var reelName = __metadataValue(metadataText, [/reel(?:Name)?["'\\s:=]+([^"'<>\\n\\r]+)/i, /tape(?:Name)?["'\\s:=]+([^"'<>\\n\\r]+)/i, /cameraRoll["'\\s:=]+([^"'<>\\n\\r]+)/i]);
            var startTimecode = __metadataValue(metadataText, [/(?:start|source)Timecode["'\\s:=]+([0-9]{2}[:;][0-9]{2}[:;][0-9]{2}[:;][0-9]{2})/i, /timecode["'\\s:=]+([0-9]{2}[:;][0-9]{2}[:;][0-9]{2}[:;][0-9]{2})/i]);
            var sourceVideoWidth = __safeNumber(__metadataValue(metadataText, [/sourceVideoWidth["'\\s:=]+([0-9.]+)/i, /videoWidth["'\\s:=]+([0-9.]+)/i, /frameWidth["'\\s:=]+([0-9.]+)/i]));
            var sourceVideoHeight = __safeNumber(__metadataValue(metadataText, [/sourceVideoHeight["'\\s:=]+([0-9.]+)/i, /videoHeight["'\\s:=]+([0-9.]+)/i, /frameHeight["'\\s:=]+([0-9.]+)/i]));
            var durationSeconds = null;
            try { durationSeconds = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (dur) {}
            var footageInterpretation = __readFootageInterpretation(item, warnings);
            var frameRateValue = footageInterpretation && footageInterpretation.frameRate ? footageInterpretation.frameRate : null;
            var durationFrames = durationSeconds !== null && frameRateValue ? Math.round(durationSeconds * frameRateValue) : null;
            var sourceStartFrame = __timecodeToFrames(startTimecode, frameRateValue, warnings);
            var raster = { width: sourceVideoWidth, height: sourceVideoHeight, pixelAspectRatio: footageInterpretation ? footageInterpretation.pixelAspectRatio : null };
            return {
              projectItemId: String(item.nodeId),
              name: item.name,
              mediaPath: mediaPath,
              treePath: item.treePath || null,
              type: item.type === 2 ? 'bin' : (item.isSequence && item.isSequence() ? 'sequence' : 'footage'),
              durationSeconds: durationSeconds,
              durationFrames: durationFrames,
              frameRate: frameRateValue ? { fps: frameRateValue, nominalFps: Math.round(frameRateValue) } : null,
              footageInterpretation: footageInterpretation,
              raster: raster,
              inPointSeconds: __safeSeconds(item.getInPoint ? item.getInPoint() : null),
              outPointSeconds: __safeSeconds(item.getOutPoint ? item.getOutPoint() : null),
              reelName: reelName,
              tapeName: reelName,
              sourceStartTimecode: startTimecode,
              sourceStartFrame: sourceStartFrame,
              rawMetadata: __readMetadata(item),
              warnings: warnings
            };
          }

          var candidates = [];
          if (payload.binId) {
            var bin = __findProjectItem(payload.binId);
            if (!bin) return JSON.stringify({ success: false, mutationPlanned: false, error: 'Bin not found: ' + payload.binId });
            __walkProjectItems(bin, candidates);
          } else if (requestedIds.length > 0) {
            for (var idIndex = 0; idIndex < requestedIds.length; idIndex++) {
              var item = __findProjectItem(requestedIds[idIndex]);
              if (item) candidates.push(item);
            }
          } else {
            __walkProjectItems(app.project.rootItem, candidates);
          }

          var items = [];
          var missingProjectItemIds = [];
          for (var missingIndex = 0; missingIndex < requestedIds.length; missingIndex++) {
            if (!__findProjectItem(requestedIds[missingIndex])) missingProjectItemIds.push(requestedIds[missingIndex]);
          }

          for (var c = 0; c < candidates.length; c++) {
            var record = __itemToConformRecord(candidates[c]);
            if (!payload.includeSequences && record.type === 'sequence') continue;
            if (!payload.includeOffline && !record.mediaPath && record.type !== 'sequence') continue;
            if (requestedPaths.length > 0 && record.mediaPath && !requestedPathMap[String(record.mediaPath)]) continue;
            items.push(record);
          }

          return JSON.stringify({
            success: true,
            mutationPlanned: false,
            scannedAt: __isoTimestamp(),
            criteria: payload,
            items: items,
            totalItems: items.length,
            missingProjectItemIds: missingProjectItemIds,
            warnings: missingProjectItemIds.length ? ['missingProjectItems'] : []
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: false, error: e.toString() });
        }
      }
      return __scanConformMediaMetadata();
    `;

    return await this.bridge.executeScript(script);
  }

  private async snapshotSequenceForConform(args: SnapshotSequenceForConformArgs): Promise<any> {
    const payload = JSON.stringify({
      sequenceId: args.sequenceId,
      trackRoles: args.trackRoles || {},
      includeEffects: args.includeEffects !== false,
      includeKeyframes: args.includeKeyframes === true,
      includeDisabled: args.includeDisabled === true
    });

    const script = `
      function __snapshotSequenceForConform() {
        try {
          var payload = ${payload};
          var defaults = { includeDisabled: false };
          if (payload.includeDisabled !== true) payload.includeDisabled = defaults.includeDisabled;
          var sequence = __findSequence(payload.sequenceId);
          if (!sequence) return JSON.stringify({ success: false, mutationPlanned: false, error: 'Sequence not found: ' + payload.sequenceId });

          function __secondsToFrame(seconds, frameRate) {
            if (seconds === null || seconds === undefined || isNaN(seconds) || !frameRate) return null;
            return Math.round(Number(seconds) * frameRate);
          }

          function __timeSeconds(timeObj) {
            try {
              if (timeObj && typeof timeObj.seconds === 'number') return timeObj.seconds;
            } catch (ignored) {}
            return null;
          }

          function __clipProjectItem(clip) {
            try { return clip.projectItem || null; } catch (e) { return null; }
          }

          function __safeNumber(value) {
            var numberValue = Number(value);
            return isFinite(numberValue) ? numberValue : null;
          }

          function __metadataValue(raw, patterns) {
            var text = String(raw || '');
            for (var p = 0; p < patterns.length; p++) {
              var match = patterns[p].exec(text);
              if (match && match[1]) return match[1];
            }
            return null;
          }

          function __isNtscDropFrameRate(frameRate) {
            return Math.abs(frameRate - 29.97) < 0.02 || Math.abs(frameRate - 59.94) < 0.02;
          }

          function __timecodeToFrames(timecode, frameRate, warnings) {
            if (!timecode) return null;
            if (!frameRate) {
              if (warnings) warnings.push('missingSourceFrameRateForSourceTimecode');
              return null;
            }
            var match = String(timecode).match(/^([0-9]{2})([:;])([0-9]{2})([:;])([0-9]{2})([:;])([0-9]{2})$/);
            if (!match) {
              if (warnings) warnings.push('invalidSourceStartTimecode: invalid format');
              return null;
            }
            var hours = Number(match[1]);
            var minutes = Number(match[3]);
            var seconds = Number(match[5]);
            var frames = Number(match[7]);
            var fps = Math.round(frameRate);
            if (minutes > 59 || seconds > 59 || frames >= fps) {
              if (warnings) warnings.push('invalidSourceStartTimecode: fields out of range');
              return null;
            }
            var totalFrames = (((hours * 60 + minutes) * 60 + seconds) * fps) + frames;
            if (String(timecode).indexOf(';') >= 0) {
              if (!__isNtscDropFrameRate(frameRate)) {
                if (warnings) warnings.push('dropFrameTimecodeAtNonNtscRate');
                return totalFrames;
              }
              var dropFrames = Math.round(fps * 0.0666666667);
              if ((minutes % 10) !== 0 && seconds === 0 && frames < dropFrames) {
                if (warnings) warnings.push('invalidSourceStartTimecode: Invalid dropped frame label');
                return null;
              }
              var totalMinutes = hours * 60 + minutes;
              totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
            }
            return totalFrames;
          }

          function __readItemConformIdentity(item, sequenceFrameRate, warnings) {
            var projectMetadata = null;
            try { if (item && item.getProjectMetadata) projectMetadata = item.getProjectMetadata(); } catch (metadataError) { warnings.push('projectMetadataUnavailable'); }
            var metadataText = String(projectMetadata || '');
            var sourceStartTimecode = __metadataValue(metadataText, [/(?:start|source)Timecode["'\\s:=]+([0-9]{2}[:;][0-9]{2}[:;][0-9]{2}[:;][0-9]{2})/i, /timecode["'\\s:=]+([0-9]{2}[:;][0-9]{2}[:;][0-9]{2}[:;][0-9]{2})/i]);
            var reelName = __metadataValue(metadataText, [/reel(?:Name)?["'\\s:=]+([^"'<>\\n\\r]+)/i, /tape(?:Name)?["'\\s:=]+([^"'<>\\n\\r]+)/i, /cameraRoll["'\\s:=]+([^"'<>\\n\\r]+)/i]);
            var footageInterpretation = null;
            try {
              if (item && item.getFootageInterpretation) {
                var interp = item.getFootageInterpretation();
                footageInterpretation = {
                  frameRate: __safeNumber(interp.frameRate),
                  pixelAspectRatio: __safeNumber(interp.pixelAspectRatio),
                  fieldType: interp.fieldType !== undefined ? interp.fieldType : null
                };
              }
            } catch (footageError) { warnings.push('getFootageInterpretation unavailable: ' + footageError.toString()); }
            var sourceFrameRate = footageInterpretation && footageInterpretation.frameRate ? footageInterpretation.frameRate : null;
            return {
              reelName: reelName,
              tapeName: reelName,
              sourceStartTimecode: sourceStartTimecode,
              sourceStartFrame: __timecodeToFrames(sourceStartTimecode, sourceFrameRate, warnings),
              frameRate: sourceFrameRate ? { fps: sourceFrameRate, nominalFps: Math.round(sourceFrameRate) } : null,
              footageInterpretation: footageInterpretation,
              raster: { width: null, height: null, pixelAspectRatio: footageInterpretation ? footageInterpretation.pixelAspectRatio : null }
            };
          }

          function __clipEnabled(clip) {
            try {
              if (clip && typeof clip.isEnabled === 'function') return clip.isEnabled();
              if (clip && clip.disabled !== undefined) return !clip.disabled;
            } catch (_) { }
            return true;
          }

          function __effectSummary(clip) {
            var effects = [];
            if (!payload.includeEffects) return effects;
            try {
              if (!clip.components) return effects;
              for (var ci = 0; ci < clip.components.numItems; ci++) {
                var component = clip.components[ci];
                var properties = [];
                try {
                  for (var pi = 0; pi < component.properties.numItems; pi++) {
                    var prop = component.properties[pi];
                    var value = null;
                    var keyframed = false;
                    try { value = prop.getValue(); } catch (pv) {}
                    try {
                      if (payload.includeKeyframes && prop.areKeyframesSupported && prop.areKeyframesSupported() && prop.isTimeVarying && prop.isTimeVarying()) keyframed = true;
                    } catch (kf) {}
                    properties.push({
                      index: pi,
                      displayName: prop.displayName || null,
                      matchName: prop.matchName || null,
                      value: value,
                      keyframed: keyframed,
                      keyframesIncluded: payload.includeKeyframes
                    });
                  }
                } catch (propsError) {}
                effects.push({
                  index: ci,
                  displayName: component.displayName || null,
                  matchName: component.matchName || null,
                  properties: properties
                });
              }
            } catch (e) {
              effects.push({ unsupported: true, error: e.toString() });
            }
            return effects;
          }

          function __clipSnapshot(clip, trackType, trackIndex, clipIndex, frameRate) {
            var item = __clipProjectItem(clip);
            var warnings = [];
            var mediaPath = null;
            try { if (item) mediaPath = item.getMediaPath(); } catch (mp) { warnings.push('mediaPathUnavailable'); }
            var projectItemId = item ? String(item.nodeId) : null;
            var mediaIdentityDetails = __readItemConformIdentity(item, frameRate, warnings);
            var mediaIdentity = {
              projectItemId: projectItemId,
              mediaPath: mediaPath,
              name: item ? item.name : null,
              treePath: item ? (item.treePath || null) : null,
              reelName: mediaIdentityDetails.reelName,
              tapeName: mediaIdentityDetails.tapeName,
              sourceStartTimecode: mediaIdentityDetails.sourceStartTimecode,
              sourceStartFrame: mediaIdentityDetails.sourceStartFrame,
              frameRate: mediaIdentityDetails.frameRate,
              footageInterpretation: mediaIdentityDetails.footageInterpretation,
              raster: mediaIdentityDetails.raster
            };
            var timelineStartSeconds = __timeSeconds(clip.start);
            var timelineEndSeconds = __timeSeconds(clip.end);
            var sourceInSeconds = __timeSeconds(clip.inPoint);
            var sourceOutSeconds = __timeSeconds(clip.outPoint);
            var timelineStartFrame = __secondsToFrame(timelineStartSeconds, frameRate);
            var timelineEndFrame = __secondsToFrame(timelineEndSeconds, frameRate);
            var sourceFrameRate = mediaIdentityDetails.frameRate && mediaIdentityDetails.frameRate.fps ? mediaIdentityDetails.frameRate.fps : null;
            if (!sourceFrameRate && (sourceInSeconds !== null || sourceOutSeconds !== null)) warnings.push('missingSourceFrameRateForSourceInOut');
            var sourceInFrame = __secondsToFrame(sourceInSeconds, sourceFrameRate);
            var sourceOutFrame = __secondsToFrame(sourceOutSeconds, sourceFrameRate);
            return {
              offlineClipId: String(clip.nodeId),
              clipId: String(clip.nodeId),
              name: clip.name,
              trackType: trackType,
              trackIndex: trackIndex,
              clipIndex: clipIndex,
              timelineStartSeconds: timelineStartSeconds,
              timelineEndSeconds: timelineEndSeconds,
              timelineStartFrame: timelineStartFrame,
              timelineEndFrame: timelineEndFrame,
              timelineDurationFrames: timelineStartFrame !== null && timelineEndFrame !== null ? timelineEndFrame - timelineStartFrame : null,
              sourceInSeconds: sourceInSeconds,
              sourceOutSeconds: sourceOutSeconds,
              sourceInFrame: sourceInFrame,
              sourceOutFrame: sourceOutFrame,
              sourceDurationFrames: sourceInFrame !== null && sourceOutFrame !== null ? sourceOutFrame - sourceInFrame : null,
              durationFrames: sourceInFrame !== null && sourceOutFrame !== null ? sourceOutFrame - sourceInFrame : null,
              sourceStartTimecode: mediaIdentityDetails.sourceStartTimecode,
              sourceStartFrame: mediaIdentityDetails.sourceStartFrame,
              frameRate: mediaIdentityDetails.frameRate,
              raster: mediaIdentityDetails.raster,
              projectItemId: projectItemId,
              mediaPath: mediaPath,
              mediaIdentity: mediaIdentity,
              effectsSnapshot: __effectSummary(clip),
              warnings: warnings
            };
          }

          var frameRate = null;
          try { frameRate = Number(sequence.timebase) ? (254016000000 / Number(sequence.timebase)) : null; } catch (rateError) {}
          var tracks = [];
          var clips = [];
          var roleMaps = payload.trackRoles || {};

          for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
            var vTrack = sequence.videoTracks[vt];
            var vRole = roleMaps.video && roleMaps.video[String(vt)] ? roleMaps.video[String(vt)] : 'picture';
            var videoClipCount = 0;
            for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
              var vClip = vTrack.clips[vc];
              if (!(payload.includeDisabled || __clipEnabled(vClip))) continue;
              var vSnap = __clipSnapshot(vClip, 'video', vt, vc, frameRate);
              clips.push(vSnap);
              videoClipCount++;
            }
            tracks.push({ trackType: 'video', trackIndex: vt, name: vTrack.name || ('Video ' + (vt + 1)), role: vRole, clipCount: videoClipCount, warnings: [] });
          }

          for (var at = 0; at < sequence.audioTracks.numTracks; at++) {
            var aTrack = sequence.audioTracks[at];
            var aRole = roleMaps.audio && roleMaps.audio[String(at)] ? roleMaps.audio[String(at)] : 'audio';
            var audioClipCount = 0;
            for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
              var aClip = aTrack.clips[ac];
              if (!(payload.includeDisabled || __clipEnabled(aClip))) continue;
              var aSnap = __clipSnapshot(aClip, 'audio', at, ac, frameRate);
              clips.push(aSnap);
              audioClipCount++;
            }
            tracks.push({ trackType: 'audio', trackIndex: at, name: aTrack.name || ('Audio ' + (at + 1)), role: aRole, clipCount: audioClipCount, warnings: [] });
          }

          return JSON.stringify({
            success: true,
            mutationPlanned: false,
            sequence: {
              sequenceId: sequence.sequenceID,
              name: sequence.name,
              frameRate: { fps: frameRate, nominalFps: Math.round(frameRate) },
              width: sequence.frameSizeHorizontal || null,
              height: sequence.frameSizeVertical || null
            },
            tracks: tracks,
            clips: clips,
            warnings: []
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: false, error: e.toString() });
        }
      }
      return __snapshotSequenceForConform();
    `;

    return await this.bridge.executeScript(script);
  }

  private async scanTimelineCleanupState(args: ScanTimelineCleanupStateArgs): Promise<any> {
    const payload = JSON.stringify({
      sequenceId: args.sequenceId,
      includeDisabled: args.includeDisabled !== false,
      includeEffects: args.includeEffects !== false,
      includeKeyframes: args.includeKeyframes === true,
    });

    const script = `
      function __scanTimelineCleanupState() {
        try {
          var payload = ${payload};
          var sequence = __findSequence(payload.sequenceId);
          if (!sequence) return JSON.stringify({ success: false, mutationPlanned: false, error: 'Sequence not found: ' + payload.sequenceId });
          var globalWarnings = [];
          if (!payload.includeEffects) globalWarnings.push('effectInspectionDisabled: cleanup cannot prove visual dependencies without component/effect inspection');

          function __safeSeconds(timeObj) {
            try {
              if (timeObj && typeof timeObj.seconds === 'number') return timeObj.seconds;
            } catch (_) { }
            return null;
          }

          function __clipEnabled(clip) {
            try {
              if (clip && typeof clip.isEnabled === 'function') return clip.isEnabled();
              if (clip && clip.disabled !== undefined) return !clip.disabled;
            } catch (_) { }
            return true;
          }

          function __clipProjectItem(clip) {
            try { return clip.projectItem || null; } catch (_) { return null; }
          }

          function __isNestedItem(item) {
            try { if (item && item.isSequence && item.isSequence()) return true; } catch (_) { }
            return false;
          }

          function __safeValue(prop) {
            try { if (prop && typeof prop.getValue === 'function') return prop.getValue(); } catch (_) { }
            return null;
          }

          function __propertySummary(prop, propertyIndex, riskFlags) {
            var displayName = null;
            var matchName = null;
            var value = null;
            var keyframed = false;
            try { displayName = prop.displayName || null; } catch (_) { }
            try { matchName = prop.matchName || null; } catch (_) { }
            value = __safeValue(prop);
            try {
              if (payload.includeKeyframes && prop && prop.areKeyframesSupported && prop.areKeyframesSupported() && prop.isTimeVarying && prop.isTimeVarying()) {
                keyframed = true;
                riskFlags.keyframe = true;
              }
            } catch (_) { }
            var propText = String(displayName || '') + ' ' + String(matchName || '');
            if (/mask/i.test(propText)) riskFlags.mask = true;
            if (/matte/i.test(propText)) riskFlags.matte = true;
            if (/opacity/i.test(propText) && typeof value === 'number' && value < 100) riskFlags.opacity = true;
            if (/blend.?mode/i.test(propText) && value !== null && value !== 0 && String(value).toLowerCase() !== 'normal') riskFlags.blendMode = true;
            return { index: propertyIndex, displayName: displayName, matchName: matchName, value: value, keyframed: keyframed };
          }

          function __effectSummary(clip, riskFlags, trackMatteDependencies) {
            var effects = [];
            if (!payload.includeEffects) {
              riskFlags.unsupportedEffect = true;
              return [{ unsupported: true, error: 'effectInspectionDisabled' }];
            }
            try {
              if (!clip.components) {
                riskFlags.unsupportedEffect = true;
                return [{ unsupported: true, error: 'clipComponentsUnavailable' }];
              }
              for (var ci = 0; ci < clip.components.numItems; ci++) {
                var component = clip.components[ci];
                var displayName = null;
                var matchName = null;
                try { displayName = component.displayName || null; } catch (_) { }
                try { matchName = component.matchName || null; } catch (_) { }
                var componentText = String(displayName || '') + ' ' + String(matchName || '');
                if (/Track Matte/i.test(componentText)) {
                  riskFlags.trackMatte = true;
                  trackMatteDependencies.push({ effectName: displayName || matchName || 'Track Matte', targetTrackIndex: null, sourceTrackIndex: null });
                }
                if (/Set Matte/i.test(componentText)) {
                  riskFlags.matte = true;
                  trackMatteDependencies.push({ effectName: displayName || matchName || 'Set Matte', targetTrackIndex: null, sourceTrackIndex: null });
                }
                if (/matte/i.test(componentText)) riskFlags.matte = true;
                if (/mask/i.test(componentText)) riskFlags.mask = true;
                if (/adjustment/i.test(componentText)) riskFlags.adjustment = true;
                var knownComponent = /Motion|Opacity|Crop|Time Remapping|Volume|Channel Volume|Panner/i.test(componentText);
                if (!knownComponent) riskFlags.unsupportedEffect = true;
                var properties = [];
                try {
                  if (component.properties) {
                    for (var pi = 0; pi < component.properties.numItems; pi++) {
                      properties.push(__propertySummary(component.properties[pi], pi, riskFlags));
                    }
                  }
                } catch (propertyError) {
                  riskFlags.unsupportedEffect = true;
                  properties.push({ error: propertyError.toString() });
                }
                effects.push({ index: ci, displayName: displayName, matchName: matchName, properties: properties });
              }
            } catch (effectError) {
              riskFlags.unsupportedEffect = true;
              effects.push({ unsupported: true, error: effectError.toString() });
            }
            return effects;
          }

          function __riskFlagNames(riskFlags) {
            var names = [];
            for (var key in riskFlags) if (riskFlags.hasOwnProperty(key) && riskFlags[key]) names.push(key);
            return names;
          }

          function __readTrackState(track, trackType, trackIndex) {
            var warnings = [];
            var visible = null;
            var locked = null;
            var muted = null;
            try {
              if (track && typeof track.isVisible === 'function') visible = track.isVisible();
              else if (track && typeof track.isVisible === 'boolean') visible = track.isVisible;
            } catch (visibilityError) { warnings.push('visibilityUnavailable: ' + visibilityError.toString()); }
            try {
              if (track && typeof track.isLocked === 'function') locked = track.isLocked();
              else if (track && typeof track.isLocked === 'boolean') locked = track.isLocked;
            } catch (lockError) { warnings.push('lockedStateUnavailable: ' + lockError.toString()); }
            try {
              if (trackType === 'audio' && track && typeof track.isMuted === 'function') muted = track.isMuted();
            } catch (muteError) { warnings.push('muteStateUnavailable: ' + muteError.toString()); }
            var name = null;
            try { name = track.name || (trackType === 'video' ? 'Video ' : 'Audio ') + (trackIndex + 1); } catch (_) { name = (trackType === 'video' ? 'Video ' : 'Audio ') + (trackIndex + 1); }
            if (/matte|track.?index|dependency|unknown|unsupported/i.test(String(name || ''))) warnings.push('trackNameMayIndicateDependency');
            return { trackType: trackType, trackIndex: trackIndex, name: name, clipCount: track && track.clips ? track.clips.numItems : 0, locked: locked, muted: muted, visible: visible, warnings: warnings };
          }

          function __clipSnapshot(clip, trackType, trackIndex, clipIndex) {
            var warnings = [];
            var riskMap = {};
            var item = __clipProjectItem(clip);
            var itemName = item ? String(item.name || '') : '';
            var clipName = '';
            try { clipName = String(clip.name || itemName || ''); } catch (_) { clipName = itemName; }
            var nameText = clipName + ' ' + itemName;
            var enabled = __clipEnabled(clip);
            if (/adjustment/i.test(nameText)) riskMap.adjustmentLayer = true;
            if (/graphic|mogrt|essential graphic|lower third/i.test(nameText)) riskMap.graphic = true;
            if (/title|caption/i.test(nameText)) riskMap.title = true;
            if (/matte/i.test(nameText)) riskMap.matte = true;
            if (__isNestedItem(item)) riskMap.nestedSequence = true;
            if (trackType === 'video') warnings.push('linkedAudioUnknown: video clip may have linked or synchronized audio');
            var trackMatteDependencies = [];
            var effects = __effectSummary(clip, riskMap, trackMatteDependencies);
            var effectNames = [];
            for (var ei = 0; ei < effects.length; ei++) {
              if (effects[ei].displayName) effectNames.push(effects[ei].displayName);
              else if (effects[ei].matchName) effectNames.push(effects[ei].matchName);
            }
            var startTime = __safeSeconds(clip.start);
            var endTime = __safeSeconds(clip.end);
            var duration = __safeSeconds(clip.duration);
            if (duration === null && startTime !== null && endTime !== null) duration = endTime - startTime;
            var mediaPath = null;
            var projectItemId = null;
            try { if (item && item.nodeId !== undefined) projectItemId = String(item.nodeId); } catch (_) { }
            try { if (item && item.getMediaPath) mediaPath = item.getMediaPath(); } catch (mediaError) { warnings.push('mediaPathUnavailable: ' + mediaError.toString()); }
            return {
              clipId: String(clip.nodeId),
              trackType: trackType,
              trackIndex: trackIndex,
              clipIndex: clipIndex,
              name: clipName,
              startTime: startTime || 0,
              endTime: endTime || 0,
              duration: duration || 0,
              enabled: enabled,
              hasVideo: trackType === 'video',
              hasAudio: trackType === 'audio',
              isAdjustmentLayer: !!riskMap.adjustmentLayer,
              isGraphic: !!riskMap.graphic,
              isTitle: !!riskMap.title,
              isNestedSequence: !!riskMap.nestedSequence,
              hasMasks: !!riskMap.mask,
              hasKeyframes: !!riskMap.keyframe,
              effects: effectNames,
              componentNames: effectNames,
              trackMatteDependencies: trackMatteDependencies,
              riskFlags: __riskFlagNames(riskMap),
              unsupportedFeatures: riskMap.unsupportedEffect ? ['unsupportedEffectInspection'] : [],
              projectItemId: projectItemId,
              mediaPath: mediaPath,
              warnings: warnings
            };
          }

          var tracks = [];
          var clips = [];
          for (var vt = 0; sequence.videoTracks && vt < sequence.videoTracks.numTracks; vt++) {
            var vTrack = sequence.videoTracks[vt];
            tracks.push(__readTrackState(vTrack, 'video', vt));
            if (vTrack && vTrack.clips) {
              for (var vc = 0; vc < vTrack.clips.numItems; vc++) {
                var vClip = vTrack.clips[vc];
                if (!payload.includeDisabled && !__clipEnabled(vClip)) continue;
                clips.push(__clipSnapshot(vClip, 'video', vt, vc));
              }
            }
          }
          for (var at = 0; sequence.audioTracks && at < sequence.audioTracks.numTracks; at++) {
            var aTrack = sequence.audioTracks[at];
            tracks.push(__readTrackState(aTrack, 'audio', at));
            if (aTrack && aTrack.clips) {
              for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
                var aClip = aTrack.clips[ac];
                if (!payload.includeDisabled && !__clipEnabled(aClip)) continue;
                clips.push(__clipSnapshot(aClip, 'audio', at, ac));
              }
            }
          }

          return JSON.stringify({
            success: true,
            mutationPlanned: false,
            sequence: { sequenceId: sequence.sequenceID, name: sequence.name },
            tracks: tracks,
            clips: clips,
            warnings: globalWarnings
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: false, error: e.toString() });
        }
      }
      return __scanTimelineCleanupState();
    `;

    return await this.bridge.executeScript(script);
  }

  private async analyzeTimelineCleanupTool(args: AnalyzeTimelineCleanupToolArgs): Promise<any> {
    let cleanupSnapshot = args.cleanupSnapshot;
    if (!cleanupSnapshot) {
      if (!args.sequenceId) {
        return { success: false, mutationPlanned: false, error: 'sequenceId or cleanupSnapshot is required' };
      }
      const snapshot = await this.scanTimelineCleanupState({
        sequenceId: args.sequenceId,
        includeDisabled: true,
        includeEffects: true,
        includeKeyframes: false,
      });
      if (!snapshot?.success) {
        return {
          success: false,
          mutationPlanned: false,
          error: snapshot?.error || 'Failed to scan sequence for timeline cleanup analysis',
          snapshot,
        };
      }
      cleanupSnapshot = snapshot as TimelineCleanupSnapshot;
    }

    return analyzeTimelineCleanup({
      cleanupSnapshot,
      ...(args.mode ? { mode: args.mode } : {}),
      ...(args.removeDisabledClips !== undefined ? { removeDisabledClips: args.removeDisabledClips } : {}),
      ...(args.removeFullyCoveredClips !== undefined ? { removeFullyCoveredClips: args.removeFullyCoveredClips } : {}),
      ...(args.organizeGraphics !== undefined ? { organizeGraphics: args.organizeGraphics } : {}),
    });
  }

  private async createCleanTimelineSequence(args: CreateCleanTimelineSequenceArgs): Promise<any> {
    const planArgs = {
      sourceSequenceId: args.sourceSequenceId,
      cleanSequenceName: args.cleanSequenceName,
      duplicateSequence: args.duplicateSequence ?? true,
      ...(args.allowMutatingSourceSequence !== undefined ? { allowMutatingSourceSequence: args.allowMutatingSourceSequence } : {}),
      ...(args.analysisId ? { analysisId: args.analysisId } : {}),
      actions: args.actions,
    };
    const validation = validateTimelineCleanupExecutionPlan(planArgs);
    if (!validation.safe) {
      return {
        success: false,
        dryRun: args.dryRun ?? true,
        mutationPlanned: false,
        error: 'Unsafe timeline cleanup plan',
        validation,
      };
    }

    const dryRun = args.dryRun ?? true;
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        mutationPlanned: false,
        validation,
        operations: validation.operations,
      };
    }

    const actionKey = (action: any): string => JSON.stringify({
      type: action.type,
      clipId: action.clipId ?? null,
      trackType: action.trackType,
      trackIndex: action.trackIndex,
      targetTrackIndex: action.targetTrackIndex ?? null,
      targetTrackName: action.targetTrackName ?? null,
    });
    const freshSnapshot = await this.scanTimelineCleanupState({
      sequenceId: args.sourceSequenceId,
      includeDisabled: true,
      includeEffects: true,
      includeKeyframes: false,
    });
    if (!freshSnapshot?.success) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: freshSnapshot?.error || 'Failed to re-scan source sequence before live timeline cleanup execution',
        freshSnapshot,
      };
    }
    const freshAnalysis = analyzeTimelineCleanup({
      cleanupSnapshot: freshSnapshot as TimelineCleanupSnapshot,
      ...(args.mode ? { mode: args.mode } : {}),
      ...(args.removeDisabledClips !== undefined ? { removeDisabledClips: args.removeDisabledClips } : {}),
      ...(args.removeFullyCoveredClips !== undefined ? { removeFullyCoveredClips: args.removeFullyCoveredClips } : {}),
      ...(args.organizeGraphics !== undefined ? { organizeGraphics: args.organizeGraphics } : {}),
    });
    if (freshAnalysis.analysisId !== args.analysisId) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: 'Timeline cleanup analysisId does not match fresh source analysis',
        expectedAnalysisId: freshAnalysis.analysisId,
        providedAnalysisId: args.analysisId,
        freshAnalysisSummary: freshAnalysis.summary,
      };
    }
    const freshSafeActionKeys = new Set(freshAnalysis.actionPlan.map(actionKey));
    const actionsNotFreshlyProven = args.actions.filter((action) => !freshSafeActionKeys.has(actionKey(action)));
    if (actionsNotFreshlyProven.length > 0) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: 'Requested cleanup action is not present in fresh timeline cleanup analysis; refusing live mutation',
        actionsNotFreshlyProven,
        freshAnalysisSummary: freshAnalysis.summary,
      };
    }

    const executableOperations = validation.operations.filter((operation: any) => operation.type !== 'duplicateSequence');
    const payload = JSON.stringify({ ...planArgs, actions: executableOperations });
    const script = `
      function __createCleanTimelineSequence(payload) {
        try {
          var sourceSeq = __findSequence(payload.sourceSequenceId);
          if (!sourceSeq) return JSON.stringify({ success: false, mutationPlanned: false, error: 'Source sequence not found: ' + payload.sourceSequenceId });

          function __findClipInSequence(sequence, clipId) {
            var collections = [sequence.videoTracks, sequence.audioTracks];
            for (var ci = 0; ci < collections.length; ci++) {
              var tracks = collections[ci];
              if (!tracks) continue;
              for (var ti = 0; ti < tracks.numTracks; ti++) {
                var track = tracks[ti];
                if (!track || !track.clips) continue;
                for (var c = 0; c < track.clips.numItems; c++) {
                  var clip = track.clips[c];
                  if (clip && String(clip.nodeId) === String(clipId)) return { clip: clip, track: track, trackIndex: ti, clipIndex: c };
                }
              }
            }
            return null;
          }

          function __trackCollection(sequence, trackType) {
            return trackType === 'video' ? sequence.videoTracks : sequence.audioTracks;
          }

          function __preflightTimelineCleanupExecution(sequence, payload) {
            var errors = [];
            var warnings = [];
            for (var i = 0; i < payload.actions.length; i++) {
              var action = payload.actions[i];
              if (action.type === 'removeTrack') {
                var tracks = __trackCollection(sequence, action.trackType);
                if (!tracks || action.trackIndex >= tracks.numTracks) errors.push({ actionIndex: i, error: 'track index out of range', action: action });
                else if (tracks.numTracks <= 1) errors.push({ actionIndex: i, error: 'refusing to delete the only ' + action.trackType + ' track on this host', action: action });
                else if (tracks[action.trackIndex].clips && tracks[action.trackIndex].clips.numItems > 0) errors.push({ actionIndex: i, error: 'refusing to delete non-empty track during preflight', action: action });
              } else if (action.type === 'removeClip') {
                var clipInfo = __findClipInSequence(sequence, action.clipId);
                if (!clipInfo) errors.push({ actionIndex: i, error: 'clip not found', action: action });
              } else if (action.type === 'reorganizeClip') {
                warnings.push({ actionIndex: i, warning: 'reorganizeClip is reported but live track moves are host-dependent; action will be skipped unless targetTrackName-only organization becomes supported', action: action });
              } else {
                errors.push({ actionIndex: i, error: 'unknown action type', action: action });
              }
            }
            return { success: errors.length === 0, errors: errors, warnings: warnings };
          }

          function __findItemForSequence(parent, seqId) {
            if (!parent || !parent.children) return null;
            for (var pi = 0; pi < parent.children.numItems; pi++) {
              var item = parent.children[pi];
              if (!item) continue;
              try {
                var seq = item.getSequence && item.getSequence();
                if (seq && seq.sequenceID === seqId) return item;
              } catch (_) { }
              if (item.type === 2) {
                var nested = __findItemForSequence(item, seqId);
                if (nested) return nested;
              }
            }
            return null;
          }

          function __cloneSequenceAndResolve(sourceSequence, desiredName) {
            var beforeSequenceIds = {};
            for (var bi = 0; bi < app.project.sequences.numSequences; bi++) {
              beforeSequenceIds[String(app.project.sequences[bi].sequenceID)] = true;
            }
            var cloneResult = null;
            var cloneReturnType = null;
            try {
              cloneResult = sourceSequence.clone();
              cloneReturnType = typeof cloneResult;
            } catch (cloneError) {
              return { success: false, cloneAttempted: true, error: 'Sequence.clone failed: ' + cloneError.toString(), cloneReturnType: cloneReturnType };
            }
            var targetSequence = null;
            try {
              if (cloneResult && cloneResult.sequenceID !== undefined) targetSequence = cloneResult;
            } catch (_) { }
            if (!targetSequence) {
              var candidates = [];
              for (var ci = 0; ci < app.project.sequences.numSequences; ci++) {
                var candidate = app.project.sequences[ci];
                if (candidate && !beforeSequenceIds[String(candidate.sequenceID)]) candidates.push(candidate);
              }
              if (candidates.length !== 1) {
                var candidateIds = [];
                for (var cii = 0; cii < candidates.length; cii++) candidateIds.push(candidates[cii].sequenceID);
                return { success: false, cloneAttempted: true, error: 'Unable to identify cloned sequence after Sequence.clone()', cloneReturnType: cloneReturnType, candidateCount: candidates.length, candidateIds: candidateIds };
              }
              targetSequence = candidates[0];
            }
            var renamedAtSequence = false;
            try { targetSequence.name = desiredName; renamedAtSequence = true; } catch (_) { }
            var renamedAtProjectItem = false;
            var targetProjectItem = __findItemForSequence(app.project.rootItem, targetSequence.sequenceID);
            if (targetProjectItem) {
              try { targetProjectItem.name = desiredName; renamedAtProjectItem = true; } catch (_) { }
            }
            return { success: true, sequence: targetSequence, sequenceId: targetSequence.sequenceID, cloneReturnType: cloneReturnType, renamedAtSequence: renamedAtSequence, renamedAtProjectItem: renamedAtProjectItem };
          }

          var preflight = __preflightTimelineCleanupExecution(sourceSeq, payload);
          if (!preflight.success) {
            return JSON.stringify({ success: false, mutationPlanned: false, sourceSequenceId: payload.sourceSequenceId, error: 'Timeline cleanup execution preflight failed', preflight: preflight });
          }

          var cloneResolution = __cloneSequenceAndResolve(sourceSeq, payload.cleanSequenceName);
          if (!cloneResolution.success) {
            return JSON.stringify({ success: false, mutationPlanned: cloneResolution.cloneAttempted === true, sourceSequenceId: payload.sourceSequenceId, error: cloneResolution.error, cloneResolution: cloneResolution });
          }
          var targetSequence = cloneResolution.sequence;
          app.project.activeSequence = targetSequence;

          var actionsApplied = [];
          var actionsSkipped = [];
          var actionsFailed = [];
          for (var a = 0; a < payload.actions.length; a++) {
            var current = payload.actions[a];
            try {
              if (current.type === 'removeClip') {
                var targetClipInfo = __findClipInSequence(targetSequence, current.clipId);
                if (!targetClipInfo) actionsFailed.push({ action: current, error: 'clip not found on duplicated sequence' });
                else {
                  targetClipInfo.clip.remove(false, true);
                  actionsApplied.push(current);
                }
              } else if (current.type === 'removeTrack') {
                var targetTracks = __trackCollection(targetSequence, current.trackType);
                if (!targetTracks || current.trackIndex >= targetTracks.numTracks) actionsFailed.push({ action: current, error: 'track not found on duplicated sequence' });
                else if (targetTracks[current.trackIndex].clips && targetTracks[current.trackIndex].clips.numItems > 0) actionsFailed.push({ action: current, error: 'refusing to delete non-empty track on duplicated sequence' });
                else if (targetTracks.numTracks <= 1) actionsFailed.push({ action: current, error: 'refusing to delete the only ' + current.trackType + ' track on duplicated sequence' });
                else {
                  app.enableQE();
                  app.project.activeSequence = targetSequence;
                  if (targetSequence.openInTimeline) targetSequence.openInTimeline();
                  var qeSeq = qe.project.getActiveSequence();
                  var beforeTrackCount = targetTracks.numTracks;
                  var removeMethodName = current.trackType === 'video' ? 'removeVideoTrack' : 'removeAudioTrack';
                  if (!qeSeq || typeof qeSeq[removeMethodName] !== 'function') {
                    actionsFailed.push({ action: current, error: removeMethodName + ' is unavailable on this Premiere host' });
                  } else {
                    var qeRemoveResult = qeSeq[removeMethodName](current.trackIndex);
                    var afterTrackCount = targetTracks.numTracks;
                    if (afterTrackCount < beforeTrackCount) {
                      actionsApplied.push({ type: current.type, trackType: current.trackType, trackIndex: current.trackIndex, classification: current.classification, reason: current.reason, removeMethod: removeMethodName, qeResult: String(qeRemoveResult) });
                    } else {
                      actionsFailed.push({ action: current, error: removeMethodName + ' made no progress', beforeTrackCount: beforeTrackCount, afterTrackCount: afterTrackCount, qeResult: String(qeRemoveResult) });
                    }
                  }
                }
              } else if (current.type === 'reorganizeClip') {
                actionsSkipped.push({ action: current, warning: 'reorganizeClip skipped: live clip track moves are not capability-proven on this host' });
              }
            } catch (actionError) {
              actionsFailed.push({ action: current, error: actionError.toString() });
            }
          }

          var warnings = [];
          for (var w = 0; w < actionsSkipped.length; w++) {
            if (actionsSkipped[w] && actionsSkipped[w].warning) warnings.push(actionsSkipped[w].warning);
          }

          return JSON.stringify({
            success: actionsFailed.length === 0,
            mutationPlanned: true,
            sourceSequenceId: payload.sourceSequenceId,
            duplicatedSequenceId: targetSequence.sequenceID,
            cleanSequenceId: targetSequence.sequenceID,
            cleanSequenceName: payload.cleanSequenceName,
            cloneReturnType: cloneResolution.cloneReturnType,
            renamedAtSequence: cloneResolution.renamedAtSequence,
            renamedAtProjectItem: cloneResolution.renamedAtProjectItem,
            actionsApplied: actionsApplied,
            actionsSkipped: actionsSkipped,
            actionsFailed: actionsFailed,
            preflightWarnings: preflight.warnings,
            warnings: warnings
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: false, error: e.toString() });
        }
      }
      return __createCleanTimelineSequence(${payload});
    `;

    return await this.bridge.executeScript(script);
  }

  private async qcTimelineCleanup(args: QcTimelineCleanupArgs): Promise<any> {
    const dryRun = args.dryRun ?? true;
    if (!dryRun && !args.allowedOutputRoot) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: 'allowedOutputRoot is required for live timeline cleanup QC export',
      };
    }

    const plan = planTimelineCleanupQc({
      sourceSequenceId: args.sourceSequenceId,
      ...(args.cleanSequenceId ? { cleanSequenceId: args.cleanSequenceId } : {}),
      outputDir: args.outputDir,
      ...(args.allowedOutputRoot ? { allowedOutputRoot: args.allowedOutputRoot } : {}),
      cleanupResult: args.cleanupResult,
      ...(args.sampleTimes ? { sampleTimes: args.sampleTimes } : {}),
      ...(args.format ? { format: args.format } : {}),
    });

    if (dryRun) {
      return { success: true, dryRun: true, mutationPlanned: false, plan };
    }

    if (!plan.safeToExecute) {
      return { success: false, dryRun: false, mutationPlanned: false, error: 'Timeline cleanup QC plan is not safe to execute', plan };
    }

    const payload = JSON.stringify(plan);
    const script = `
      function __qcTimelineCleanup(payload) {
        try {
          app.enableQE();
          var exportedFrames = [];
          var failedExports = [];
          var qcFolder = new Folder(payload.outputDir);
          if (!qcFolder.exists) qcFolder.create();
          for (var i = 0; i < payload.frameExports.length; i++) {
            var frameExport = payload.frameExports[i];
            var sequence = __findSequence(frameExport.sequenceId);
            if (!sequence) {
              failedExports.push({ frameExport: frameExport, error: 'Sequence not found for QC frame export' });
              continue;
            }
            if (sequence.openInTimeline) {
              try { sequence.openInTimeline(); } catch (_) { }
            }
            app.project.activeSequence = sequence;
            var qeSequence = qe.project.getActiveSequence();
            if (!qeSequence) {
              failedExports.push({ frameExport: frameExport, error: 'QE active sequence unavailable for QC frame export' });
              continue;
            }
            var methodName = frameExport.format === 'jpg' ? 'exportFrameJPEG' : (frameExport.format === 'tiff' ? 'exportFrameTiff' : 'exportFramePNG');
            if (typeof qeSequence[methodName] !== 'function') {
              failedExports.push({ frameExport: frameExport, error: 'Frame export method unavailable: ' + methodName });
              continue;
            }
            function __extensionForFormat(format) { return format === 'jpg' ? '.jpg' : (format === 'tiff' ? '.tiff' : '.png'); }
            function __stripFormatExtension(outputPath, format) {
              var ext = __extensionForFormat(format);
              var lowerPath = String(outputPath).toLowerCase();
              if (lowerPath.lastIndexOf(ext) === lowerPath.length - ext.length) return String(outputPath).substring(0, String(outputPath).length - ext.length);
              return String(outputPath);
            }
            var exportBasePath = __stripFormatExtension(frameExport.outputPath, frameExport.format);
            var actualOutputPath = exportBasePath + __extensionForFormat(frameExport.format);
            var timeNumber = Number(frameExport.time);
            var timeString = String(timeNumber);
            var timeTicks = timeString;
            try { var exportTime = new Time(); exportTime.seconds = timeNumber; timeTicks = String(exportTime.ticks); } catch (timeError) { }
            var exportError = null;
            function __tryExport(timeValue, signatureName) {
              try {
                qeSequence[methodName](String(timeValue), exportBasePath);
                if (File(actualOutputPath).exists) return { success: true, outputPath: actualOutputPath, requestedOutputPath: frameExport.outputPath, exportBasePath: exportBasePath, exportSignature: signatureName };
                exportError = signatureName + ' returned without creating ' + actualOutputPath;
                return null;
              } catch (e0) { exportError = signatureName + ': ' + e0.toString(); return null; }
            }
            var exportResult = __tryExport(timeString, 'secondsString_outputBase') || __tryExport(timeTicks, 'ticksString_outputBase');
            if (exportResult) {
              exportResult.view = frameExport.view;
              exportResult.sequenceId = frameExport.sequenceId;
              exportResult.time = frameExport.time;
              exportResult.format = frameExport.format;
              exportedFrames.push(exportResult);
            } else failedExports.push({ frameExport: frameExport, error: exportError || 'Frame export failed' });
          }
          return JSON.stringify({
            success: failedExports.length === 0,
            mutationPlanned: true,
            sourceSequenceId: payload.sourceSequenceId,
            cleanSequenceId: payload.cleanSequenceId,
            exportedFrames: exportedFrames,
            failedExports: failedExports,
            structuralReport: payload.structuralReport,
            summary: payload.summary,
            warnings: payload.warnings || []
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: false, error: e.toString() });
        }
      }
      return __qcTimelineCleanup(${payload});
    `;

    return await this.bridge.executeScript(script);
  }

  private async analyzeStackedOnlineConformTool(args: AnalyzeStackedOnlineConformToolArgs): Promise<any> {
    let sequenceSnapshot = args.sequenceSnapshot;
    if (!sequenceSnapshot) {
      if (!args.sequenceId) {
        return { success: false, mutationPlanned: false, error: 'sequenceId or sequenceSnapshot is required' };
      }
      const snapshot = await this.snapshotSequenceForConform({
        sequenceId: args.sequenceId,
        includeEffects: true,
        includeKeyframes: false,
      });
      if (!snapshot?.success) {
        return {
          success: false,
          mutationPlanned: false,
          error: snapshot?.error || 'Failed to snapshot sequence for conform analysis',
          snapshot,
        };
      }
      sequenceSnapshot = snapshot;
    }

    return analyzeStackedOnlineConform({
      sequenceSnapshot,
      onlineMedia: args.onlineMedia,
      ...(args.sourceTrackIndices ? { sourceTrackIndices: args.sourceTrackIndices } : {}),
      ...(args.targetTrackBySourceTrack ? { targetTrackBySourceTrack: args.targetTrackBySourceTrack } : {}),
      ...(args.matchFields ? { matchFields: args.matchFields } : {}),
      ...(args.toleranceFrames !== undefined ? { toleranceFrames: args.toleranceFrames } : {}),
      ...(args.minConfidence !== undefined ? { minConfidence: args.minConfidence } : {}),
      ...(args.strictFrameRate !== undefined ? { strictFrameRate: args.strictFrameRate } : {}),
    });
  }

  private async createStackedOnlineConformSequence(args: CreateStackedOnlineConformSequenceArgs): Promise<any> {
    const planArgs: StackedConformExecutionPlanArgs = {
      sourceSequenceId: args.sourceSequenceId,
      conformSequenceName: args.conformSequenceName,
      placementPlan: [...args.placementPlan].sort((a, b) => {
        if (a.targetTrackIndex !== b.targetTrackIndex) return a.targetTrackIndex - b.targetTrackIndex;
        if (a.startTime !== b.startTime) return a.startTime - b.startTime;
        return a.offlineClipId.localeCompare(b.offlineClipId);
      }),
      ...(args.existingVideoTrackCount !== undefined ? { existingVideoTrackCount: args.existingVideoTrackCount } : {}),
      duplicateSequence: args.duplicateSequence ?? true,
      ...(args.allowMutatingSourceSequence !== undefined ? { allowMutatingSourceSequence: args.allowMutatingSourceSequence } : {}),
    };
    const validation = validateStackedConformExecutionPlan(planArgs);

    if (!validation.safe) {
      return {
        success: false,
        dryRun: args.dryRun ?? true,
        mutationPlanned: false,
        error: 'Unsafe stacked conform plan',
        validation,
      };
    }

    const dryRun = args.dryRun ?? true;
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        mutationPlanned: false,
        validation,
        operations: validation.operations,
      };
    }

    const payload = JSON.stringify(planArgs);
    const script = `
      function __createStackedOnlineConformSequence(payload) {
        try {
          app.enableQE();
          var originalSeq = __findSequence(payload.sourceSequenceId);
          if (!originalSeq) return JSON.stringify({ success: false, mutationPlanned: false, error: "Source sequence not found" });

          function __findProjectItem(id) {
            function walk(parent) {
              if (!parent || !parent.children) return null;
              for (var i = 0; i < parent.children.numItems; i++) {
                var child = parent.children[i];
                if (!child) continue;
                if (String(child.nodeId) === String(id)) return child;
                var found = walk(child);
                if (found) return found;
              }
              return null;
            }
            return walk(app.project.rootItem);
          }

          function __projectItemDurationSeconds(item) {
            try {
              if (!item || !item.getInPoint || !item.getOutPoint) return null;
              var inPoint = item.getInPoint();
              var outPoint = item.getOutPoint();
              if (!inPoint || !outPoint || typeof inPoint.seconds !== 'number' || typeof outPoint.seconds !== 'number') return null;
              var duration = outPoint.seconds - inPoint.seconds;
              return duration >= 0 ? duration : null;
            } catch (_) {
              return null;
            }
          }

          function __preflightStackedConformExecution(sequence, payload) {
            var preExistingVideoTrackCount = sequence.videoTracks ? sequence.videoTracks.numTracks : 0;
            var failedPlacements = [];
            var missingOnlineProjectItems = [];
            var trackCreationFailures = [];
            var maxTargetTrackIndex = preExistingVideoTrackCount - 1;
            for (var preflightIndex = 0; preflightIndex < payload.placementPlan.length; preflightIndex++) {
              var preflightPlacement = payload.placementPlan[preflightIndex];
              if (preflightPlacement.targetTrackIndex > maxTargetTrackIndex) maxTargetTrackIndex = preflightPlacement.targetTrackIndex;
              if (preflightPlacement.targetTrackIndex < preExistingVideoTrackCount) {
                failedPlacements.push({
                  offlineClipId: preflightPlacement.offlineClipId,
                  targetTrackIndex: preflightPlacement.targetTrackIndex,
                  error: 'targetTrackIndex < preExistingVideoTrackCount; refusing to place online media onto an existing/offline track'
                });
              }
              if (typeof preflightPlacement.sourceOutPoint !== 'number' || preflightPlacement.sourceOutPoint <= preflightPlacement.sourceInPoint) {
                failedPlacements.push({
                  offlineClipId: preflightPlacement.offlineClipId,
                  onlineProjectItemId: preflightPlacement.onlineProjectItemId,
                  error: 'sourceOutPoint must be provided and greater than sourceInPoint for live conform placement'
                });
              }
              var preflightOnlineItem = __findProjectItem(preflightPlacement.onlineProjectItemId);
              if (!preflightOnlineItem) {
                missingOnlineProjectItems.push(preflightPlacement.onlineProjectItemId);
                failedPlacements.push({
                  offlineClipId: preflightPlacement.offlineClipId,
                  onlineProjectItemId: preflightPlacement.onlineProjectItemId,
                  error: 'Online project item not found'
                });
              } else {
                if (!preflightOnlineItem.setInPoint || !preflightOnlineItem.setOutPoint) {
                  failedPlacements.push({
                    offlineClipId: preflightPlacement.offlineClipId,
                    onlineProjectItemId: preflightPlacement.onlineProjectItemId,
                    error: 'cannotSetProjectItemInOut'
                  });
                }
                var projectItemDurationSeconds = __projectItemDurationSeconds(preflightOnlineItem);
                if (projectItemDurationSeconds !== null && preflightPlacement.sourceOutPoint > projectItemDurationSeconds + 0.001) {
                  failedPlacements.push({
                    offlineClipId: preflightPlacement.offlineClipId,
                    onlineProjectItemId: preflightPlacement.onlineProjectItemId,
                    sourceOutPoint: preflightPlacement.sourceOutPoint,
                    projectItemDurationSeconds: projectItemDurationSeconds,
                    error: 'sourceOutPointExceedsProjectItemDuration'
                  });
                }
                try {
                  var originalInPoint = preflightOnlineItem.getInPoint ? preflightOnlineItem.getInPoint() : null;
                  if (!originalInPoint || originalInPoint.ticks === undefined) {
                    failedPlacements.push({ offlineClipId: preflightPlacement.offlineClipId, onlineProjectItemId: preflightPlacement.onlineProjectItemId, error: 'originalInPointUnavailable' });
                  }
                } catch (preflightInError) {
                  failedPlacements.push({ offlineClipId: preflightPlacement.offlineClipId, onlineProjectItemId: preflightPlacement.onlineProjectItemId, error: 'originalInPointUnavailable: ' + preflightInError.toString() });
                }
                try {
                  var originalOutPoint = preflightOnlineItem.getOutPoint ? preflightOnlineItem.getOutPoint() : null;
                  if (!originalOutPoint || originalOutPoint.ticks === undefined) {
                    failedPlacements.push({ offlineClipId: preflightPlacement.offlineClipId, onlineProjectItemId: preflightPlacement.onlineProjectItemId, error: 'originalOutPointUnavailable' });
                  }
                } catch (preflightOutError) {
                  failedPlacements.push({ offlineClipId: preflightPlacement.offlineClipId, onlineProjectItemId: preflightPlacement.onlineProjectItemId, error: 'originalOutPointUnavailable: ' + preflightOutError.toString() });
                }
              }
            }
            var tracksNeeded = Math.max(0, maxTargetTrackIndex + 1 - preExistingVideoTrackCount);
            if (tracksNeeded > payload.placementPlan.length) {
              trackCreationFailures.push({
                error: 'trackCreationFailures: sparse targetTrackIndex would require more new tracks than placements',
                tracksNeeded: tracksNeeded,
                maxTargetTrackIndex: maxTargetTrackIndex,
                preExistingVideoTrackCount: preExistingVideoTrackCount
              });
            }
            return {
              success: failedPlacements.length === 0 && trackCreationFailures.length === 0,
              preExistingVideoTrackCount: preExistingVideoTrackCount,
              missingOnlineProjectItems: missingOnlineProjectItems,
              trackCreationFailures: trackCreationFailures,
              failedPlacements: failedPlacements
            };
          }

          var executionPreflight = __preflightStackedConformExecution(originalSeq, payload);
          if (!executionPreflight.success) {
            return JSON.stringify({
              success: false,
              mutationPlanned: false,
              sourceSequenceId: payload.sourceSequenceId,
              duplicatedSequenceId: null,
              error: 'Stacked conform execution preflight failed',
              preExistingVideoTrackCount: executionPreflight.preExistingVideoTrackCount,
              missingOnlineProjectItems: executionPreflight.missingOnlineProjectItems,
              trackCreationFailures: executionPreflight.trackCreationFailures,
              failedPlacements: executionPreflight.failedPlacements
            });
          }

          function __findItemForSequence(parent, seqId) {
            if (!parent || !parent.children) return null;
            for (var i = 0; i < parent.children.numItems; i++) {
              var item = parent.children[i];
              if (!item) continue;
              try {
                var seq = item.getSequence && item.getSequence();
                if (seq && seq.sequenceID === seqId) return item;
              } catch (_) { }
              if (item.type === 2) {
                var nested = __findItemForSequence(item, seqId);
                if (nested) return nested;
              }
            }
            return null;
          }

          function __cloneSequenceAndResolve(sourceSequence, desiredName) {
            var beforeSequenceIds = {};
            for (var bi = 0; bi < app.project.sequences.numSequences; bi++) {
              beforeSequenceIds[String(app.project.sequences[bi].sequenceID)] = true;
            }
            var cloneResult = null;
            var cloneReturnType = null;
            try {
              cloneResult = sourceSequence.clone();
              cloneReturnType = typeof cloneResult;
            } catch (cloneError) {
              return { success: false, cloneAttempted: true, error: 'Sequence.clone failed: ' + cloneError.toString(), cloneReturnType: cloneReturnType };
            }
            var targetSequence = null;
            try {
              if (cloneResult && cloneResult.sequenceID !== undefined) targetSequence = cloneResult;
            } catch (_) { }
            if (!targetSequence) {
              var candidates = [];
              for (var ci = 0; ci < app.project.sequences.numSequences; ci++) {
                var candidate = app.project.sequences[ci];
                if (candidate && !beforeSequenceIds[String(candidate.sequenceID)]) candidates.push(candidate);
              }
              if (candidates.length !== 1) {
                var candidateIds = [];
                for (var cii = 0; cii < candidates.length; cii++) candidateIds.push(candidates[cii].sequenceID);
                return { success: false, cloneAttempted: true, error: 'Unable to identify cloned sequence after Sequence.clone()', cloneReturnType: cloneReturnType, candidateCount: candidates.length, candidateIds: candidateIds };
              }
              targetSequence = candidates[0];
            }
            var renamedAtSequence = false;
            try { targetSequence.name = desiredName; renamedAtSequence = true; } catch (_) { }
            var renamedAtProjectItem = false;
            var targetProjectItem = __findItemForSequence(app.project.rootItem, targetSequence.sequenceID);
            if (targetProjectItem) {
              try { targetProjectItem.name = desiredName; renamedAtProjectItem = true; } catch (_) { }
            }
            return { success: true, sequence: targetSequence, sequenceId: targetSequence.sequenceID, cloneReturnType: cloneReturnType, renamedAtSequence: renamedAtSequence, renamedAtProjectItem: renamedAtProjectItem };
          }

          var cloneResolution = __cloneSequenceAndResolve(originalSeq, payload.conformSequenceName);
          if (!cloneResolution.success) {
            return JSON.stringify({ success: false, mutationPlanned: cloneResolution.cloneAttempted === true, sourceSequenceId: payload.sourceSequenceId, duplicatedSequenceId: null, error: cloneResolution.error, cloneResolution: cloneResolution });
          }
          var targetSequence = cloneResolution.sequence;
          app.project.activeSequence = targetSequence;
          var renamedAtProjectItem = cloneResolution.renamedAtProjectItem;

          function __ensureVideoTrack(targetSequence, trackIndex, maxTracksToCreate) {
            var trackCreationFailures = [];
            var attempts = 0;
            while (targetSequence.videoTracks.numTracks <= trackIndex) {
              if (attempts >= maxTracksToCreate) {
                trackCreationFailures.push({
                  targetTrackIndex: trackIndex,
                  error: 'trackCreationFailures: maximum bounded track creation attempts reached'
                });
                return { track: null, trackCreationFailures: trackCreationFailures };
              }
              app.project.activeSequence = targetSequence;
              var qeSeq = qe.project.getActiveSequence();
              var beforeTrackCount = targetSequence.videoTracks.numTracks;
              var insertVideoIdx = targetSequence.videoTracks.numTracks;
              qeSeq.addTracks(1, insertVideoIdx, 0, 0, 1, 0, 0);
              attempts++;
              if (targetSequence.videoTracks.numTracks <= beforeTrackCount) {
                trackCreationFailures.push({
                  targetTrackIndex: trackIndex,
                  error: 'trackCreationNoProgress'
                });
                return { track: null, trackCreationFailures: trackCreationFailures };
              }
            }
            return { track: targetSequence.videoTracks[trackIndex], trackCreationFailures: trackCreationFailures };
          }

          function __findPlacedClip(track, projectItemId, startTime) {
            if (!track || !track.clips) return null;
            for (var c = 0; c < track.clips.numItems; c++) {
              var clip = track.clips[c];
              if (!clip) continue;
              try {
                var sameItem = clip.projectItem && clip.projectItem.nodeId === projectItemId;
                var sameStart = clip.start && Math.abs(clip.start.seconds - startTime) < 0.01;
                if (sameItem && sameStart) return clip;
              } catch (_) { }
            }
            return null;
          }

          function __restoreProjectItemInOut(projectItem, originalInPoint, originalOutPoint, warnings) {
            try {
              if (projectItem && projectItem.setInPoint && originalInPoint && originalInPoint.ticks !== undefined) projectItem.setInPoint(originalInPoint.ticks, 4);
            } catch (restoreInError) { warnings.push('restoreProjectItemInPointFailed: ' + restoreInError.toString()); }
            try {
              if (projectItem && projectItem.setOutPoint && originalOutPoint && originalOutPoint.ticks !== undefined) projectItem.setOutPoint(originalOutPoint.ticks, 4);
            } catch (restoreOutError) { warnings.push('restoreProjectItemOutPointFailed: ' + restoreOutError.toString()); }
          }

          function __audioClipKeyMap(sequence) {
            var map = {};
            if (!sequence.audioTracks) return map;
            for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
              var audioTrack = sequence.audioTracks[a];
              if (!audioTrack || !audioTrack.clips) continue;
              for (var c = 0; c < audioTrack.clips.numItems; c++) {
                var clip = audioTrack.clips[c];
                if (!clip) continue;
                try {
                  var projectItemId = clip.projectItem && clip.projectItem.nodeId ? String(clip.projectItem.nodeId) : '';
                  var startSeconds = clip.start && typeof clip.start.seconds === 'number' ? clip.start.seconds.toFixed(3) : '';
                  map[projectItemId + '|' + startSeconds + '|' + String(clip.nodeId)] = true;
                } catch (_) { }
              }
            }
            return map;
          }

          function __countNewLinkedAudioCounterparts(sequence, projectItemId, startTime, beforeAudioClipKeys) {
            var linkedAudioInserted = 0;
            if (!sequence.audioTracks) return linkedAudioInserted;
            for (var a = 0; a < sequence.audioTracks.numTracks; a++) {
              var audioTrack = sequence.audioTracks[a];
              if (!audioTrack || !audioTrack.clips) continue;
              for (var c = 0; c < audioTrack.clips.numItems; c++) {
                var clip = audioTrack.clips[c];
                if (!clip) continue;
                try {
                  var sameItem = clip.projectItem && clip.projectItem.nodeId === projectItemId;
                  var sameStart = clip.start && Math.abs(clip.start.seconds - startTime) < 0.01;
                  var startSeconds = clip.start && typeof clip.start.seconds === 'number' ? clip.start.seconds.toFixed(3) : '';
                  var key = String(projectItemId) + '|' + startSeconds + '|' + String(clip.nodeId);
                  if (sameItem && sameStart && !beforeAudioClipKeys[key]) linkedAudioInserted++;
                } catch (_) { }
              }
            }
            return linkedAudioInserted;
          }

          var placedClips = [];
          var failedPlacements = [];
          var warnings = [];
          for (var p = 0; p < payload.placementPlan.length; p++) {
            var placement = payload.placementPlan[p];
            var onlineItem = __findProjectItem(placement.onlineProjectItemId);
            if (!onlineItem) {
              failedPlacements.push({ offlineClipId: placement.offlineClipId, error: "Online project item not found", onlineProjectItemId: placement.onlineProjectItemId });
              continue;
            }

            var trackResult = __ensureVideoTrack(targetSequence, placement.targetTrackIndex, payload.placementPlan.length);
            if (trackResult.trackCreationFailures && trackResult.trackCreationFailures.length > 0) {
              failedPlacements.push({ offlineClipId: placement.offlineClipId, onlineProjectItemId: placement.onlineProjectItemId, trackCreationFailures: trackResult.trackCreationFailures, error: 'trackCreationFailures' });
              warnings.push('trackCreationFailures');
              continue;
            }
            var targetTrack = trackResult.track;
            var inTicks = __secondsToTicks(placement.sourceInPoint);
            var outTicks = __secondsToTicks(placement.sourceOutPoint);
            var originalInPoint = null;
            var originalOutPoint = null;
            try { if (onlineItem.getInPoint) originalInPoint = onlineItem.getInPoint(); } catch (originalInError) { warnings.push('readProjectItemInPointFailed: ' + originalInError.toString()); }
            try { if (onlineItem.getOutPoint) originalOutPoint = onlineItem.getOutPoint(); } catch (originalOutError) { warnings.push('readProjectItemOutPointFailed: ' + originalOutError.toString()); }
            var beforeAudioClipKeys = __audioClipKeyMap(targetSequence);
            try {
              if (onlineItem.setInPoint) onlineItem.setInPoint(inTicks, 4);
              if (onlineItem.setOutPoint) onlineItem.setOutPoint(outTicks, 4);
              targetSequence.videoTracks[placement.targetTrackIndex].insertClip(onlineItem, placement.startTime);
            } catch (placementError) {
              failedPlacements.push({ offlineClipId: placement.offlineClipId, error: placementError.toString(), onlineProjectItemId: placement.onlineProjectItemId });
              __restoreProjectItemInOut(onlineItem, originalInPoint, originalOutPoint, warnings);
              continue;
            }
            __restoreProjectItemInOut(onlineItem, originalInPoint, originalOutPoint, warnings);

            var onlineClip = __findPlacedClip(targetTrack, placement.onlineProjectItemId, placement.startTime);
            var linkedAudioInserted = __countNewLinkedAudioCounterparts(targetSequence, placement.onlineProjectItemId, placement.startTime, beforeAudioClipKeys);
            if (linkedAudioInserted > 0) warnings.push('linkedAudioInserted: ' + linkedAudioInserted + ' linked audio clip(s) were preserved because stacked conform execution never removes timeline media');
            placedClips.push({
              offlineClipId: placement.offlineClipId,
              onlineProjectItemId: placement.onlineProjectItemId,
              onlineClipId: onlineClip ? onlineClip.nodeId : null,
              targetTrackIndex: placement.targetTrackIndex,
              startTime: placement.startTime,
              sourceInPoint: placement.sourceInPoint,
              sourceOutPoint: placement.sourceOutPoint,
              duration: placement.duration,
              linkedAudioInserted: linkedAudioInserted
            });
          }

          return JSON.stringify({
            success: failedPlacements.length === 0,
            mutationPlanned: true,
            sourceSequenceId: payload.sourceSequenceId,
            duplicatedSequenceId: targetSequence.sequenceID,
            conformSequenceName: payload.conformSequenceName,
            cloneReturnType: cloneResolution.cloneReturnType,
            renamedAtSequence: cloneResolution.renamedAtSequence,
            renamedAtProjectItem: renamedAtProjectItem,
            placedClips: placedClips,
            failedPlacements: failedPlacements,
            warnings: warnings.concat(failedPlacements.length > 0 ? ["Some placements failed; offline edit remains preserved in duplicated sequence"] : [])
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: true, error: e.toString() });
        }
      }

      var __stackedConformPayload = ${payload};
      return __createStackedOnlineConformSequence(__stackedConformPayload);
    `;

    return await this.bridge.executeScript(script);
  }

  private async copyConformClipEffects(args: CopyConformClipEffectsArgs): Promise<any> {
    const normalizedSourceEffects = normalizeEffectSnapshots(args.sourceEffects || []);
    if (normalizedSourceEffects.length === 0) {
      return {
        success: false,
        dryRun: args.dryRun ?? true,
        mutationPlanned: false,
        error: 'sourceEffects are required so supported and unsupported effects can be planned explicitly',
      };
    }

    const planInput: BuildEffectCopyPlanArgs = {
      sourceClipId: args.sourceClipId,
      targetClipId: args.targetClipId,
      sourceEffects: normalizedSourceEffects,
      ...(args.offlineSourceRaster ? { offlineSourceRaster: args.offlineSourceRaster as RasterDimensions } : {}),
      ...(args.onlineSourceRaster ? { onlineSourceRaster: args.onlineSourceRaster as RasterDimensions } : {}),
      ...(args.supportedComponents ? { supportedComponents: args.supportedComponents } : {}),
    };
    const plan = buildEffectCopyPlan(planInput);
    const dryRun = args.dryRun ?? true;

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        mutationPlanned: false,
        plan,
      };
    }

    if (!plan.safeToExecute) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: 'No supported conform effect assignments to execute',
        plan,
      };
    }

    const payload = JSON.stringify({
      sequenceId: args.sequenceId || null,
      sourceClipId: args.sourceClipId,
      targetClipId: args.targetClipId,
      plan,
    });
    const script = `
      function __copyConformClipEffects(payload) {
        try {
          var sourceInfo = __findClip(payload.sourceClipId, payload.sequenceId);
          if (!sourceInfo) return JSON.stringify({ success: false, mutationPlanned: false, error: "Source clip not found" });
          var targetInfo = __findClip(payload.targetClipId, payload.sequenceId);
          if (!targetInfo) return JSON.stringify({ success: false, mutationPlanned: false, error: "Target clip not found" });
          var sourceClip = sourceInfo.clip;
          var targetClip = targetInfo.clip;

          function __normalizedName(value) {
            return String(value || "").toLowerCase().replace(/\\s+/g, "");
          }
          function __findComponent(clip, componentName) {
            var wanted = __normalizedName(componentName);
            for (var c = 0; c < clip.components.numItems; c++) {
              var component = clip.components[c];
              if (!component) continue;
              if (__normalizedName(component.displayName) === wanted || __normalizedName(component.matchName) === wanted) return component;
            }
            return null;
          }
          function __findProperty(component, propertyName) {
            var wanted = __normalizedName(propertyName);
            for (var p = 0; p < component.properties.numItems; p++) {
              var prop = component.properties[p];
              if (!prop) continue;
              if (__normalizedName(prop.displayName) === wanted || __normalizedName(prop.matchName) === wanted) return prop;
            }
            return null;
          }

          var copiedProperties = [];
          var failedProperties = [];
          var unsupportedComponents = payload.plan.unsupportedComponents ? payload.plan.unsupportedComponents.slice(0) : [];
          for (var i = 0; i < payload.plan.assignments.length; i++) {
            var assignment = payload.plan.assignments[i];
            var sourceComponent = __findComponent(sourceClip, assignment.componentName);
            var targetComponent = __findComponent(targetClip, assignment.componentName);
            if (!sourceComponent || !targetComponent) {
              unsupportedComponents.push(assignment.componentName);
              failedProperties.push({ componentName: assignment.componentName, propertyName: assignment.propertyName, error: "Component unavailable on source or target clip" });
              continue;
            }
            var targetProperty = __findProperty(targetComponent, assignment.propertyName);
            if (!targetProperty || !targetProperty.setValue) {
              failedProperties.push({ componentName: assignment.componentName, propertyName: assignment.propertyName, error: "Target property cannot be set" });
              continue;
            }
            try {
              targetProperty.setValue(assignment.value, true);
              copiedProperties.push({ componentName: assignment.componentName, propertyName: assignment.propertyName, value: assignment.value });
            } catch (setError) {
              failedProperties.push({ componentName: assignment.componentName, propertyName: assignment.propertyName, error: setError.toString() });
            }
          }

          return JSON.stringify({
            success: failedProperties.length === 0,
            mutationPlanned: true,
            sourceClipId: payload.sourceClipId,
            targetClipId: payload.targetClipId,
            copiedProperties: copiedProperties,
            failedProperties: failedProperties,
            unsupportedComponents: unsupportedComponents,
            warnings: payload.plan.warnings || []
          });
        } catch (e) {
          return JSON.stringify({ success: false, mutationPlanned: true, error: e.toString() });
        }
      }

      var __conformEffectPayload = ${payload};
      return __copyConformClipEffects(__conformEffectPayload);
    `;

    return await this.bridge.executeScript(script);
  }

  private async qcStackedOnlineConform(args: QcStackedOnlineConformArgs): Promise<any> {
    const dryRun = args.dryRun ?? true;
    if (!dryRun && !args.allowedOutputRoot) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: 'allowedOutputRoot is required for live QC export',
      };
    }

    const plan = planStackedConformQc({
      sequenceId: args.sequenceId,
      outputDir: args.outputDir,
      ...(args.allowedOutputRoot ? { allowedOutputRoot: args.allowedOutputRoot } : {}),
      comparisons: args.comparisons,
      ...(args.sampleOffsets ? { sampleOffsets: args.sampleOffsets } : {}),
      ...(args.format ? { format: args.format } : {}),
    });

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        mutationPlanned: false,
        plan,
      };
    }

    if (!plan.safeToExecute) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        error: 'QC plan is not safe to execute',
        plan,
      };
    }

    const payload = JSON.stringify(plan);
    const script = `
      function __qcStackedOnlineConform(payload) {
        var savedVisibility = [];
        var savedClipDisabledStates = [];
        var visibilityReadFailures = [];
        var clipDisabledReadFailures = [];
        var isolationMethod = null;
        function __trackVisibilityIsolationAvailable(track) {
          return !!(track && typeof track.setVisible === "function" && (typeof track.isVisible === "function" || typeof track.isVisible === "boolean"));
        }
        function __setTrackVisible(track, visible) {
          if (!__trackVisibilityIsolationAvailable(track)) return false;
          try {
            track.setVisible(visible);
            return true;
          } catch (_) {
            return false;
          }
        }
        function restoreTrackVisibility(sequence) {
          var restoreFailures = [];
          for (var i = 0; i < savedVisibility.length; i++) {
            var state = savedVisibility[i];
            if (sequence.videoTracks && state.trackIndex < sequence.videoTracks.numTracks) {
              if (!__setTrackVisible(sequence.videoTracks[state.trackIndex], state.visible)) {
                restoreFailures.push({ trackIndex: state.trackIndex, visible: state.visible, error: 'setVisible failed while restoring track visibility' });
              }
            } else {
              restoreFailures.push({ trackIndex: state.trackIndex, visible: state.visible, error: 'track missing while restoring track visibility' });
            }
          }
          return restoreFailures;
        }
        function restoreClipDisabledStates(sequence) {
          var restoreFailures = [];
          for (var i = 0; i < savedClipDisabledStates.length; i++) {
            var state = savedClipDisabledStates[i];
            try {
              if (!state.clip || typeof state.clip.disabled !== "boolean") {
                restoreFailures.push({ trackIndex: state.trackIndex, clipIndex: state.clipIndex, clipId: state.clipId, error: 'clip.disabled unavailable while restoring clip disabled state' });
              } else {
                state.clip.disabled = state.disabled;
              }
            } catch (clipRestoreError) {
              restoreFailures.push({ trackIndex: state.trackIndex, clipIndex: state.clipIndex, clipId: state.clipId, disabled: state.disabled, error: 'clip.disabled restore failed: ' + clipRestoreError.toString() });
            }
          }
          return restoreFailures;
        }
        function __rememberTrack(sequence, trackIndex) {
          if (!sequence.videoTracks || trackIndex >= sequence.videoTracks.numTracks) return;
          for (var i = 0; i < savedVisibility.length; i++) {
            if (savedVisibility[i].trackIndex === trackIndex) return;
          }
          var track = sequence.videoTracks[trackIndex];
          var visibleValue = null;
          try {
            if (track && typeof track.isVisible === "function") {
              visibleValue = track.isVisible();
            } else if (track && typeof track.isVisible === "boolean") {
              visibleValue = track.isVisible;
            } else {
              visibilityReadFailures.push({ trackIndex: trackIndex, error: 'isVisible unavailable; refusing QC because original track visibility cannot be restored honestly' });
              return;
            }
          } catch (visibilityError) {
            visibilityReadFailures.push({ trackIndex: trackIndex, error: 'isVisible read failed: ' + visibilityError.toString() });
            return;
          }
          if (typeof visibleValue !== "boolean") {
            visibilityReadFailures.push({ trackIndex: trackIndex, value: visibleValue, error: 'isVisible returned non-boolean; refusing QC because original track visibility cannot be restored honestly' });
            return;
          }
          savedVisibility.push({ trackIndex: trackIndex, visible: visibleValue });
        }
        function __rememberAllVideoTracks(sequence) {
          if (!sequence.videoTracks) return;
          for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
            __rememberTrack(sequence, vt);
          }
        }
        function __rememberAllVideoClips(sequence) {
          if (!sequence.videoTracks) return;
          for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
            var track = sequence.videoTracks[vt];
            if (!track || !track.clips) continue;
            for (var ci = 0; ci < track.clips.numItems; ci++) {
              var clip = track.clips[ci];
              try {
                if (!clip || typeof clip.disabled !== "boolean") {
                  clipDisabledReadFailures.push({ trackIndex: vt, clipIndex: ci, error: 'clip.disabled unavailable; refusing QC because original clip disabled state cannot be restored honestly' });
                } else {
                  savedClipDisabledStates.push({ clip: clip, trackIndex: vt, clipIndex: ci, clipId: String(clip.nodeId), disabled: clip.disabled });
                }
              } catch (clipReadError) {
                clipDisabledReadFailures.push({ trackIndex: vt, clipIndex: ci, error: 'clip.disabled read failed: ' + clipReadError.toString() });
              }
            }
          }
        }
        function __allTracksSupportVisibilityIsolation(sequence) {
          if (!sequence.videoTracks || sequence.videoTracks.numTracks < 1) return false;
          for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
            if (!__trackVisibilityIsolationAvailable(sequence.videoTracks[vt])) return false;
          }
          return true;
        }
        function __clipTimeSeconds(timeObject) {
          try {
            if (timeObject && typeof timeObject.seconds === "number") return Number(timeObject.seconds);
            if (timeObject && timeObject.seconds !== undefined) return Number(timeObject.seconds);
            if (timeObject && timeObject.ticks !== undefined) return parseFloat(String(timeObject.ticks)) / 254016000000.0;
          } catch (_) { }
          return null;
        }
        function __clipOverlapsExportTime(clip, exportTime) {
          var startSeconds = __clipTimeSeconds(clip.start);
          var endSeconds = __clipTimeSeconds(clip.end);
          if (startSeconds === null || endSeconds === null) return false;
          var t = Number(exportTime);
          return startSeconds <= t + 0.0001 && endSeconds >= t - 0.0001;
        }
        function __findUniqueClipAtTime(sequence, trackIndex, exportTime) {
          if (!sequence.videoTracks || trackIndex >= sequence.videoTracks.numTracks) return { success: false, error: "active QC track missing for unique time-overlap resolver" };
          var track = sequence.videoTracks[trackIndex];
          if (!track || !track.clips) return { success: false, error: "active QC track has no clips collection for unique time-overlap resolver" };
          var matchedClip = null;
          var matchedCount = 0;
          for (var ci = 0; ci < track.clips.numItems; ci++) {
            var clip = track.clips[ci];
            if (clip && __clipOverlapsExportTime(clip, exportTime)) {
              matchedClip = clip;
              matchedCount++;
            }
          }
          if (matchedCount === 1) return { success: true, clip: matchedClip, clipId: String(matchedClip.nodeId), resolvedBy: "unique-time-overlap" };
          return { success: false, error: matchedCount === 0 ? "unique time-overlap resolver found no clip at QC export time" : "unique time-overlap resolver found multiple clips at QC export time", matchedCount: matchedCount };
        }
        function __findQcClip(sequence, frameExport) {
          var activeViewTrackIndex = frameExport.view === "offline" ? frameExport.sourceTrackIndex : frameExport.targetTrackIndex;
          var activeClipId = frameExport.view === "offline" ? frameExport.offlineClipId : frameExport.onlineClipId;
          if (!sequence.videoTracks || activeViewTrackIndex >= sequence.videoTracks.numTracks) return { success: false, error: "active QC track missing" };
          var track = sequence.videoTracks[activeViewTrackIndex];
          if (!track || !track.clips) return { success: false, error: "active QC track has no clips collection" };
          if (activeClipId !== undefined && activeClipId !== null) {
            for (var ci = 0; ci < track.clips.numItems; ci++) {
              var clip = track.clips[ci];
              try {
                if (clip && String(clip.nodeId) === String(activeClipId)) return { success: true, clip: clip, clipId: String(clip.nodeId), resolvedBy: "nodeId" };
              } catch (_) { }
            }
          }
          return __findUniqueClipAtTime(sequence, activeViewTrackIndex, frameExport.time);
        }
        function __preflightClipDisabledFallback(sequence, payload) {
          var failures = [];
          var inspectedClips = 0;
          if (!sequence.videoTracks || sequence.videoTracks.numTracks < 1) {
            failures.push({ success: false, error: "No video tracks available for clip-disabled QC fallback" });
            return { success: false, failedExports: failures };
          }
          for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
            var track = sequence.videoTracks[vt];
            if (!track || !track.clips) continue;
            for (var ci = 0; ci < track.clips.numItems; ci++) {
              inspectedClips++;
              var clip = track.clips[ci];
              try {
                if (!clip || typeof clip.disabled !== "boolean") {
                  failures.push({ success: false, error: "clip.disabled isolation unavailable; refusing stacked conform QC export because clip states cannot be restored", trackIndex: vt, clipIndex: ci });
                }
              } catch (clipError) {
                failures.push({ success: false, error: "clip.disabled isolation probe failed: " + clipError.toString(), trackIndex: vt, clipIndex: ci });
              }
            }
          }
          if (inspectedClips < 1) failures.push({ success: false, error: "clip-disabled fallback found no video clips to isolate" });
          for (var f = 0; f < payload.frameExports.length; f++) {
            var frameExport = payload.frameExports[f];
            var resolvedClip = __findQcClip(sequence, frameExport);
            if (!resolvedClip.success) {
              failures.push({ success: false, outputPath: frameExport.outputPath, error: resolvedClip.error || "clip-disabled fallback could not find the requested offline/online clip for QC isolation", matchedCount: resolvedClip.matchedCount, frameExport: frameExport });
            }
          }
          return { success: failures.length === 0, failedExports: failures };
        }
        function __preflightQcFrameExports(sequence, payload) {
          var failures = [];
          if (!sequence.videoTracks || sequence.videoTracks.numTracks < 1) {
            failures.push({ success: false, error: "No video tracks available for stacked conform QC" });
            return { success: false, failedExports: failures, isolationMethod: null };
          }
          for (var f = 0; f < payload.frameExports.length; f++) {
            var frameExport = payload.frameExports[f];
            if (frameExport.sourceTrackIndex >= sequence.videoTracks.numTracks || frameExport.targetTrackIndex >= sequence.videoTracks.numTracks) {
              failures.push({
                success: false,
                outputPath: frameExport.outputPath,
                error: "sourceTrackIndex >= sequence.videoTracks.numTracks or targetTrackIndex >= sequence.videoTracks.numTracks",
                frameExport: frameExport
              });
            }
          }
          if (failures.length > 0) return { success: false, failedExports: failures, isolationMethod: null };
          if (__allTracksSupportVisibilityIsolation(sequence)) return { success: true, failedExports: [], isolationMethod: "track-visibility" };
          var clipFallback = __preflightClipDisabledFallback(sequence, payload);
          if (clipFallback.success) return { success: true, failedExports: [], isolationMethod: "clip-disabled" };
          for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
            if (!__trackVisibilityIsolationAvailable(sequence.videoTracks[vt])) {
              failures.push({ success: false, error: "Track visibility isolation unavailable; refusing stacked conform QC export because offline/online layers cannot be isolated by track visibility and clip-disabled fallback is unavailable", trackIndex: vt });
            }
          }
          failures = failures.concat(clipFallback.failedExports || []);
          return { success: false, failedExports: failures, isolationMethod: null };
        }
        function __setClipDisabledForQc(clip, disabled) {
          try {
            if (!clip || typeof clip.disabled !== "boolean") return false;
            clip.disabled = disabled;
            return true;
          } catch (_) {
            return false;
          }
        }
        function __isolateQcView(sequence, frameExport, method) {
          var activeViewTrackIndex = frameExport.view === "offline" ? frameExport.sourceTrackIndex : frameExport.targetTrackIndex;
          if (method === "track-visibility") {
            for (var vt = 0; vt < sequence.videoTracks.numTracks; vt++) {
              if (!__setTrackVisible(sequence.videoTracks[vt], vt === activeViewTrackIndex)) {
                return { success: false, outputPath: frameExport.outputPath, error: "Track visibility isolation unavailable during export", frameExport: frameExport, isolationMethod: method };
              }
            }
            return { success: true, activeViewTrackIndex: activeViewTrackIndex, isolationMethod: method };
          }
          if (method === "clip-disabled") {
            var activeResolution = __findQcClip(sequence, frameExport);
            if (!activeResolution.success) return { success: false, outputPath: frameExport.outputPath, error: activeResolution.error || "clip-disabled fallback could not find the requested active QC clip", frameExport: frameExport, activeViewTrackIndex: activeViewTrackIndex, matchedCount: activeResolution.matchedCount, isolationMethod: method };
            var activeClip = activeResolution.clip;
            var activeClipId = activeResolution.clipId;
            var activeClipFound = false;
            for (var cvt = 0; cvt < sequence.videoTracks.numTracks; cvt++) {
              var track = sequence.videoTracks[cvt];
              if (!track || !track.clips) continue;
              for (var ci = 0; ci < track.clips.numItems; ci++) {
                var clip = track.clips[ci];
                var isActiveClip = false;
                try { isActiveClip = clip === activeClip || String(clip.nodeId) === String(activeClipId); } catch (_) { isActiveClip = false; }
                if (isActiveClip) activeClipFound = true;
                if (!__setClipDisabledForQc(clip, !isActiveClip)) {
                  return { success: false, outputPath: frameExport.outputPath, error: "clip.disabled isolation unavailable during export", frameExport: frameExport, trackIndex: cvt, clipIndex: ci, isolationMethod: method };
                }
              }
            }
            if (!activeClipFound) return { success: false, outputPath: frameExport.outputPath, error: "clip-disabled fallback resolved an active QC clip but could not match it during isolation", frameExport: frameExport, activeViewTrackIndex: activeViewTrackIndex, activeClipId: activeClipId, isolationMethod: method };
            return { success: true, activeViewTrackIndex: activeViewTrackIndex, activeClipId: String(activeClipId), resolvedBy: activeResolution.resolvedBy, isolationMethod: method };
          }
          return { success: false, outputPath: frameExport.outputPath, error: "QC isolation method unavailable", frameExport: frameExport, isolationMethod: method };
        }
        function __exportQcFrame(qeSequence, frameExport) {
          var methodName = frameExport.format === "jpg" ? "exportFrameJPEG" : (frameExport.format === "tiff" ? "exportFrameTiff" : "exportFramePNG");
          if (typeof qeSequence[methodName] !== "function") {
            return { success: false, outputPath: frameExport.outputPath, error: "Frame export method unavailable: " + methodName };
          }
          function __extensionForFormat(format) { return format === "jpg" ? ".jpg" : (format === "tiff" ? ".tiff" : ".png"); }
          function __stripFormatExtension(outputPath, format) {
            var ext = __extensionForFormat(format);
            var lowerPath = String(outputPath).toLowerCase();
            if (lowerPath.lastIndexOf(ext) === lowerPath.length - ext.length) return String(outputPath).substring(0, String(outputPath).length - ext.length);
            return String(outputPath);
          }
          var exportBasePath = __stripFormatExtension(frameExport.outputPath, frameExport.format);
          var actualOutputPath = exportBasePath + __extensionForFormat(frameExport.format);
          var timeNumber = Number(frameExport.time);
          var timeString = String(timeNumber);
          var timeTicks = timeString;
          try { var exportTime = new Time(); exportTime.seconds = timeNumber; timeTicks = String(exportTime.ticks); } catch (timeError) { }
          var exportError = null;
          function tryExport(timeValue, signatureName) {
            try {
              qeSequence[methodName](String(timeValue), exportBasePath);
              if (File(actualOutputPath).exists) return { success: true, outputPath: actualOutputPath, requestedOutputPath: frameExport.outputPath, exportBasePath: exportBasePath, exportSignature: signatureName };
              exportError = signatureName + " returned without creating " + actualOutputPath;
              return null;
            } catch (e0) {
              exportError = signatureName + ": " + e0.toString();
              return null;
            }
          }
          var exported = tryExport(timeString, "secondsString_outputBase") || tryExport(timeTicks, "ticksString_outputBase");
          return exported ? { success: true, outputPath: exported.outputPath, requestedOutputPath: exported.requestedOutputPath, exportBasePath: exported.exportBasePath, exportSignature: exported.exportSignature, time: frameExport.time, view: frameExport.view } : { success: false, outputPath: frameExport.outputPath, error: exportError || "Frame export failed" };
        }

        try {
          var sequence = __findSequence(payload.sequenceId);
          if (!sequence) return JSON.stringify({ success: false, mutationPlanned: false, error: "Sequence not found" });
          if (sequence.openInTimeline) {
            try { sequence.openInTimeline(); } catch (_) { }
          }
          app.project.activeSequence = sequence;
          app.enableQE();
          var qeSequence = qe.project.getActiveSequence();
          if (!qeSequence) return JSON.stringify({ success: false, mutationPlanned: false, error: "QE active sequence not available for QC export" });

          var preflight = __preflightQcFrameExports(sequence, payload);
          isolationMethod = preflight.isolationMethod;
          if (!preflight.success) {
            return JSON.stringify({
              success: false,
              mutationPlanned: false,
              sequenceId: payload.sequenceId,
              exportedFrames: [],
              failedExports: preflight.failedExports,
              restoredTrackVisibility: false,
              restoredClipDisabledStates: false,
              isolationMethod: isolationMethod,
              structuralReport: payload.structuralReport,
              visibilityReadFailures: visibilityReadFailures,
              clipDisabledReadFailures: clipDisabledReadFailures,
              summary: payload.summary,
              warnings: (payload.warnings || []).concat(["QC preflight failed before export"])
            });
          }
          if (isolationMethod === "track-visibility") {
            __rememberAllVideoTracks(sequence);
          } else if (isolationMethod === "clip-disabled") {
            __rememberAllVideoClips(sequence);
          }
          if (visibilityReadFailures.length > 0 || clipDisabledReadFailures.length > 0) {
            return JSON.stringify({
              success: false,
              mutationPlanned: false,
              sequenceId: payload.sequenceId,
              exportedFrames: [],
              failedExports: [],
              restoreFailures: [],
              restoredTrackVisibility: isolationMethod !== "track-visibility",
              restoredClipDisabledStates: isolationMethod !== "clip-disabled",
              isolationMethod: isolationMethod,
              structuralReport: payload.structuralReport,
              visibilityReadFailures: visibilityReadFailures,
              clipDisabledReadFailures: clipDisabledReadFailures,
              summary: payload.summary,
              warnings: (payload.warnings || []).concat(["QC isolation state read failed before export"])
            });
          }

          var qcFolder = new Folder(payload.outputDir);
          if (!qcFolder.exists) qcFolder.create();

          var exportedFrames = [];
          var failedExports = [];
          for (var f = 0; f < payload.frameExports.length; f++) {
            var frameExport = payload.frameExports[f];
            var isolation = __isolateQcView(sequence, frameExport, isolationMethod);
            if (!isolation.success) {
              failedExports.push(isolation);
              continue;
            }
            var exportResult = __exportQcFrame(qeSequence, frameExport);
            if (exportResult.success) {
              exportResult.activeViewTrackIndex = isolation.activeViewTrackIndex;
              exportResult.isolationMethod = isolation.isolationMethod;
              if (isolation.activeClipId !== undefined) exportResult.activeClipId = isolation.activeClipId;
              if (isolation.resolvedBy !== undefined) exportResult.resolvedBy = isolation.resolvedBy;
              exportedFrames.push(exportResult);
            } else failedExports.push(exportResult);
          }

          var restoreFailures = isolationMethod === "track-visibility" ? restoreTrackVisibility(sequence) : restoreClipDisabledStates(sequence);
          return JSON.stringify({
            success: failedExports.length === 0 && restoreFailures.length === 0 && visibilityReadFailures.length === 0 && clipDisabledReadFailures.length === 0,
            mutationPlanned: true,
            sequenceId: payload.sequenceId,
            exportedFrames: exportedFrames,
            failedExports: failedExports,
            restoreFailures: restoreFailures,
            visibilityReadFailures: visibilityReadFailures,
            clipDisabledReadFailures: clipDisabledReadFailures,
            restoredTrackVisibility: isolationMethod !== "track-visibility" || restoreFailures.length === 0,
            restoredClipDisabledStates: isolationMethod !== "clip-disabled" || restoreFailures.length === 0,
            isolationMethod: isolationMethod,
            structuralReport: payload.structuralReport,
            summary: payload.summary,
            warnings: (payload.warnings || []).concat(restoreFailures.length > 0 ? [isolationMethod === "clip-disabled" ? 'Clip disabled state restoration had failures' : 'Track visibility restoration had failures'] : [])
          });
        } catch (e) {
          var trackRestoreFailures = [];
          var clipRestoreFailures = [];
          try {
            var activeSequence = app.project.activeSequence;
            if (activeSequence) {
              trackRestoreFailures = restoreTrackVisibility(activeSequence);
              clipRestoreFailures = restoreClipDisabledStates(activeSequence);
            }
          } catch (restoreError) {
            trackRestoreFailures.push({ error: restoreError.toString() });
          }
          var restoreFailures = trackRestoreFailures.concat(clipRestoreFailures);
          return JSON.stringify({ success: false, mutationPlanned: true, restoreFailures: restoreFailures, visibilityReadFailures: visibilityReadFailures, clipDisabledReadFailures: clipDisabledReadFailures, restoredTrackVisibility: trackRestoreFailures.length === 0, restoredClipDisabledStates: clipRestoreFailures.length === 0, isolationMethod: isolationMethod, structuralReport: payload.structuralReport, error: e.toString() });
        }
      }

      var __stackedConformQcPayload = ${payload};
      return __qcStackedOnlineConform(__stackedConformQcPayload);
    `;

    return await this.bridge.executeScript(script);
  }

  private async getProjectInfo(): Promise<any> {
    const script = `
      try {
        var project = app.project;
        var hasActive = project.activeSequence ? true : false;
        return JSON.stringify({
          success: true,
          name: project.name,
          path: project.path,
          activeSequence: hasActive ? {
            id: project.activeSequence.sequenceID,
            name: project.activeSequence.name
          } : null,
          itemCount: project.rootItem.children.numItems,
          sequenceCount: project.sequences.numSequences,
          hasActiveSequence: hasActive
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async buildMotionGraphicsDemo(sequenceName = 'Apple Like Motion Demo'): Promise<any> {
    const assetBase = process.env.PREMIERE_TEMP_DIR || '/tmp';
    const assetDir = `${assetBase.replace(/\/$/, '')}/motion-demo-${Date.now()}`;
    const assets = await createMotionDemoAssets(assetDir);

    const createdSequence = await this.createSequence(sequenceName);
    if (!createdSequence.success || !createdSequence.id) {
      return {
        success: false,
        error: createdSequence.error || 'Failed to create demo sequence',
        assetDir,
        assets
      };
    }

    const imported = [];
    for (const asset of assets) {
      const result = await this.importMedia(asset.path);
      imported.push(result);
      if (!result.success || !result.id) {
        return {
          success: false,
          error: result.error || `Failed to import asset ${asset.name}`,
          assetDir,
          assets,
          createdSequence,
          imported
        };
      }
    }

    const placements = [];
    for (let index = 0; index < imported.length; index++) {
      const placement = await this.addToTimeline(createdSequence.id, imported[index].id, 0, index * 5);
      placements.push(placement);
      if (!placement.success) {
        return {
          success: false,
          error: placement.error || `Failed to place ${imported[index].name} on the timeline`,
          assetDir,
          assets,
          createdSequence,
          imported,
          placements
        };
      }
    }

    const clips = placements.map((placement: any) => placement.id).filter(Boolean);
    const transitions = [];
    if (clips[0]) {
      transitions.push(await this.addTransitionToClip(clips[0], 'Cross Dissolve', 'end', 0.75));
    }
    if (clips[1]) {
      transitions.push(await this.addTransitionToClip(clips[1], 'Cross Dissolve', 'end', 0.75));
    }

    const animations = [];
    const scaleFrames = [
      { start: 0, end: 4.8, from: 100, to: 108 },
      { start: 5.005, end: 9.8, from: 112, to: 100 },
      { start: 10.01, end: 14.7, from: 100, to: 106 },
    ];
    for (let index = 0; index < clips.length && index < scaleFrames.length; index++) {
      const frame = scaleFrames[index];
      if (!frame) {
        continue;
      }
      animations.push(await this.addKeyframe(clips[index], 'Motion', 'Scale', frame.start, frame.from));
      animations.push(await this.addKeyframe(clips[index], 'Motion', 'Scale', frame.end, frame.to));
    }

    const tracks = await this.listSequenceTracks(createdSequence.id);

    return {
      success: true,
      message: 'Motion graphics demo sequence created',
      assetDir,
      assets,
      sequence: createdSequence,
      imported,
      placements,
      transitions,
      animations,
      tracks
    };
  }

  private getMotionRange(style: MotionStyle, index: number): { from: number; to: number } {
    if (style === 'push_in') {
      return { from: 100, to: 108 };
    }
    if (style === 'pull_out') {
      return { from: 108, to: 100 };
    }
    if (style === 'alternate') {
      const invert = index % 2 === 1;
      return invert ? { from: 110, to: 100 } : { from: 100, to: 108 };
    }
    return { from: 100, to: 100 };
  }

  private hasColorAdjustments(color?: ClipPlanColor): boolean {
    if (!color) {
      return false;
    }
    return Object.values(color).some((value) => value !== undefined);
  }

  private normalizeEditPlanAssembly(args: AssembleFromEditPlanArgs): { assembleArgs: AssembleProductSpotArgs; normalizedPlan: any } {
    const clipDuration = args.clipDuration ?? 4;
    const videoTrackIndex = args.videoTrackIndex ?? 0;
    const hasDirectedPlan = Array.isArray(args.clipPlan) && args.clipPlan.length > 0;
    const transitionName = args.transitionName ?? (hasDirectedPlan ? undefined : 'Cross Dissolve');
    const transitionDuration = args.transitionDuration ?? 0.5;
    const sourceSteps: ClipPlanStep[] = hasDirectedPlan
      ? args.clipPlan ?? []
      : args.assetPaths.map((_, index) => ({ assetIndex: index }));

    const normalizedSteps = sourceSteps.map((step, index) => {
      const assetIndex = step.assetIndex ?? index;
      const warnings: string[] = [];
      if (assetIndex >= args.assetPaths.length) {
        warnings.push(`assetIndex ${assetIndex} is outside assetPaths length ${args.assetPaths.length}`);
      }

      const normalizedStep: Record<string, any> = {
        stepIndex: index,
        assetIndex,
        assetPath: args.assetPaths[assetIndex] ?? null,
        time: step.time ?? (index * clipDuration),
        trackIndex: step.trackIndex ?? videoTrackIndex,
        insertMode: step.insertMode ?? 'overwrite',
        warnings
      };

      if (step.transitionAfter !== undefined) {
        normalizedStep.transitionAfter = step.transitionAfter;
      } else if (transitionName !== undefined && index < sourceSteps.length - 1) {
        normalizedStep.transitionAfter = { name: transitionName, duration: transitionDuration };
      }
      if (step.motion !== undefined) normalizedStep.motion = step.motion;
      if (step.trim !== undefined) normalizedStep.trim = step.trim;
      if (step.effects !== undefined) normalizedStep.effects = step.effects;
      if (step.color !== undefined) normalizedStep.color = step.color;

      return normalizedStep;
    });

    const assembleArgs: AssembleProductSpotArgs = {
      sequenceName: args.sequenceName,
      assetPaths: args.assetPaths,
      motionStyle: 'none'
    };
    if (args.clipDuration !== undefined) assembleArgs.clipDuration = args.clipDuration;
    if (args.videoTrackIndex !== undefined) assembleArgs.videoTrackIndex = args.videoTrackIndex;
    if (args.transitionName !== undefined) assembleArgs.transitionName = args.transitionName;
    if (args.transitionDuration !== undefined) assembleArgs.transitionDuration = args.transitionDuration;
    if (args.clipPlan !== undefined) assembleArgs.clipPlan = args.clipPlan;

    return {
      assembleArgs,
      normalizedPlan: {
        sequenceName: args.sequenceName,
        assetPaths: args.assetPaths,
        clipDuration,
        videoTrackIndex,
        transitionName,
        transitionDuration,
        motionStyle: 'none',
        clipPlan: normalizedSteps,
        stepCount: normalizedSteps.length
      }
    };
  }

  private async assembleFromEditPlan(args: AssembleFromEditPlanArgs): Promise<any> {
    const { assembleArgs, normalizedPlan } = this.normalizeEditPlanAssembly(args);

    if (args.dryRun === true) {
      return {
        success: true,
        dryRun: true,
        mutationPlanned: false,
        normalizedPlan,
        assembleArgs
      };
    }

    const result = await this.assembleProductSpot(assembleArgs);
    const sequenceId = result?.sequenceId ?? result?.sequence?.id;
    const response: Record<string, any> = {
      ...result,
      delegatedTool: 'assemble_product_spot',
      normalizedPlan
    };

    if (sequenceId && args.includePostcondition !== false) {
      response.postcondition = await this.listSequenceTracks(sequenceId);
    }

    return response;
  }

  private async assembleProductSpot(args: AssembleProductSpotArgs): Promise<any> {
    const clipDuration = args.clipDuration ?? 4;
    const videoTrackIndex = args.videoTrackIndex ?? 0;
    const hasDirectedPlan = Array.isArray(args.clipPlan) && args.clipPlan.length > 0;
    const transitionName = args.transitionName ?? (hasDirectedPlan ? undefined : 'Cross Dissolve');
    const transitionDuration = args.transitionDuration ?? 0.5;
    const motionStyle: MotionStyle = args.motionStyle ?? (hasDirectedPlan ? 'none' : 'alternate');

    const createdSequence = await this.createSequence(args.sequenceName);
    if (!createdSequence.success || !createdSequence.id) {
      return {
        success: false,
        error: createdSequence.error || 'Failed to create sequence',
        sequenceName: args.sequenceName
      };
    }

    const imported = [];
    for (const assetPath of args.assetPaths) {
      const result = await this.importMedia(assetPath);
      imported.push(result);
      if (!result.success || !result.id) {
        return {
          success: false,
          error: result.error || `Failed to import ${assetPath}`,
          sequence: createdSequence,
          imported
        };
      }
    }

    const planSteps: ClipPlanStep[] = hasDirectedPlan
      ? args.clipPlan ?? []
      : imported.map((_, index) => ({
        assetIndex: index,
        time: index * clipDuration,
        trackIndex: videoTrackIndex,
        insertMode: 'overwrite' as const
      }));

    const placements = [];
    const trims = [];
    const clipEffects = [];
    const colorAdjustments = [];

    for (let index = 0; index < planSteps.length; index++) {
      const step: ClipPlanStep = planSteps[index] ?? {};
      const assetIndex = step.assetIndex ?? index;
      const importedAsset = imported[assetIndex];

      if (!importedAsset?.id) {
        return {
          success: false,
          error: `Clip plan references asset index ${assetIndex}, but only ${imported.length} asset(s) were imported.`,
          sequence: createdSequence,
          imported,
          planSteps
        };
      }

      const placementTime = step.time ?? (index * clipDuration);
      const track = step.trackIndex ?? videoTrackIndex;
      const insertMode = step.insertMode ?? 'overwrite';
      const placement = await this.addToTimeline(
        createdSequence.id,
        importedAsset.id,
        track,
        placementTime,
        insertMode,
      );

      placements.push(placement);
      if (!placement.success || !placement.id) {
        return {
          success: false,
          error: placement.error || `Failed to place ${importedAsset.name ?? importedAsset.id} on the timeline`,
          sequence: createdSequence,
          imported,
          placements,
          planSteps
        };
      }

      const trimConfig = step.trim;
      if (trimConfig && (trimConfig.inPoint !== undefined || trimConfig.outPoint !== undefined || trimConfig.duration !== undefined)) {
        trims.push(await this.trimClip(placement.id, trimConfig.inPoint, trimConfig.outPoint, trimConfig.duration));
      }

      const effects = step.effects ?? [];
      for (const effectName of effects) {
        clipEffects.push(await this.applyEffect(placement.id, effectName));
      }

      if (this.hasColorAdjustments(step.color)) {
        colorAdjustments.push(await this.colorCorrect(placement.id, {
          clipId: placement.id,
          ...step.color
        }));
      }
    }

    const transitions = [];
    for (let index = 0; index < placements.length - 1; index++) {
      const step: ClipPlanStep = planSteps[index] ?? {};
      const transitionAfter = step.transitionAfter;
      let transitionToApply: string | undefined;
      let durationToApply = transitionDuration;

      if (transitionAfter) {
        const explicitName = transitionAfter.name ?? transitionName;
        if (explicitName && explicitName.toLowerCase() !== 'none') {
          transitionToApply = explicitName;
          durationToApply = transitionAfter.duration ?? transitionDuration;
        }
      } else if (transitionName) {
        transitionToApply = transitionName;
      }

      if (transitionToApply) {
        transitions.push(await this.addTransitionToClip(
          placements[index].id,
          transitionToApply,
          'end',
          durationToApply,
        ));
      }
    }

    const animations = [];
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      const step: ClipPlanStep = planSteps[index] ?? {};
      const motion = step.motion;
      const style: MotionStyle = motion?.style ?? motionStyle;
      const hasExplicitRange = motion?.from !== undefined || motion?.to !== undefined;

      if (style === 'none' && !hasExplicitRange) {
        continue;
      }

      const range = this.getMotionRange(style, index);
      const from = motion?.from ?? range.from;
      const to = motion?.to ?? range.to;
      const start = motion?.startTime ?? placement.inPoint ?? (step.time ?? (index * clipDuration));
      const candidateEnd = motion?.endTime ?? ((placement.outPoint ?? (start + clipDuration)) - 0.1);
      const end = Math.max(start + 0.1, candidateEnd);
      const componentName = motion?.componentName ?? 'Motion';
      const paramName = motion?.paramName ?? 'Scale';

      animations.push(await this.addKeyframe(placement.id, componentName, paramName, start, from));
      animations.push(await this.addKeyframe(placement.id, componentName, paramName, end, to));
    }

    const tracks = await this.listSequenceTracks(createdSequence.id);

    return {
      success: true,
      message: hasDirectedPlan ? 'Product spot assembled from directed clip plan' : 'Product spot assembled successfully',
      sequence: createdSequence,
      imported,
      planSteps,
      placements,
      trims,
      transitions,
      animations,
      clipEffects,
      colorAdjustments,
      tracks
    };
  }

  private async buildBrandSpotFromMogrtAndAssets(args: BuildBrandSpotArgs): Promise<any> {
    const assemblyArgs: AssembleProductSpotArgs = {
      sequenceName: args.sequenceName,
      assetPaths: args.assetPaths,
    };
    if (args.clipDuration !== undefined) {
      assemblyArgs.clipDuration = args.clipDuration;
    }
    if (args.videoTrackIndex !== undefined) {
      assemblyArgs.videoTrackIndex = args.videoTrackIndex;
    }
    if (args.transitionName !== undefined) {
      assemblyArgs.transitionName = args.transitionName;
    }
    if (args.transitionDuration !== undefined) {
      assemblyArgs.transitionDuration = args.transitionDuration;
    }
    if (args.motionStyle !== undefined) {
      assemblyArgs.motionStyle = args.motionStyle;
    }
    if (args.clipPlan !== undefined) {
      assemblyArgs.clipPlan = args.clipPlan;
    }

    const assembly = await this.assembleProductSpot(assemblyArgs);

    if (!assembly.success || !assembly.sequence?.id) {
      return assembly;
    }

    const overlays = [];
    if (args.mogrtPath) {
      overlays.push(await this.importMogrt(
        assembly.sequence.id,
        args.mogrtPath,
        args.titleStartTime ?? 0.4,
        args.titleTrackIndex ?? 1,
        0,
      ));
    } else {
      overlays.push({
        success: true,
        skipped: true,
        note: 'No MOGRT supplied; brand title overlay was skipped'
      });
    }

    const polish = [];
    if (args.applyDefaultPolish) {
      const placedClips = Array.isArray(assembly.placements) ? assembly.placements : [];
      const middleIndex = Math.floor(placedClips.length / 2);
      if (placedClips[middleIndex]?.id) {
        polish.push(await this.applyEffect(placedClips[middleIndex].id, 'Gaussian Blur'));
      }
      const lastClip = placedClips[placedClips.length - 1];
      if (lastClip?.id) {
        polish.push(await this.colorCorrect(lastClip.id, {
          clipId: lastClip.id,
          brightness: 4,
          contrast: 8,
          saturation: 6
        }));
      }
    } else {
      polish.push({
        success: true,
        skipped: true,
        note: 'Default polish disabled. Use clipPlan effects/color for directed finishing.'
      });
    }

    const refreshedTracks = await this.listSequenceTracks(assembly.sequence.id);

    return {
      success: true,
      ...assembly,
      message: 'Brand spot assembled successfully',
      overlays,
      polish,
      tracks: refreshedTracks
    };
  }

  // Project Management Implementation
  private async createProject(name: string, location: string): Promise<any> {
    try {
      const result: any = await this.bridge.createProject(name, location);
      const projectPath = `${location.replace(/[\\/]+$/, '')}/${name.endsWith('.prproj') ? name : `${name}.prproj`}`;
      if (result?.success === false) {
        return {
          ...result,
          projectPath: result.projectPath || projectPath
        };
      }

      return {
        success: true,
        message: `Project "${name}" created successfully`,
        projectPath,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async openProject(path: string): Promise<any> {
    try {
      const result: any = await this.bridge.openProject(path);
      if (result?.success === false) {
        return {
          ...result,
          projectPath: result.projectPath || path
        };
      }

      return {
        success: true,
        message: `Project opened successfully`,
        projectPath: path,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async saveProject(): Promise<any> {
    try {
      await this.bridge.saveProject();
      return {
        success: true,
        message: 'Project saved successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to save project: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async saveProjectAs(name: string, location: string): Promise<any> {
    const script = `
      try {
        var project = app.project;
        var newPath = "${location}/${name}.prproj";
        project.saveAs(newPath);

        return JSON.stringify({
          success: true,
          message: "Project saved as: " + newPath,
          newPath: newPath
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Media Management Implementation
  private async importMedia(filePath: string, binName?: string): Promise<any> {
    try {
      const result: any = await this.bridge.importMedia(filePath);
      if (!result.success) {
        return {
          ...result,
          filePath: filePath,
          binName: binName || 'Root'
        };
      }
      return {
        success: true,
        message: `Media imported successfully`,
        filePath: filePath,
        binName: binName || 'Root',
        ...result
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const maybeModalTimeout = /timeout|timed out/i.test(message);
      return {
        success: false,
        error: `Failed to import media: ${message}`,
        filePath: filePath,
        ...(maybeModalTimeout ? {
          warning: 'Premiere may be showing a blocking modal dialog, such as "File format not supported". Dismiss the dialog in Premiere, then retry. For subtitle files, convert unsupported formats like .ass/.ssa to .srt before importing.'
        } : {})
      };
    }
  }

  /**
   * Import a Final Cut Pro 7 XML (XMEML) file.
   *
   * Premiere 2026 requires project.importFiles (not the legacy openFCPXML which
   * needs additional args like project context). importFiles handles XML/EDL/AAF
   * detection automatically and creates a new sequence atomically.
   *
   * Fallback chain: importFiles → openFCPXML(path,suppressUI) → openFCPXML(path).
   */
  private async importFcpXml(filePath: string): Promise<any> {
    try {
      const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `
        try {
          var f = new File("${escapedPath}");
          if (!f.exists) {
            return JSON.stringify({ success: false, error: "File not found: ${escapedPath}" });
          }
          var attempts = [];

          // Attempt 1: project.importFiles (modern Premiere 2026 preferred)
          if (typeof app.project !== 'undefined' && typeof app.project.importFiles === 'function') {
            try {
              var ok = app.project.importFiles(["${escapedPath}"], false, app.project.rootItem, false);
              attempts.push({ method: "importFiles", ok: ok });
              if (ok) return JSON.stringify({ success: true, imported: true, path: "${escapedPath}", method: "importFiles", attempts: attempts });
            } catch (e1) { attempts.push({ method: "importFiles", error: e1.toString() }); }
          }

          // Attempt 2: openFCPXML with suppressUI flag (Premiere 2026)
          if (typeof app.openFCPXML === 'function') {
            try {
              app.openFCPXML("${escapedPath}", true);
              return JSON.stringify({ success: true, imported: true, path: "${escapedPath}", method: "openFCPXML(path,true)", attempts: attempts });
            } catch (e2) {
              attempts.push({ method: "openFCPXML(path,true)", error: e2.toString() });
              try {
                app.openFCPXML("${escapedPath}");
                return JSON.stringify({ success: true, imported: true, path: "${escapedPath}", method: "openFCPXML(path)", attempts: attempts });
              } catch (e3) { attempts.push({ method: "openFCPXML(path)", error: e3.toString() }); }
            }
          }

          return JSON.stringify({ success: false, error: "All import methods failed", attempts: attempts });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `;
      const result: any = await this.bridge.executeScript(script);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return {
        ...parsed,
        message: parsed.success
          ? `FCP XML imported successfully via ${parsed.method} — Premiere created new sequence atomically`
          : `Failed to import FCP XML — see attempts for details`,
        filePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import FCP XML: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      };
    }
  }

  /**
   * Import a CMX 3600 EDL file via app.importEDL.
   * Premiere prompts for sequence settings + source media in interactive mode.
   * The resulting sequence's timebase/video standard comes from the project defaults
   * or the interactive dialog — app.importEDL has no video-standard argument.
   */
  private async importEdl(filePath: string): Promise<any> {
    try {
      const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `
        try {
          var f = new File("${escapedPath}");
          if (!f.exists) {
            return JSON.stringify({ success: false, error: "File not found: ${escapedPath}" });
          }
          // Premiere's EDL import API: app.importEDL(filePath, sequence, project)
          // If no sequence provided, Premiere creates a new one with prompted settings.
          // Note: this may pop up an interactive sequence-settings dialog.
          if (typeof app.importEDL === 'function') {
            app.importEDL("${escapedPath}");
            return JSON.stringify({ success: true, imported: true, path: "${escapedPath}", mode: "importEDL" });
          } else {
            // Fallback: try app.openDocument or app.project.importFiles
            var imported = app.project.importFiles(["${escapedPath}"], false, app.project.rootItem, false);
            return JSON.stringify({ success: !!imported, imported: !!imported, path: "${escapedPath}", mode: "importFiles_fallback" });
          }
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `;
      const result: any = await this.bridge.executeScript(script);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return {
        ...parsed,
        message: parsed.success
          ? `EDL imported successfully — check project for new sequence`
          : `Failed to import EDL — try import_fcp_xml as alternative`,
        filePath
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to import EDL: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      };
    }
  }

  private async importFolder(folderPath: string, binName?: string, recursive = false): Promise<any> {
    const script = `
      try {
        var folder = new Folder("${folderPath}");
        var importedItems = [];
        var errors = [];

        function importFiles(dir, targetBin) {
          var files = dir.getFiles();
          for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file instanceof File) {
              try {
                var item = targetBin.importFiles([file.fsName]);
                if (item && item.length > 0) {
                  importedItems.push({
                    name: file.name,
                    path: file.fsName,
                    id: item[0].nodeId
                  });
                }
              } catch (e) {
                errors.push({
                  file: file.name,
                  error: e.toString()
                });
              }
            } else if (file instanceof Folder && ${recursive}) {
              importFiles(file, targetBin);
            }
          }
        }

        var targetBin = app.project.rootItem;
        ${binName ? `targetBin = app.project.rootItem.children["${binName}"] || app.project.rootItem;` : ''}

        importFiles(folder, targetBin);

        return JSON.stringify({
          success: true,
          importedItems: importedItems,
          errors: errors,
          totalImported: importedItems.length,
          totalErrors: errors.length
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async createBin(name: string, parentBinName?: string): Promise<any> {
    const script = `
      try {
        var parentBin = app.project.rootItem;
        ${parentBinName ? `parentBin = app.project.rootItem.children["${parentBinName}"] || app.project.rootItem;` : ''}

        var newBin = parentBin.createBin("${name}");

        return JSON.stringify({
          success: true,
          binName: "${name}",
          binId: newBin.nodeId,
          parentBin: ${parentBinName ? `"${parentBinName}"` : '"Root"'}
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Sequence Management Implementation
  private async createSequence(name: string, presetPath?: string, width?: number, height?: number, frameRate?: number, sampleRate?: number): Promise<any> {
    const requestedSettings = {
      presetPath,
      width,
      height,
      frameRate,
      sampleRate
    };
    const hasUnsupportedSettings = Object.values(requestedSettings).some((value) => value !== undefined && value !== null);
    if (hasUnsupportedSettings) {
      return {
        success: false,
        supported: false,
        sequenceName: name,
        requestedSettings,
        error: 'create_sequence currently supports non-modal sequence creation by name only. Premiere Pro ExtendScript Project.createNewSequence(sequenceName, sequenceID) does not accept presetPath/width/height/frameRate/sampleRate; passing an empty or preset-path second argument can open the native New Sequence dialog and block the CEP bridge.',
        hint: 'Call create_sequence with only { name } for a non-modal default sequence, or create/duplicate a template sequence when exact raster/timebase settings are required.'
      };
    }

    try {
      const result: any = await this.bridge.createSequence(name);
      if (result?.success === false) {
        return {
          ...result,
          sequenceName: result.sequenceName || name
        };
      }

      return {
        success: true,
        message: `Sequence "${name}" created successfully`,
        sequenceName: name,
        ...result
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = /timeout|timed out/i.test(message);
      return {
        success: false,
        error: `Failed to create sequence: ${message}`,
        sequenceName: name,
        ...(timedOut ? {
          warning: 'Premiere may still create the sequence after this timeout. Wait for the bridge to become responsive, then run list_sequences to verify before retrying. The server intentionally does not run automatic recovery after a timeout because that can wedge the CEP bridge on Windows.'
        } : {})
      };
    }
  }

  private async duplicateSequence(sequenceId: string, newName: string): Promise<any> {
    const safeName = JSON.stringify(newName);
    const script = `
      try {
        var originalSeq = __findSequence(${JSON.stringify(sequenceId)});
        if (!originalSeq) return JSON.stringify({ success: false, error: "Sequence not found" });

        function __findItemForSequence(parent, seqId) {
          if (!parent || !parent.children) return null;
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            if (!item) continue;
            try {
              var seq = item.getSequence && item.getSequence();
              if (seq && seq.sequenceID === seqId) return item;
            } catch (_) { /* not a sequence-bearing item */ }
            if (item.type === 2 /* BIN */) {
              var nested = __findItemForSequence(item, seqId);
              if (nested) return nested;
            }
          }
          return null;
        }

        function __cloneSequenceAndResolve(sourceSequence, desiredName) {
          var beforeSequenceIds = {};
          for (var bi = 0; bi < app.project.sequences.numSequences; bi++) {
            beforeSequenceIds[String(app.project.sequences[bi].sequenceID)] = true;
          }
          var cloneResult = null;
          var cloneReturnType = null;
          try {
            cloneResult = sourceSequence.clone();
            cloneReturnType = typeof cloneResult;
          } catch (cloneError) {
            return { success: false, cloneAttempted: true, error: 'Sequence.clone failed: ' + cloneError.toString(), cloneReturnType: cloneReturnType };
          }
          var targetSequence = null;
          try {
            if (cloneResult && cloneResult.sequenceID !== undefined) targetSequence = cloneResult;
          } catch (_) { }
          if (!targetSequence) {
            var candidates = [];
            for (var ci = 0; ci < app.project.sequences.numSequences; ci++) {
              var candidate = app.project.sequences[ci];
              if (candidate && !beforeSequenceIds[String(candidate.sequenceID)]) candidates.push(candidate);
            }
            if (candidates.length !== 1) {
              var candidateIds = [];
              for (var cii = 0; cii < candidates.length; cii++) candidateIds.push(candidates[cii].sequenceID);
              return { success: false, cloneAttempted: true, error: 'Unable to identify cloned sequence after Sequence.clone()', cloneReturnType: cloneReturnType, candidateCount: candidates.length, candidateIds: candidateIds };
            }
            targetSequence = candidates[0];
          }
          var renamedAtSequence = false;
          try { targetSequence.name = desiredName; renamedAtSequence = true; } catch (_) { }
          var renamedAtItem = false;
          var targetProjectItem = __findItemForSequence(app.project.rootItem, targetSequence.sequenceID);
          if (targetProjectItem) {
            try { targetProjectItem.name = desiredName; renamedAtItem = true; } catch (_) { }
          }
          return { success: true, sequence: targetSequence, projectItem: targetProjectItem, sequenceId: targetSequence.sequenceID, cloneReturnType: cloneReturnType, renamedAtSequence: renamedAtSequence, renamedAtProjectItem: renamedAtItem };
        }

        var cloneResolution = __cloneSequenceAndResolve(originalSeq, ${safeName});
        if (!cloneResolution.success) return JSON.stringify({ success: false, error: cloneResolution.error, cloneResolution: cloneResolution });
        var newSeq = cloneResolution.sequence;
        var newItem = cloneResolution.projectItem;

        return JSON.stringify({
          success: true,
          originalSequenceId: ${JSON.stringify(sequenceId)},
          newSequenceId: newSeq.sequenceID,
          newName: ${safeName},
          newProjectItemId: newItem ? newItem.nodeId : null,
          cloneReturnType: cloneResolution.cloneReturnType,
          renamedAtSequence: cloneResolution.renamedAtSequence,
          renamedAtProjectItem: cloneResolution.renamedAtProjectItem
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async renameProjectItem(projectItemId: string, newName: string): Promise<any> {
    const safeName = JSON.stringify(newName);
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var oldName = item.name;
        item.name = ${safeName};
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          oldName: oldName,
          newName: ${safeName}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async readSequenceCaptions(sequenceId?: string): Promise<any> {
    const seqArg = sequenceId ? JSON.stringify(sequenceId) : 'null';
    const script = `
      try {
        var sequence = ${seqArg} ? __findSequence(${seqArg}) : app.project.activeSequence;
        if (${seqArg} && !sequence) {
          return JSON.stringify({
            success: false,
            supported: false,
            error: "Sequence not found by id: " + ${seqArg},
            requestedSequenceId: ${seqArg},
            captions: []
          });
        }
        if (!sequence) return JSON.stringify({ success: false, supported: false, error: "No active sequence found", captions: [] });

        // Premiere caption tracks live alongside video/audio tracks, but only some
        // builds expose real caption collections through ExtendScript:
        //   - sequence.getCaptionTracks() (newer/conditional)
        //   - sequence.captionTracks (some builds)
        // Do not scan ordinary video tracks or use clip names as caption text;
        // that would fabricate captions from edit item names.

        var tracks = [];
        var trackSource = null;
        function __collectionCount(collection) {
          if (!collection) return 0;
          if (collection.numItems !== undefined) return collection.numItems;
          if (collection.numTracks !== undefined) return collection.numTracks;
          if (collection.length !== undefined) return collection.length;
          return 0;
        }
        function __collectionItem(collection, index) {
          try { return collection[index]; } catch (_) { return null; }
        }
        try {
          if (sequence.getCaptionTracks) {
            tracks = sequence.getCaptionTracks();
            trackSource = 'sequence.getCaptionTracks';
          } else if (sequence.captionTracks) {
            tracks = sequence.captionTracks;
            trackSource = 'sequence.captionTracks';
          }
        } catch (captionTrackError) {
          return JSON.stringify({
            success: false,
            supported: false,
            error: 'Failed while reading native caption track collection: ' + captionTrackError.toString(),
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name
          });
        }

        var trackCount = __collectionCount(tracks);
        if (!trackSource) {
          return JSON.stringify({
            success: true,
            supported: false,
            message: 'This Premiere host did not expose readable native caption tracks through ExtendScript. Use exported SRT/VTT sidecars with export_captions/qc_captions/search_captions, or generate captions manually in Premiere and export a sidecar.',
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            captionReadSupported: false,
            note: 'Premiere Pro did not expose sequence.getCaptionTracks or sequence.captionTracks, so native caption cue text/timing cannot be read from this host via ExtendScript. trackCount:0 does NOT prove the sequence has no captions; parse the source SRT/VTT sidecar when cue data is required.',
            trackCount: 0,
            captionCount: 0,
            captions: []
          });
        }
        if (trackCount === 0) {
          return JSON.stringify({
            success: true,
            supported: true,
            message: 'Premiere exposed a native caption track collection, but this sequence has no caption tracks.',
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            trackSource: trackSource,
            captionReadSupported: true,
            note: '',
            trackCount: 0,
            captionCount: 0,
            captions: []
          });
        }
        var output = [];

        for (var i = 0; i < trackCount; i++) {
          var trk = __collectionItem(tracks, i);
          if (!trk) continue;
          var clips = trk.clips || trk.captions || [];
          var clipCount = clips.numItems !== undefined ? clips.numItems : (clips.length || 0);
          for (var c = 0; c < clipCount; c++) {
            var clip = clips[c];
            if (!clip) continue;
            var startSec = null;
            var endSec = null;
            try {
              if (clip.start && clip.start.seconds !== undefined) startSec = clip.start.seconds;
              else if (clip.start && clip.start.ticks) startSec = parseFloat(clip.start.ticks) / 254016000000.0;
              else if (typeof clip.startTime === 'number') startSec = clip.startTime;
            } catch (_) {}
            try {
              if (clip.end && clip.end.seconds !== undefined) endSec = clip.end.seconds;
              else if (clip.end && clip.end.ticks) endSec = parseFloat(clip.end.ticks) / 254016000000.0;
              else if (typeof clip.endTime === 'number') endSec = clip.endTime;
            } catch (_) {}

            var text = "";
            try {
              if (typeof clip.text === 'string') text = clip.text;
              else if (typeof clip.captionText === 'string') text = clip.captionText;
              else if (clip.getText && typeof clip.getText === 'function') text = String(clip.getText());
            } catch (_) {}

            output.push({
              trackIndex: i,
              start: startSec,
              end: endSec,
              text: text
            });
          }
        }

        return JSON.stringify({
          success: true,
          sequenceId: sequence.sequenceID,
          sequenceName: sequence.name,
          trackSource: trackSource,
          captionReadSupported: true,
          trackCount: trackCount,
          captionCount: output.length,
          captions: output,
          note: ''
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async removeCaptionTracks(args: RemoveCaptionTracksArgs): Promise<any> {
    const payload = JSON.stringify({
      sequenceId: args.sequenceId ?? null,
      dryRun: args.dryRun ?? true
    });
    const script = `
      (function __removeCaptionTracks() {
        try {
          var payload = ${payload};
          var sequence = payload.sequenceId ? __findSequence(payload.sequenceId) : app.project.activeSequence;
          if (payload.sequenceId && !sequence) {
            return JSON.stringify({
              success: false,
              supported: false,
              dryRun: payload.dryRun,
              mutationPlanned: false,
              error: "Sequence not found by id: " + payload.sequenceId,
              requestedSequenceId: payload.sequenceId,
              trackCount: 0,
              removedTrackCount: 0,
              tracks: []
            });
          }
          if (!sequence) return JSON.stringify({ success: false, supported: false, dryRun: payload.dryRun, mutationPlanned: false, error: "No active sequence found", trackCount: 0, removedTrackCount: 0, tracks: [] });

          function __collectionCount(collection) {
            if (!collection) return 0;
            if (collection.numItems !== undefined) return collection.numItems;
            if (collection.numTracks !== undefined) return collection.numTracks;
            if (collection.length !== undefined) return collection.length;
            return 0;
          }
          function __collectionItem(collection, index) {
            try {
              if (collection && collection[index] !== undefined) return collection[index];
            } catch (_) { }
            try {
              if (collection && typeof collection.get === "function") return collection.get(index);
            } catch (_) { }
            return null;
          }
          function __locateCaptionTrackCollection(sequence) {
            var collection = null;
            var trackSource = null;
            try {
              if (typeof sequence.getCaptionTracks === "function") {
                collection = sequence.getCaptionTracks();
                trackSource = "sequence.getCaptionTracks";
              } else if (sequence.captionTracks) {
                collection = sequence.captionTracks;
                trackSource = "sequence.captionTracks";
              }
            } catch (captionTrackError) {
              return { error: captionTrackError.toString() };
            }
            return { collection: collection, trackSource: trackSource };
          }
          function __trackRemovalMethods(collection, track) {
            var methods = [];
            if (track && typeof track.remove === "function") methods.push("track.remove");
            if (track && typeof track.delete === "function") methods.push("track.delete");
            if (collection && typeof collection.remove === "function") methods.push("collection.remove");
            if (collection && typeof collection.delete === "function") methods.push("collection.delete");
            return methods;
          }
          function __tryCallRemoval(target, methodName, args, label) {
            try {
              target[methodName].apply(target, args);
              return { success: true, method: label };
            } catch (removalError) {
              return { success: false, method: label, error: removalError.toString() };
            }
          }
          function __removeOneCaptionTrack(collection, track, index) {
            var attempts = [];
            var result = null;
            if (track && typeof track.remove === "function") {
              result = __tryCallRemoval(track, "remove", [], "track.remove()");
              if (result.success) return result;
              attempts.push(result);
            }
            if (track && typeof track.delete === "function") {
              result = __tryCallRemoval(track, "delete", [], "track.delete()");
              if (result.success) return result;
              attempts.push(result);
            }
            if (collection && typeof collection.remove === "function") {
              if (track) {
                result = __tryCallRemoval(collection, "remove", [track], "collection.remove(track)");
                if (result.success) return result;
                attempts.push(result);
              }
              result = __tryCallRemoval(collection, "remove", [index], "collection.remove(index)");
              if (result.success) return result;
              attempts.push(result);
            }
            if (collection && typeof collection.delete === "function") {
              if (track) {
                result = __tryCallRemoval(collection, "delete", [track], "collection.delete(track)");
                if (result.success) return result;
                attempts.push(result);
              }
              result = __tryCallRemoval(collection, "delete", [index], "collection.delete(index)");
              if (result.success) return result;
              attempts.push(result);
            }
            return { success: false, error: "No exposed caption track remove/delete method succeeded", attempts: attempts };
          }

          var located = __locateCaptionTrackCollection(sequence);
          if (located.error) {
            return JSON.stringify({
              success: false,
              supported: false,
              dryRun: payload.dryRun,
              mutationPlanned: false,
              error: "Failed while locating native caption track collection: " + located.error,
              sequenceId: sequence.sequenceID,
              sequenceName: sequence.name
            });
          }
          if (!located.trackSource) {
            return JSON.stringify({
              success: true,
              supported: false,
              dryRun: payload.dryRun,
              mutationPlanned: false,
              message: "This Premiere host did not expose native caption tracks through sequence.getCaptionTracks or sequence.captionTracks.",
              sequenceId: sequence.sequenceID,
              sequenceName: sequence.name,
              trackCount: 0,
              removedTrackCount: 0,
              tracks: []
            });
          }

          var tracks = located.collection;
          var trackCount = __collectionCount(tracks);
          var trackSummaries = [];
          var publicRemovalApiAvailable = false;
          for (var i = 0; i < trackCount; i++) {
            var track = __collectionItem(tracks, i);
            var methods = __trackRemovalMethods(tracks, track);
            if (methods.length > 0) publicRemovalApiAvailable = true;
            trackSummaries.push({ index: i, removalMethods: methods });
          }

          if (payload.dryRun) {
            return JSON.stringify({
              success: true,
              supported: true,
              dryRun: true,
              mutationPlanned: false,
              sequenceId: sequence.sequenceID,
              sequenceName: sequence.name,
              trackSource: located.trackSource,
              trackCount: trackCount,
              removedTrackCount: 0,
              tracks: trackSummaries,
              publicRemovalApiAvailable: publicRemovalApiAvailable
            });
          }

          if (trackCount === 0) {
            return JSON.stringify({
              success: true,
              supported: true,
              dryRun: false,
              mutationPlanned: false,
              sequenceId: sequence.sequenceID,
              sequenceName: sequence.name,
              trackSource: located.trackSource,
              trackCount: 0,
              removedTrackCount: 0,
              tracks: []
            });
          }

          if (!publicRemovalApiAvailable) {
            return JSON.stringify({
              success: false,
              supported: false,
              dryRun: false,
              mutationPlanned: false,
              error: "Premiere exposed caption tracks, but no public caption track remove/delete API was available on the tracks or collection.",
              sequenceId: sequence.sequenceID,
              sequenceName: sequence.name,
              trackSource: located.trackSource,
              trackCount: trackCount,
              removedTrackCount: 0,
              tracks: trackSummaries
            });
          }

          var removedTracks = [];
          var failedTracks = [];
          for (var removeIndex = trackCount - 1; removeIndex >= 0; removeIndex--) {
            var captionTrack = __collectionItem(tracks, removeIndex);
            var removal = __removeOneCaptionTrack(tracks, captionTrack, removeIndex);
            if (removal.success) {
              removedTracks.push({ index: removeIndex, method: removal.method });
            } else {
              failedTracks.push({ index: removeIndex, error: removal.error, attempts: removal.attempts || [] });
            }
          }

          return JSON.stringify({
            success: failedTracks.length === 0,
            supported: true,
            dryRun: false,
            mutationPlanned: true,
            sequenceId: sequence.sequenceID,
            sequenceName: sequence.name,
            trackSource: located.trackSource,
            trackCount: trackCount,
            removedTrackCount: removedTracks.length,
            removedTracks: removedTracks,
            failedTracks: failedTracks,
            afterTrackCount: __collectionCount(tracks)
          });
        } catch (e) {
          return JSON.stringify({ success: false, dryRun: false, mutationPlanned: true, error: e.toString() });
        }
      })();
    `;
    return await this.bridge.executeScript(script);
  }

  private captionlessDuplicateName(sequenceId: string, newName?: string): string {
    return newName ?? `${sequenceId} without captions`;
  }

  private async duplicateSequenceWithoutCaptions(args: DuplicateSequenceWithoutCaptionsArgs): Promise<any> {
    const duplicateName = this.captionlessDuplicateName(args.sequenceId, args.newName);
    const dryRun = args.dryRun ?? true;

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        mutationPlanned: false,
        sequenceId: args.sequenceId,
        intendedDuplicateName: duplicateName,
        operations: [
          { type: 'duplicateSequence', sourceSequenceId: args.sequenceId, newName: duplicateName },
          { type: 'removeCaptionTracks', dryRun: false },
          { type: 'readSequenceCaptions' }
        ]
      };
    }

    const duplicateResult = await this.duplicateSequence(args.sequenceId, duplicateName);
    if (!duplicateResult?.success) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: false,
        sequenceId: args.sequenceId,
        intendedDuplicateName: duplicateName,
        error: duplicateResult?.error ?? 'Failed to duplicate sequence before caption cleanup',
        duplicateResult
      };
    }

    const duplicateSequenceIdValue = duplicateResult.newSequenceId ?? duplicateResult.sequenceId ?? duplicateResult.id;
    if (duplicateSequenceIdValue === undefined || duplicateSequenceIdValue === null || String(duplicateSequenceIdValue).length === 0) {
      return {
        success: false,
        dryRun: false,
        mutationPlanned: true,
        sequenceId: args.sequenceId,
        intendedDuplicateName: duplicateName,
        error: 'Sequence duplicated, but no duplicated sequence ID was returned for caption cleanup',
        duplicateResult
      };
    }

    const duplicateSequenceId = String(duplicateSequenceIdValue);
    const removeCaptionTracksResult = await this.removeCaptionTracks({ sequenceId: duplicateSequenceId, dryRun: false });
    const readback = await this.readSequenceCaptions(duplicateSequenceId);
    const cleanupSucceeded = removeCaptionTracksResult?.success === true && removeCaptionTracksResult?.supported !== false;
    const readbackSucceeded = readback?.success === true;

    return {
      success: cleanupSucceeded && readbackSucceeded,
      dryRun: false,
      mutationPlanned: true,
      sourceSequenceId: args.sequenceId,
      newSequenceId: duplicateSequenceId,
      newName: duplicateName,
      duplicateResult,
      removeCaptionTracksResult,
      readback,
      ...(cleanupSucceeded && readbackSucceeded ? {} : {
        error: removeCaptionTracksResult?.error ?? readback?.error ?? 'Caption cleanup duplicate completed with unsupported or failed cleanup/readback'
      })
    };
  }

  private async deleteSequence(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        var sequenceName = sequence.name;
        app.project.deleteSequence(sequence);
        return JSON.stringify({
          success: true,
          message: "Sequence deleted successfully",
          deletedSequenceId: "${sequenceId}",
          deletedSequenceName: sequenceName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Timeline Operations Implementation
  private async addToTimeline(sequenceId: string, projectItemId: string, trackIndex: number, time: number, insertMode = 'overwrite', linkAudio: boolean = true): Promise<any> {
    try {
      const result: any = await this.bridge.addToTimeline(sequenceId, projectItemId, trackIndex, time, linkAudio);
      if (!result.success) {
        return {
          ...result,
          sequenceId: sequenceId,
          projectItemId: projectItemId,
          trackIndex: trackIndex,
          time: time,
          insertMode: insertMode,
          linkAudio: linkAudio
        };
      }
      return {
        success: true,
        message: `Clip added to timeline successfully`,
        sequenceId: sequenceId,
        projectItemId: projectItemId,
        trackIndex: trackIndex,
        time: time,
        insertMode: insertMode,
        linkAudio: linkAudio,
        ...result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to add clip to timeline: ${error instanceof Error ? error.message : String(error)}`,
        sequenceId: sequenceId,
        projectItemId: projectItemId,
        trackIndex: trackIndex,
        time: time
      };
    }
  }

  private async removeFromTimeline(clipId: string, sequenceId?: string, deleteMode = 'ripple'): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)}, ${sequenceId ? JSON.stringify(sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${sequenceId ? JSON.stringify(`Clip not found in sequence: ${sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;
        var clipName = clip.name;
        var isRipple = ${JSON.stringify(deleteMode)} === "ripple";
        clip.remove(isRipple, true);
        return JSON.stringify({
          success: true,
          message: "Clip removed from timeline",
          clipId: ${JSON.stringify(clipId)},
          clipName: clipName,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          deleteMode: ${JSON.stringify(deleteMode)}
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async moveClip(clipId: string, newTime: number, _newTrackIndex?: number): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldTime = clip.start.seconds;
        var shiftAmount = ${newTime} - oldTime;
        clip.move(shiftAmount);
        return JSON.stringify({
          success: true,
          message: "Clip moved successfully",
          clipId: "${clipId}",
          oldTime: oldTime,
          newTime: ${newTime},
          trackIndex: info.trackIndex
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async trimClip(clipId: string, inPoint?: number, outPoint?: number, duration?: number): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var oldInPoint = clip.inPoint.seconds;
        var oldOutPoint = clip.outPoint.seconds;
        var oldDuration = clip.duration.seconds;
        ${inPoint !== undefined ? `clip.inPoint = new Time("${inPoint}s");` : ''}
        ${outPoint !== undefined ? `clip.outPoint = new Time("${outPoint}s");` : ''}
        ${duration !== undefined ? `clip.outPoint = new Time(clip.inPoint.seconds + ${duration});` : ''}
        return JSON.stringify({
          success: true,
          message: "Clip trimmed successfully",
          clipId: "${clipId}",
          oldInPoint: oldInPoint,
          oldOutPoint: oldOutPoint,
          oldDuration: oldDuration,
          newInPoint: clip.inPoint.seconds,
          newOutPoint: clip.outPoint.seconds,
          newDuration: clip.duration.seconds
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async splitClip(clipId: string, splitTime: number): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var splitSeconds = info.clip.start.seconds + ${splitTime};
        var seq = app.project.activeSequence;
        var fps = seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var totalFrames = Math.round(splitSeconds * fps);
        var hours = Math.floor(totalFrames / (fps * 3600));
        var mins = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
        var secs = Math.floor((totalFrames % (fps * 60)) / fps);
        var frames = Math.round(totalFrames % fps);
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var tc = pad(hours) + ":" + pad(mins) + ":" + pad(secs) + ":" + pad(frames);
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        qeTrack.razor(tc);
        return JSON.stringify({ success: true, message: "Clip split at " + tc, splitTime: ${splitTime}, timecode: tc });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async razorTimelineAtTime(sequenceId?: string, time?: number, videoTrackIndices?: number[], audioTrackIndices?: number[]): Promise<any> {
    const normalizedTime = time ?? 0;
    const videoIndices = videoTrackIndices ?? [];
    const audioIndices = audioTrackIndices ?? [];

    const script = `
      try {
        app.enableQE();
        var sequence = ${sequenceId ? `__findSequence(${JSON.stringify(sequenceId)})` : 'app.project.activeSequence'};
        if (!sequence) return JSON.stringify({ success: false, error: ${sequenceId ? `"Sequence not found by id: ${sequenceId}"` : '"No active sequence"'} });

        if (app.project.activeSequence && app.project.activeSequence.sequenceID !== sequence.sequenceID) {
          app.project.openSequence(sequence.sequenceID);
        }

        var activeSequence = app.project.activeSequence;
        if (!activeSequence || activeSequence.sequenceID !== sequence.sequenceID) {
          return JSON.stringify({ success: false, error: "Unable to activate requested sequence for razor cut" });
        }

        var fps = activeSequence.timebase ? (254016000000 / parseInt(activeSequence.timebase, 10)) : 30;
        var totalFrames = Math.round(${normalizedTime} * fps);
        var hours = Math.floor(totalFrames / (fps * 3600));
        var mins = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
        var secs = Math.floor((totalFrames % (fps * 60)) / fps);
        var frames = Math.round(totalFrames % fps);
        function pad(n) { return n < 10 ? "0" + n : "" + n; }
        var tc = pad(hours) + ":" + pad(mins) + ":" + pad(secs) + ":" + pad(frames);

        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ success: false, error: "QE active sequence unavailable" });

        function buildIndices(count, requested) {
          if (!requested || requested.length === 0) {
            var all = [];
            for (var idx = 0; idx < count; idx++) all.push(idx);
            return all;
          }
          return requested;
        }

        var requestedVideo = ${JSON.stringify(videoIndices)};
        var requestedAudio = ${JSON.stringify(audioIndices)};
        var finalVideo = buildIndices(activeSequence.videoTracks.numTracks, requestedVideo);
        var finalAudio = buildIndices(activeSequence.audioTracks.numTracks, requestedAudio);
        var cutVideoTracks = [];
        var cutAudioTracks = [];
        var skippedVideoTracks = [];
        var skippedAudioTracks = [];

        for (var i = 0; i < finalVideo.length; i++) {
          var videoIndex = finalVideo[i];
          if (videoIndex < 0 || videoIndex >= activeSequence.videoTracks.numTracks) {
            skippedVideoTracks.push({ index: videoIndex, reason: "Video track index out of range" });
            continue;
          }
          var qeVideoTrack = qeSeq.getVideoTrackAt(videoIndex);
          if (!qeVideoTrack) {
            skippedVideoTracks.push({ index: videoIndex, reason: "QE video track not found" });
            continue;
          }
          qeVideoTrack.razor(tc);
          cutVideoTracks.push(videoIndex);
        }

        for (var j = 0; j < finalAudio.length; j++) {
          var audioIndex = finalAudio[j];
          if (audioIndex < 0 || audioIndex >= activeSequence.audioTracks.numTracks) {
            skippedAudioTracks.push({ index: audioIndex, reason: "Audio track index out of range" });
            continue;
          }
          var qeAudioTrack = qeSeq.getAudioTrackAt(audioIndex);
          if (!qeAudioTrack) {
            skippedAudioTracks.push({ index: audioIndex, reason: "QE audio track not found" });
            continue;
          }
          qeAudioTrack.razor(tc);
          cutAudioTracks.push(audioIndex);
        }

        return JSON.stringify({
          success: true,
          message: "Timeline razored at " + tc,
          sequenceId: activeSequence.sequenceID,
          sequenceName: activeSequence.name,
          time: ${normalizedTime},
          timecode: tc,
          cutVideoTracks: cutVideoTracks,
          cutAudioTracks: cutAudioTracks,
          skippedVideoTracks: skippedVideoTracks,
          skippedAudioTracks: skippedAudioTracks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Effects and Transitions Implementation
  // FIX vs upstream: upstream silently ignored `parameters` (typed as `_parameters`).
  // This version:
  //   1. Adds the effect (current behavior)
  //   2. Locates the newly added component (matched by index = before+0; effects append)
  //   3. Dumps that component's properties (displayName + current value) so callers can see
  //      exactly which params are settable via flat property access (some effects hide their
  //      real params behind "Custom Setup / Editar..." dialogs and won't be settable this way)
  //   4. For each entry in `parameters`, attempts to set the matching property by displayName
  //      (exact match first, then case-insensitive whitespace-stripped match)
  //   5. Returns dump + per-param result so debugging is one round-trip
  private async listClipEffects(clipId: string, sequenceId?: string): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)}, ${sequenceId ? JSON.stringify(sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${sequenceId ? JSON.stringify(`Clip not found in sequence: ${sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;

        function __serializeEffectValue(value) {
          if (value === null || value === undefined) return value;
          var valueType = typeof value;
          if (valueType === "number" || valueType === "string" || valueType === "boolean") return value;
          try {
            if (value.seconds !== undefined || value.ticks !== undefined) {
              return {
                seconds: value.seconds !== undefined ? value.seconds : null,
                ticks: value.ticks !== undefined ? String(value.ticks) : null
              };
            }
          } catch (_) {}
          try {
            if (value.length !== undefined && typeof value !== "string") {
              var arr = [];
              for (var vi = 0; vi < value.length; vi++) arr.push(__serializeEffectValue(value[vi]));
              return arr;
            }
          } catch (_) {}
          try { return String(value); } catch (_) { return "<unserializable>"; }
        }

        function __safeGetPropertyValue(prop) {
          var result = {
            available: false,
            value: null,
            valueType: null,
            error: null
          };
          try {
            var raw = prop.getValue();
            result.available = true;
            result.valueType = raw === null ? "null" : typeof raw;
            result.value = __serializeEffectValue(raw);
          } catch (valueError) {
            result.error = valueError.toString();
          }
          return result;
        }

        function __safeBool(methodOwner, methodName) {
          try {
            if (methodOwner && typeof methodOwner[methodName] === "function") return !!methodOwner[methodName]();
          } catch (_) {}
          return null;
        }

        function __safeKeyframeCount(prop) {
          try {
            if (prop && typeof prop.getKeys === "function") {
              var keys = prop.getKeys();
              if (!keys) return 0;
              if (keys.numItems !== undefined) return keys.numItems;
              if (keys.length !== undefined) return keys.length;
            }
          } catch (_) {}
          return null;
        }

        var effects = [];
        var componentCount = clip.components && clip.components.numItems !== undefined ? clip.components.numItems : 0;
        for (var ci = 0; ci < componentCount; ci++) {
          var comp = clip.components[ci];
          if (!comp) continue;
          var props = [];
          var propertyCount = 0;
          try { propertyCount = comp.properties && comp.properties.numItems !== undefined ? comp.properties.numItems : 0; } catch (_) { propertyCount = 0; }
          for (var pi = 0; pi < propertyCount; pi++) {
            var prop = comp.properties[pi];
            var propValue = __safeGetPropertyValue(prop);
            props.push({
              propertyIndex: pi,
              displayName: prop && prop.displayName !== undefined ? String(prop.displayName) : "",
              matchName: prop && prop.matchName !== undefined ? String(prop.matchName) : null,
              value: propValue.value,
              valueType: propValue.valueType,
              valueAvailable: propValue.available,
              valueError: propValue.error,
              supportsKeyframes: __safeBool(prop, "areKeyframesSupported"),
              isTimeVarying: __safeBool(prop, "isTimeVarying"),
              keyframeCount: __safeKeyframeCount(prop)
            });
          }
          effects.push({
            componentIndex: ci,
            displayName: comp.displayName !== undefined ? String(comp.displayName) : "",
            matchName: comp.matchName !== undefined ? String(comp.matchName) : null,
            propertyCount: propertyCount,
            properties: props
          });
        }

        return JSON.stringify({
          success: true,
          clipId: ${JSON.stringify(clipId)},
          clipName: clip.name,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex,
          effects: effects,
          count: effects.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async setEffectParameter(args: SetEffectParameterArgs): Promise<any> {
    const selectorsJson = literalForExtendScript({
      componentName: args.componentName ?? null,
      componentMatchName: args.componentMatchName ?? null,
      componentIndex: args.componentIndex ?? null,
      propertyName: args.propertyName ?? null,
      propertyMatchName: args.propertyMatchName ?? null,
      propertyIndex: args.propertyIndex ?? null
    });
    const valueJson = literalForExtendScript(args.value);
    if (valueJson === 'undefined') {
      return { success: false, error: 'value must be JSON-serializable' };
    }
    const clipIdLiteral = literalForExtendScript(args.clipId);
    const sequenceIdLiteral = args.sequenceId ? literalForExtendScript(args.sequenceId) : 'null';
    const notFoundErrorLiteral = literalForExtendScript(args.sequenceId ? `Clip not found in sequence: ${args.sequenceId}` : 'Clip not found');

    const script = `
      try {
        var selectors = ${selectorsJson};
        var requestedValue = ${valueJson};
        var info = __findClip(${clipIdLiteral}, ${sequenceIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: ${notFoundErrorLiteral} });
        var clip = info.clip;

        function __safeString(value) {
          try {
            if (value === null || value === undefined) return null;
            return String(value);
          } catch (_) {
            return null;
          }
        }

        function __normalizeName(value) {
          return String(value).toLowerCase().replace(/[\\s_-]+/g, "");
        }

        function __namesEqual(actual, expected) {
          var actualText = __safeString(actual);
          var expectedText = __safeString(expected);
          if (actualText === null || expectedText === null) return false;
          return actualText === expectedText || __normalizeName(actualText) === __normalizeName(expectedText);
        }

        function __serializeEffectValue(value) {
          if (value === null || value === undefined) return value;
          var valueType = typeof value;
          if (valueType === "number" || valueType === "string" || valueType === "boolean") return value;
          try {
            if (value.seconds !== undefined || value.ticks !== undefined) {
              return {
                seconds: value.seconds !== undefined ? value.seconds : null,
                ticks: value.ticks !== undefined ? String(value.ticks) : null
              };
            }
          } catch (_) {}
          try {
            if (value.length !== undefined && typeof value !== "string") {
              var arr = [];
              for (var vi = 0; vi < value.length; vi++) arr.push(__serializeEffectValue(value[vi]));
              return arr;
            }
          } catch (_) {}
          try { return String(value); } catch (_) { return "<unserializable>"; }
        }

        function __safeGetPropertyValue(prop) {
          var result = { available: false, value: null, valueType: null, error: null };
          try {
            var raw = prop.getValue();
            result.available = true;
            result.valueType = raw === null ? "null" : typeof raw;
            result.value = __serializeEffectValue(raw);
          } catch (valueError) {
            result.error = valueError.toString();
          }
          return result;
        }

        function __componentSummary(component, componentIndex) {
          return {
            componentIndex: componentIndex,
            displayName: component && component.displayName !== undefined ? String(component.displayName) : "",
            matchName: component && component.matchName !== undefined ? String(component.matchName) : null,
            propertyCount: component && component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0
          };
        }

        function __propertySummary(prop, propertyIndex) {
          return {
            propertyIndex: propertyIndex,
            displayName: prop && prop.displayName !== undefined ? String(prop.displayName) : "",
            matchName: prop && prop.matchName !== undefined ? String(prop.matchName) : null
          };
        }

        function __availableComponents(clipToInspect) {
          var components = [];
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          for (var ci = 0; ci < componentCount; ci++) {
            components.push(__componentSummary(clipToInspect.components[ci], ci));
          }
          return components;
        }

        function __availableProperties(component) {
          var properties = [];
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          for (var pi = 0; pi < propertyCount; pi++) {
            properties.push(__propertySummary(component.properties[pi], pi));
          }
          return properties;
        }

        function __findComponent(clipToInspect, componentSelectors) {
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          if (componentSelectors.componentIndex !== null && componentSelectors.componentIndex !== undefined) {
            var requestedComponentIndex = Number(componentSelectors.componentIndex);
            if (requestedComponentIndex >= 0 && requestedComponentIndex < componentCount) {
              return { component: clipToInspect.components[requestedComponentIndex], componentIndex: requestedComponentIndex, strategy: "componentIndex" };
            }
            return { error: "componentIndex out of range", availableComponents: __availableComponents(clipToInspect) };
          }
          for (var ci = 0; ci < componentCount; ci++) {
            var component = clipToInspect.components[ci];
            if (componentSelectors.componentMatchName !== null && componentSelectors.componentMatchName !== undefined) {
              if (__namesEqual(component.matchName, componentSelectors.componentMatchName)) {
                return { component: component, componentIndex: ci, strategy: "componentMatchName" };
              }
            }
            if (componentSelectors.componentName !== null && componentSelectors.componentName !== undefined) {
              if (__namesEqual(component.displayName, componentSelectors.componentName) || __namesEqual(component.matchName, componentSelectors.componentName)) {
                return { component: component, componentIndex: ci, strategy: "componentName" };
              }
            }
          }
          return { error: "Component not found", availableComponents: __availableComponents(clipToInspect) };
        }

        function __findEffectProperty(component, propertySelectors) {
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          if (propertySelectors.propertyIndex !== null && propertySelectors.propertyIndex !== undefined) {
            var requestedPropertyIndex = Number(propertySelectors.propertyIndex);
            if (requestedPropertyIndex >= 0 && requestedPropertyIndex < propertyCount) {
              return { property: component.properties[requestedPropertyIndex], propertyIndex: requestedPropertyIndex, strategy: "propertyIndex" };
            }
            return { error: "propertyIndex out of range", availableProperties: __availableProperties(component) };
          }
          for (var pi = 0; pi < propertyCount; pi++) {
            var prop = component.properties[pi];
            if (propertySelectors.propertyMatchName !== null && propertySelectors.propertyMatchName !== undefined) {
              if (__namesEqual(prop.matchName, propertySelectors.propertyMatchName)) {
                return { property: prop, propertyIndex: pi, strategy: "propertyMatchName" };
              }
            }
            if (propertySelectors.propertyName !== null && propertySelectors.propertyName !== undefined) {
              if (__namesEqual(prop.displayName, propertySelectors.propertyName) || __namesEqual(prop.matchName, propertySelectors.propertyName)) {
                return { property: prop, propertyIndex: pi, strategy: "propertyName" };
              }
            }
          }
          return { error: "Property not found", availableProperties: __availableProperties(component) };
        }

        function __valuesDiffer(valueAfter, requested) {
          try {
            if (typeof valueAfter === "number" && typeof requested === "number") {
              return Math.abs(valueAfter - requested) > 0.0001;
            }
            return JSON.stringify(valueAfter) !== JSON.stringify(requested);
          } catch (_) {
            return null;
          }
        }

        var componentResult = __findComponent(clip, selectors);
        if (!componentResult.component) {
          return JSON.stringify({
            success: false,
            error: componentResult.error || "Component not found",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            selectors: selectors,
            availableComponents: componentResult.availableComponents || []
          });
        }

        var propertyResult = __findEffectProperty(componentResult.component, selectors);
        if (!propertyResult.property) {
          return JSON.stringify({
            success: false,
            error: propertyResult.error || "Property not found",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            selectors: selectors,
            availableProperties: propertyResult.availableProperties || []
          });
        }

        var valueBeforeResult = __safeGetPropertyValue(propertyResult.property);
        try {
          propertyResult.property.setValue(requestedValue, true);
        } catch (setError) {
          return JSON.stringify({
            success: false,
            error: "setValue threw: " + setError.toString(),
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            property: __propertySummary(propertyResult.property, propertyResult.propertyIndex),
            propertyStrategy: propertyResult.strategy,
            valueBefore: valueBeforeResult.value,
            valueBeforeAvailable: valueBeforeResult.available,
            valueRequested: requestedValue
          });
        }

        var valueAfterResult = __safeGetPropertyValue(propertyResult.property);
        return JSON.stringify({
          success: true,
          message: "Effect parameter set",
          clipId: ${literalForExtendScript(args.clipId)},
          clipName: clip.name,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex,
          component: __componentSummary(componentResult.component, componentResult.componentIndex),
          componentStrategy: componentResult.strategy,
          property: __propertySummary(propertyResult.property, propertyResult.propertyIndex),
          propertyStrategy: propertyResult.strategy,
          valueBefore: valueBeforeResult.value,
          valueBeforeAvailable: valueBeforeResult.available,
          valueBeforeError: valueBeforeResult.error,
          valueRequested: requestedValue,
          valueAfter: valueAfterResult.value,
          valueAfterAvailable: valueAfterResult.available,
          valueAfterError: valueAfterResult.error,
          clamped: valueAfterResult.available ? __valuesDiffer(valueAfterResult.value, requestedValue) : null
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async setClipOpacity(clipId: string, opacity: number, sequenceId?: string): Promise<any> {
    const args: SetEffectParameterArgs = {
      clipId,
      componentName: 'Opacity',
      propertyName: 'Opacity',
      value: opacity
    };
    if (sequenceId !== undefined) args.sequenceId = sequenceId;
    return await this.setEffectParameter(args);
  }

  private async setClipBlendMode(clipId: string, blendMode: number, blendModePropertyIndex = 1, sequenceId?: string): Promise<any> {
    const args: SetEffectParameterArgs = {
      clipId,
      componentName: 'Opacity',
      propertyIndex: blendModePropertyIndex,
      value: blendMode
    };
    if (sequenceId !== undefined) args.sequenceId = sequenceId;
    return await this.setEffectParameter(args);
  }

  private async setClipScale(clipId: string, scale: number, sequenceId?: string): Promise<any> {
    const args: SetEffectParameterArgs = {
      clipId,
      componentName: 'Motion',
      propertyName: 'Scale',
      value: scale
    };
    if (sequenceId !== undefined) args.sequenceId = sequenceId;
    return await this.setEffectParameter(args);
  }

  private async setClipScaleMode(args: SetClipScaleModeArgs): Promise<any> {
    const dimensionKeys: Array<keyof Pick<SetClipScaleModeArgs, 'sourceWidth' | 'sourceHeight' | 'sequenceWidth' | 'sequenceHeight'>> = [
      'sourceWidth',
      'sourceHeight',
      'sequenceWidth',
      'sequenceHeight'
    ];
    const missingDimensions = dimensionKeys.filter((key) => args[key] === undefined);
    if (missingDimensions.length > 0) {
      return {
        success: false,
        supported: false,
        mutationPlanned: false,
        clipId: args.clipId,
        sequenceId: args.sequenceId ?? null,
        mode: args.mode,
        missingDimensions,
        error: `set_clip_scale_mode requires explicit sourceWidth, sourceHeight, sequenceWidth, and sequenceHeight. Missing: ${missingDimensions.join(', ')}. Dimensions are not guessed from Premiere metadata.`
      };
    }

    const sourceWidth = args.sourceWidth as number;
    const sourceHeight = args.sourceHeight as number;
    const sequenceWidth = args.sequenceWidth as number;
    const sequenceHeight = args.sequenceHeight as number;
    const widthScale = (sequenceWidth / sourceWidth) * 100;
    const heightScale = (sequenceHeight / sourceHeight) * 100;
    const properties: BatchClipPropertiesArgs['properties'] = args.mode === 'stretch'
      ? {
          uniformScale: false,
          scale: heightScale,
          scaleWidth: widthScale
        }
      : {
          uniformScale: true,
          scale: args.mode === 'fit' ? Math.min(widthScale, heightScale) : Math.max(widthScale, heightScale)
        };

    const batchArgs: BatchClipPropertiesArgs = {
      clipId: args.clipId,
      properties
    };
    if (args.sequenceId !== undefined) batchArgs.sequenceId = args.sequenceId;

    const result = await this.batchSetClipProperties(batchArgs);
    return {
      ...result,
      mode: args.mode,
      delegatedTool: 'batch_set_clip_properties',
      computedScaleMode: {
        sourceWidth,
        sourceHeight,
        sequenceWidth,
        sequenceHeight,
        widthScale,
        heightScale,
        properties
      }
    };
  }

  private async setClipPosition(clipId: string, x: number, y: number, sequenceId?: string): Promise<any> {
    const args: SetEffectParameterArgs = {
      clipId,
      componentName: 'Motion',
      propertyName: 'Position',
      value: [x, y]
    };
    if (sequenceId !== undefined) args.sequenceId = sequenceId;
    return await this.setEffectParameter(args);
  }

  private buildBatchClipPropertyOperations(properties: BatchClipPropertiesArgs['properties']): BatchClipPropertyOperation[] {
    const operations: BatchClipPropertyOperation[] = [];
    const addProperty = (label: string, componentName: string, propertyName: string, value: any): void => {
      operations.push({ label, componentName, propertyName, value });
    };
    const addPropertyByIndex = (label: string, componentName: string, propertyIndex: number, value: any): void => {
      operations.push({ label, componentName, propertyIndex, value });
    };

    if (properties.opacity !== undefined) addProperty('opacity', 'Opacity', 'Opacity', properties.opacity);
    if (properties.blendMode !== undefined) addPropertyByIndex('blendMode', 'Opacity', properties.blendModePropertyIndex ?? 1, properties.blendMode);
    if (properties.scale !== undefined) addProperty('scale', 'Motion', 'Scale', properties.scale);
    if (properties.scaleWidth !== undefined) addProperty('scaleWidth', 'Motion', 'Scale Width', properties.scaleWidth);
    if (properties.uniformScale !== undefined) addProperty('uniformScale', 'Motion', 'Uniform Scale', properties.uniformScale);
    if (properties.position !== undefined) addProperty('position', 'Motion', 'Position', [properties.position.x, properties.position.y]);
    if (properties.rotation !== undefined) addProperty('rotation', 'Motion', 'Rotation', properties.rotation);
    if (properties.anchorPoint !== undefined) addProperty('anchorPoint', 'Motion', 'Anchor Point', [properties.anchorPoint.x, properties.anchorPoint.y]);
    if (properties.antiFlickerFilter !== undefined) addProperty('antiFlickerFilter', 'Motion', 'Anti-flicker Filter', properties.antiFlickerFilter);
    if (properties.crop?.left !== undefined) addProperty('cropLeft', 'Motion', 'Crop Left', properties.crop.left);
    if (properties.crop?.top !== undefined) addProperty('cropTop', 'Motion', 'Crop Top', properties.crop.top);
    if (properties.crop?.right !== undefined) addProperty('cropRight', 'Motion', 'Crop Right', properties.crop.right);
    if (properties.crop?.bottom !== undefined) addProperty('cropBottom', 'Motion', 'Crop Bottom', properties.crop.bottom);

    return operations;
  }

  private async batchSetClipProperties(args: BatchClipPropertiesArgs): Promise<any> {
    const operations = this.buildBatchClipPropertyOperations(args.properties);
    const speedSettings = args.properties.speed !== undefined
      ? {
          percent: args.properties.speed.percent,
          maintainAudioPitch: args.properties.speed.maintainAudioPitch ?? true
        }
      : null;
    const operationsJson = literalForExtendScript(operations);
    const speedSettingsJson = literalForExtendScript(speedSettings);
    if (operationsJson === 'undefined' || speedSettingsJson === 'undefined') {
      return { success: false, error: 'Batch clip properties must be JSON-serializable' };
    }
    if (operations.length === 0 && speedSettings === null) {
      return { success: false, error: 'Provide at least one clip property to set' };
    }

    const script = `
      try {
        var operations = ${operationsJson};
        var speedSettings = ${speedSettingsJson};
        var info = __findClip(${literalForExtendScript(args.clipId)}, ${args.sequenceId ? literalForExtendScript(args.sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${args.sequenceId ? literalForExtendScript(`Clip not found in sequence: ${args.sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;

        function __safeString(value) {
          try {
            if (value === null || value === undefined) return null;
            return String(value);
          } catch (_) {
            return null;
          }
        }

        function __normalizeName(value) {
          return String(value).toLowerCase().replace(/[\\s_-]+/g, "");
        }

        function __namesEqual(actual, expected) {
          var actualText = __safeString(actual);
          var expectedText = __safeString(expected);
          if (actualText === null || expectedText === null) return false;
          return actualText === expectedText || __normalizeName(actualText) === __normalizeName(expectedText);
        }

        function __serializeEffectValue(value) {
          if (value === null || value === undefined) return value;
          var valueType = typeof value;
          if (valueType === "number" || valueType === "string" || valueType === "boolean") return value;
          try {
            if (value.seconds !== undefined || value.ticks !== undefined) {
              return {
                seconds: value.seconds !== undefined ? value.seconds : null,
                ticks: value.ticks !== undefined ? String(value.ticks) : null
              };
            }
          } catch (_) {}
          try {
            if (value.length !== undefined && typeof value !== "string") {
              var arr = [];
              for (var vi = 0; vi < value.length; vi++) arr.push(__serializeEffectValue(value[vi]));
              return arr;
            }
          } catch (_) {}
          try { return String(value); } catch (_) { return "<unserializable>"; }
        }

        function __safeGetPropertyValue(prop) {
          var result = { available: false, value: null, valueType: null, error: null };
          try {
            var raw = prop.getValue();
            result.available = true;
            result.valueType = raw === null ? "null" : typeof raw;
            result.value = __serializeEffectValue(raw);
          } catch (valueError) {
            result.error = valueError.toString();
          }
          return result;
        }

        function __componentSummary(component, componentIndex) {
          return {
            componentIndex: componentIndex,
            displayName: component && component.displayName !== undefined ? String(component.displayName) : "",
            matchName: component && component.matchName !== undefined ? String(component.matchName) : null,
            propertyCount: component && component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0
          };
        }

        function __propertySummary(prop, propertyIndex) {
          return {
            propertyIndex: propertyIndex,
            displayName: prop && prop.displayName !== undefined ? String(prop.displayName) : "",
            matchName: prop && prop.matchName !== undefined ? String(prop.matchName) : null
          };
        }

        function __availableComponents(clipToInspect) {
          var components = [];
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          for (var ci = 0; ci < componentCount; ci++) components.push(__componentSummary(clipToInspect.components[ci], ci));
          return components;
        }

        function __availableProperties(component) {
          var properties = [];
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          for (var pi = 0; pi < propertyCount; pi++) properties.push(__propertySummary(component.properties[pi], pi));
          return properties;
        }

        function __findComponent(clipToInspect, componentName) {
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          for (var ci = 0; ci < componentCount; ci++) {
            var component = clipToInspect.components[ci];
            if (__namesEqual(component.displayName, componentName) || __namesEqual(component.matchName, componentName)) {
              return { component: component, componentIndex: ci, strategy: "componentName" };
            }
          }
          return { error: "Component not found", availableComponents: __availableComponents(clipToInspect) };
        }

        function __findEffectProperty(component, operation) {
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          if (operation.propertyIndex !== null && operation.propertyIndex !== undefined) {
            var requestedPropertyIndex = Number(operation.propertyIndex);
            if (requestedPropertyIndex >= 0 && requestedPropertyIndex < propertyCount) {
              return { property: component.properties[requestedPropertyIndex], propertyIndex: requestedPropertyIndex, strategy: "propertyIndex" };
            }
            return { error: "propertyIndex out of range", availableProperties: __availableProperties(component) };
          }
          for (var pi = 0; pi < propertyCount; pi++) {
            var prop = component.properties[pi];
            if (__namesEqual(prop.displayName, operation.propertyName) || __namesEqual(prop.matchName, operation.propertyName)) {
              return { property: prop, propertyIndex: pi, strategy: "propertyName" };
            }
          }
          return { error: "Property not found", availableProperties: __availableProperties(component) };
        }

        function __valuesDiffer(valueAfter, requested) {
          try {
            if (typeof valueAfter === "number" && typeof requested === "number") return Math.abs(valueAfter - requested) > 0.0001;
            return JSON.stringify(valueAfter) !== JSON.stringify(requested);
          } catch (_) {
            return null;
          }
        }

        var prepared = [];
        for (var oi = 0; oi < operations.length; oi++) {
          var operation = operations[oi];
          var componentResult = __findComponent(clip, operation.componentName);
          if (!componentResult.component) {
            return JSON.stringify({
              success: false,
              error: componentResult.error || "Component not found",
              stage: "preflight",
              failedOperation: operation,
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              availableComponents: componentResult.availableComponents || []
            });
          }
          var propertyResult = __findEffectProperty(componentResult.component, operation);
          if (!propertyResult.property) {
            return JSON.stringify({
              success: false,
              error: propertyResult.error || "Property not found",
              stage: "preflight",
              failedOperation: operation,
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              component: __componentSummary(componentResult.component, componentResult.componentIndex),
              availableProperties: propertyResult.availableProperties || []
            });
          }
          prepared.push({
            operation: operation,
            component: componentResult.component,
            componentIndex: componentResult.componentIndex,
            componentStrategy: componentResult.strategy,
            property: propertyResult.property,
            propertyIndex: propertyResult.propertyIndex,
            propertyStrategy: propertyResult.strategy
          });
        }

        var qeClip = null;
        if (speedSettings !== null) {
          app.enableQE();
          var activeSequence = app.project.activeSequence;
          if (!activeSequence || activeSequence.sequenceID !== info.sequenceId) {
            return JSON.stringify({
              success: false,
              error: "Speed changes require the target sequence to be active for QE DOM operations",
              stage: "preflight",
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              activeSequenceId: activeSequence && activeSequence.sequenceID ? activeSequence.sequenceID : null
            });
          }
          var qeSeq = qe.project.getActiveSequence();
          var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
          qeClip = qeTrack ? qeTrack.getItemAt(info.clipIndex) : null;
          if (!qeClip) {
            return JSON.stringify({
              success: false,
              error: "QE clip not found for speed change",
              stage: "preflight",
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              trackType: info.trackType,
              trackIndex: info.trackIndex,
              clipIndex: info.clipIndex
            });
          }
        }

        var results = [];
        for (var si = 0; si < prepared.length; si++) {
          var preparedOperation = prepared[si];
          var op = preparedOperation.operation;
          var valueBeforeResult = __safeGetPropertyValue(preparedOperation.property);
          var setErrorText = null;
          try {
            preparedOperation.property.setValue(op.value, true);
          } catch (setError) {
            setErrorText = setError.toString();
          }
          var valueAfterResult = __safeGetPropertyValue(preparedOperation.property);
          results.push({
            label: op.label,
            success: setErrorText === null && valueAfterResult.error === null,
            error: setErrorText,
            component: __componentSummary(preparedOperation.component, preparedOperation.componentIndex),
            componentStrategy: preparedOperation.componentStrategy,
            property: __propertySummary(preparedOperation.property, preparedOperation.propertyIndex),
            propertyStrategy: preparedOperation.propertyStrategy,
            valueBefore: valueBeforeResult.value,
            valueBeforeError: valueBeforeResult.error,
            valueRequested: op.value,
            valueAfter: valueAfterResult.value,
            valueAfterError: valueAfterResult.error,
            valueAfterDiffersFromRequested: valueAfterResult.error === null ? __valuesDiffer(valueAfterResult.value, op.value) : null
          });
        }

        var speedResult = null;
        if (speedSettings !== null) {
          var speedBefore = null;
          var speedAfter = null;
          var speedError = null;
          try { speedBefore = clip.getSpeed(); } catch (speedBeforeError) { speedBefore = null; }
          try {
            qeClip.setSpeed(Number(speedSettings.percent), speedSettings.maintainAudioPitch !== false);
          } catch (speedSetError) {
            speedError = speedSetError.toString();
          }
          try { speedAfter = clip.getSpeed(); } catch (speedAfterError) { speedAfter = null; }
          speedResult = {
            success: speedError === null,
            error: speedError,
            valueBefore: speedBefore,
            valueRequested: Number(speedSettings.percent),
            valueAfter: speedAfter,
            maintainAudioPitch: speedSettings.maintainAudioPitch !== false
          };
        }

        var allSucceeded = true;
        for (var ri = 0; ri < results.length; ri++) {
          if (!results[ri].success) allSucceeded = false;
        }
        if (speedResult !== null && !speedResult.success) allSucceeded = false;

        return JSON.stringify({
          success: allSucceeded,
          clipId: ${literalForExtendScript(args.clipId)},
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex,
          results: results,
          speed: speedResult
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async setClipSpeedSettings(args: SetClipSpeedSettingsArgs): Promise<any> {
    const settings: Record<string, number | boolean> = {};
    if (args.sourceInPointSeconds !== undefined) settings.sourceInPointSeconds = args.sourceInPointSeconds;
    if (args.sourceOutPointSeconds !== undefined) settings.sourceOutPointSeconds = args.sourceOutPointSeconds;
    if (args.sourceDurationSeconds !== undefined) settings.sourceDurationSeconds = args.sourceDurationSeconds;
    if (args.speedPercent !== undefined) settings.speedPercent = args.speedPercent;
    if (args.maintainAudioPitch !== undefined) settings.maintainAudioPitch = args.maintainAudioPitch;

    const settingsJson = literalForExtendScript(settings);

    const script = `
      try {
        var settings = ${settingsJson};
        var info = __findClip(${literalForExtendScript(args.clipId)}, ${args.sequenceId ? literalForExtendScript(args.sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${args.sequenceId ? literalForExtendScript(`Clip not found in sequence: ${args.sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;

        function __makeTime(seconds) {
          var time = new Time();
          time.seconds = Number(seconds);
          return time;
        }

        function __safeNumber(label, fn) {
          try {
            var value = fn();
            return value === undefined || value === null ? null : Number(value);
          } catch (_) {
            return null;
          }
        }

        function __safeBool(label, fn) {
          try { return !!fn(); } catch (_) { return null; }
        }

        function __snapshot(label) {
          return {
            label: label,
            start: __safeNumber("start", function () { return clip.start.seconds; }),
            end: __safeNumber("end", function () { return clip.end.seconds; }),
            duration: __safeNumber("duration", function () { return clip.duration.seconds; }),
            sourceInPoint: __safeNumber("inPoint", function () { return clip.inPoint.seconds; }),
            sourceOutPoint: __safeNumber("outPoint", function () { return clip.outPoint.seconds; }),
            speed: __safeNumber("speed", function () { return clip.getSpeed(); })
          };
        }

        var before = __snapshot("before");
        var timingAttempted = settings.sourceInPointSeconds !== undefined || settings.sourceOutPointSeconds !== undefined || settings.sourceDurationSeconds !== undefined;
        var timingError = null;
        var requestedInPointSeconds = settings.sourceInPointSeconds !== undefined ? Number(settings.sourceInPointSeconds) : before.sourceInPoint;
        var requestedOutPointSeconds = null;
        if (timingAttempted) {
          if (settings.sourceDurationSeconds !== undefined) {
            requestedOutPointSeconds = requestedInPointSeconds + Number(settings.sourceDurationSeconds);
          } else if (settings.sourceOutPointSeconds !== undefined) {
            requestedOutPointSeconds = Number(settings.sourceOutPointSeconds);
          } else {
            requestedOutPointSeconds = before.sourceOutPoint;
          }
          if (requestedInPointSeconds !== null && requestedOutPointSeconds !== null && requestedInPointSeconds >= requestedOutPointSeconds) {
            var afterPreflight = __snapshot("afterPreflight");
            return JSON.stringify({
              success: false,
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              sequenceName: info.sequenceName,
              trackType: info.trackType,
              trackIndex: info.trackIndex,
              clipIndex: info.clipIndex,
              before: before,
              after: afterPreflight,
              timing: {
                attempted: true,
                success: false,
                error: "Requested source in point must be before requested source out point",
                sourceInPointBefore: before.sourceInPoint,
                sourceOutPointBefore: before.sourceOutPoint,
                sourceInPointAfter: afterPreflight.sourceInPoint,
                sourceOutPointAfter: afterPreflight.sourceOutPoint,
                requestedSourceInPoint: requestedInPointSeconds,
                requestedSourceOutPoint: requestedOutPointSeconds,
                requestedSourceDuration: settings.sourceDurationSeconds !== undefined ? Number(settings.sourceDurationSeconds) : null
              },
              speed: null
            });
          }
        }
        try {
          if (settings.sourceInPointSeconds !== undefined) {
            clip.inPoint = __makeTime(Number(settings.sourceInPointSeconds));
          }
          if (settings.sourceDurationSeconds !== undefined) {
            var outPointSeconds = requestedOutPointSeconds;
            clip.outPoint = __makeTime(outPointSeconds);
          }
          if (settings.sourceOutPointSeconds !== undefined) {
            clip.outPoint = __makeTime(Number(settings.sourceOutPointSeconds));
          }
        } catch (timingSetError) {
          timingError = timingSetError.toString();
        }
        var afterTiming = __snapshot("afterTiming");

        var speedResult = null;
        if (settings.speedPercent !== undefined) {
          var speedAttempted = true;
          var speedBefore = afterTiming.speed;
          var qeSpeedBefore = null;
          var qeSpeedAfter = null;
          var qeDurationBefore = null;
          var qeDurationAfter = null;
          var reversedBefore = null;
          var reversedAfter = null;
          var speedError = null;
          try {
            app.enableQE();
            var activeSequence = app.project.activeSequence;
            if (!activeSequence || activeSequence.sequenceID !== info.sequenceId) {
              speedError = "Speed changes require the target sequence to be active for QE DOM operations";
            } else {
              var qeSeq = qe.project.getActiveSequence();
              var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
              var qeClip = qeTrack ? qeTrack.getItemAt(info.clipIndex) : null;
              if (!qeClip) {
                speedError = "QE clip not found for speed change";
              } else {
                try { qeSpeedBefore = Number(qeClip.speed); } catch (_) { qeSpeedBefore = null; }
                try { qeDurationBefore = String(qeClip.duration); } catch (_) { qeDurationBefore = null; }
                try { reversedBefore = __safeBool("reversed", function () { return qeClip.reversed; }); } catch (_) { reversedBefore = null; }
                try {
                  qeClip.setSpeed(Number(settings.speedPercent), settings.maintainAudioPitch !== false);
                } catch (speedSetError) {
                  speedError = speedSetError.toString();
                }
                try { qeSpeedAfter = Number(qeClip.speed); } catch (_) { qeSpeedAfter = null; }
                try { qeDurationAfter = String(qeClip.duration); } catch (_) { qeDurationAfter = null; }
                try { reversedAfter = __safeBool("reversed", function () { return qeClip.reversed; }); } catch (_) { reversedAfter = null; }
              }
            }
          } catch (speedOuterError) {
            speedError = speedOuterError.toString();
          }
          var speedAfter = __snapshot("afterSpeed").speed;
          var requestedMultiplier = Number(settings.speedPercent) / 100;
          var speedMatchesRequest = speedAfter !== null ? Math.abs(speedAfter - requestedMultiplier) <= 0.0001 : null;
          var directionMatchesRequest = reversedAfter !== true;
          speedResult = {
            speedAttempted: true,
            attempted: speedAttempted,
            success: speedError === null && speedMatchesRequest !== false && directionMatchesRequest,
            error: speedError,
            valueBefore: speedBefore,
            valueRequestedPercent: Number(settings.speedPercent),
            valueRequestedMultiplier: requestedMultiplier,
            valueAfter: speedAfter,
            directionMatchesRequest: directionMatchesRequest,
            qeSpeedBefore: qeSpeedBefore,
            qeSpeedAfter: qeSpeedAfter,
            qeDurationBefore: qeDurationBefore,
            qeDurationAfter: qeDurationAfter,
            reversedBefore: reversedBefore,
            reversedAfter: reversedAfter,
            maintainAudioPitch: settings.maintainAudioPitch !== false,
            warning: speedError === null ? null : "Premiere Pro QE rejected the speed change; source timing changes, if requested, are reported separately."
          };
        }

        var timingResult = {
          attempted: timingAttempted,
          success: timingError === null,
          error: timingError,
          sourceInPointBefore: before.sourceInPoint,
          sourceOutPointBefore: before.sourceOutPoint,
          sourceInPointAfter: afterTiming.sourceInPoint,
          sourceOutPointAfter: afterTiming.sourceOutPoint,
          requestedSourceInPoint: settings.sourceInPointSeconds !== undefined ? Number(settings.sourceInPointSeconds) : null,
          requestedSourceOutPoint: requestedOutPointSeconds,
          requestedSourceDuration: settings.sourceDurationSeconds !== undefined ? Number(settings.sourceDurationSeconds) : null
        };

        var after = __snapshot("after");
        var speedSucceeded = speedResult === null || speedResult.success === true;
        return JSON.stringify({
          success: timingResult.success === true && speedSucceeded,
          clipId: ${literalForExtendScript(args.clipId)},
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex,
          before: before,
          after: after,
          timing: timingResult,
          speed: speedResult
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async setClipTimeRemapSettings(args: SetClipTimeRemapSettingsArgs): Promise<any> {
    const settings: { staticSpeedPercent?: number; keyframes?: ClipTimeRemapKeyframe[] } = {};
    if (args.staticSpeedPercent !== undefined) settings.staticSpeedPercent = args.staticSpeedPercent;
    if (args.keyframes !== undefined) settings.keyframes = args.keyframes.map((keyframe) => ({
      timeSeconds: keyframe.timeSeconds,
      speedPercent: keyframe.speedPercent
    }));

    const settingsJson = literalForExtendScript(settings);

    const script = `
      try {
        var settings = ${settingsJson};
        var info = __findClip(${literalForExtendScript(args.clipId)}, ${args.sequenceId ? literalForExtendScript(args.sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${args.sequenceId ? literalForExtendScript(`Clip not found in sequence: ${args.sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;

        function __safeString(value) {
          try {
            if (value === null || value === undefined) return null;
            return String(value);
          } catch (_) {
            return null;
          }
        }

        function __normalizeName(value) {
          return String(value).toLowerCase().replace(/[\\s_-]+/g, "");
        }

        function __namesEqual(actual, expected) {
          var actualText = __safeString(actual);
          var expectedText = __safeString(expected);
          if (actualText === null || expectedText === null) return false;
          return actualText === expectedText || __normalizeName(actualText) === __normalizeName(expectedText);
        }

        function __nameLooksLikeTimeRemap(value) {
          var text = __safeString(value);
          if (text === null) return false;
          var normalized = __normalizeName(text);
          return normalized.indexOf("timeremap") !== -1 || normalized.indexOf("timeremapping") !== -1;
        }

        function __serializeEffectValue(value) {
          if (value === null || value === undefined) return value;
          var valueType = typeof value;
          if (valueType === "number" || valueType === "string" || valueType === "boolean") return value;
          try {
            if (value.seconds !== undefined || value.ticks !== undefined) {
              return {
                seconds: value.seconds !== undefined ? value.seconds : null,
                ticks: value.ticks !== undefined ? String(value.ticks) : null
              };
            }
          } catch (_) {}
          try {
            if (value.length !== undefined && typeof value !== "string") {
              var arr = [];
              for (var vi = 0; vi < value.length; vi++) arr.push(__serializeEffectValue(value[vi]));
              return arr;
            }
          } catch (_) {}
          try { return String(value); } catch (_) { return "<unserializable>"; }
        }

        function __safeGetPropertyValue(prop) {
          var result = { available: false, value: null, valueType: null, error: null };
          try {
            var raw = prop.getValue();
            result.available = true;
            result.valueType = raw === null ? "null" : typeof raw;
            result.value = __serializeEffectValue(raw);
          } catch (valueError) {
            result.error = valueError.toString();
          }
          return result;
        }

        function __safeGetValueAtKey(prop, timeSeconds) {
          try { return __serializeEffectValue(prop.getValueAtKey(Number(timeSeconds))); } catch (_) { return null; }
        }

        function __componentSummary(component, componentIndex) {
          return {
            componentIndex: componentIndex,
            displayName: component && component.displayName !== undefined ? String(component.displayName) : "",
            matchName: component && component.matchName !== undefined ? String(component.matchName) : null,
            propertyCount: component && component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0
          };
        }

        function __propertySummary(prop, propertyIndex) {
          return {
            propertyIndex: propertyIndex,
            displayName: prop && prop.displayName !== undefined ? String(prop.displayName) : "",
            matchName: prop && prop.matchName !== undefined ? String(prop.matchName) : null
          };
        }

        function __availableProperties(component) {
          var properties = [];
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          for (var pi = 0; pi < propertyCount; pi++) {
            properties.push(__propertySummary(component.properties[pi], pi));
          }
          return properties;
        }

        function __availableComponents(clipToInspect) {
          var components = [];
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          for (var ci = 0; ci < componentCount; ci++) {
            var component = clipToInspect.components[ci];
            var summary = __componentSummary(component, ci);
            summary.properties = __availableProperties(component);
            components.push(summary);
          }
          return components;
        }

        function __propertyLooksLikeTimeRemapSpeed(prop) {
          return __namesEqual(prop.displayName, "Speed") ||
            __namesEqual(prop.matchName, "Speed") ||
            __nameLooksLikeTimeRemap(prop.displayName) ||
            __nameLooksLikeTimeRemap(prop.matchName);
        }

        function __findTimeRemapSpeedProperty(clip) {
          var componentCount = clip.components && clip.components.numItems !== undefined ? clip.components.numItems : 0;
          for (var ci = 0; ci < componentCount; ci++) {
            var component = clip.components[ci];
            var isTimeRemapComponent = __nameLooksLikeTimeRemap(component.displayName) || __nameLooksLikeTimeRemap(component.matchName);
            if (!isTimeRemapComponent) continue;
            var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
            for (var pi = 0; pi < propertyCount; pi++) {
              var prop = component.properties[pi];
              if (__propertyLooksLikeTimeRemapSpeed(prop)) {
                return {
                  property: prop,
                  propertyIndex: pi,
                  component: component,
                  componentIndex: ci
                };
              }
            }
          }
          return { property: null };
        }

        function __safeType(obj, key) {
          try { return obj ? typeof obj[key] : null; } catch (e) { return "ERR:" + e.toString(); }
        }

        function __qeTimeRemapCapabilities() {
          var result = {
            available: false,
            activeSequenceMatches: null,
            speed: null,
            setSpeed: null,
            startPercent: null,
            endPercent: null,
            frameBlend: null,
            timeInterpolationType: null,
            error: null
          };
          try {
            app.enableQE();
            var activeSequence = app.project.activeSequence;
            result.activeSequenceMatches = !!activeSequence && activeSequence.sequenceID === info.sequenceId;
            if (!result.activeSequenceMatches) {
              result.error = "Target sequence is not active for QE capability inspection";
              return result;
            }
            var qeSeq = qe.project.getActiveSequence();
            var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
            var qeClip = qeTrack ? qeTrack.getItemAt(info.clipIndex) : null;
            if (!qeClip) {
              result.error = "QE clip not found";
              return result;
            }
            result.available = true;
            result.speed = __safeType(qeClip, "speed");
            result.setSpeed = __safeType(qeClip, "setSpeed");
            result.startPercent = __safeType(qeClip, "startPercent");
            result.endPercent = __safeType(qeClip, "endPercent");
            result.frameBlend = __safeType(qeClip, "frameBlend");
            result.timeInterpolationType = __safeType(qeClip, "timeInterpolationType");
          } catch (qeError) {
            result.error = qeError.toString();
          }
          return result;
        }

        var found = __findTimeRemapSpeedProperty(clip);
        if (!found.property) {
          return JSON.stringify({
            success: false,
            supported: false,
            error: "Time Remapping speed property is not exposed to ExtendScript on this clip",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            sequenceName: info.sequenceName,
            trackType: info.trackType,
            trackIndex: info.trackIndex,
            clipIndex: info.clipIndex,
            availableComponents: __availableComponents(clip),
            qeTimeRemapCapabilities: __qeTimeRemapCapabilities()
          });
        }

        var speedProp = found.property;
        var valueBefore = __safeGetPropertyValue(speedProp);
        var staticSpeedResult = null;
        if (settings.staticSpeedPercent !== undefined) {
          var staticError = null;
          try {
            speedProp.setValue(Number(settings.staticSpeedPercent), true);
          } catch (staticSetError) {
            staticError = staticSetError.toString();
          }
          var staticAfter = __safeGetPropertyValue(speedProp);
          staticSpeedResult = {
            attempted: true,
            success: staticError === null,
            error: staticError,
            requested: Number(settings.staticSpeedPercent),
            valueBefore: valueBefore.value,
            valueAfter: staticAfter.value,
            valueAfterAvailable: staticAfter.available,
            valueAfterError: staticAfter.error
          };
        }

        var keyframeResults = [];
        var keyframeSetupError = null;
        if (settings.keyframes !== undefined) {
          try {
            speedProp.setTimeVarying(true);
          } catch (varyingError) {
            keyframeSetupError = varyingError.toString();
          }
          if (keyframeSetupError === null) {
            for (var ki = 0; ki < settings.keyframes.length; ki++) {
              var keyframe = settings.keyframes[ki];
              var keyError = null;
              try {
                speedProp.addKey(Number(keyframe.timeSeconds));
                speedProp.setValueAtKey(Number(keyframe.timeSeconds), Number(keyframe.speedPercent), true);
              } catch (keySetError) {
                keyError = keySetError.toString();
              }
              keyframeResults.push({
                timeSeconds: Number(keyframe.timeSeconds),
                speedPercent: Number(keyframe.speedPercent),
                success: keyError === null,
                error: keyError,
                valueAfter: keyError === null ? __safeGetValueAtKey(speedProp, keyframe.timeSeconds) : null
              });
            }
          }
        }

        var keyframesSucceeded = keyframeSetupError === null;
        for (var ri = 0; ri < keyframeResults.length; ri++) {
          if (keyframeResults[ri].success !== true) keyframesSucceeded = false;
        }
        var staticSucceeded = staticSpeedResult === null || staticSpeedResult.success === true;
        var valueAfter = __safeGetPropertyValue(speedProp);

        return JSON.stringify({
          success: staticSucceeded && keyframesSucceeded,
          supported: true,
          clipId: ${literalForExtendScript(args.clipId)},
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex,
          component: __componentSummary(found.component, found.componentIndex),
          property: __propertySummary(speedProp, found.propertyIndex),
          valueBefore: valueBefore.value,
          valueBeforeAvailable: valueBefore.available,
          valueBeforeError: valueBefore.error,
          valueAfter: valueAfter.value,
          valueAfterAvailable: valueAfter.available,
          valueAfterError: valueAfter.error,
          staticSpeed: staticSpeedResult,
          keyframeSetupError: keyframeSetupError,
          keyframes: keyframeResults,
          qeTimeRemapCapabilities: __qeTimeRemapCapabilities()
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async applyEffect(clipId: string, effectName: string, parameters?: Record<string, any>): Promise<any> {
    const paramJson = literalForExtendScript(parameters || {});
    const clipIdLiteral = literalForExtendScript(clipId);
    const effectNameLiteral = literalForExtendScript(effectName);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var activeSequence = app.project.activeSequence;
        if (!activeSequence || String(activeSequence.sequenceID) !== String(info.sequenceId)) {
          return JSON.stringify({
            success: false,
            mutationAttempted: false,
            error: "apply_effect requires the target clip to be in the active sequence before QE mutation",
            clipId: ${clipIdLiteral},
            sequenceId: info.sequenceId || null,
            activeSequenceId: activeSequence ? String(activeSequence.sequenceID) : null
          });
        }
        var clip = info.clip;
        var beforeCount = clip.components.numItems;
        var qeSeq = qe.project.getActiveSequence();
        if (!qeSeq) return JSON.stringify({ success: false, error: "QE active sequence not available" });
        var qeTrack, effect;
        if (info.trackType === 'video') {
          qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
          effect = qe.project.getVideoEffectByName(${effectNameLiteral});
        } else {
          qeTrack = qeSeq.getAudioTrackAt(info.trackIndex);
          effect = qe.project.getAudioEffectByName(${effectNameLiteral});
        }
        if (!qeTrack) return JSON.stringify({ success: false, error: "QE track not found for effect application" });
        if (!effect) return JSON.stringify({ success: false, error: "Effect not found: " + ${effectNameLiteral} + ". Use list_available_effects to see available effects." });
        function findQeClipByExactStart() {
          var targetTicks = String(info.clip.start.ticks);
          for (var qi = 0; qi < qeTrack.numItems; qi++) {
            var item = qeTrack.getItemAt(qi);
            if (!item || String(item.type) !== "Clip") continue;
            var itemTicks = String(item.start.ticks);
            if (itemTicks === targetTicks) return item;
          }
          return null;
        }
        var qeClip = findQeClipByExactStart();
        if (!qeClip) return JSON.stringify({ success: false, mutationAttempted: false, error: "Could not locate exact-start matching QE clip for effect application; mutation was not attempted" });
        if (info.trackType === 'video') { qeClip.addVideoEffect(effect); } else { qeClip.addAudioEffect(effect); }

        // Find the newly added component (last in the array)
        var afterCount = clip.components.numItems;
        if (afterCount <= beforeCount) {
          return JSON.stringify({
            success: false,
            error: "Effect add did not create a new component on the target clip",
            clipId: ${clipIdLiteral},
            effectName: ${effectNameLiteral},
            beforeComponentCount: beforeCount,
            afterComponentCount: afterCount
          });
        }
        var newCompIdx = afterCount - 1;
        var newComp = clip.components[newCompIdx];

        // Dump every property name + current value
        var propsDump = [];
        for (var i = 0; i < newComp.properties.numItems; i++) {
          var prop = newComp.properties[i];
          var dn = String(prop.displayName);
          var val = null;
          try { val = prop.getValue(); } catch (e1) { val = "<getValue threw: " + e1.toString() + ">"; }
          propsDump.push({ index: i, displayName: dn, value: val });
        }

        // Apply parameters by displayName match (exact first, then normalized)
        var requestedParams = ${paramJson};
        var paramResults = [];
        function normalize(s) { return String(s).toLowerCase().replace(/[\\s_-]+/g, ''); }
        for (var pName in requestedParams) {
          if (requestedParams.hasOwnProperty && !requestedParams.hasOwnProperty(pName)) continue;
          var requestedVal = requestedParams[pName];
          var matched = null;
          // Pass 1: exact displayName match
          for (var k = 0; k < newComp.properties.numItems; k++) {
            if (String(newComp.properties[k].displayName) === pName) {
              matched = { idx: k, prop: newComp.properties[k], strategy: "exact" };
              break;
            }
          }
          // Pass 2: normalized match (strip case/whitespace/underscores/dashes)
          if (!matched) {
            var nameN = normalize(pName);
            for (var k = 0; k < newComp.properties.numItems; k++) {
              if (normalize(String(newComp.properties[k].displayName)) === nameN) {
                matched = { idx: k, prop: newComp.properties[k], strategy: "normalized" };
                break;
              }
            }
          }
          if (matched) {
            try {
              var valueBefore = null;
              try { valueBefore = matched.prop.getValue(); } catch (eB) {}
              matched.prop.setValue(requestedVal, true);
              var valueAfter = null;
              try { valueAfter = matched.prop.getValue(); } catch (eA) {}
              var clamped = (valueAfter !== null && Math.abs(valueAfter - requestedVal) > 0.0001);
              paramResults.push({
                requestedName: pName,
                matchedDisplayName: String(matched.prop.displayName),
                strategy: matched.strategy,
                valueRequested: requestedVal,
                valueBefore: valueBefore,
                valueAfter: valueAfter,
                clamped: clamped,
                ok: true
              });
            } catch (e2) {
              paramResults.push({ requestedName: pName, ok: false, error: "setValue threw: " + e2.toString() });
            }
          } else {
            paramResults.push({ requestedName: pName, ok: false, error: "no property matches this displayName (exact or normalized)" });
          }
        }

        var failedParams = [];
        for (var pr = 0; pr < paramResults.length; pr++) {
          if (!paramResults[pr].ok) failedParams.push(paramResults[pr]);
        }

        return JSON.stringify({
          success: failedParams.length === 0,
          message: "Effect applied",
          clipId: ${clipIdLiteral},
          effectName: ${effectNameLiteral},
          addedComponent: {
            displayName: String(newComp.displayName),
            componentIndex: newCompIdx,
            propertyCount: propsDump.length,
            properties: propsDump
          },
          paramResults: paramResults,
          error: failedParams.length ? "One or more effect parameters could not be set" : undefined
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async cropClip(clipId: string, options: { left?: number; right?: number; top?: number; bottom?: number; zoom?: boolean; edgeFeather?: number }): Promise<any> {
    const params: Record<string, any> = {};
    if (options.left !== undefined) params['Left'] = options.left;
    if (options.top !== undefined) params['Top'] = options.top;
    if (options.right !== undefined) params['Right'] = options.right;
    if (options.bottom !== undefined) params['Bottom'] = options.bottom;
    if (options.zoom !== undefined) params['Zoom'] = options.zoom;
    if (options.edgeFeather !== undefined) params['Edge Feather'] = options.edgeFeather;

    const paramJson = literalForExtendScript(params);
    const clipIdLiteral = literalForExtendScript(clipId);
    const script = `
      try {
        app.enableQE();
        var info = __findClip(${clipIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        if (info.trackType !== "video") return JSON.stringify({ success: false, error: "crop_clip only supports video clips" });
        var activeSequence = app.project.activeSequence;
        if (!activeSequence || String(activeSequence.sequenceID) !== String(info.sequenceId)) {
          return JSON.stringify({
            success: false,
            mutationAttempted: false,
            error: "crop_clip requires the target clip to be in the active sequence before QE mutation",
            clipId: ${clipIdLiteral},
            sequenceId: info.sequenceId || null,
            activeSequenceId: activeSequence ? String(activeSequence.sequenceID) : null
          });
        }

        var clip = info.clip;
        var cropComp = null;
        var cropCompIdx = -1;

        function isCropComponent(component) {
          return String(component.displayName) === "Crop" || String(component.matchName) === "AE.ADBE AECrop";
        }

        function findCropComponent() {
          for (var i = clip.components.numItems - 1; i >= 0; i--) {
            var component = clip.components[i];
            if (isCropComponent(component)) {
              cropComp = component;
              cropCompIdx = i;
              return true;
            }
          }
          return false;
        }

        var effectAdded = false;
        if (!findCropComponent()) {
          var qeSeq = qe.project.getActiveSequence();
          if (!qeSeq) return JSON.stringify({ success: false, error: "QE active sequence not available" });
          var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
          if (!qeTrack) return JSON.stringify({ success: false, error: "QE video track not found for clip" });
          var effect = qe.project.getVideoEffectByName("Crop");
          if (!effect) return JSON.stringify({ success: false, error: "Crop effect not found. Use list_available_effects to inspect installed effects." });

          function findQeClipByExactStart() {
            var targetTicks = String(info.clip.start.ticks);
            for (var qi = 0; qi < qeTrack.numItems; qi++) {
              var item = qeTrack.getItemAt(qi);
              if (!item || String(item.type) !== "Clip") continue;
              var itemTicks = String(item.start.ticks);
              if (itemTicks === targetTicks) return item;
            }
            return null;
          }

          var beforeCount = clip.components.numItems;
          var qeClip = findQeClipByExactStart();
          if (!qeClip) return JSON.stringify({ success: false, mutationAttempted: false, error: "Could not locate exact-start matching QE clip for Crop effect; mutation was not attempted" });
          qeClip.addVideoEffect(effect);
          if (clip.components.numItems <= beforeCount) {
            return JSON.stringify({
              success: false,
              error: "Crop effect add did not create a new component on the target clip",
              beforeComponentCount: beforeCount,
              afterComponentCount: clip.components.numItems
            });
          }
          effectAdded = true;
          if (!findCropComponent()) {
            var addedNames = [];
            for (var ai = beforeCount; ai < clip.components.numItems; ai++) {
              addedNames.push(String(clip.components[ai].displayName));
            }
            return JSON.stringify({
              success: false,
              error: "Effect add completed but the new component was not Crop",
              addedComponents: addedNames
            });
          }
        }

        var requestedParams = ${paramJson};
        var paramResults = [];
        function normalize(s) { return String(s).toLowerCase().replace(/[\\s_-]+/g, ''); }
        for (var pName in requestedParams) {
          if (requestedParams.hasOwnProperty && !requestedParams.hasOwnProperty(pName)) continue;
          var requestedVal = requestedParams[pName];
          var matched = null;
          for (var k = 0; k < cropComp.properties.numItems; k++) {
            if (String(cropComp.properties[k].displayName) === pName) {
              matched = { prop: cropComp.properties[k], strategy: "exact" };
              break;
            }
          }
          if (!matched) {
            var nameN = normalize(pName);
            for (var nk = 0; nk < cropComp.properties.numItems; nk++) {
              if (normalize(String(cropComp.properties[nk].displayName)) === nameN) {
                matched = { prop: cropComp.properties[nk], strategy: "normalized" };
                break;
              }
            }
          }
          if (!matched) {
            paramResults.push({ requestedName: pName, ok: false, error: "no Crop property matches this displayName" });
            continue;
          }
          try {
            var valueBefore = null;
            try { valueBefore = matched.prop.getValue(); } catch (eB) {}
            matched.prop.setValue(requestedVal, true);
            var valueAfter = null;
            try { valueAfter = matched.prop.getValue(); } catch (eA) {}
            var clamped = false;
            if (typeof valueAfter === "number" && typeof requestedVal === "number") {
              clamped = Math.abs(valueAfter - requestedVal) > 0.0001;
            } else {
              clamped = valueAfter !== requestedVal;
            }
            paramResults.push({
              requestedName: pName,
              matchedDisplayName: String(matched.prop.displayName),
              strategy: matched.strategy,
              valueRequested: requestedVal,
              valueBefore: valueBefore,
              valueAfter: valueAfter,
              clamped: clamped,
              ok: true
            });
          } catch (eSet) {
            paramResults.push({ requestedName: pName, ok: false, error: "setValue threw: " + eSet.toString() });
          }
        }

        var propsDump = [];
        for (var pi = 0; pi < cropComp.properties.numItems; pi++) {
          var prop = cropComp.properties[pi];
          var val = null;
          try { val = prop.getValue(); } catch (eVal) { val = "<getValue threw: " + eVal.toString() + ">"; }
          propsDump.push({ index: pi, displayName: String(prop.displayName), value: val });
        }

        var failedParams = [];
        for (var pr = 0; pr < paramResults.length; pr++) {
          if (!paramResults[pr].ok) failedParams.push(paramResults[pr]);
        }

        return JSON.stringify({
          success: failedParams.length === 0,
          message: effectAdded ? "Crop effect applied" : "Existing Crop effect updated",
          clipId: ${clipIdLiteral},
          effectName: "Crop",
          effectAdded: effectAdded,
          componentIndex: cropCompIdx,
          properties: propsDump,
          paramResults: paramResults,
          error: failedParams.length ? "One or more Crop parameters could not be set" : undefined
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "Crop effect failed: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async removeEffect(clipId: string, effectName: string): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var found = false;
        for (var i = 0; i < clip.components.numItems; i++) {
          if (clip.components[i].displayName === "${effectName}" || clip.components[i].matchName === "${effectName}") {
            found = true;
            break;
          }
        }
        return JSON.stringify({
          success: false,
          error: "Effect removal is not supported by the ExtendScript API. The effect '${effectName}' was " + (found ? "found" : "not found") + " on this clip.",
          note: "Remove effects manually in Premiere Pro"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async addTransition(clipId1: string, _clipId2: string, transitionName: string, duration: number): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info1 = __findClip("${clipId1}");
        if (!info1) return JSON.stringify({ success: false, error: "First clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info1.trackIndex);
        var qeClip = qeTrack.getItemAt(info1.clipIndex);
        var transition = qe.project.getVideoTransitionByName("${transitionName}");
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: ${transitionName}. Use list_available_transitions." });
        var seq = app.project.activeSequence;
        var fps = seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var frames = Math.round(${duration} * fps);
        qeClip.addTransition(transition, true, frames + ":00", "0:00", 0.5, false, true);
        return JSON.stringify({ success: true, message: "Transition added", transitionName: "${transitionName}", duration: ${duration} });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async addTransitionToClip(clipId: string, transitionName: string, position: 'start' | 'end', duration: number): Promise<any> {
    const atEnd = position === 'end';
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var transition = info.trackType === 'video'
          ? qe.project.getVideoTransitionByName("${transitionName}")
          : qe.project.getAudioTransitionByName("${transitionName}");
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: ${transitionName}" });
        var seq = app.project.activeSequence;
        var fps = seq.timebase ? (254016000000 / parseInt(seq.timebase, 10)) : 30;
        var frames = Math.round(${duration} * fps);
        qeClip.addTransition(transition, ${atEnd}, frames + ":00", "0:00", 0.5, true, true);
        return JSON.stringify({ success: true, message: "Transition added at ${position}", transitionName: "${transitionName}", duration: ${duration} });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Audio Operations Implementation
  /**
   * High-level ducking helper. Computes a keyframe curve and delegates to
   * addAudioKeyframes (single source of truth for the locale-aware + calibrated
   * keyframe write).
   *
   * For each ducking window, emits 4 keyframes:
   *   - pre-fade  (window.startTime - fadeSeconds): baseDb
   *   - duck-in   (window.startTime):               duckedDb
   *   - duck-out  (window.endTime):                 duckedDb
   *   - post-fade (window.endTime + fadeSeconds):   baseDb
   *
   * Plus boundary keyframes at clipStartTime (or 0) and clipEndTime
   * (or last window.endTime + 1s) anchored to baseDb. Result: a continuous
   * curve that sits at baseDb except inside duck windows.
   *
   * Replaces the manual Sprint 3 "8 keyframes per video" pattern.
   */
  private async setupDucking(
    clipId: string,
    baseDb: number,
    duckingWindows: Array<{ startTime: number; endTime: number; duckedDb: number }>,
    fadeSeconds: number = 0.2,
    clipStartTime?: number,
    clipEndTime?: number
  ): Promise<any> {
    const fade = fadeSeconds ?? 0.2;
    const start = clipStartTime ?? 0;
    const lastWindow = duckingWindows.length > 0 ? duckingWindows[duckingWindows.length - 1] : undefined;
    const end = clipEndTime ?? (lastWindow ? lastWindow.endTime + 1 : start + 1);

    // Collect all keyframes and dedupe-by-time (later writes win for same time)
    const map = new Map<number, number>();
    const upsert = (t: number, db: number) => {
      // Quantize to ms to avoid duplicate-but-not-equal floats
      const key = Math.round(t * 1000) / 1000;
      map.set(key, db);
    };

    upsert(start, baseDb);

    for (const w of duckingWindows) {
      upsert(Math.max(start, w.startTime - fade), baseDb);
      upsert(w.startTime, w.duckedDb);
      upsert(w.endTime, w.duckedDb);
      upsert(Math.min(end, w.endTime + fade), baseDb);
    }

    upsert(end, baseDb);

    const keyframes = Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, level]) => ({ time, level }));

    const result = await this.addAudioKeyframes(clipId, keyframes);
    return {
      ...(typeof result === 'object' && result !== null ? result : {}),
      ducking_windows: duckingWindows.length,
      fade_seconds: fade,
      keyframes_emitted: keyframes.length,
      base_db: baseDb,
      computed_keyframes: keyframes,
    };
  }

  //
  // Sets the audio clip volume in dB (relative gain on the clip's Volume component, NOT track mixer).
  //
  // FIX vs upstream:
  //   - Upstream looked for property `displayName === "Volume"` iterating ALL component properties.
  //     That's wrong: "Volume" is a COMPONENT name, and its level property is "Level" (en) / "Nivel" (es).
  //   - Upstream passed `level` (dB) directly to setValue, but Premiere ExtendScript expects a
  //     linear scale (1.0 = 0 dB, 1.4454 = +3.2 dB). Conversion: linear = 10^(dB/20).
  //   - Now supports localized component names (Spanish "Volumen", English "Volume", others).
  //   - On not-found, returns a dump of clip components+properties for debugging.
  private async adjustAudioLevels(clipId: string, level: number): Promise<any> {
    const script = `
      try {
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;

        // Localized display names for the Volume component
        var VOLUME_NAMES = ["Volume", "Volumen", "Lautstärke", "Volume", "音量"];
        // Localized display names for the Level property inside Volume
        var LEVEL_NAMES  = ["Level", "Nivel", "Pegel", "Niveau", "Livello", "音量"];

        function isOneOf(name, list) {
          for (var n = 0; n < list.length; n++) { if (name === list[n]) return true; }
          return false;
        }

        // Build dump for debug fallback
        var dump = [];
        var volumeComp = null;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          var compName = String(comp.displayName);
          var propsList = [];
          for (var j = 0; j < comp.properties.numItems; j++) {
            propsList.push(String(comp.properties[j].displayName));
          }
          dump.push({ idx: i, component: compName, properties: propsList });
          if (!volumeComp && isOneOf(compName, VOLUME_NAMES)) {
            volumeComp = comp;
          }
        }
        if (!volumeComp) {
          return JSON.stringify({
            success: false,
            error: "Volume component not found on clip",
            components_dump: dump
          });
        }

        var levelProp = null;
        for (var j = 0; j < volumeComp.properties.numItems; j++) {
          var pName = String(volumeComp.properties[j].displayName);
          if (isOneOf(pName, LEVEL_NAMES)) {
            levelProp = volumeComp.properties[j];
            break;
          }
        }
        if (!levelProp) {
          return JSON.stringify({
            success: false,
            error: "Level property not found inside Volume component",
            volume_component: String(volumeComp.displayName),
            properties_in_volume: dump.length > 0 ? dump : []
          });
        }

        // CALIBRATION (empirical, Premiere Pro 2026 macOS, locale es_ES):
        //   Premiere's clip Volume Level property uses a linear amplitude scale where the
        //   displayed "0 dB" in the Effects Controls panel corresponds to internal linear value
        //   ~0.17783. The relationship is: linear = 0.17783 × 10^(dB/20),
        //   equivalently: linear = 10^((dB - 15) / 20).
        //   Verified by measurement: setting linear = 1.4454 (which standard audio convention
        //   says is +3.2 dB) actually produced ~+13 dB of broadcast loudness gain. With this
        //   calibrated formula, requesting +3.2 dB now sets linear = 0.2571 ≈ matches Premiere's
        //   displayed value.
        var DB_CALIBRATION_OFFSET = 15;  // Premiere ES-locale, PrPro 2026.x
        var dB = ${level};
        var linearValue = Math.pow(10, (dB - DB_CALIBRATION_OFFSET) / 20);
        var oldLinear = levelProp.getValue();
        var oldDB = (oldLinear > 0)
          ? (20 * Math.log(oldLinear) / Math.log(10) + DB_CALIBRATION_OFFSET)
          : -Infinity;
        levelProp.setValue(linearValue, true);

        return JSON.stringify({
          success: true,
          message: "Audio level adjusted (clip Volume component, locale-aware, calibrated dB scale)",
          clipId: "${clipId}",
          requestedDB: dB,
          oldLinearValue: oldLinear,
          oldDB: oldDB,
          newLinearValue: linearValue,
          newDB: dB,
          calibrationOffset: DB_CALIBRATION_OFFSET,
          volumeComponent: String(volumeComp.displayName),
          levelProperty: String(levelProp.displayName)
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async addAudioKeyframes(clipId: string, keyframes: Array<{time: number, level: number}>): Promise<any> {
    // CALIBRATION (matches adjustAudioLevels): Premiere's clip Volume Level property is linear amplitude.
    // The displayed "0 dB" in Effects Controls corresponds to internal linear value ~0.17783.
    // Relationship: linear = 10^((dB - 15) / 20). Verified empirically on Premiere Pro 2026 macOS es_ES.
    const DB_CALIBRATION_OFFSET = 15;
    const keyframeCode = keyframes.map(kf => {
      const linearValue = Math.pow(10, (kf.level - DB_CALIBRATION_OFFSET) / 20);
      return `
        try {
          levelProp.addKey(${kf.time});
          levelProp.setValueAtKey(${kf.time}, ${linearValue}, true);
          addedKeyframes.push({ time: ${kf.time}, level: ${kf.level}, linearValue: ${linearValue} });
        } catch (e2) {
          failedKeyframes.push({ time: ${kf.time}, level: ${kf.level}, error: e2.toString() });
        }
    `;
    }).join('\n');

    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;

        // Locale-aware Volume component / Level property detection (matches adjustAudioLevels patch).
        // Without this, the function fails with "Volume property not found" on non-English Premiere
        // installs (e.g., Spanish "Volumen"/"Nivel", German "Lautstärke"/"Pegel", etc.).
        var VOLUME_NAMES = ["Volume", "Volumen", "Lautstärke", "Volume", "音量"];
        var LEVEL_NAMES  = ["Level", "Nivel", "Pegel", "Niveau", "Livello", "音量"];
        function isOneOf(name, list) {
          for (var n = 0; n < list.length; n++) { if (name === list[n]) return true; }
          return false;
        }

        var volumeComp = null;
        var dump = [];
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          var compName = String(comp.displayName);
          var propsList = [];
          for (var j = 0; j < comp.properties.numItems; j++) {
            propsList.push(String(comp.properties[j].displayName));
          }
          dump.push({ idx: i, component: compName, properties: propsList });
          if (!volumeComp && isOneOf(compName, VOLUME_NAMES)) {
            volumeComp = comp;
          }
        }
        if (!volumeComp) {
          return JSON.stringify({
            success: false,
            error: "Volume component not found on clip (locale-aware lookup failed)",
            components_dump: dump
          });
        }

        var levelProp = null;
        for (var k = 0; k < volumeComp.properties.numItems; k++) {
          var pName = String(volumeComp.properties[k].displayName);
          if (isOneOf(pName, LEVEL_NAMES)) {
            levelProp = volumeComp.properties[k];
            break;
          }
        }
        if (!levelProp) {
          return JSON.stringify({
            success: false,
            error: "Level property not found inside Volume component",
            volume_component: String(volumeComp.displayName)
          });
        }

        levelProp.setTimeVarying(true);
        var addedKeyframes = [];
        var failedKeyframes = [];
        ${keyframeCode}
        return JSON.stringify({
          success: true,
          message: "Audio keyframes added (locale-aware Volume detection, calibrated dB scale)",
          clipId: ${JSON.stringify(clipId)},
          volumeComponent: String(volumeComp.displayName),
          levelProperty: String(levelProp.displayName),
          calibrationOffset: ${DB_CALIBRATION_OFFSET},
          addedKeyframes: addedKeyframes,
          failedKeyframes: failedKeyframes,
          totalKeyframes: addedKeyframes.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async muteTrack(sequenceId: string, trackIndex: number, muted: boolean): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence("${sequenceId}");
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var track = sequence.audioTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: "Audio track not found" });
        track.setMute(${muted ? 1 : 0});
        return JSON.stringify({
          success: true,
          message: "Track mute status changed",
          sequenceId: "${sequenceId}",
          trackIndex: ${trackIndex},
          muted: ${muted}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Text and Graphics Implementation
  private async addTextOverlay(args: any): Promise<any> {
    if (args.mogrtPath) {
      // FIX vs upstream: upstream silently ignored args.text; the MOGRT was imported but
      // its text properties stayed at default placeholders ("Su nombre aquí", etc.)
      // This version:
      //   1. importMGT (existing)
      //   2. After import, get trackItem.getMGTComponent() — the special MGT component
      //      that exposes the parameters defined in the Essential Graphics template
      //   3. Dump those properties for debugging (so callers see what's available)
      //   4. If args.text is provided, attempt to set it by:
      //      a. The first text-typed property whose value JSON-parses to {mTextString: ...}
      //      b. Or by displayName match against args.textPropertyName (optional override)
      //   Premiere stores text values as JSON: '{"mTextString":"...", ...}'
      const textJson = args.text !== undefined ? JSON.stringify(args.text) : 'null';
      // When set, the script restricts the write to the property whose displayName matches
      // (instead of running the auto-detect). text2/text3/text4 are ignored in override mode
      // — the override targets a single field by name.
      const textPropNameJson = args.textPropertyName !== undefined
        ? JSON.stringify(args.textPropertyName)
        : 'null';
      const script = `
        try {
          var sequence = __findSequence(${JSON.stringify(args.sequenceId)});
          if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
          var timeTicks = __secondsToTicks(${args.startTime});
          var trackItem = sequence.importMGT(${JSON.stringify(args.mogrtPath)}, timeTicks, ${args.trackIndex}, 0);
          if (!trackItem) return JSON.stringify({ success: false, error: "Failed to import MOGRT. Ensure the .mogrt file exists." });

          // First, probe ALL plausible MGT-access APIs (so we know what's available)
          var apiProbe = {};
          apiProbe.hasGetMGTComponent = (typeof trackItem.getMGTComponent === "function");
          apiProbe.hasGetMGT = (typeof trackItem.getMGT === "function");
          apiProbe.hasGetMogrtComponent = (typeof trackItem.getMogrtComponent === "function");
          apiProbe.hasGetComponentParameters = (typeof trackItem.getComponentParameters === "function");
          // App-level
          apiProbe.appHasMOGRTAPI = (app.project && typeof app.project.openMGT === "function");
          // Try calling getMGTComponent and capture more detail
          if (apiProbe.hasGetMGTComponent) {
            try {
              var mgtTry = trackItem.getMGTComponent();
              apiProbe.getMGTComponent_returned = (mgtTry === null) ? "null" : (typeof mgtTry);
              if (mgtTry) {
                apiProbe.getMGTComponent_displayName = String(mgtTry.displayName || "");
                apiProbe.getMGTComponent_propertyCount = (mgtTry.properties ? mgtTry.properties.numItems : -1);
                // Dump first 3 properties of MGT comp
                var mgtPropsSample = [];
                if (mgtTry.properties) {
                  for (var mp = 0; mp < Math.min(5, mgtTry.properties.numItems); mp++) {
                    var mprop = mgtTry.properties[mp];
                    var mval = null;
                    try { mval = mprop.getValue(); } catch (eMg) { mval = "<getValue threw>"; }
                    mgtPropsSample.push({
                      index: mp,
                      displayName: String(mprop.displayName),
                      valueType: typeof mval,
                      valuePreview: (typeof mval === "string" ? mval.substring(0, 80) : mval)
                    });
                  }
                }
                apiProbe.getMGTComponent_propertiesSample = mgtPropsSample;
              }
            } catch (eMG) {
              apiProbe.getMGTComponent_threw = eMG.toString();
            }
          }
          // Probe trackItem.name (some MOGRT-specific stuff might surface here)
          try { apiProbe.trackItemName = String(trackItem.name); } catch (e) {}
          // Probe sequence-level methods
          try { apiProbe.sequenceHasGetSelection = (typeof sequence.getSelection === "function"); } catch (e) {}

          // Iterate ALL components of the imported trackItem (MOGRT params live as
          // properties on one of its components, not always via getMGTComponent)
          var componentsDump = [];
          var textPropsFound = [];  // {compIndex, propIndex, displayName, currentValue}
          for (var ci = 0; ci < trackItem.components.numItems; ci++) {
            var comp = trackItem.components[ci];
            var compName = String(comp.displayName);
            var compMatch = (comp.matchName !== undefined) ? String(comp.matchName) : "";
            var compProps = [];
            for (var i = 0; i < comp.properties.numItems; i++) {
              var prop = comp.properties[i];
              var dn = String(prop.displayName);
              var val = null;
              try { val = prop.getValue(); } catch (eV) { val = "<getValue threw>"; }
              var truncatedVal = (typeof val === "string" ? val.substring(0, 250) : val);
              compProps.push({ index: i, displayName: dn, value: truncatedVal });
              // Heuristic: text properties contain "mTextString" in their JSON value
              if (typeof val === "string" && val.indexOf("mTextString") >= 0) {
                textPropsFound.push({ compIndex: ci, propIndex: i, compDisplayName: compName, propDisplayName: dn, currentValue: val });
              }
            }
            componentsDump.push({ index: ci, displayName: compName, matchName: compMatch, propertyCount: compProps.length, properties: compProps });
          }

          // Set custom text(s). Each "AE.ADBE Text" component in the MOGRT exposes its
          // editable text as property 0 (display name "Texto de origen" / "Source Text").
          // Only one setValue per property — raw_string strategy worked in earlier tests; no
          // JSON wrapping (that broke rendering).
          //
          // Inputs:
          //   args.text  → first text component (e.g., main title in Basic Lower Third)
          //   args.text2 → second text component (e.g., subtitle)
          //   args.text3 → third (if MOGRT has more)
          //   ...
          // Auto-collected from numbered keys.
          var textsByIndex = [];
          if (${textJson} !== null) textsByIndex.push(${textJson});
          ${args.text2 !== undefined ? `textsByIndex.push(${JSON.stringify(args.text2)});` : ''}
          ${args.text3 !== undefined ? `textsByIndex.push(${JSON.stringify(args.text3)});` : ''}
          ${args.text4 !== undefined ? `textsByIndex.push(${JSON.stringify(args.text4)});` : ''}
          var setResults = [];
          if (textsByIndex.length > 0) {
            // PREFERRED PATH: getMGTComponent() for AE-exported MOGRTs (Adobe-CEP canonical).
            // Properties exposed there are the Essential Graphics parameters and contain
            // FULL JSON values that ARE editable.
            // FALLBACK PATH: iterate trackItem.components for "AE.ADBE Text" — only works for
            // some MOGRTs and tokens are opaque single-char references in Premiere-native MOGRTs.
            var textComps = [];
            var textCompsViaMGT = false;
            var textPropNameOverride = ${textPropNameJson};
            // OVERRIDE PATH: caller named a specific property by displayName.
            // Search both the MGT component and all trackItem components for an exact
            // displayName match, then restrict textComps to that single hit.
            // text2/text3/text4 are ignored in override mode — caller targeted one field.
            if (textPropNameOverride) {
              try {
                var mgtCompO = trackItem.getMGTComponent();
                if (mgtCompO && mgtCompO.properties) {
                  for (var miO = 0; miO < mgtCompO.properties.numItems; miO++) {
                    var mpO = mgtCompO.properties[miO];
                    if (String(mpO.displayName) === textPropNameOverride) {
                      textComps.push({ comp: mgtCompO, compIndex: -1, prop: mpO, propIndex: miO, displayName: String(mpO.displayName) });
                      textCompsViaMGT = true;
                      break;
                    }
                  }
                }
              } catch (eOMG) {}
              if (textComps.length === 0) {
                for (var ciO = 0; ciO < trackItem.components.numItems && textComps.length === 0; ciO++) {
                  var cO = trackItem.components[ciO];
                  for (var piO = 0; piO < cO.properties.numItems; piO++) {
                    var pO = cO.properties[piO];
                    if (String(pO.displayName) === textPropNameOverride) {
                      textComps.push({ comp: cO, compIndex: ciO, prop: pO, propIndex: piO, displayName: String(pO.displayName) });
                      break;
                    }
                  }
                }
              }
              if (textComps.length === 0) {
                return JSON.stringify({
                  success: false,
                  error: "textPropertyName override did not match any property displayName: " + textPropNameOverride,
                  componentCount: componentsDump.length,
                  components: componentsDump
                });
              }
              // In override mode keep only the first text (named-target write).
              textsByIndex = [textsByIndex[0]];
              setResults.push({ _strategy: "textPropertyName_override", overrideName: textPropNameOverride });
            }
            // AUTO-DETECT PATH (only when no override).
            if (textComps.length === 0) {
              try {
                var mgtComp = trackItem.getMGTComponent();
                if (mgtComp && mgtComp.properties) {
                  for (var mi = 0; mi < mgtComp.properties.numItems; mi++) {
                    var mp = mgtComp.properties[mi];
                    var mpVal = null;
                    try { mpVal = mp.getValue(); } catch (eMPv) {}
                    // A "text" param has a JSON string value containing textEditValue or mTextString
                    if (typeof mpVal === "string" && mpVal.length > 50 &&
                        (mpVal.indexOf("textEditValue") >= 0 || mpVal.indexOf("mTextString") >= 0 || mpVal.indexOf("capPropTextRunCount") >= 0)) {
                      textComps.push({ comp: mgtComp, compIndex: -1, prop: mp, propIndex: mi, displayName: String(mp.displayName) });
                    }
                  }
                  if (textComps.length > 0) textCompsViaMGT = true;
                }
              } catch (eMGTC) {}
              // Fallback to component iteration if MGT didn't yield text params
              if (textComps.length === 0) {
                for (var ci3 = 0; ci3 < trackItem.components.numItems; ci3++) {
                  var c3 = trackItem.components[ci3];
                  var mn = (c3.matchName !== undefined) ? String(c3.matchName) : "";
                  if (mn === "AE.ADBE Text") {
                    textComps.push({ comp: c3, compIndex: ci3, prop: c3.properties[0], propIndex: 0, displayName: "Source Text (legacy)" });
                  }
                }
              }
              setResults.push({ _strategy: textCompsViaMGT ? "getMGTComponent" : "components_fallback", textCompsFound: textComps.length });
            }
            for (var ti2 = 0; ti2 < textsByIndex.length && ti2 < textComps.length; ti2++) {
              var tc = textComps[ti2];
              var sourceTextProp = tc.prop;
              var newText = String(textsByIndex[ti2]);
              try {
                // Source Text in Premiere/After Effects MOGRTs is stored as:
                //   <4 bytes binary header> + <JSON payload of mTextParam structure>
                // Source: Adobe Community (Kurt_Clark) + Adobe-CEP samples + reproduced
                // independently across multiple Premiere versions (incl. 2026).
                // The agent investigation confirmed this format. Direct setValue("text")
                // stores the value but the renderer cannot parse it → no visual update.
                // Correct mutation: parse JSON (skipping header), patch
                // mTextParam.mStyleSheet.mText, re-prepend header, setValue(...).
                var rawVal = sourceTextProp.getValue();
                var rawValStr = String(rawVal);
                var rawValLen = rawValStr.length;
                var headerBytes = "";
                var jsonStr = "";
                var textObj = null;
                var parseStrategy = "";
                // Strategy 1: 4-byte header + JSON
                try {
                  headerBytes = rawValStr.substring(0, 4);
                  jsonStr = rawValStr.substring(4);
                  textObj = JSON.parse(jsonStr);
                  parseStrategy = "header4+json";
                } catch (eP1) {
                  // Strategy 2: pure JSON (AE 14.3+ no header)
                  try {
                    textObj = JSON.parse(rawValStr);
                    headerBytes = "";
                    parseStrategy = "pure_json";
                  } catch (eP2) {
                    setResults.push({
                      textIndex: ti2, compIndex: tc.compIndex, requestedText: newText,
                      ok: false,
                      error: "Both JSON parse strategies failed",
                      rawValLength: rawValLen,
                      rawValPreview: rawValStr.substring(0, 50),
                      parseError1: eP1.toString(),
                      parseError2: eP2.toString()
                    });
                    continue;
                  }
                }
                // Mutate the text in the proper nested path(s)
                var mutated = [];
                if (textObj.mTextParam && textObj.mTextParam.mStyleSheet) {
                  textObj.mTextParam.mStyleSheet.mText = newText;
                  mutated.push("mTextParam.mStyleSheet.mText");
                }
                // AE 14.3+ alternate: textEditValue + fontTextRunLength
                if (textObj.textEditValue !== undefined) {
                  textObj.textEditValue = newText;
                  textObj.fontTextRunLength = [newText.length];
                  mutated.push("textEditValue+fontTextRunLength");
                }
                if (mutated.length === 0) {
                  setResults.push({
                    textIndex: ti2, compIndex: tc.compIndex, requestedText: newText,
                    ok: false,
                    error: "Parsed JSON but no known text field found",
                    parseStrategy: parseStrategy,
                    jsonKeys: (function(){ var ks=[]; for (var k in textObj) ks.push(k); return ks; })()
                  });
                  continue;
                }
                // Re-encode + write back
                var newRawVal = headerBytes + JSON.stringify(textObj);
                sourceTextProp.setValue(newRawVal, true);
                // Verify
                var afterRaw = "";
                try { afterRaw = String(sourceTextProp.getValue()); } catch (eVA) {}
                var afterParseOk = false;
                var afterText = "";
                try {
                  var afterObj = JSON.parse(afterRaw.substring(headerBytes.length));
                  if (afterObj.mTextParam && afterObj.mTextParam.mStyleSheet) {
                    afterText = afterObj.mTextParam.mStyleSheet.mText;
                    afterParseOk = true;
                  } else if (afterObj.textEditValue) {
                    afterText = afterObj.textEditValue;
                    afterParseOk = true;
                  }
                } catch (eAP) {}
                setResults.push({
                  textIndex: ti2,
                  compIndex: tc.compIndex,
                  requestedText: newText,
                  parseStrategy: parseStrategy,
                  fieldsMutated: mutated,
                  rawValLength: rawValLen,
                  newRawValLength: newRawVal.length,
                  readbackParseOk: afterParseOk,
                  readbackText: afterText,
                  ok: (afterText === newText)
                });
              } catch (eS) {
                setResults.push({ textIndex: ti2, compIndex: tc.compIndex, requestedText: newText, ok: false, error: eS.toString() });
              }
            }
            if (textComps.length === 0) {
              setResults.push({ ok: false, error: "No 'AE.ADBE Text' components found in MOGRT" });
            } else if (textsByIndex.length > textComps.length) {
              setResults.push({ ok: false, warning: "More texts requested (" + textsByIndex.length + ") than text components in MOGRT (" + textComps.length + ")" });
            }
          }

          return JSON.stringify({
            success: true,
            message: "MOGRT imported as text overlay",
            clipId: trackItem.nodeId,
            apiProbe: apiProbe,
            componentCount: componentsDump.length,
            components: componentsDump,
            textPropsAutoDetected: textPropsFound,
            textInjectionResults: setResults
          });
        } catch (e) {
          return JSON.stringify({ success: false, error: e.toString() });
        }
      `;
      return await this.bridge.executeScript(script);
    }

    // Fallback: try legacy title approach
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(args.sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found" });
        return JSON.stringify({
          success: false,
          error: "Text overlay requires a MOGRT file path. Use the mogrtPath parameter with a .mogrt template file, or use import_mogrt tool.",
          note: "Legacy titles (app.project.createNewTitle) are not supported in current Premiere Pro ExtendScript API."
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Color Correction Implementation
  private async colorCorrect(clipId: string, adjustments: any): Promise<any> {
    const paramCode = [
      adjustments.brightness !== undefined ? `if (p.displayName === "Brightness") p.setValue(${adjustments.brightness}, true);` : '',
      adjustments.contrast !== undefined ? `if (p.displayName === "Contrast") p.setValue(${adjustments.contrast}, true);` : '',
      adjustments.saturation !== undefined ? `if (p.displayName === "Saturation") p.setValue(${adjustments.saturation}, true);` : '',
      adjustments.hue !== undefined ? `if (p.displayName === "Hue") p.setValue(${adjustments.hue}, true);` : '',
      adjustments.temperature !== undefined ? `if (p.displayName === "Temperature") p.setValue(${adjustments.temperature}, true);` : '',
      adjustments.tint !== undefined ? `if (p.displayName === "Tint") p.setValue(${adjustments.tint}, true);` : '',
    ].filter(Boolean).join('\n              ');

    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color effect not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            ${paramCode}
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "Color correction applied", clipId: "${clipId}" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async applyLut(clipId: string, lutPath: string, _intensity = 100): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Lumetri Color");
        if (!effect) return JSON.stringify({ success: false, error: "Lumetri Color not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          var p = lastComp.properties[j];
          try {
            if (p.displayName === "Input LUT") p.setValue("${lutPath}", true);
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "LUT applied", clipId: "${clipId}", lutPath: "${lutPath}" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // Export and Rendering Implementation
  private async exportSequence(sequenceId: string, outputPath: string, presetPath?: string, format?: string, quality?: string, resolution?: string): Promise<any> {
    // app.encoder.encodeSequence() expects an absolute path to a .epr preset file.
    // Passing a string name like "H.264" silently fails: encodeSequence returns
    // no jobID and the JSX bridge reports {success:false}. Reject early with a
    // clear error rather than letting the user think a queue happened.
    if (!presetPath) {
      return {
        success: false,
        error: 'presetPath required — must be absolute path to a .epr preset file (Adobe encodeSequence does not accept format names like "H.264" or "ProRes")',
        hint: 'Create the preset in AME UI: File → Export Settings → configure → Save Preset → exports to ~/Library/Application Support/Adobe/Common/AME/<version>/Presets/. Pass that .epr path as presetPath.',
        sequenceId,
        outputPath,
        format,
        quality,
        resolution,
      };
    }

    try {
      // bridge.renderSequence returns a structured response; propagate it instead
      // of unconditionally claiming success. Pre-fix wrapper reported success even
      // when AME never received the job (false-success false positives).
      const result = await this.bridge.renderSequence(sequenceId, outputPath, presetPath);

      if (result && result.success === false) {
        return {
          ...result,
          sequenceId,
          outputPath,
          format,
          quality,
          resolution,
        };
      }

      return {
        success: true,
        message: 'Sequence queued in Adobe Media Encoder. Render runs asynchronously — verify by checking the output file size growth.',
        sequenceId,
        outputPath,
        presetPath,
        format,
        quality,
        resolution,
        jobID: result?.jobID,
        queued: result?.queued,
        verify: `ffprobe -show_entries format=duration,size '${outputPath}'`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to export sequence: ${error instanceof Error ? error.message : String(error)}`,
        sequenceId,
        outputPath,
      };
    }
  }

  private defaultExportPresetRoots(): string[] {
    const roots: string[] = [];
    const home = process.env.HOME;

    if (home) {
      roots.push(join(home, 'Library', 'Application Support', 'Adobe', 'Common', 'AME'));
      roots.push(join(home, 'Library', 'Application Support', 'Adobe', 'Adobe Media Encoder'));
      roots.push(join(home, 'Documents', 'Adobe', 'Adobe Media Encoder'));
    }

    roots.push('/Library/Application Support/Adobe/Common/AME');
    return roots;
  }

  private exportPresetInfoFromStat(filePath: string, source: string, stats: { mtimeMs: number; size: number }): ExportPresetInfo {
    const fileName = basename(filePath);
    const extension = extname(fileName);
    return {
      name: extension ? fileName.slice(0, -extension.length) : fileName,
      path: filePath,
      source,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
    };
  }

  private async scanExportPresetRoot(rootPath: string, source: string, warnings: string[]): Promise<ExportPresetInfo[]> {
    const presets: ExportPresetInfo[] = [];
    const maxDepth = 8;

    try {
      const rootStat = await fs.stat(rootPath);
      if (rootStat.isFile()) {
        if (extname(rootPath).toLowerCase() === '.epr') {
          return [this.exportPresetInfoFromStat(rootPath, source, rootStat)];
        }
        warnings.push(`Preset search path is not an .epr file: ${rootPath}`);
        return [];
      }
      if (!rootStat.isDirectory()) {
        warnings.push(`Preset search path is not a file or directory: ${rootPath}`);
        return [];
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Preset search root unavailable: ${rootPath} (${message})`);
      return [];
    }

    const walk = async (currentPath: string, depth: number): Promise<void> => {
      if (depth > maxDepth) {
        return;
      }

      let entries: Dirent[];
      try {
        entries = await fs.readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Unable to read preset directory: ${currentPath} (${message})`);
        return;
      }

      for (const entry of entries) {
        const entryPath = join(currentPath, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath, depth + 1);
          continue;
        }

        if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.epr') {
          continue;
        }

        try {
          const presetStat = await fs.stat(entryPath);
          presets.push(this.exportPresetInfoFromStat(entryPath, source, presetStat));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Unable to stat export preset: ${entryPath} (${message})`);
        }
      }
    };

    await walk(rootPath, 0);
    return presets;
  }

  private async listExportPresets(args: ListExportPresetsArgs): Promise<any> {
    const warnings: string[] = [];
    const rootSpecs: Array<{ path: string; source: string }> = [];

    if (args.includeAdobeDefaults ?? true) {
      for (const root of this.defaultExportPresetRoots()) {
        rootSpecs.push({ path: root, source: 'adobe_default' });
      }
    }

    for (const root of args.searchRoots ?? []) {
      rootSpecs.push({ path: root, source: 'search_root' });
    }

    const uniqueRoots: Array<{ path: string; source: string }> = [];
    const seenRoots = new Set<string>();
    for (const rootSpec of rootSpecs) {
      const normalizedPath = isAbsolute(rootSpec.path) ? rootSpec.path : resolve(rootSpec.path);
      if (seenRoots.has(normalizedPath)) {
        continue;
      }
      seenRoots.add(normalizedPath);
      uniqueRoots.push({ path: normalizedPath, source: rootSpec.source });
    }

    const presets: ExportPresetInfo[] = [];
    const seenPresetPaths = new Set<string>();
    for (const rootSpec of uniqueRoots) {
      const discoveredPresets = await this.scanExportPresetRoot(rootSpec.path, rootSpec.source, warnings);
      for (const preset of discoveredPresets) {
        if (seenPresetPaths.has(preset.path)) {
          continue;
        }
        seenPresetPaths.add(preset.path);
        presets.push(preset);
      }
    }

    const query = args.query?.trim().toLowerCase();
    const filteredPresets = query
      ? presets.filter((preset) => preset.name.toLowerCase().includes(query) || preset.path.toLowerCase().includes(query))
      : presets;

    filteredPresets.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

    return {
      success: true,
      presetCount: filteredPresets.length,
      presets: filteredPresets,
      warnings,
    };
  }

  private async qcRenderedMedia(args: QcRenderedMediaArgs): Promise<any> {
    const warnings: string[] = [];
    const minSizeBytes = args.minSizeBytes ?? 1;
    const durationToleranceSeconds = args.durationToleranceSeconds ?? 0.5;

    let mediaStat: Stats;
    try {
      mediaStat = await fs.stat(args.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        exists: false,
        filePath: args.filePath,
        minSizeBytes,
        durationToleranceSeconds,
        expectedDurationSeconds: args.expectedDurationSeconds,
        error: `Rendered media file not found or unreadable: ${message}`,
        warnings,
      };
    }

    const isFile = mediaStat.isFile();
    const sizeBytes = mediaStat.size;
    const sizeOk = sizeBytes >= minSizeBytes;

    if (!isFile) {
      warnings.push(`Rendered media path exists but is not a regular file: ${args.filePath}`);
    }
    if (!sizeOk) {
      warnings.push(`Rendered media file is smaller than minSizeBytes (${sizeBytes} < ${minSizeBytes}).`);
    }

    const ffprobe: { available: boolean; command: string; durationSeconds?: number; sizeBytes?: number; error?: string } = {
      available: true,
      command: 'ffprobe',
    };
    let durationSeconds: number | undefined;

    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-of', 'json',
        '-show_entries', 'format=duration,size',
        args.filePath,
      ], { timeout: 10_000, maxBuffer: 1024 * 1024 });
      const stdoutText = stdout;
      const parsed = JSON.parse(stdoutText) as { format?: { duration?: string; size?: string } };
      const parsedDuration = Number(parsed.format?.duration);
      if (Number.isFinite(parsedDuration)) {
        durationSeconds = parsedDuration;
        ffprobe.durationSeconds = parsedDuration;
      } else {
        warnings.push('ffprobe did not return a numeric duration; duration QC skipped.');
      }

      const parsedSize = Number(parsed.format?.size);
      if (Number.isFinite(parsedSize)) {
        ffprobe.sizeBytes = parsedSize;
      }
    } catch (error) {
      const childError = error as NodeJS.ErrnoException & { stderr?: unknown };
      const stderrValue = childError.stderr;
      const stderrText = typeof stderrValue === 'string'
        ? stderrValue.trim()
        : Buffer.isBuffer(stderrValue)
          ? stderrValue.toString('utf8').trim()
          : undefined;
      const errorMessage = stderrText || childError.message || String(error);
      ffprobe.error = errorMessage;

      if (childError.code === 'ENOENT') {
        ffprobe.available = false;
        warnings.push('ffprobe is not available on PATH; duration QC skipped.');
      } else {
        warnings.push(`ffprobe failed; duration QC skipped: ${errorMessage}`);
      }
    }

    let durationDeltaSeconds: number | undefined;
    let durationWithinTolerance: boolean | undefined;
    if (args.expectedDurationSeconds !== undefined) {
      if (durationSeconds !== undefined) {
        durationDeltaSeconds = Math.abs(durationSeconds - args.expectedDurationSeconds);
        durationWithinTolerance = durationDeltaSeconds <= durationToleranceSeconds;
        if (!durationWithinTolerance) {
          warnings.push(`Duration is outside tolerance (${durationDeltaSeconds}s > ${durationToleranceSeconds}s).`);
        }
      } else {
        durationWithinTolerance = false;
        warnings.push('Expected duration was provided, but ffprobe duration was unavailable; duration tolerance check failed. Install ffprobe or provide readable media with probeable duration.');
      }
    }

    const success = isFile && sizeOk && durationWithinTolerance !== false;
    const result: Record<string, any> = {
      success,
      exists: true,
      filePath: args.filePath,
      isFile,
      sizeBytes,
      minSizeBytes,
      sizeOk,
      mtimeMs: mediaStat.mtimeMs,
      durationToleranceSeconds,
      ffprobe,
      warnings,
    };

    if (args.expectedDurationSeconds !== undefined) {
      result.expectedDurationSeconds = args.expectedDurationSeconds;
    }
    if (durationSeconds !== undefined) {
      result.durationSeconds = durationSeconds;
    }
    if (durationDeltaSeconds !== undefined) {
      result.durationDeltaSeconds = durationDeltaSeconds;
    }
    if (durationWithinTolerance !== undefined) {
      result.durationWithinTolerance = durationWithinTolerance;
    }
    if (!success) {
      result.error = 'Rendered media QC failed';
    }

    return result;
  }

  private async exportFrame(sequenceId: string, time: number, outputPath: string, format = 'png'): Promise<any> {
    const payload = { sequenceId, time, outputPath, format };
    const script = buildPremiereScript(`
      var payload = ${literalForExtendScript(payload)};
      var sequence = __findSequence(payload.sequenceId);
      if (!sequence) {
        return {
          success: false,
          error: "Sequence not found by id: " + payload.sequenceId,
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath,
          format: payload.format
        };
      }

      if (sequence.openInTimeline) {
        try { sequence.openInTimeline(); } catch (e0) {}
      }

      app.enableQE();
      var qeSequence = qe.project.getActiveSequence();
      if (!qeSequence) {
        return { success: false, error: "QE active sequence not available for frame export" };
      }

      var methodName = payload.format === "jpg" ? "exportFrameJPEG" : (payload.format === "tiff" ? "exportFrameTiff" : "exportFramePNG");
      if (typeof qeSequence[methodName] !== "function") {
        return {
          success: false,
          error: "Frame export format '" + payload.format + "' is not supported by the available Premiere API",
          format: payload.format
        };
      }

      function __extensionForFormat(format) { return format === "jpg" ? ".jpg" : (format === "tiff" ? ".tiff" : ".png"); }
      function __stripFormatExtension(outputPath, format) {
        var ext = __extensionForFormat(format);
        var lowerPath = String(outputPath).toLowerCase();
        if (lowerPath.lastIndexOf(ext) === lowerPath.length - ext.length) return String(outputPath).substring(0, String(outputPath).length - ext.length);
        return String(outputPath);
      }
      var requestedOutputPath = String(payload.outputPath);
      var exportBasePath = __stripFormatExtension(requestedOutputPath, payload.format);
      var actualOutputPath = exportBasePath + __extensionForFormat(payload.format);
      var outputFile = File(actualOutputPath);
      var preExportExists = outputFile.exists;
      var preExportLength = preExportExists ? outputFile.length : null;
      var preExportModified = null;
      if (preExportExists) {
        try { preExportModified = outputFile.modified ? Number(outputFile.modified.getTime()) : null; } catch (ePre) {}
      }
      var staleExistingFile = false;
      var lastOutputExists = preExportExists;
      var lastSizeBytes = preExportExists ? preExportLength : 0;
      var timeNumber = Number(payload.time);
      var timeString = String(timeNumber);
      var timeTicks = timeString;
      try {
        var exportTime = new Time();
        exportTime.seconds = timeNumber;
        timeTicks = String(exportTime.ticks);
      } catch (e1) {}

      var exportError = null;
      function tryExport(timeValue, signatureName) {
        try {
          qeSequence[methodName](String(timeValue), exportBasePath);
          var exportedFile = File(actualOutputPath);
          if (exportedFile.exists) {
            var postExportLength = exportedFile.length;
            lastOutputExists = true;
            lastSizeBytes = postExportLength;
            if (!(postExportLength > 0)) {
              exportError = signatureName + " returned but no non-empty frame file was created";
              return null;
            }
            var postExportModified = null;
            try { postExportModified = exportedFile.modified ? Number(exportedFile.modified.getTime()) : null; } catch (ePost) {}
            var modifiedAfterExport = !preExportExists || (preExportModified !== null && postExportModified !== null && postExportModified > preExportModified);
            var sizeChangedAfterExport = !preExportExists || postExportLength !== preExportLength;
            if (preExportExists && !modifiedAfterExport && !sizeChangedAfterExport) {
              staleExistingFile = true;
              exportError = signatureName + " returned but output path was not modified; refusing to treat stale existing frame as success";
              return null;
            }
            staleExistingFile = false;
            return signatureName;
          }
          exportError = signatureName + " returned without creating " + actualOutputPath;
          lastOutputExists = false;
          lastSizeBytes = 0;
          return null;
        } catch (e2) {
          exportError = signatureName + ": " + e2.toString();
          return null;
        }
      }

      var exportSignature = tryExport(timeString, "secondsString_outputBase") || tryExport(timeTicks, "ticksString_outputBase");

      if (!exportSignature) {
        return {
          success: false,
          error: exportError || "Frame export failed",
          sequenceId: payload.sequenceId,
          time: payload.time,
          outputPath: actualOutputPath,
          requestedOutputPath: requestedOutputPath,
          outputExists: lastOutputExists,
          sizeBytes: lastSizeBytes,
          format: payload.format,
          preExportExists: preExportExists,
          preExportLength: preExportLength,
          preExportModified: preExportModified,
          staleExistingFile: staleExistingFile
        };
      }

      return {
        success: true,
        message: "Frame exported successfully",
        sequenceId: payload.sequenceId,
        time: payload.time,
        outputPath: actualOutputPath,
        requestedOutputPath: requestedOutputPath,
        outputExists: lastOutputExists,
        sizeBytes: lastSizeBytes,
        exportBasePath: exportBasePath,
        exportSignature: exportSignature,
        format: payload.format,
        preExportExists: preExportExists,
        preExportLength: preExportLength,
        preExportModified: preExportModified,
        staleExistingFile: staleExistingFile
      };
    `, '__exportFrame');

    return await this.bridge.executeScript(script);
  }

  private extensionForFrameFormat(format: 'png' | 'jpg' | 'tiff'): string {
    if (format === 'jpg') return '.jpg';
    if (format === 'tiff') return '.tiff';
    return '.png';
  }

  private expectedFrameOutputPath(outputPath: string, format: 'png' | 'jpg' | 'tiff'): string {
    const expectedExtension = this.extensionForFrameFormat(format);
    const currentExtension = extname(outputPath);
    if (currentExtension.toLowerCase() === expectedExtension) {
      return `${outputPath.slice(0, outputPath.length - currentExtension.length)}${expectedExtension}`;
    }
    return `${outputPath}${expectedExtension}`;
  }

  private mimeTypeForFrameFormat(format: 'png' | 'jpg' | 'tiff'): string {
    if (format === 'jpg') return 'image/jpeg';
    if (format === 'tiff') return 'image/tiff';
    return 'image/png';
  }

  private async waitForReadableFile(filePath: string, attempts = 20, delayMs = 100): Promise<Stats | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const fileStat = await fs.stat(filePath);
        if (fileStat.isFile()) {
          return fileStat;
        }
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
    return null;
  }

  private async captureFrame(args: CaptureFrameArgs): Promise<any> {
    const format = args.format ?? 'png';
    const explicitOutputPath = Boolean(args.outputPath);
    let temporaryCaptureDir: string | null = null;
    const outputPath = explicitOutputPath
      ? resolve(args.outputPath as string)
      : join(
        temporaryCaptureDir = await fs.mkdtemp(join(tmpdir(), 'premiere-mcp-capture-frame-')),
        `frame${this.extensionForFrameFormat(format)}`,
      );
    const expectedOutputPath = this.expectedFrameOutputPath(outputPath, format);
    const expectedResolvedOutputPath = resolve(expectedOutputPath);

    if (!isAbsolute(outputPath)) {
      return {
        success: false,
        error: 'outputPath must be absolute when provided',
        outputPath,
      };
    }

    let preExistingFrameStat: Stats | null = null;
    try {
      const candidateStat = await fs.stat(expectedResolvedOutputPath);
      if (candidateStat.isFile()) {
        preExistingFrameStat = candidateStat;
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        return {
          success: false,
          captured: false,
          sequenceId: args.sequenceId,
          time: args.time,
          outputPath: expectedResolvedOutputPath,
          expectedOutputPath,
          error: `Failed to stat existing frame output before export: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    const exportResult = await this.exportFrame(args.sequenceId, args.time, outputPath, format);
    if (!exportResult?.success) {
      return {
        ...exportResult,
        success: false,
        captured: false,
        sequenceId: args.sequenceId,
        time: args.time,
        outputPath: exportResult?.outputPath ?? expectedOutputPath,
        expectedOutputPath,
      };
    }

    const actualOutputPath = resolve(String(exportResult.outputPath ?? expectedOutputPath));
    if (actualOutputPath !== expectedResolvedOutputPath) {
      return {
        ...exportResult,
        success: false,
        captured: false,
        sequenceId: args.sequenceId,
        time: args.time,
        outputPath: actualOutputPath,
        expectedOutputPath,
        error: `Frame export returned an unexpected output path; refusing to read or delete it. Expected ${expectedOutputPath}, got ${actualOutputPath}`,
      };
    }

    const fileStat = await this.waitForReadableFile(actualOutputPath);
    if (!fileStat) {
      return {
        ...exportResult,
        success: false,
        captured: false,
        sequenceId: args.sequenceId,
        time: args.time,
        outputPath: actualOutputPath,
        expectedOutputPath,
        error: `Frame export completed but file was not found: ${actualOutputPath}`,
      };
    }

    if (preExistingFrameStat) {
      const modifiedAfterCapture = fileStat.mtimeMs > preExistingFrameStat.mtimeMs || fileStat.ctimeMs > preExistingFrameStat.ctimeMs;
      const sizeChangedAfterCapture = fileStat.size !== preExistingFrameStat.size;
      if (!modifiedAfterCapture && !sizeChangedAfterCapture) {
        return {
          ...exportResult,
          success: false,
          captured: false,
          sequenceId: args.sequenceId,
          time: args.time,
          outputPath: actualOutputPath,
          expectedOutputPath,
          staleExistingFile: true,
          preCaptureSizeBytes: preExistingFrameStat.size,
          preCaptureModifiedMs: preExistingFrameStat.mtimeMs,
          sizeBytes: fileStat.size,
          modifiedAfterCapture,
          sizeChangedAfterCapture,
          error: 'Frame export returned but output path matches a stale pre-existing frame; refusing to read or delete it.',
        };
      }
    }

    if (fileStat.size <= 0) {
      return {
        ...exportResult,
        success: false,
        captured: false,
        sequenceId: args.sequenceId,
        time: args.time,
        outputPath: actualOutputPath,
        expectedOutputPath,
        sizeBytes: fileStat.size,
        error: 'Frame export created an empty file',
      };
    }

    let frameBytes: Buffer;
    try {
      frameBytes = await fs.readFile(actualOutputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...exportResult,
        success: false,
        captured: false,
        sequenceId: args.sequenceId,
        time: args.time,
        outputPath: actualOutputPath,
        expectedOutputPath,
        sizeBytes: fileStat.size,
        error: `Failed to read captured frame: ${message}`,
      };
    }

    const deleteAfterRead = args.deleteAfterRead ?? !explicitOutputPath;
    let deletedAfterRead = false;
    let cleanupError: string | undefined;
    if (deleteAfterRead) {
      try {
        await fs.unlink(actualOutputPath);
        deletedAfterRead = true;
        if (temporaryCaptureDir) {
          await fs.rmdir(temporaryCaptureDir).catch(() => undefined);
        }
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      ...exportResult,
      success: true,
      captured: true,
      sequenceId: args.sequenceId,
      time: args.time,
      outputPath: actualOutputPath,
      expectedOutputPath,
      format,
      mimeType: this.mimeTypeForFrameFormat(format),
      base64: frameBytes.toString('base64'),
      sizeBytes: fileStat.size,
      deleteAfterRead,
      deletedAfterRead,
      cleanupError,
    };
  }

  private async exportOmf(args: ExportOmfArgs): Promise<any> {
    const audioFileFormat = args.audioFileFormat ?? 'wav';
    const payload = {
      sequenceId: args.sequenceId,
      outputPath: args.outputPath,
      title: args.title ?? null,
      sampleRate: args.sampleRate ?? 48000,
      bitsPerSample: args.bitsPerSample ?? 16,
      audioEncapsulated: args.audioEncapsulated !== false,
      audioFileFormat,
      audioFileFormatCode: audioFileFormat === 'aiff' ? 0 : 1,
      trimAudioFiles: args.trimAudioFiles !== false,
      handleFrames: args.handleFrames ?? 1000,
      dryRun: args.dryRun !== false,
      overwrite: args.overwrite === true,
    };

    const script = buildPremiereScript(`
      var payload = ${literalForExtendScript(payload)};
      var sequence = __findSequence(payload.sequenceId);
      if (!sequence) {
        return {
          success: false,
          error: "Sequence not found by id: " + payload.sequenceId,
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath,
          dryRun: payload.dryRun,
          supported: null
        };
      }

      var exportOmfAvailable = app.project && typeof app.project.exportOMF === "function";
      if (!exportOmfAvailable) {
        return {
          success: payload.dryRun !== false,
          supported: false,
          dryRun: payload.dryRun,
          wouldExport: false,
          sequenceId: payload.sequenceId,
          sequenceName: sequence.name,
          outputPath: payload.outputPath,
          error: "app.project.exportOMF is not available in this Premiere host"
        };
      }

      var plannedTitle = payload.title || sequence.name || "OMFTitle";
      var plannedSettings = {
        title: plannedTitle,
        sampleRate: payload.sampleRate,
        bitsPerSample: payload.bitsPerSample,
        audioEncapsulated: payload.audioEncapsulated,
        audioFileFormat: payload.audioFileFormat,
        audioFileFormatCode: payload.audioFileFormatCode,
        trimAudioFiles: payload.trimAudioFiles,
        handleFrames: payload.handleFrames
      };

      if (payload.dryRun !== false) {
        return {
          success: true,
          supported: true,
          dryRun: true,
          wouldExport: true,
          sequenceId: payload.sequenceId,
          sequenceName: sequence.name,
          outputPath: payload.outputPath,
          settings: plannedSettings
        };
      }

      var outputFile = new File(payload.outputPath);
      var preExportExists = outputFile.exists;
      var preExportLength = preExportExists ? outputFile.length : 0;
      var preExportModified = null;
      try {
        preExportModified = preExportExists && outputFile.modified ? outputFile.modified.getTime() : null;
      } catch (preModifiedError) {}
      if (preExportExists && payload.overwrite !== true) {
        return {
          success: false,
          supported: true,
          dryRun: false,
          exported: false,
          outputExists: true,
          sequenceId: payload.sequenceId,
          sequenceName: sequence.name,
          outputPath: payload.outputPath,
          settings: plannedSettings,
          error: "Output OMF already exists; pass overwrite:true to allow Premiere to replace it."
        };
      }

      var exportReturnValue = null;
      try {
        exportReturnValue = app.project.exportOMF(
          sequence,
          payload.outputPath,
          plannedTitle,
          payload.sampleRate,
          payload.bitsPerSample,
          payload.audioEncapsulated ? 1 : 0,
          payload.audioFileFormatCode,
          payload.trimAudioFiles ? 1 : 0,
          payload.handleFrames
        );
      } catch (exportError) {
        return {
          success: false,
          supported: true,
          dryRun: false,
          exported: false,
          sequenceId: payload.sequenceId,
          sequenceName: sequence.name,
          outputPath: payload.outputPath,
          settings: plannedSettings,
          error: "exportOMF threw: " + exportError.toString()
        };
      }

      outputFile = new File(payload.outputPath);
      var outputExists = outputFile.exists;
      var sizeBytes = outputExists ? outputFile.length : 0;
      var postExportModified = null;
      try {
        postExportModified = outputExists && outputFile.modified ? outputFile.modified.getTime() : null;
      } catch (postModifiedError) {}
      var modifiedAfterExport = !preExportExists || (postExportModified !== null && preExportModified !== null && postExportModified > preExportModified);
      var sizeChangedAfterExport = !preExportExists || sizeBytes !== preExportLength;
      var staleExistingFile = outputExists && sizeBytes > 0 && preExportExists && !modifiedAfterExport && !sizeChangedAfterExport;
      var verified = outputExists && sizeBytes > 0 && !staleExistingFile;
      return {
        success: verified,
        supported: true,
        dryRun: false,
        exported: verified,
        outputExists: outputExists,
        sizeBytes: sizeBytes,
        preExportExists: preExportExists,
        preExportLength: preExportLength,
        preExportModified: preExportModified,
        postExportModified: postExportModified,
        modifiedAfterExport: modifiedAfterExport,
        sizeChangedAfterExport: sizeChangedAfterExport,
        staleExistingFile: staleExistingFile,
        sequenceId: payload.sequenceId,
        sequenceName: sequence.name,
        outputPath: payload.outputPath,
        settings: plannedSettings,
        exportReturnValue: exportReturnValue,
        error: verified ? null : (staleExistingFile ? "exportOMF returned but output path was not modified; refusing to treat stale existing OMF as success" : "exportOMF returned but no non-empty OMF file was created")
      };
    `, '__exportOmf');

    return await this.bridge.executeScript(script);
  }

  // Advanced Features Implementation
  private async stabilizeClip(clipId: string, _method = 'warp', smoothness = 50): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        var effect = qe.project.getVideoEffectByName("Warp Stabilizer");
        if (!effect) return JSON.stringify({ success: false, error: "Warp Stabilizer effect not found" });
        qeClip.addVideoEffect(effect);
        var clip = info.clip;
        var lastComp = clip.components[clip.components.numItems - 1];
        for (var j = 0; j < lastComp.properties.numItems; j++) {
          try {
            if (lastComp.properties[j].displayName === "Smoothness") lastComp.properties[j].setValue(${smoothness}, true);
          } catch (e2) {}
        }
        return JSON.stringify({ success: true, message: "Warp Stabilizer applied", clipId: "${clipId}", smoothness: ${smoothness} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  private async speedChange(clipId: string, speed: number, maintainAudio = true): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var info = __findClip("${clipId}");
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var oldSpeed = info.clip.getSpeed();
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = info.trackType === 'video' ? qeSeq.getVideoTrackAt(info.trackIndex) : qeSeq.getAudioTrackAt(info.trackIndex);
        var qeClip = qeTrack.getItemAt(info.clipIndex);
        try { qeClip.setSpeed(${speed}, ${maintainAudio}); } catch(e2) {
          return JSON.stringify({ success: false, error: "Speed change via QE DOM not available: " + e2.toString() });
        }
        return JSON.stringify({ success: true, oldSpeed: oldSpeed, newSpeed: ${speed} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;

    return await this.bridge.executeScript(script);
  }

  // ============================================
  // NEW TOOLS IMPLEMENTATION
  // ============================================

  // Markers Implementation
  private async addMarker(_sequenceId: string, time: number, name: string, comment?: string, color?: string, duration?: number): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var marker = sequence.markers.createMarker(${time});
          marker.name = ${JSON.stringify(name)};
          ${comment ? `marker.comments = ${JSON.stringify(comment)};` : ''}
          ${color ? `marker.setColorByIndex(${color === 'red' ? '5' : color === 'green' ? '3' : color === 'blue' ? '1' : '0'});` : ''}
          ${duration && duration > 0 ? `marker.end = ${time + duration};` : ''}

          return JSON.stringify({
            success: true,
            markerId: marker.guid,
            message: "Marker added successfully"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async deleteMarker(sequenceId: string, markerId: string): Promise<any> {
    const sequenceIdLiteral = literalForExtendScript(sequenceId);
    const markerIdLiteral = literalForExtendScript(markerId);
    const sequenceNotFoundLiteral = literalForExtendScript(`Sequence not found by id: ${sequenceId}`);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: ${sequenceNotFoundLiteral}
          });
        } else {
          var marker = null;
          var markerIndex = -1;
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var candidate = sequence.markers[i];
            if (candidate && String(candidate.guid) === String(${markerIdLiteral})) {
              marker = candidate;
              markerIndex = i;
              break;
            }
          }

          if (!marker) {
            return JSON.stringify({
              success: false,
              markerId: ${markerIdLiteral},
              message: "Marker not found",
              postconditionVerified: true
            });
          }

          sequence.markers.deleteMarker(marker);

          var stillPresent = false;
          for (var verifyIndex = 0; verifyIndex < sequence.markers.numMarkers; verifyIndex++) {
            var verifyMarker = sequence.markers[verifyIndex];
            if (verifyMarker && String(verifyMarker.guid) === String(${markerIdLiteral})) {
              stillPresent = true;
              break;
            }
          }

          return JSON.stringify({
            success: !stillPresent,
            markerId: ${markerIdLiteral},
            markerIndex: markerIndex,
            deletionArgumentType: "Marker",
            postconditionVerified: !stillPresent,
            message: !stillPresent ? "Marker deleted successfully" : "Marker delete call returned but marker is still present"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async updateMarker(_sequenceId: string, markerId: string, updates: any): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var found = false;
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var marker = sequence.markers[i];
            if (marker.guid === ${JSON.stringify(markerId)}) {
              ${updates.name ? `marker.name = ${JSON.stringify(updates.name)};` : ''}
              ${updates.comment ? `marker.comments = ${JSON.stringify(updates.comment)};` : ''}
              ${updates.color ? `marker.setColorByIndex(${updates.color === 'red' ? '5' : updates.color === 'green' ? '3' : updates.color === 'blue' ? '1' : '0'});` : ''}
              found = true;
              break;
            }
          }

          return JSON.stringify({
            success: found,
            message: found ? "Marker updated successfully" : "Marker not found"
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async listMarkers(_sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var markers = [];
          for (var i = 0; i < sequence.markers.numMarkers; i++) {
            var marker = sequence.markers[i];
            markers.push({
              id: marker.guid,
              name: marker.name,
              comment: marker.comments,
              start: marker.start.seconds,
              end: marker.end.seconds,
              duration: marker.end.seconds - marker.start.seconds,
              type: marker.type
            });
          }

          return JSON.stringify({
            success: true,
            markers: markers,
            count: markers.length
          });
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Track Management Implementation
  // FIX vs upstream: upstream called qeSeq.addTracks(numVideo, numAudio, 0) which interpreted
  // the 3rd arg as videoInsertIndex = 0, meaning "insert NEW track AT INDEX 0", pushing all
  // existing tracks up by 1. This destroyed V1's content positioning relative to track names
  // and caused MOGRT inserts to land on the wrong track.
  //
  // QE DOM signature: Sequence.addTracks(videoCount, videoInsertIndex, audioCount,
  //   audioInsertIndex, audioMediaType, audioSubmixCount, audioSubmixInsertIndex)
  //
  // Now we honor the `position` param:
  //   - "above" (default) → insert at index = numVideoTracks (becomes new TOP track,
  //     existing tracks keep their indices)
  //   - "below" → insert at 0 (legacy behavior, pushes existing up — only useful in special
  //     cases since V1 in Premiere's UI is the bottom)
  private async addTrack(sequenceId: string, trackType: string, position: string = 'above'): Promise<any> {
    const isVideo = trackType === 'video';
    const numVideo = isVideo ? 1 : 0;
    const numAudio = isVideo ? 0 : 1;
    const script = `
      try {
        app.enableQE();
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        app.project.activeSequence = seq;
        var qeSeq = qe.project.getActiveSequence();

        // Calculate insertion index based on position
        var existingVideoTracks = seq.videoTracks.numTracks;
        var existingAudioTracks = seq.audioTracks.numTracks;
        var insertVideoIdx = (${JSON.stringify(position)} === 'above') ? existingVideoTracks : 0;
        var insertAudioIdx = (${JSON.stringify(position)} === 'above') ? existingAudioTracks : 0;

        // Full QE addTracks signature
        qeSeq.addTracks(${numVideo}, insertVideoIdx, ${numAudio}, insertAudioIdx, 1, 0, 0);

        var afterVideoTracks = seq.videoTracks.numTracks;
        var afterAudioTracks = seq.audioTracks.numTracks;

        return JSON.stringify({
          success: true,
          message: "${trackType} track added at " + ${JSON.stringify(position)},
          trackType: "${trackType}",
          position: ${JSON.stringify(position)},
          videoTracksBefore: existingVideoTracks,
          videoTracksAfter: afterVideoTracks,
          audioTracksBefore: existingAudioTracks,
          audioTracksAfter: afterAudioTracks,
          newVideoTrackIndex: ${isVideo ? `(${JSON.stringify(position)} === 'above') ? existingVideoTracks : 0` : 'null'},
          newAudioTrackIndex: ${!isVideo ? `(${JSON.stringify(position)} === 'above') ? existingAudioTracks : 0` : 'null'}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async deleteTrack(_sequenceId: string, trackType: string, trackIndex: number): Promise<any> {
    if (trackType === 'caption') {
      return {
        success: false,
        error: 'Caption track deletion is not supported by Premiere Pro scripting. The ExtendScript DOM exposes no sequence.captionTracks/getCaptionTracks surface, and the QE DOM exposes no caption-track accessor or delete method.',
        sequenceId: _sequenceId,
        trackType,
        trackIndex,
        unsupportedByPremiereApi: true,
        workaround: 'Delete caption tracks manually in Premiere, or remove/recreate captions from the source .srt before creating the caption track.'
      };
    }

    const sequenceIdLiteral = literalForExtendScript(_sequenceId);
    const script = `
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found",
            sequenceId: ${sequenceIdLiteral},
            mutationAttempted: false
          });
        } else {
          var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
          if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
            tracks.deleteTrack(${trackIndex});
            return JSON.stringify({
              success: true,
              message: "Track deleted successfully"
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async lockTrack(_sequenceId: string, trackType: string, trackIndex: number, locked: boolean): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          var tracks = ${trackType === 'video' ? 'sequence.videoTracks' : 'sequence.audioTracks'};
          if (${trackIndex} >= 0 && ${trackIndex} < tracks.numTracks) {
            tracks[${trackIndex}].setLocked(${locked});
            return JSON.stringify({
              success: true,
              message: "Track " + (${locked} ? "locked" : "unlocked")
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async toggleTrackVisibility(_sequenceId: string, trackIndex: number, visible: boolean): Promise<any> {
    const script = `
      try {
        var sequence = app.project.activeSequence;
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "No active sequence"
          });
        } else {
          if (${trackIndex} >= 0 && ${trackIndex} < sequence.videoTracks.numTracks) {
            sequence.videoTracks[${trackIndex}].setTargeted(${visible}, true);
            return JSON.stringify({
              success: true,
              message: "Track visibility toggled"
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Track index out of range"
            });
          }
        }
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async linkAudioVideo(clipId: string, linked: boolean): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        info.clip.setSelected(1, 1);
        var seq = app.project.activeSequence;
        if (${linked}) { seq.linkSelection(); } else { seq.unlinkSelection(); }
        return JSON.stringify({ success: true, message: "Clip " + (${linked} ? "linked" : "unlinked") });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async applyAudioEffect(clipId: string, effectName: string, parameters?: any): Promise<any> {
    return await this.applyEffect(clipId, effectName, parameters);
  }

  // BULK helper: apply same audio effect + parameters to all audio clips of a sequence in ONE
  // ExtendScript round-trip. Activates the target sequence first (QE DOM operates on active).
  // Returns per-clip results with valueAfter readback for the SET parameters.
  private async applyAudioEffectToAllClips(sequenceId: string, effectName: string, parameters?: Record<string, any>): Promise<any> {
    const paramJson = JSON.stringify(parameters || {});
    const script = `
      try {
        app.enableQE();
        var seq = __findSequence("${sequenceId}");
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        // Make target active so QE DOM can address it
        app.project.activeSequence = seq;
        var qeSeq = qe.project.getActiveSequence();
        var effect = qe.project.getAudioEffectByName("${effectName}");
        if (!effect) return JSON.stringify({ success: false, error: "Audio effect not found: ${effectName}" });

        var requestedParams = ${paramJson};
        function normalize(s) { return String(s).toLowerCase().replace(/[\\s_-]+/g, ''); }

        var perClip = [];
        for (var t = 0; t < seq.audioTracks.numTracks; t++) {
          var track = seq.audioTracks[t];
          var qeTrack = qeSeq.getAudioTrackAt(t);
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var qeClip = qeTrack.getItemAt(c);
            try {
              qeClip.addAudioEffect(effect);
              var newCompIdx = clip.components.numItems - 1;
              var newComp = clip.components[newCompIdx];
              var paramResults = [];
              for (var pName in requestedParams) {
                if (requestedParams.hasOwnProperty && !requestedParams.hasOwnProperty(pName)) continue;
                var requestedVal = requestedParams[pName];
                var matched = null;
                for (var k = 0; k < newComp.properties.numItems; k++) {
                  if (String(newComp.properties[k].displayName) === pName) {
                    matched = newComp.properties[k]; break;
                  }
                }
                if (!matched) {
                  var nameN = normalize(pName);
                  for (var k = 0; k < newComp.properties.numItems; k++) {
                    if (normalize(String(newComp.properties[k].displayName)) === nameN) {
                      matched = newComp.properties[k]; break;
                    }
                  }
                }
                if (matched) {
                  try {
                    matched.setValue(requestedVal, true);
                    var valueAfter = null;
                    try { valueAfter = matched.getValue(); } catch (eA) {}
                    paramResults.push({ name: pName, ok: true, valueRequested: requestedVal, valueAfter: valueAfter });
                  } catch (e1) {
                    paramResults.push({ name: pName, ok: false, error: e1.toString() });
                  }
                } else {
                  paramResults.push({ name: pName, ok: false, error: "no matching property" });
                }
              }
              perClip.push({ clipIndex: c, trackIndex: t, clipId: String(clip.nodeId), name: String(clip.name), ok: true, paramResults: paramResults });
            } catch (e2) {
              perClip.push({ clipIndex: c, trackIndex: t, clipId: String(clip.nodeId), name: String(clip.name), ok: false, error: e2.toString() });
            }
          }
        }

        return JSON.stringify({
          success: true,
          sequenceId: "${sequenceId}",
          sequenceName: String(seq.name),
          effectName: "${effectName}",
          totalClipsProcessed: perClip.length,
          allOk: perClip.every ? perClip.every(function(r){return r.ok;}) : true,
          perClip: perClip
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: "QE DOM error: " + e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Nested Sequences
  private async createNestedSequence(_clipIds: string[], _name: string): Promise<any> {
    return {
      success: false,
      error: "create_nested_sequence: This feature requires selection and nesting APIs. Implementation pending.",
      note: "You can manually nest clips via right-click > Nest"
    };
  }

  private async unnestSequence(_nestedSequenceClipId: string): Promise<any> {
    return {
      success: false,
      error: "unnest_sequence: This feature is not available in Premiere Pro scripting API",
      note: "You can manually unnest via Edit > Paste Attributes"
    };
  }

  // Additional Clip Operations
  private async duplicateClip(clipId: string, offset?: number): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var projItem = clip.projectItem;
        var insertTime = clip.end.seconds + ${offset !== undefined ? offset : 0};
        info.track.overwriteClip(projItem, insertTime);
        return JSON.stringify({ success: true, message: "Clip duplicated at " + insertTime + "s" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async reverseClip(clipId: string, maintainAudioPitch?: boolean): Promise<any> {
    return await this.speedChange(clipId, -100, maintainAudioPitch !== false);
  }

  private async enableDisableClip(clipId: string, enabled: boolean): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        info.clip.disabled = ${!enabled};
        return JSON.stringify({
          success: true,
          message: "Clip " + (${enabled} ? "enabled" : "disabled")
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async replaceClip(clipId: string, newProjectItemId: string, _preserveEffects?: boolean): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var newItem = __findProjectItem(${JSON.stringify(newProjectItemId)});
        if (!newItem) return JSON.stringify({ success: false, error: "New project item not found" });
        var startTime = info.clip.start.seconds;
        info.clip.remove(false, true);
        info.track.overwriteClip(newItem, startTime);
        return JSON.stringify({ success: true, message: "Clip replaced" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Project Settings
  private async getSequenceSettings(_sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(_sequenceId)});
        if (!sequence) {
          return JSON.stringify({
            success: false,
            error: "Sequence not found by id: " + ${JSON.stringify(_sequenceId)}
          });
        }
        var settings = sequence.getSettings();
        return JSON.stringify({
          success: true,
          settings: {
            name: sequence.name,
            sequenceID: sequence.sequenceID,
            width: settings.videoFrameWidth,
            height: settings.videoFrameHeight,
            timebase: sequence.timebase,
            videoDisplayFormat: settings.videoDisplayFormat,
            audioChannelType: settings.audioChannelType,
            audioSampleRate: settings.audioSampleRate
          }
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async setSequenceSettings(_sequenceId: string, _settings: any): Promise<any> {
    return {
      success: false,
      error: "set_sequence_settings: Sequence settings cannot be changed after creation in Premiere Pro",
      note: "Create a new sequence with desired settings instead"
    };
  }

  private async getClipProperties(clipId: string, sequenceId?: string): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)}, ${sequenceId ? JSON.stringify(sequenceId) : 'null'});
        if (!info) return JSON.stringify({ success: false, error: ${sequenceId ? JSON.stringify(`Clip not found in sequence: ${sequenceId}`) : '"Clip not found"'} });
        var clip = info.clip;
        return JSON.stringify({
          success: true,
          properties: {
            name: clip.name,
            start: clip.start.seconds,
            end: clip.end.seconds,
            duration: clip.duration.seconds,
            inPoint: clip.inPoint.seconds,
            outPoint: clip.outPoint.seconds,
            enabled: !clip.disabled,
            trackIndex: info.trackIndex,
            trackType: info.trackType,
            sequenceId: info.sequenceId,
            sequenceName: info.sequenceName,
            speed: clip.getSpeed()
          }
        });
      } catch (e) {
        return JSON.stringify({
          success: false,
          error: e.toString()
        });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async setClipProperties(clipId: string, properties: any): Promise<any> {
    const propCode = [
      properties?.opacity !== undefined ? `if (p.displayName === "Opacity") p.setValue(${properties.opacity}, true);` : '',
      properties?.scale !== undefined ? `if (p.displayName === "Scale") p.setValue(${properties.scale}, true);` : '',
      properties?.rotation !== undefined ? `if (p.displayName === "Rotation") p.setValue(${properties.rotation}, true);` : '',
    ].filter(Boolean).join('\n              ');

    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          for (var j = 0; j < comp.properties.numItems; j++) {
            var p = comp.properties[j];
            try {
              ${propCode}
            } catch (e2) {}
          }
        }
        return JSON.stringify({ success: true, message: "Clip properties updated" });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Render Queue
  private async addToRenderQueue(sequenceId: string, outputPath: string, presetPath?: string, _startImmediately?: boolean): Promise<any> {
    return await this.exportSequence(sequenceId, outputPath, presetPath);
  }

  private async getRenderQueueStatus(): Promise<any> {
    return {
      success: false,
      error: "get_render_queue_status: Render queue monitoring requires Adobe Media Encoder integration",
      note: "Check Adobe Media Encoder application for render status"
    };
  }

  // Playhead & Work Area Implementation
  private async getPlayheadPosition(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var pos = sequence.getPlayerPosition();
        return JSON.stringify({
          success: true,
          position: __ticksToSeconds(pos.ticks),
          ticks: pos.ticks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async setPlayheadPosition(sequenceId: string, time: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var ticks = __secondsToTicks(${time});
        sequence.setPlayerPosition(ticks);
        return JSON.stringify({
          success: true,
          message: "Playhead position set",
          time: ${time}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private buildTrackTargetingHelpersScript(): string {
    return `
      function __resolveTrackSequence(sequenceId) {
        if (sequenceId) return __findSequence(sequenceId);
        if (!app.project || !app.project.activeSequence) return null;
        return app.project.activeSequence;
      }

      function __trackCollection(sequence, trackType) {
        return trackType === 'video' ? sequence.videoTracks : sequence.audioTracks;
      }

      function __trackCollectionName(trackType) {
        return trackType === 'video' ? 'videoTracks' : 'audioTracks';
      }

      function __resolveTrack(sequence, trackType, trackIndex) {
        var tracks = __trackCollection(sequence, trackType);
        if (!tracks) return { success: false, supported: true, error: 'Sequence has no ' + __trackCollectionName(trackType) + ' collection' };
        if (trackIndex >= tracks.numTracks) return { success: false, supported: true, error: 'Track index out of range: ' + trackIndex, trackType: trackType, trackIndex: trackIndex, trackCount: tracks.numTracks };
        return { success: true, supported: true, track: tracks[trackIndex], trackCount: tracks.numTracks };
      }

      function __readTrackTargeted(track) {
        if (!track || typeof track.isTargeted !== 'function') {
          return { supported: false, targeted: null, error: 'Track.isTargeted is not available on this Premiere host' };
        }
        try {
          var isTargeted = track.isTargeted();
          return { supported: true, targeted: isTargeted };
        } catch (targetError) {
          return { supported: false, targeted: null, error: targetError.toString() };
        }
      }

      function __readTrackName(track, trackType, trackIndex) {
        try { return track.name || (trackType === 'video' ? 'Video ' : 'Audio ') + (trackIndex + 1); } catch (_) { return (trackType === 'video' ? 'Video ' : 'Audio ') + (trackIndex + 1); }
      }

      function __readTrackDetails(track, trackType, trackIndex) {
        var info = {
          success: true,
          supported: true,
          trackType: trackType,
          trackIndex: trackIndex,
          name: __readTrackName(track, trackType, trackIndex),
          clipCount: 0,
          clips: [],
          transitions: [],
          warnings: []
        };
        try { info.clipCount = track.clips.numItems; } catch (clipCountError) { info.warnings.push('clipCountUnavailable: ' + clipCountError.toString()); }
        try { info.isLocked = track.isLocked(); } catch (lockError) { info.lockedUnavailable = lockError.toString(); }
        try { info.isMuted = track.isMuted(); } catch (muteError) { info.mutedUnavailable = muteError.toString(); }
        var targeted = __readTrackTargeted(track);
        info.isTargeted = targeted.supported ? targeted.targeted : null;
        info.targetingSupported = targeted.supported;
        if (targeted.error) info.targetingError = targeted.error;

        try {
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            var clipInfo = {
              index: c,
              nodeId: clip.nodeId || null,
              name: clip.name || null,
              startSeconds: __ticksToSeconds(clip.start.ticks),
              endSeconds: __ticksToSeconds(clip.end.ticks),
              durationSeconds: __ticksToSeconds(clip.duration.ticks)
            };
            try { clipInfo.enabled = !clip.isDisabled(); } catch (_) { clipInfo.enabled = true; }
            try { clipInfo.speed = clip.getSpeed(); } catch (_) {}
            try { clipInfo.projectItemId = clip.projectItem ? clip.projectItem.nodeId : null; } catch (_) {}
            info.clips.push(clipInfo);
          }
        } catch (clipsError) {
          info.warnings.push('clipsUnavailable: ' + clipsError.toString());
        }

        try {
          for (var t = 0; t < track.transitions.numItems; t++) {
            var transition = track.transitions[t];
            info.transitions.push({
              index: t,
              name: transition.name || null,
              startSeconds: __ticksToSeconds(transition.start.ticks),
              endSeconds: __ticksToSeconds(transition.end.ticks)
            });
          }
        } catch (transitionError) {
          info.transitionsUnavailable = transitionError.toString();
        }
        return info;
      }
    `;
  }

  private async setTargetTrack(args: SetTargetTrackArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType,
      trackIndex: args.trackIndex,
      targeted: args.targeted
    });
    const script = buildPremiereScript(`
      ${this.buildTrackTargetingHelpersScript()}
      var payload = ${payload};
      var seq = __resolveTrackSequence(payload.sequenceId);
      if (!seq) return { success: false, supported: true, error: payload.sequenceId ? 'Sequence not found by id: ' + payload.sequenceId : 'No active sequence' };
      var resolved = __resolveTrack(seq, payload.trackType, payload.trackIndex);
      if (!resolved.success) return resolved;
      var track = resolved.track;
      if (!track || typeof track.setTargeted !== 'function') {
        return { success: false, supported: false, error: 'Track.setTargeted is not available on this Premiere host', trackType: payload.trackType, trackIndex: payload.trackIndex };
      }
      var before = __readTrackTargeted(track);
      try {
        track.setTargeted(payload.targeted, payload.trackType === "video");
      } catch (setError) {
        return { success: false, supported: true, error: setError.toString(), trackType: payload.trackType, trackIndex: payload.trackIndex };
      }
      var after = __readTrackTargeted(track);
      return {
        success: true,
        supported: true,
        sequenceId: seq.sequenceID || payload.sequenceId || null,
        sequenceName: seq.name || null,
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        trackName: __readTrackName(track, payload.trackType, payload.trackIndex),
        requestedTargeted: payload.targeted,
        targeted: after.supported ? after.targeted : null,
        targetingReadbackSupported: after.supported,
        previousTargeted: before.supported ? before.targeted : null,
        readbackError: after.error || null
      };
    `, '__setTargetTrack');

    return await this.bridge.executeScript(script);
  }

  private async getTargetTracks(args: GetTargetTracksArgs): Promise<any> {
    const payload = literalForExtendScript({ sequenceId: args.sequenceId ?? null });
    const script = buildPremiereScript(`
      ${this.buildTrackTargetingHelpersScript()}
      var payload = ${payload};
      var seq = __resolveTrackSequence(payload.sequenceId);
      if (!seq) return { success: false, supported: true, error: payload.sequenceId ? 'Sequence not found by id: ' + payload.sequenceId : 'No active sequence' };
      var targets = { success: true, supported: false, sequenceId: seq.sequenceID || payload.sequenceId || null, sequenceName: seq.name || null, video: [], audio: [], tracks: { video: [], audio: [] }, errors: [] };
      function __recordTargetTrack(track, index, trackType) {
        var targeted = __readTrackTargeted(track);
        var record = { index: index, name: __readTrackName(track, trackType, index), targeted: targeted.supported ? targeted.targeted : null, targetingSupported: targeted.supported };
        if (targeted.error) record.error = targeted.error;
        targets.tracks[trackType].push(record);
        if (targeted.supported) targets.supported = true;
        if (targeted.supported && targeted.targeted) {
          if (trackType === 'video') targets.video.push({ index: index, name: record.name });
          if (trackType === 'audio') targets.audio.push({ index: index, name: record.name });
        }
      }
      try {
        for (var v = 0; v < seq.videoTracks.numTracks; v++) __recordTargetTrack(seq.videoTracks[v], v, 'video');
      } catch (videoError) { targets.errors.push('videoTargetsUnavailable: ' + videoError.toString()); }
      try {
        for (var a = 0; a < seq.audioTracks.numTracks; a++) __recordTargetTrack(seq.audioTracks[a], a, 'audio');
      } catch (audioError) { targets.errors.push('audioTargetsUnavailable: ' + audioError.toString()); }
      if (!targets.supported) targets.error = 'Track.isTargeted is not available on this Premiere host';
      return targets;
    `, '__getTargetTracks');

    return await this.bridge.executeScript(script);
  }

  private async setAllTracksTargeted(args: SetAllTracksTargetedArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType ?? 'both',
      targeted: args.targeted
    });
    const script = buildPremiereScript(`
      ${this.buildTrackTargetingHelpersScript()}
      var payload = ${payload};
      var seq = __resolveTrackSequence(payload.sequenceId);
      if (!seq) return { success: false, supported: true, error: payload.sequenceId ? 'Sequence not found by id: ' + payload.sequenceId : 'No active sequence' };
      var result = { success: true, supported: true, sequenceId: seq.sequenceID || payload.sequenceId || null, sequenceName: seq.name || null, trackType: payload.trackType, targeted: payload.targeted, affected: 0, videoAffected: 0, audioAffected: 0, errors: [] };
      function __applyTrackTarget(track, index, trackType, isVideo) {
        if (!track || typeof track.setTargeted !== 'function') {
          result.errors.push({ trackType: trackType, trackIndex: index, supported: false, error: 'Track.setTargeted is not available on this Premiere host' });
          return;
        }
        try {
          track.setTargeted(payload.targeted, isVideo);
          result.affected++;
          if (trackType === 'video') result.videoAffected++;
          if (trackType === 'audio') result.audioAffected++;
        } catch (setError) {
          result.errors.push({ trackType: trackType, trackIndex: index, supported: true, error: setError.toString() });
        }
      }
      if (payload.trackType !== "audio") {
        try {
          for (var v = 0; v < seq.videoTracks.numTracks; v++) __applyTrackTarget(seq.videoTracks[v], v, 'video', true);
        } catch (videoError) { result.errors.push({ trackType: 'video', error: videoError.toString() }); }
      }
      if (payload.trackType !== "video") {
        try {
          for (var a = 0; a < seq.audioTracks.numTracks; a++) __applyTrackTarget(seq.audioTracks[a], a, 'audio', false);
        } catch (audioError) { result.errors.push({ trackType: 'audio', error: audioError.toString() }); }
      }
      if (result.affected === 0 && result.errors.length > 0) result.supported = false;
      return result;
    `, '__setAllTracksTargeted');

    return await this.bridge.executeScript(script);
  }

  private async renameTrack(args: RenameTrackArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType,
      trackIndex: args.trackIndex,
      name: args.name
    });
    const script = buildPremiereScript(`
      ${this.buildTrackTargetingHelpersScript()}
      var payload = ${payload};
      var seq = __resolveTrackSequence(payload.sequenceId);
      if (!seq) return { success: false, supported: true, error: payload.sequenceId ? 'Sequence not found by id: ' + payload.sequenceId : 'No active sequence' };
      var resolved = __resolveTrack(seq, payload.trackType, payload.trackIndex);
      if (!resolved.success) return resolved;
      var track = resolved.track;
      var oldName = __readTrackName(track, payload.trackType, payload.trackIndex);
      try {
        track.name = payload.name;
      } catch (renameError) {
        return { success: false, supported: false, error: 'Track renaming is not available on this Premiere host: ' + renameError.toString(), trackType: payload.trackType, trackIndex: payload.trackIndex, oldName: oldName };
      }
      var verifiedName = __readTrackName(track, payload.trackType, payload.trackIndex);
      return {
        success: verifiedName === payload.name,
        supported: true,
        sequenceId: seq.sequenceID || payload.sequenceId || null,
        sequenceName: seq.name || null,
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        oldName: oldName,
        newName: verifiedName,
        requestedName: payload.name,
        postconditionVerified: verifiedName === payload.name
      };
    `, '__renameTrack');

    return await this.bridge.executeScript(script);
  }

  private async getTrackInfo(args: TrackTargetScopeArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType,
      trackIndex: args.trackIndex
    });
    const script = buildPremiereScript(`
      ${this.buildTrackTargetingHelpersScript()}
      var payload = ${payload};
      var seq = __resolveTrackSequence(payload.sequenceId);
      if (!seq) return { success: false, supported: true, error: payload.sequenceId ? 'Sequence not found by id: ' + payload.sequenceId : 'No active sequence' };
      var resolved = __resolveTrack(seq, payload.trackType, payload.trackIndex);
      if (!resolved.success) return resolved;
      var info = __readTrackDetails(resolved.track, payload.trackType, payload.trackIndex);
      info.sequenceId = seq.sequenceID || payload.sequenceId || null;
      info.sequenceName = seq.name || null;
      info.trackCount = resolved.trackCount;
      return info;
    `, '__getTrackInfo');

    return await this.bridge.executeScript(script);
  }

  private buildSelectionHelpersScript(): string {
    return `
      function __resolveSelectionSequence(sequenceId) {
        if (sequenceId) return __findSequence(sequenceId);
        if (!app.project || !app.project.activeSequence) return null;
        return app.project.activeSequence;
      }

      function __selectionStats() {
        return {
          inspected: 0,
          selected: 0,
          deselected: 0,
          selectedVideo: 0,
          selectedAudio: 0,
          deselectedVideo: 0,
          deselectedAudio: 0,
          errors: []
        };
      }

      function __clipSeconds(timeLike) {
        if (!timeLike) return 0;
        if (typeof timeLike.seconds === 'number') return timeLike.seconds;
        if (timeLike.seconds !== undefined) return Number(timeLike.seconds);
        if (timeLike.ticks !== undefined) return __ticksToSeconds(timeLike.ticks);
        return Number(timeLike) || 0;
      }

      function __visitSelectionClips(seq, payload, visitor, stats) {
        function scanTracks(tracks, type) {
          if (!tracks) return;
          for (var t = 0; t < tracks.numTracks; t++) {
            if (typeof payload.trackIndex === 'number' && t !== payload.trackIndex) continue;
            var track = tracks[t];
            if (!track || !track.clips) continue;
            for (var c = 0; c < track.clips.numItems; c++) {
              var clip = track.clips[c];
              if (!clip) continue;
              stats.inspected++;
              visitor(clip, type, t, c, stats);
            }
          }
        }

        if (payload.trackType !== "audio") scanTracks(seq.videoTracks, "video");
        if (payload.trackType !== "video") scanTracks(seq.audioTracks, "audio");
        return stats;
      }
    `;
  }

  private async selectClipsByName(args: SelectClipsByNameArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType ?? 'both',
      trackIndex: args.trackIndex ?? null,
      name: args.name,
      addToSelection: args.addToSelection ?? false,
      caseSensitive: args.caseSensitive ?? false
    });
    const script = buildPremiereScript(`
      var payload = ${payload};
      ${this.buildSelectionHelpersScript()}
      var seq = __resolveSelectionSequence(payload.sequenceId);
      if (!seq) return { success: false, error: payload.sequenceId ? 'Sequence not found: ' + payload.sequenceId : 'No active sequence' };
      var stats = __selectionStats();
      var needle = payload.caseSensitive ? String(payload.name) : String(payload.name).toLowerCase();
      __visitSelectionClips(seq, payload, function(clip, type, trackIndex, clipIndex, localStats) {
        var haystack = payload.caseSensitive ? String(clip.name || '') : String(clip.name || '').toLowerCase();
        if (haystack.indexOf(needle) !== -1) {
          clip.setSelected(true, true);
          localStats.selected++;
          if (type === 'video') localStats.selectedVideo++;
          if (type === 'audio') localStats.selectedAudio++;
        } else if (!payload.addToSelection) {
          clip.setSelected(false, true);
          localStats.deselected++;
          if (type === 'video') localStats.deselectedVideo++;
          if (type === 'audio') localStats.deselectedAudio++;
        }
      }, stats);
      return {
        success: true,
        query: payload.name,
        caseSensitive: payload.caseSensitive,
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        selected: stats.selected,
        deselected: stats.deselected,
        selectedVideo: stats.selectedVideo,
        selectedAudio: stats.selectedAudio,
        deselectedVideo: stats.deselectedVideo,
        deselectedAudio: stats.deselectedAudio,
        inspected: stats.inspected,
        errors: stats.errors
      };
    `, '__selectClipsByName');

    return await this.bridge.executeScript(script);
  }

  private async setSelectionForAllClips(operation: 'select_all_clips' | 'deselect_all_clips', args: SelectionScopeArgs): Promise<any> {
    const shouldSelect = operation === 'select_all_clips';
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType ?? 'both',
      trackIndex: args.trackIndex ?? null
    });
    const script = buildPremiereScript(`
      var payload = ${payload};
      ${this.buildSelectionHelpersScript()}
      var seq = __resolveSelectionSequence(payload.sequenceId);
      if (!seq) return { success: false, error: payload.sequenceId ? 'Sequence not found: ' + payload.sequenceId : 'No active sequence' };
      var stats = __selectionStats();
      __visitSelectionClips(seq, payload, function(clip, type, trackIndex, clipIndex, localStats) {
        clip.setSelected(${shouldSelect ? 'true' : 'false'}, true);
        if (${shouldSelect ? 'true' : 'false'}) {
          localStats.selected++;
          if (type === 'video') localStats.selectedVideo++;
          if (type === 'audio') localStats.selectedAudio++;
        } else {
          localStats.deselected++;
          if (type === 'video') localStats.deselectedVideo++;
          if (type === 'audio') localStats.deselectedAudio++;
        }
      }, stats);
      return {
        success: true,
        operation: ${literalForExtendScript(operation)},
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        selected: stats.selected,
        deselected: stats.deselected,
        selectedVideo: stats.selectedVideo,
        selectedAudio: stats.selectedAudio,
        deselectedVideo: stats.deselectedVideo,
        deselectedAudio: stats.deselectedAudio,
        inspected: stats.inspected,
        errors: stats.errors
      };
    `, shouldSelect ? '__selectAllClips' : '__deselectAllClips');

    return await this.bridge.executeScript(script);
  }

  private async selectClipsInRange(args: SelectClipsInRangeArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType ?? 'both',
      trackIndex: args.trackIndex ?? null,
      startTime: args.startTime,
      endTime: args.endTime,
      addToSelection: args.addToSelection ?? false
    });
    const script = buildPremiereScript(`
      var payload = ${payload};
      ${this.buildSelectionHelpersScript()}
      var seq = __resolveSelectionSequence(payload.sequenceId);
      if (!seq) return { success: false, error: payload.sequenceId ? 'Sequence not found: ' + payload.sequenceId : 'No active sequence' };
      var stats = __selectionStats();
      __visitSelectionClips(seq, payload, function(clip, type, trackIndex, clipIndex, localStats) {
        var clipStartSeconds = __clipSeconds(clip.start);
        var clipEndSeconds = __clipSeconds(clip.end);
        if (clipStartSeconds < payload.endTime && clipEndSeconds > payload.startTime) {
          clip.setSelected(true, true);
          localStats.selected++;
          if (type === 'video') localStats.selectedVideo++;
          if (type === 'audio') localStats.selectedAudio++;
        } else if (!payload.addToSelection) {
          clip.setSelected(false, true);
          localStats.deselected++;
          if (type === 'video') localStats.deselectedVideo++;
          if (type === 'audio') localStats.deselectedAudio++;
        }
      }, stats);
      return {
        success: true,
        startTime: payload.startTime,
        endTime: payload.endTime,
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        selected: stats.selected,
        deselected: stats.deselected,
        selectedVideo: stats.selectedVideo,
        selectedAudio: stats.selectedAudio,
        deselectedVideo: stats.deselectedVideo,
        deselectedAudio: stats.deselectedAudio,
        inspected: stats.inspected,
        errors: stats.errors
      };
    `, '__selectClipsInRange');

    return await this.bridge.executeScript(script);
  }

  private async selectClipsByColor(args: SelectClipsByColorArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType ?? 'both',
      trackIndex: args.trackIndex ?? null,
      colorIndex: args.colorIndex,
      addToSelection: args.addToSelection ?? false
    });
    const script = buildPremiereScript(`
      var payload = ${payload};
      ${this.buildSelectionHelpersScript()}
      var seq = __resolveSelectionSequence(payload.sequenceId);
      if (!seq) return { success: false, error: payload.sequenceId ? 'Sequence not found: ' + payload.sequenceId : 'No active sequence' };
      var stats = __selectionStats();
      __visitSelectionClips(seq, payload, function(clip, type, trackIndex, clipIndex, localStats) {
        var colorLabel = null;
        try {
          if (clip.projectItem && typeof clip.projectItem.getColorLabel === 'function') {
            colorLabel = clip.projectItem.getColorLabel();
          }
        } catch (colorError) {
          localStats.errors.push(String(colorError));
        }
        if (colorLabel === payload.colorIndex) {
          clip.setSelected(true, true);
          localStats.selected++;
          if (type === 'video') localStats.selectedVideo++;
          if (type === 'audio') localStats.selectedAudio++;
        } else if (!payload.addToSelection) {
          clip.setSelected(false, true);
          localStats.deselected++;
          if (type === 'video') localStats.deselectedVideo++;
          if (type === 'audio') localStats.deselectedAudio++;
        }
      }, stats);
      return {
        success: true,
        colorIndex: payload.colorIndex,
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        selected: stats.selected,
        deselected: stats.deselected,
        selectedVideo: stats.selectedVideo,
        selectedAudio: stats.selectedAudio,
        deselectedVideo: stats.deselectedVideo,
        deselectedAudio: stats.deselectedAudio,
        inspected: stats.inspected,
        errors: stats.errors
      };
    `, '__selectClipsByColor');

    return await this.bridge.executeScript(script);
  }

  private async invertSelection(args: SelectionScopeArgs): Promise<any> {
    const payload = literalForExtendScript({
      sequenceId: args.sequenceId ?? null,
      trackType: args.trackType ?? 'both',
      trackIndex: args.trackIndex ?? null
    });
    const script = buildPremiereScript(`
      var payload = ${payload};
      ${this.buildSelectionHelpersScript()}
      var seq = __resolveSelectionSequence(payload.sequenceId);
      if (!seq) return { success: false, error: payload.sequenceId ? 'Sequence not found: ' + payload.sequenceId : 'No active sequence' };
      var stats = __selectionStats();
      __visitSelectionClips(seq, payload, function(clip, type, trackIndex, clipIndex, localStats) {
        if (typeof clip.isSelected !== 'function') {
          localStats.errors.push('clip.isSelected is not available for ' + (clip.name || 'unnamed clip'));
          return;
        }
        var selected = clip.isSelected();
        clip.setSelected(!selected, true);
        if (selected) {
          localStats.deselected++;
          if (type === 'video') localStats.deselectedVideo++;
          if (type === 'audio') localStats.deselectedAudio++;
        } else {
          localStats.selected++;
          if (type === 'video') localStats.selectedVideo++;
          if (type === 'audio') localStats.selectedAudio++;
        }
      }, stats);
      return {
        success: true,
        trackType: payload.trackType,
        trackIndex: payload.trackIndex,
        nowSelected: stats.selected,
        nowDeselected: stats.deselected,
        selectedVideo: stats.selectedVideo,
        selectedAudio: stats.selectedAudio,
        deselectedVideo: stats.deselectedVideo,
        deselectedAudio: stats.deselectedAudio,
        inspected: stats.inspected,
        errors: stats.errors
      };
    `, '__invertSelection');

    return await this.bridge.executeScript(script);
  }

  private async getSelectedClips(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var selection = sequence.getSelection();
        var clips = [];
        for (var i = 0; i < selection.length; i++) {
          var clip = selection[i];
          clips.push({
            nodeId: clip.nodeId,
            name: clip.name,
            start: clip.start.seconds,
            end: clip.end.seconds,
            duration: clip.duration.seconds,
            mediaType: clip.mediaType
          });
        }
        return JSON.stringify({
          success: true,
          clips: clips,
          count: clips.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Effect & Transition Discovery Implementation
  private async listAvailableEffects(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getVideoEffectList();
        return JSON.stringify({
          success: true,
          effects: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async listAvailableTransitions(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getVideoTransitionList();
        return JSON.stringify({
          success: true,
          transitions: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async listAvailableAudioEffects(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getAudioEffectList();
        return JSON.stringify({
          success: true,
          effects: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async listAvailableAudioTransitions(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var list = qe.project.getAudioTransitionList();
        return JSON.stringify({
          success: true,
          transitions: list,
          count: list.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private buildEffectPropertyLookupScript(args: EffectPropertySelectorArgs, operationBody: string): string {
    const selectorsJson = literalForExtendScript({
      componentName: args.componentName ?? null,
      componentMatchName: args.componentMatchName ?? null,
      componentIndex: args.componentIndex ?? null,
      propertyName: args.propertyName ?? null,
      propertyMatchName: args.propertyMatchName ?? null,
      propertyIndex: args.propertyIndex ?? null
    });
    const clipIdLiteral = literalForExtendScript(args.clipId);
    const sequenceIdLiteral = args.sequenceId ? literalForExtendScript(args.sequenceId) : 'null';
    const notFoundErrorLiteral = literalForExtendScript(args.sequenceId ? `Clip not found in sequence: ${args.sequenceId}` : 'Clip not found');

    return `
      try {
        var selectors = ${selectorsJson};
        var info = __findClip(${clipIdLiteral}, ${sequenceIdLiteral});
        if (!info) return JSON.stringify({ success: false, error: ${notFoundErrorLiteral} });
        var clip = info.clip;

        function __safeString(value) {
          try {
            if (value === null || value === undefined) return null;
            return String(value);
          } catch (_) {
            return null;
          }
        }

        function __normalizeName(value) {
          return String(value).toLowerCase().replace(/[\\s_-]+/g, "");
        }

        function __namesEqual(actual, expected) {
          var actualText = __safeString(actual);
          var expectedText = __safeString(expected);
          if (actualText === null || expectedText === null) return false;
          return actualText === expectedText || __normalizeName(actualText) === __normalizeName(expectedText);
        }

        function __serializeEffectValue(value) {
          if (value === null || value === undefined) return value;
          var valueType = typeof value;
          if (valueType === "number" || valueType === "string" || valueType === "boolean") return value;
          try {
            if (value.seconds !== undefined || value.ticks !== undefined) {
              return {
                seconds: value.seconds !== undefined ? value.seconds : null,
                ticks: value.ticks !== undefined ? String(value.ticks) : null
              };
            }
          } catch (_) {}
          try {
            if (value.length !== undefined && typeof value !== "string") {
              var arr = [];
              for (var vi = 0; vi < value.length; vi++) arr.push(__serializeEffectValue(value[vi]));
              return arr;
            }
          } catch (_) {}
          try { return String(value); } catch (_) { return "<unserializable>"; }
        }

        function __safeGetPropertyValue(prop) {
          var result = { available: false, value: null, valueType: null, error: null };
          try {
            var raw = prop.getValue();
            result.available = true;
            result.valueType = raw === null ? "null" : typeof raw;
            result.value = __serializeEffectValue(raw);
          } catch (valueError) {
            result.error = valueError.toString();
          }
          return result;
        }

        function __componentSummary(component, componentIndex) {
          return {
            componentIndex: componentIndex,
            displayName: component && component.displayName !== undefined ? String(component.displayName) : "",
            matchName: component && component.matchName !== undefined ? String(component.matchName) : null,
            propertyCount: component && component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0
          };
        }

        function __propertySummary(prop, propertyIndex) {
          return {
            propertyIndex: propertyIndex,
            displayName: prop && prop.displayName !== undefined ? String(prop.displayName) : "",
            matchName: prop && prop.matchName !== undefined ? String(prop.matchName) : null
          };
        }

        function __availableComponents(clipToInspect) {
          var components = [];
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          for (var ci = 0; ci < componentCount; ci++) {
            components.push(__componentSummary(clipToInspect.components[ci], ci));
          }
          return components;
        }

        function __availableProperties(component) {
          var properties = [];
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          for (var pi = 0; pi < propertyCount; pi++) {
            properties.push(__propertySummary(component.properties[pi], pi));
          }
          return properties;
        }

        function __findComponent(clipToInspect, componentSelectors) {
          var componentCount = clipToInspect.components && clipToInspect.components.numItems !== undefined ? clipToInspect.components.numItems : 0;
          if (componentSelectors.componentIndex !== null && componentSelectors.componentIndex !== undefined) {
            var requestedComponentIndex = Number(componentSelectors.componentIndex);
            if (requestedComponentIndex >= 0 && requestedComponentIndex < componentCount) {
              return { component: clipToInspect.components[requestedComponentIndex], componentIndex: requestedComponentIndex, strategy: "componentIndex" };
            }
            return { error: "componentIndex out of range", availableComponents: __availableComponents(clipToInspect) };
          }
          for (var ci = 0; ci < componentCount; ci++) {
            var component = clipToInspect.components[ci];
            if (componentSelectors.componentMatchName !== null && componentSelectors.componentMatchName !== undefined) {
              if (__namesEqual(component.matchName, componentSelectors.componentMatchName)) {
                return { component: component, componentIndex: ci, strategy: "componentMatchName" };
              }
            }
            if (componentSelectors.componentName !== null && componentSelectors.componentName !== undefined) {
              if (__namesEqual(component.displayName, componentSelectors.componentName) || __namesEqual(component.matchName, componentSelectors.componentName)) {
                return { component: component, componentIndex: ci, strategy: "componentName" };
              }
            }
          }
          return { error: "Component not found", availableComponents: __availableComponents(clipToInspect) };
        }

        function __findEffectProperty(component, propertySelectors) {
          var propertyCount = component.properties && component.properties.numItems !== undefined ? component.properties.numItems : 0;
          if (propertySelectors.propertyIndex !== null && propertySelectors.propertyIndex !== undefined) {
            var requestedPropertyIndex = Number(propertySelectors.propertyIndex);
            if (requestedPropertyIndex >= 0 && requestedPropertyIndex < propertyCount) {
              return { property: component.properties[requestedPropertyIndex], propertyIndex: requestedPropertyIndex, strategy: "propertyIndex" };
            }
            return { error: "propertyIndex out of range", availableProperties: __availableProperties(component) };
          }
          for (var pi = 0; pi < propertyCount; pi++) {
            var prop = component.properties[pi];
            if (propertySelectors.propertyMatchName !== null && propertySelectors.propertyMatchName !== undefined) {
              if (__namesEqual(prop.matchName, propertySelectors.propertyMatchName)) {
                return { property: prop, propertyIndex: pi, strategy: "propertyMatchName" };
              }
            }
            if (propertySelectors.propertyName !== null && propertySelectors.propertyName !== undefined) {
              if (__namesEqual(prop.displayName, propertySelectors.propertyName) || __namesEqual(prop.matchName, propertySelectors.propertyName)) {
                return { property: prop, propertyIndex: pi, strategy: "propertyName" };
              }
            }
          }
          return { error: "Property not found", availableProperties: __availableProperties(component) };
        }

        function __timeToSeconds(timeValue) {
          try {
            if (typeof timeValue === "number") return timeValue;
            if (timeValue && typeof timeValue.seconds === "number") return timeValue.seconds;
            if (timeValue && timeValue.seconds !== undefined && timeValue.seconds !== null) {
              var parsedSeconds = Number(timeValue.seconds);
              return isFinite(parsedSeconds) ? parsedSeconds : null;
            }
            var parsed = Number(timeValue);
            return isFinite(parsed) ? parsed : null;
          } catch (_) {
            return null;
          }
        }

        function __readKeyframes(prop) {
          var readback = { isTimeVarying: null, keyframes: [], count: 0, error: null };
          try {
            readback.isTimeVarying = typeof prop.isTimeVarying === "function" ? prop.isTimeVarying() : null;
            if (readback.isTimeVarying === false) return readback;
            if (typeof prop.getKeys !== "function") {
              readback.error = "getKeys is not available for this property";
              return readback;
            }
            var keys = prop.getKeys();
            var keyCount = keys && keys.numItems !== undefined ? keys.numItems : (keys && keys.length !== undefined ? keys.length : 0);
            for (var ki = 0; ki < keyCount; ki++) {
              var keyTime = keys[ki];
              var keyValueResult = { available: false, value: null, error: null };
              try {
                keyValueResult.value = __serializeEffectValue(prop.getValueAtKey(keyTime));
                keyValueResult.available = true;
              } catch (valueAtKeyError) {
                keyValueResult.error = valueAtKeyError.toString();
              }
              readback.keyframes.push({
                time: __timeToSeconds(keyTime),
                value: keyValueResult.value,
                valueAvailable: keyValueResult.available,
                valueError: keyValueResult.error
              });
            }
            readback.count = readback.keyframes.length;
          } catch (readError) {
            readback.error = readError.toString();
          }
          return readback;
        }

        var componentResult = __findComponent(clip, selectors);
        if (!componentResult.component) {
          return JSON.stringify({
            success: false,
            error: componentResult.error || "Component not found",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            selectors: selectors,
            availableComponents: componentResult.availableComponents || []
          });
        }

        var propertyResult = __findEffectProperty(componentResult.component, selectors);
        if (!propertyResult.property) {
          return JSON.stringify({
            success: false,
            error: propertyResult.error || "Property not found",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            selectors: selectors,
            availableProperties: propertyResult.availableProperties || []
          });
        }

${operationBody}
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
  }

  private async setEffectKeyframes(args: SetEffectKeyframesArgs): Promise<any> {
    const keyframesJson = literalForExtendScript(args.keyframes);
    const script = this.buildEffectPropertyLookupScript(args, `
        var keyframes = ${keyframesJson};
        var prop = propertyResult.property;
        if (typeof prop.areKeyframesSupported === "function" && !prop.areKeyframesSupported()) {
          return JSON.stringify({
            success: false,
            supported: false,
            error: "Property does not support keyframes",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            property: __propertySummary(prop, propertyResult.propertyIndex),
            propertyStrategy: propertyResult.strategy
          });
        }
        if (typeof prop.setTimeVarying !== "function" || typeof prop.addKey !== "function" || typeof prop.setValueAtKey !== "function") {
          return JSON.stringify({
            success: false,
            supported: false,
            error: "Property keyframe write APIs are not available",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            property: __propertySummary(prop, propertyResult.propertyIndex),
            propertyStrategy: propertyResult.strategy,
            areKeyframesSupported: typeof prop.areKeyframesSupported === "function" ? prop.areKeyframesSupported() : null,
            hasSetTimeVarying: typeof prop.setTimeVarying === "function",
            hasAddKey: typeof prop.addKey === "function",
            hasSetValueAtKey: typeof prop.setValueAtKey === "function"
          });
        }

        try { prop.setTimeVarying(true); } catch (timeVaryingError) {
          return JSON.stringify({
            success: false,
            supported: true,
            error: "setTimeVarying threw: " + timeVaryingError.toString(),
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            property: __propertySummary(prop, propertyResult.propertyIndex)
          });
        }

        var applied = [];
        for (var ki = 0; ki < keyframes.length; ki++) {
          var keyframe = keyframes[ki];
          var time = keyframe.time;
          try { prop.addKey(time); } catch (addKeyError) {
            return JSON.stringify({
              success: false,
              supported: true,
              error: "addKey threw at index " + ki + ": " + addKeyError.toString(),
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              keyframe: keyframe,
              appliedKeyframes: applied
            });
          }
          try { prop.setValueAtKey(time, keyframe.value, true); } catch (setValueAtKeyError) {
            return JSON.stringify({
              success: false,
              supported: true,
              error: "setValueAtKey threw at index " + ki + ": " + setValueAtKeyError.toString(),
              clipId: ${literalForExtendScript(args.clipId)},
              sequenceId: info.sequenceId,
              keyframe: keyframe,
              appliedKeyframes: applied
            });
          }
          applied.push({ time: time, value: keyframe.value });
        }

        var readback = __readKeyframes(prop);
        return JSON.stringify({
          success: true,
          supported: true,
          message: "Effect keyframes set",
          clipId: ${literalForExtendScript(args.clipId)},
          clipName: clip.name,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          trackType: info.trackType,
          trackIndex: info.trackIndex,
          clipIndex: info.clipIndex,
          component: __componentSummary(componentResult.component, componentResult.componentIndex),
          componentStrategy: componentResult.strategy,
          property: __propertySummary(prop, propertyResult.propertyIndex),
          propertyStrategy: propertyResult.strategy,
          keyframeCount: applied.length,
          keyframes: readback.keyframes.length > 0 ? readback.keyframes : applied,
          readbackError: readback.error,
          requestedKeyframes: keyframes
        });
    `);
    return await this.bridge.executeScript(script);
  }

  private async setKeyframeInterpolation(args: SetKeyframeInterpolationArgs): Promise<any> {
    const interpolationCode = args.interpolation === 'hold' ? 4 : args.interpolation === 'bezier' ? 1 : 0;
    const script = this.buildEffectPropertyLookupScript(args, `
        var time = ${literalForExtendScript(args.time)};
        var interpolationName = ${literalForExtendScript(args.interpolation)};
        var interpolationCode = ${interpolationCode};
        var prop = propertyResult.property;
        if (typeof prop.setInterpolationTypeAtKey !== "function") {
          return JSON.stringify({
            success: false,
            supported: false,
            error: "Property does not expose setInterpolationTypeAtKey through ExtendScript",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            property: __propertySummary(prop, propertyResult.propertyIndex),
            propertyStrategy: propertyResult.strategy
          });
        }
        try {
          prop.setInterpolationTypeAtKey(time, interpolationCode);
        } catch (interpolationError) {
          return JSON.stringify({
            success: false,
            supported: true,
            error: "setInterpolationTypeAtKey threw: " + interpolationError.toString(),
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            property: __propertySummary(prop, propertyResult.propertyIndex),
            time: time,
            interpolation: interpolationName,
            interpolationCode: interpolationCode
          });
        }
        return JSON.stringify({
          success: true,
          supported: true,
          message: "Keyframe interpolation set",
          clipId: ${literalForExtendScript(args.clipId)},
          clipName: clip.name,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          component: __componentSummary(componentResult.component, componentResult.componentIndex),
          componentStrategy: componentResult.strategy,
          property: __propertySummary(prop, propertyResult.propertyIndex),
          propertyStrategy: propertyResult.strategy,
          time: time,
          interpolation: interpolationName,
          interpolationCode: interpolationCode
        });
    `);
    return await this.bridge.executeScript(script);
  }

  private async getEffectValueAtTime(args: GetEffectValueAtTimeArgs): Promise<any> {
    const script = this.buildEffectPropertyLookupScript(args, `
        var time = ${literalForExtendScript(args.time)};
        var prop = propertyResult.property;
        if (typeof prop.getValueAtTime !== "function") {
          return JSON.stringify({
            success: false,
            supported: false,
            error: "Property does not expose getValueAtTime through ExtendScript",
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            componentStrategy: componentResult.strategy,
            property: __propertySummary(prop, propertyResult.propertyIndex),
            propertyStrategy: propertyResult.strategy
          });
        }
        var rawValue;
        try {
          rawValue = prop.getValueAtTime(time);
        } catch (valueAtTimeError) {
          return JSON.stringify({
            success: false,
            supported: true,
            error: "getValueAtTime threw: " + valueAtTimeError.toString(),
            clipId: ${literalForExtendScript(args.clipId)},
            sequenceId: info.sequenceId,
            component: __componentSummary(componentResult.component, componentResult.componentIndex),
            property: __propertySummary(prop, propertyResult.propertyIndex),
            time: time
          });
        }
        return JSON.stringify({
          success: true,
          supported: true,
          clipId: ${literalForExtendScript(args.clipId)},
          clipName: clip.name,
          sequenceId: info.sequenceId,
          sequenceName: info.sequenceName,
          component: __componentSummary(componentResult.component, componentResult.componentIndex),
          componentStrategy: componentResult.strategy,
          property: __propertySummary(prop, propertyResult.propertyIndex),
          propertyStrategy: propertyResult.strategy,
          time: time,
          value: __serializeEffectValue(rawValue),
          valueType: rawValue === null ? "null" : typeof rawValue,
          staticValue: __safeGetPropertyValue(prop)
        });
    `);
    return await this.bridge.executeScript(script);
  }

  // Keyframe Implementation
  private async addKeyframe(clipId: string, componentName: string, paramName: string, time: number, value: number): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var param = null;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          if (comp.displayName === ${JSON.stringify(componentName)}) {
            for (var j = 0; j < comp.properties.numItems; j++) {
              if (comp.properties[j].displayName === ${JSON.stringify(paramName)}) {
                param = comp.properties[j];
                break;
              }
            }
            if (param) break;
          }
        }
        if (!param) return JSON.stringify({ success: false, error: "Parameter " + ${JSON.stringify(paramName)} + " not found in component " + ${JSON.stringify(componentName)} });
        param.setTimeVarying(true);
        param.addKey(${time});
        param.setValueAtKey(${time}, ${value}, true);
        return JSON.stringify({
          success: true,
          message: "Keyframe added",
          componentName: ${JSON.stringify(componentName)},
          paramName: ${JSON.stringify(paramName)},
          time: ${time},
          value: ${value}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async removeKeyframe(clipId: string, componentName: string, paramName: string, time: number): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var param = null;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          if (comp.displayName === ${JSON.stringify(componentName)}) {
            for (var j = 0; j < comp.properties.numItems; j++) {
              if (comp.properties[j].displayName === ${JSON.stringify(paramName)}) {
                param = comp.properties[j];
                break;
              }
            }
            if (param) break;
          }
        }
        if (!param) return JSON.stringify({ success: false, error: "Parameter not found" });
        param.removeKey(${time});
        return JSON.stringify({
          success: true,
          message: "Keyframe removed",
          time: ${time}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async getKeyframes(clipId: string, componentName: string, paramName: string): Promise<any> {
    const script = `
      try {
        var info = __findClip(${JSON.stringify(clipId)});
        if (!info) return JSON.stringify({ success: false, error: "Clip not found" });
        var clip = info.clip;
        var param = null;
        for (var i = 0; i < clip.components.numItems; i++) {
          var comp = clip.components[i];
          if (comp.displayName === ${JSON.stringify(componentName)}) {
            for (var j = 0; j < comp.properties.numItems; j++) {
              if (comp.properties[j].displayName === ${JSON.stringify(paramName)}) {
                param = comp.properties[j];
                break;
              }
            }
            if (param) break;
          }
        }
        if (!param) return JSON.stringify({ success: false, error: "Parameter not found" });
        var isTimeVarying = param.isTimeVarying();
        if (!isTimeVarying) {
          return JSON.stringify({
            success: true,
            isTimeVarying: false,
            keyframes: [],
            staticValue: param.getValue()
          });
        }
        var keys = param.getKeys();
        var result = [];
        for (var k = 0; k < keys.length; k++) {
          result.push({
            time: keys[k],
            value: param.getValueAtKey(keys[k])
          });
        }
        return JSON.stringify({
          success: true,
          isTimeVarying: true,
          keyframes: result,
          count: result.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Work Area Implementation
  private async setWorkArea(sequenceId: string, inPoint: number, outPoint: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        sequence.setWorkAreaInPoint(__secondsToTicks(${inPoint}));
        sequence.setWorkAreaOutPoint(__secondsToTicks(${outPoint}));
        return JSON.stringify({
          success: true,
          message: "Work area set",
          inPoint: ${inPoint},
          outPoint: ${outPoint}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async getWorkArea(sequenceId: string): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var inTime = sequence.getWorkAreaInPointAsTime();
        var outTime = sequence.getWorkAreaOutPointAsTime();
        return JSON.stringify({
          success: true,
          inPoint: inTime.seconds,
          outPoint: outTime.seconds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Batch Operations Implementation
  private async batchAddTransitions(sequenceId: string, trackIndex: number, transitionName: string, duration: number): Promise<any> {
    const script = `
      try {
        app.enableQE();
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var track = sequence.videoTracks[${trackIndex}];
        if (!track) return JSON.stringify({ success: false, error: "Track not found at index ${trackIndex}" });
        var clipCount = track.clips.numItems;
        if (clipCount < 2) return JSON.stringify({ success: false, error: "Need at least 2 clips to add transitions, found " + clipCount });
        var qeSeq = qe.project.getActiveSequence();
        var qeTrack = qeSeq.getVideoTrackAt(${trackIndex});
        var transition = qe.project.getVideoTransitionByName(${JSON.stringify(transitionName)});
        if (!transition) return JSON.stringify({ success: false, error: "Transition not found: " + ${JSON.stringify(transitionName)} });
        var added = 0;
        var errors = [];
        var fps = 254016000000 / parseInt(sequence.timebase, 10);
        var frames = Math.round(${duration} * fps);
        for (var i = 0; i < clipCount; i++) {
          try {
            var qeClip = qeTrack.getItemAt(i);
            qeClip.addTransition(transition, true, frames + ":00", "0:00", 0.5, false, true);
            added++;
          } catch (e) {
            errors.push("Clip " + i + ": " + e.toString());
          }
        }
        return JSON.stringify({
          success: true,
          transitionsAdded: added,
          totalClips: clipCount,
          errors: errors
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Project Item Discovery & Management Implementation
  private async findProjectItemByName(name: string, type?: string): Promise<any> {
    const filterType = type || 'any';
    const script = `
      try {
        var searchName = ${JSON.stringify(name)}.toLowerCase();
        var filterType = ${JSON.stringify(filterType)};
        var results = [];
        function walkItems(parent) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            var itemType = item.type === 2 ? "bin" : (item.isSequence() ? "sequence" : "footage");
            if (item.name.toLowerCase().indexOf(searchName) !== -1) {
              if (filterType === "any" || filterType === itemType) {
                var info = {
                  id: item.nodeId,
                  name: item.name,
                  type: itemType,
                  treePath: item.treePath
                };
                try { info.mediaPath = item.getMediaPath(); } catch(e) {}
                results.push(info);
              }
            }
            if (item.type === 2) {
              walkItems(item);
            }
          }
        }
        walkItems(app.project.rootItem);
        return JSON.stringify({
          success: true,
          items: results,
          count: results.length
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async moveItemToBin(projectItemId: string, targetBinId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var bin = __findProjectItem(${JSON.stringify(targetBinId)});
        if (!bin) return JSON.stringify({ success: false, error: "Target bin not found" });
        item.moveBin(bin);
        return JSON.stringify({
          success: true,
          message: "Item moved to bin",
          itemId: ${JSON.stringify(projectItemId)},
          targetBinId: ${JSON.stringify(targetBinId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Active Sequence Management Implementation
  private async setActiveSequence(sequenceId: string): Promise<any> {
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        app.project.openSequence(seq.sequenceID);
        return JSON.stringify({
          success: true,
          message: "Active sequence set",
          sequenceId: seq.sequenceID,
          name: seq.name
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  private async getActiveSequence(): Promise<any> {
    const script = `
      try {
        var seq = app.project.activeSequence;
        if (!seq) return JSON.stringify({ success: false, error: "No active sequence" });
        return JSON.stringify({
          success: true,
          id: seq.sequenceID,
          name: seq.name,
          duration: __ticksToSeconds(seq.end),
          videoTrackCount: seq.videoTracks.numTracks,
          audioTrackCount: seq.audioTracks.numTracks
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Clip Lookup Implementation
  private async getClipAtPosition(sequenceId: string, trackType: string, trackIndex: number, time: number): Promise<any> {
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var tracks = ${JSON.stringify(trackType)} === "video" ? sequence.videoTracks : sequence.audioTracks;
        if (${trackIndex} < 0 || ${trackIndex} >= tracks.numTracks) return JSON.stringify({ success: false, error: "Track index out of range" });
        var track = tracks[${trackIndex}];
        var targetTime = ${time};
        for (var i = 0; i < track.clips.numItems; i++) {
          var clip = track.clips[i];
          if (clip.start.seconds <= targetTime && clip.end.seconds > targetTime) {
            return JSON.stringify({
              success: true,
              clip: {
                nodeId: clip.nodeId,
                name: clip.name,
                start: clip.start.seconds,
                end: clip.end.seconds,
                duration: clip.duration.seconds,
                inPoint: clip.inPoint.seconds,
                outPoint: clip.outPoint.seconds,
                trackIndex: ${trackIndex},
                trackType: ${JSON.stringify(trackType)},
                clipIndex: i
              }
            });
          }
        }
        return JSON.stringify({
          success: true,
          clip: null,
          message: "No clip found at time " + targetTime + "s on " + ${JSON.stringify(trackType)} + " track " + ${trackIndex}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Auto Reframe Implementation
  private async autoReframeSequence(sequenceId: string, numerator: number, denominator: number, motionPreset?: string, newName?: string): Promise<any> {
    const preset = motionPreset || 'default';
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: "Sequence not found by id: ${sequenceId}" });
        var reframedName = ${newName ? JSON.stringify(newName) : 'sequence.name + " Reframed"'};
        sequence.autoReframeSequence(${numerator}, ${denominator}, ${JSON.stringify(preset)}, reframedName, false);
        return JSON.stringify({
          success: true,
          message: "Sequence auto-reframed",
          aspectRatio: ${numerator} + ":" + ${denominator},
          motionPreset: ${JSON.stringify(preset)},
          newName: reframedName
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Scene Edit Detection Implementation
  private async detectSceneEdits(sequenceId: string, action?: string, applyCutsToLinkedAudio?: boolean, sensitivity?: string): Promise<any> {
    const actionVal = action || 'CreateMarkers';
    const audioVal = applyCutsToLinkedAudio !== false;
    const sensitivityVal = sensitivity || 'Medium';
    const sequenceIdLiteral = literalForExtendScript(sequenceId);
    const actionLiteral = literalForExtendScript(actionVal);
    const sensitivityLiteral = literalForExtendScript(sensitivityVal);
    const sequenceNotFoundLiteral = literalForExtendScript(`Sequence not found by id: ${sequenceId}`);
    const noSelectionLiteral = literalForExtendScript(`Scene edit detection requires selected clips; no clips are selected in sequence ${sequenceId}`);
    const script = `
      var mutationAttempted = false;
      try {
        var sequence = __findSequence(${sequenceIdLiteral});
        if (!sequence) return JSON.stringify({ success: false, supported: true, mutationAttempted: false, error: ${sequenceNotFoundLiteral} });
        app.project.activeSequence = sequence;
        if (typeof sequence.getSelection !== "function") {
          return JSON.stringify({
            success: false,
            supported: false,
            mutationAttempted: false,
            error: "Premiere host does not expose sequence.getSelection; cannot safely preflight scene edit detection"
          });
        }
        if (typeof sequence.performSceneEditDetectionOnSelection !== "function") {
          return JSON.stringify({
            success: false,
            supported: false,
            mutationAttempted: false,
            error: "Premiere host does not expose sequence.performSceneEditDetectionOnSelection"
          });
        }
        var selection = sequence.getSelection();
        var selectedClipCount = selection && selection.length !== undefined ? selection.length : 0;
        if (selectedClipCount < 1) {
          return JSON.stringify({
            success: false,
            supported: true,
            blocked: true,
            mutationAttempted: false,
            selectedClipCount: selectedClipCount,
            action: ${actionLiteral},
            sensitivity: ${sensitivityLiteral},
            error: ${noSelectionLiteral}
          });
        }
        mutationAttempted = true;
        sequence.performSceneEditDetectionOnSelection(${actionLiteral}, ${audioVal}, ${sensitivityLiteral});
        return JSON.stringify({
          success: true,
          supported: true,
          mutationAttempted: true,
          selectedClipCount: selectedClipCount,
          message: "Scene edit detection performed",
          action: ${actionLiteral},
          sensitivity: ${sensitivityLiteral}
        });
      } catch (e) {
        return JSON.stringify({ success: false, supported: true, mutationAttempted: mutationAttempted, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Caption Track Implementation
  private async createCaptionTrack(sequenceId: string, projectItemId: string, startTime?: number, captionFormat?: PremiereCaptionFormat): Promise<any> {
    const startTimeVal = startTime ?? 0;
    const formatDescriptor = this.getPremiereCaptionFormatDescriptor(captionFormat);
    const fallbackLiteral = formatDescriptor.numericFallback === undefined ? 'null' : String(formatDescriptor.numericFallback);
    const sequenceNotFoundError = `Sequence not found by id: ${sequenceId}`;
    const script = `
      try {
        var sequence = __findSequence(${JSON.stringify(sequenceId)});
        if (!sequence) return JSON.stringify({ success: false, error: ${JSON.stringify(sequenceNotFoundError)} });
        var projectItem = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!projectItem) return JSON.stringify({ success: false, error: "Caption project item not found" });
        var startTimeVal = ${startTimeVal};
        var captionFormatConstantName = ${JSON.stringify(formatDescriptor.constantName)};
        var captionFormatValue = null;
        if (typeof Sequence !== 'undefined' && typeof Sequence.${formatDescriptor.constantName} !== 'undefined') {
          captionFormatValue = Sequence.${formatDescriptor.constantName};
        } else {
          captionFormatValue = ${fallbackLiteral};
        }
        if (captionFormatValue === null || typeof captionFormatValue === 'undefined') {
          return JSON.stringify({ success: false, supported: false, error: "Premiere host does not expose caption format constant: " + captionFormatConstantName });
        }

        var timeObjectError = null;
        var timeObjectCallError = null;
        try {
          var startAtTime = new Time();
          startAtTime.seconds = startTimeVal;
          sequence.createCaptionTrack(projectItem, startAtTime, captionFormatValue);
          return JSON.stringify({
            success: true,
            message: "Caption track created",
            captionFormat: ${JSON.stringify(formatDescriptor.key)},
            captionFormatConstant: captionFormatConstantName,
            startTime: startTimeVal,
            createCaptionTrackMethod: "sequence.createCaptionTrack",
            createCaptionTrackSignature: "createCaptionTrack(projectItem, Time, captionFormat)",
            startTimeArgumentType: "Time",
            fallbackUsed: false
          });
        } catch (timeError) {
          timeObjectCallError = timeError.toString();
          timeObjectError = timeObjectCallError;
        }

        try {
          sequence.createCaptionTrack(projectItem, startTimeVal, captionFormatValue);
          return JSON.stringify({
            success: true,
            message: "Caption track created",
            captionFormat: ${JSON.stringify(formatDescriptor.key)},
            captionFormatConstant: captionFormatConstantName,
            startTime: startTimeVal,
            createCaptionTrackMethod: "sequence.createCaptionTrack",
            createCaptionTrackSignature: "createCaptionTrack(projectItem, seconds, captionFormat)",
            startTimeArgumentType: "number",
            fallbackUsed: true,
            timeObjectError: timeObjectError
          });
        } catch (numericError) {
          return JSON.stringify({
            success: false,
            error: "createCaptionTrack failed with Time object and numeric fallback: " + numericError.toString(),
            createCaptionTrackMethod: "sequence.createCaptionTrack",
            attemptedSignatures: [
              "createCaptionTrack(projectItem, Time, captionFormat)",
              "createCaptionTrack(projectItem, seconds, captionFormat)"
            ],
            timeObjectError: timeObjectCallError,
            numericFallbackError: numericError.toString()
          });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Subclip Implementation
  private async createSubclip(projectItemId: string, name: string, startTime: number, endTime: number, hasHardBoundaries?: boolean, takeAudio?: boolean, takeVideo?: boolean): Promise<any> {
    const hardBounds = hasHardBoundaries ? 1 : 0;
    const audio = takeAudio !== false ? 1 : 0;
    const video = takeVideo !== false ? 1 : 0;
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var startTicks = __secondsToTicks(${startTime});
        var endTicks = __secondsToTicks(${endTime});
        item.createSubClip(${JSON.stringify(name)}, startTicks, endTicks, ${hardBounds}, ${audio}, ${video});
        return JSON.stringify({
          success: true,
          message: "Subclip created",
          name: ${JSON.stringify(name)},
          startTime: ${startTime},
          endTime: ${endTime}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Relink Media Implementation
  private async relinkMedia(projectItemId: string, newFilePath: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        if (item.canChangeMediaPath()) {
          item.changeMediaPath(${JSON.stringify(newFilePath)}, true);
          return JSON.stringify({
            success: true,
            message: "Media relinked successfully",
            projectItemId: ${JSON.stringify(projectItemId)},
            newFilePath: ${JSON.stringify(newFilePath)}
          });
        } else {
          return JSON.stringify({ success: false, error: "Cannot change media path for this item" });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Set Color Label Implementation
  private async setColorLabel(projectItemId: string, colorIndex: number): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        item.setColorLabel(${colorIndex});
        return JSON.stringify({
          success: true,
          message: "Color label set",
          projectItemId: ${JSON.stringify(projectItemId)},
          colorIndex: ${colorIndex}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Get Color Label Implementation
  private async getColorLabel(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var colorLabel = item.getColorLabel();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          colorLabel: colorLabel
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Get Metadata Implementation
  private async getMetadata(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var projectMetadata = item.getProjectMetadata();
        var xmpMetadata = item.getXMPMetadata();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          projectMetadata: projectMetadata,
          xmpMetadata: xmpMetadata
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Set Metadata Implementation
  private async setMetadata(projectItemId: string, key: string, value: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var schema = "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/";
        var fullKey = schema + ${JSON.stringify(key)};
        item.setProjectMetadata(${JSON.stringify(value)}, [fullKey]);
        return JSON.stringify({
          success: true,
          message: "Metadata set",
          projectItemId: ${JSON.stringify(projectItemId)},
          key: ${JSON.stringify(key)},
          value: ${JSON.stringify(value)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Get Footage Interpretation Implementation
  private async getFootageInterpretation(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var interp = item.getFootageInterpretation();
        return JSON.stringify({
          success: true,
          projectItemId: ${JSON.stringify(projectItemId)},
          frameRate: interp.frameRate,
          pixelAspectRatio: interp.pixelAspectRatio,
          fieldType: interp.fieldType,
          removePulldown: interp.removePulldown,
          alphaUsage: interp.alphaUsage
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Set Footage Interpretation Implementation
  private async setFootageInterpretation(projectItemId: string, frameRate?: number, pixelAspectRatio?: number): Promise<any> {
    const setFrameRate = frameRate !== undefined;
    const setPar = pixelAspectRatio !== undefined;
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var interp = item.getFootageInterpretation();
        ${setFrameRate ? 'interp.frameRate = ' + frameRate + ';' : ''}
        ${setPar ? 'interp.pixelAspectRatio = ' + pixelAspectRatio + ';' : ''}
        item.setFootageInterpretation(interp);
        return JSON.stringify({
          success: true,
          message: "Footage interpretation updated",
          projectItemId: ${JSON.stringify(projectItemId)},
          frameRate: interp.frameRate,
          pixelAspectRatio: interp.pixelAspectRatio
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Check Offline Media Implementation
  private async checkOfflineMedia(): Promise<any> {
    const script = `
      try {
        var offlineItems = [];
        function walkForOffline(parent) {
          for (var i = 0; i < parent.children.numItems; i++) {
            var item = parent.children[i];
            if (item.type === 2) {
              walkForOffline(item);
            } else {
              if (item.isOffline()) {
                offlineItems.push({
                  nodeId: item.nodeId,
                  name: item.name,
                  treePath: item.treePath
                });
              }
            }
          }
        }
        walkForOffline(app.project.rootItem);
        return JSON.stringify({
          success: true,
          offlineCount: offlineItems.length,
          offlineItems: offlineItems
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Export as FCP XML Implementation
  private async exportAsFcpXml(sequenceId: string, outputPath: string): Promise<any> {
    const payload = { sequenceId, outputPath };
    const script = buildPremiereScript(`
      var payload = ${literalForExtendScript(payload)};
      var seq = __findSequence(payload.sequenceId);
      if (!seq) {
        return {
          success: false,
          exported: false,
          error: "Sequence not found",
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath
        };
      }

      var outputFile = File(payload.outputPath);
      var preExportExists = outputFile.exists;
      var preExportLength = preExportExists ? outputFile.length : null;
      var preExportModified = null;
      if (preExportExists) {
        try { preExportModified = outputFile.modified ? Number(outputFile.modified.getTime()) : null; } catch (ePre) {}
      }

      try {
        seq.exportAsFinalCutProXML(payload.outputPath);
      } catch (exportError) {
        return {
          success: false,
          exported: false,
          error: "exportAsFinalCutProXML threw: " + exportError.toString(),
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath,
          preExportExists: preExportExists,
          preExportLength: preExportLength,
          preExportModified: preExportModified
        };
      }

      outputFile = File(payload.outputPath);
      var outputExists = outputFile.exists;
      var sizeBytes = outputExists ? outputFile.length : 0;
      var postExportModified = null;
      if (outputExists) {
        try { postExportModified = outputFile.modified ? Number(outputFile.modified.getTime()) : null; } catch (ePost) {}
      }
      var modifiedAfterExport = !preExportExists || (preExportModified !== null && postExportModified !== null && postExportModified > preExportModified);
      var sizeChangedAfterExport = !preExportExists || sizeBytes !== preExportLength;
      var verified = outputExists && sizeBytes > 0 && (!preExportExists || modifiedAfterExport || sizeChangedAfterExport);
      var staleExistingFile = outputExists && preExportExists && !modifiedAfterExport && !sizeChangedAfterExport;

      if (!verified) {
        return {
          success: false,
          exported: false,
          error: staleExistingFile
            ? "exportAsFinalCutProXML returned but output path was not modified; refusing to treat stale existing FCP XML as success"
            : "exportAsFinalCutProXML returned but no non-empty XML file was created",
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath,
          outputExists: outputExists,
          sizeBytes: sizeBytes,
          preExportExists: preExportExists,
          preExportLength: preExportLength,
          preExportModified: preExportModified,
          postExportModified: postExportModified,
          staleExistingFile: staleExistingFile
        };
      }

      return {
        success: verified,
        exported: true,
        message: "Exported as Final Cut Pro XML",
        sequenceId: payload.sequenceId,
        outputPath: payload.outputPath,
        outputExists: outputExists,
        sizeBytes: sizeBytes,
        preExportExists: preExportExists,
        preExportLength: preExportLength,
        preExportModified: preExportModified,
        postExportModified: postExportModified,
        staleExistingFile: staleExistingFile
      };
    `, '__exportAsFcpXml');
    return await this.bridge.executeScript(script);
  }

  // Undo Implementation
  private async undo(): Promise<any> {
    const script = `
      try {
        app.enableQE();
        qe.project.undo();
        return JSON.stringify({
          success: true,
          message: "Undo performed"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Set Sequence In/Out Points Implementation
  private async setSequenceInOutPoints(sequenceId: string, inPoint?: number, outPoint?: number): Promise<any> {
    const setIn = inPoint !== undefined;
    const setOut = outPoint !== undefined;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        ${setIn ? 'seq.setInPoint(__secondsToTicks(' + inPoint + '));' : ''}
        ${setOut ? 'seq.setOutPoint(__secondsToTicks(' + outPoint + '));' : ''}
        return JSON.stringify({
          success: true,
          message: "Sequence in/out points set",
          sequenceId: ${JSON.stringify(sequenceId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Get Sequence In/Out Points Implementation
  private async getSequenceInOutPoints(sequenceId: string): Promise<any> {
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var inTime = seq.getInPointAsTime();
        var outTime = seq.getOutPointAsTime();
        return JSON.stringify({
          success: true,
          sequenceId: ${JSON.stringify(sequenceId)},
          inPoint: inTime.seconds,
          outPoint: outTime.seconds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Export AAF Implementation
  private async exportAaf(sequenceId: string, outputPath: string, mixDownVideo?: boolean, explodeToMono?: boolean, sampleRate?: number, bitsPerSample?: number): Promise<any> {
    const payload = {
      sequenceId,
      outputPath,
      mixDownVideo: mixDownVideo !== false,
      explodeToMono: Boolean(explodeToMono),
      sampleRate: sampleRate || 48000,
      bitsPerSample: bitsPerSample || 16
    };
    const script = buildPremiereScript(`
      var payload = ${literalForExtendScript(payload)};
      var seq = __findSequence(payload.sequenceId);
      if (!seq) {
        return {
          success: false,
          exported: false,
          error: "Sequence not found",
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath
        };
      }

      if (!app.project || typeof app.project.exportAAF !== "function") {
        return {
          success: false,
          supported: false,
          exported: false,
          error: "Premiere host does not expose app.project.exportAAF",
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath
        };
      }

      var outputFile = File(payload.outputPath);
      var preExportExists = outputFile.exists;
      var preExportLength = preExportExists ? outputFile.length : null;
      var preExportModified = null;
      if (preExportExists) {
        try { preExportModified = outputFile.modified ? Number(outputFile.modified.getTime()) : null; } catch (ePre) {}
      }

      try {
        app.project.exportAAF(seq, payload.outputPath, payload.mixDownVideo ? 1 : 0, payload.explodeToMono ? 1 : 0, payload.sampleRate, payload.bitsPerSample, 0, 0, 1, 0);
      } catch (exportError) {
        return {
          success: false,
          exported: false,
          error: "exportAAF threw: " + exportError.toString(),
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath,
          preExportExists: preExportExists,
          preExportLength: preExportLength,
          preExportModified: preExportModified
        };
      }

      outputFile = File(payload.outputPath);
      var outputExists = outputFile.exists;
      var sizeBytes = outputExists ? outputFile.length : 0;
      var postExportModified = null;
      if (outputExists) {
        try { postExportModified = outputFile.modified ? Number(outputFile.modified.getTime()) : null; } catch (ePost) {}
      }
      var modifiedAfterExport = !preExportExists || (preExportModified !== null && postExportModified !== null && postExportModified > preExportModified);
      var sizeChangedAfterExport = !preExportExists || sizeBytes !== preExportLength;
      var verified = outputExists && sizeBytes > 0 && (!preExportExists || modifiedAfterExport || sizeChangedAfterExport);
      var staleExistingFile = outputExists && preExportExists && !modifiedAfterExport && !sizeChangedAfterExport;

      if (!verified) {
        return {
          success: false,
          exported: false,
          error: staleExistingFile
            ? "exportAAF returned but output path was not modified; refusing to treat stale existing AAF as success"
            : "exportAAF returned but no non-empty AAF file was created",
          sequenceId: payload.sequenceId,
          outputPath: payload.outputPath,
          outputExists: outputExists,
          sizeBytes: sizeBytes,
          preExportExists: preExportExists,
          preExportLength: preExportLength,
          preExportModified: preExportModified,
          postExportModified: postExportModified,
          staleExistingFile: staleExistingFile
        };
      }

      return {
        success: verified,
        exported: true,
        message: "Exported as AAF",
        sequenceId: payload.sequenceId,
        outputPath: payload.outputPath,
        outputExists: outputExists,
        sizeBytes: sizeBytes,
        preExportExists: preExportExists,
        preExportLength: preExportLength,
        preExportModified: preExportModified,
        postExportModified: postExportModified,
        staleExistingFile: staleExistingFile
      };
    `, '__exportAaf');
    return await this.bridge.executeScript(script);
  }

  // Consolidate Duplicates Implementation
  private async consolidateDuplicates(): Promise<any> {
    const script = `
      try {
        app.project.consolidateDuplicates();
        return JSON.stringify({
          success: true,
          message: "Duplicates consolidated"
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Refresh Media Implementation
  private async refreshMedia(projectItemId: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        item.refreshMedia();
        return JSON.stringify({
          success: true,
          message: "Media refreshed",
          projectItemId: ${JSON.stringify(projectItemId)}
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Import Sequences From Project Implementation
  private async importSequencesFromProject(projectPath: string, sequenceIds: string[]): Promise<any> {
    const script = `
      try {
        var seqIds = ${JSON.stringify(sequenceIds)};
        app.project.importSequences(${JSON.stringify(projectPath)}, seqIds);
        return JSON.stringify({
          success: true,
          message: "Sequences imported from project",
          projectPath: ${JSON.stringify(projectPath)},
          sequenceIds: seqIds
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Create Subsequence Implementation
  private async createSubsequence(sequenceId: string, ignoreTrackTargeting?: boolean): Promise<any> {
    const ignoreTargeting = ignoreTrackTargeting ? 'true' : 'false';
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var subseq = seq.createSubsequence(${ignoreTargeting});
        return JSON.stringify({
          success: true,
          message: "Subsequence created",
          sequenceId: subseq.sequenceID,
          name: subseq.name
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Import MOGRT Implementation
  private async importMogrt(sequenceId: string, mogrtPath: string, time: number, videoTrackIndex?: number, audioTrackIndex?: number): Promise<any> {
    const vidTrack = videoTrackIndex || 0;
    const audTrack = audioTrackIndex || 0;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        var clip = seq.importMGT(${JSON.stringify(mogrtPath)}, ticks, ${vidTrack}, ${audTrack});
        var clipId = "";
        if (clip && clip.nodeId) clipId = clip.nodeId;
        return JSON.stringify({
          success: true,
          message: "MOGRT imported",
          clipId: clipId
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Import MOGRT From Library Implementation
  private async importMogrtFromLibrary(sequenceId: string, libraryName: string, mogrtName: string, time: number, videoTrackIndex?: number, audioTrackIndex?: number): Promise<any> {
    const vidTrack = videoTrackIndex || 0;
    const audTrack = audioTrackIndex || 0;
    const script = `
      try {
        var seq = __findSequence(${JSON.stringify(sequenceId)});
        if (!seq) return JSON.stringify({ success: false, error: "Sequence not found" });
        var ticks = __secondsToTicks(${time});
        var clip = seq.importMGTFromLibrary(${JSON.stringify(libraryName)}, ${JSON.stringify(mogrtName)}, ticks, ${vidTrack}, ${audTrack});
        var clipId = "";
        if (clip && clip.nodeId) clipId = clip.nodeId;
        return JSON.stringify({
          success: true,
          message: "MOGRT imported from library",
          clipId: clipId
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }

  // Manage Proxies Implementation
  private async manageProxies(projectItemId: string, action: string, proxyPath?: string): Promise<any> {
    const script = `
      try {
        var item = __findProjectItem(${JSON.stringify(projectItemId)});
        if (!item) return JSON.stringify({ success: false, error: "Project item not found" });
        var actionType = ${JSON.stringify(action)};
        if (actionType === "check") {
          return JSON.stringify({
            success: true,
            projectItemId: ${JSON.stringify(projectItemId)},
            hasProxy: item.hasProxy(),
            canProxy: item.canProxy()
          });
        } else if (actionType === "attach") {
          var pPath = ${JSON.stringify(proxyPath || '')};
          if (!pPath || pPath === "") return JSON.stringify({ success: false, error: "proxyPath is required for attach action" });
          item.attachProxy(pPath, 0);
          return JSON.stringify({
            success: true,
            message: "Proxy attached",
            projectItemId: ${JSON.stringify(projectItemId)},
            proxyPath: pPath
          });
        } else if (actionType === "get_path") {
          return JSON.stringify({
            success: true,
            projectItemId: ${JSON.stringify(projectItemId)},
            proxyPath: item.getProxyPath()
          });
        } else {
          return JSON.stringify({ success: false, error: "Unknown action: " + actionType });
        }
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
      }
    `;
    return await this.bridge.executeScript(script);
  }
}
