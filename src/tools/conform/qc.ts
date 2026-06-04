import fs from 'node:fs';
import path from 'node:path';

export type QcFrameView = 'offline' | 'online';
export type QcFrameFormat = 'png' | 'jpg' | 'tiff';
export type QcStructuralFindingType =
  | 'missing-placement'
  | 'timing-drift'
  | 'source-drift'
  | 'wrong-track'
  | 'unsupported-effects'
  | 'invalid-comparison'
  | 'output-containment';
export type QcStructuralFindingSeverity = 'error' | 'warning';

export interface StackedConformQcComparison {
  offlineClipId: string;
  onlineClipId?: string | undefined;
  sourceTrackIndex: number;
  targetTrackIndex: number;
  startTime: number;
  duration: number;
  actualStartTime?: number;
  actualDuration?: number;
  expectedSourceInPoint?: number;
  actualSourceInPoint?: number;
  expectedSourceOutPoint?: number;
  actualSourceOutPoint?: number;
  unsupportedEffects?: string[];
}

export interface PlanStackedConformQcArgs {
  sequenceId: string;
  outputDir: string;
  allowedOutputRoot?: string;
  comparisons: StackedConformQcComparison[];
  sampleOffsets?: number[];
  format?: QcFrameFormat;
}

export interface QcFrameExportPlanItem {
  comparisonIndex: number;
  offlineClipId: string;
  onlineClipId: string;
  view: QcFrameView;
  time: number;
  outputPath: string;
  sourceTrackIndex: number;
  targetTrackIndex: number;
  format: QcFrameFormat;
}

export interface QcUnresolvedComparison {
  offlineClipId: string;
  reason: string;
}

export interface QcStructuralFinding {
  type: QcStructuralFindingType;
  severity: QcStructuralFindingSeverity;
  offlineClipId: string;
  onlineClipId?: string | undefined;
  message: string;
  details?: Record<string, unknown>;
}

export interface QcStructuralReport {
  passed: boolean;
  findings: QcStructuralFinding[];
  summary: {
    errors: number;
    warnings: number;
    timingDrift: number;
    sourceDrift: number;
    missingPlacements: number;
    wrongTracks: number;
    unsupportedEffects: number;
  };
}

export interface StackedConformQcPlan {
  sequenceId: string;
  outputDir: string;
  format: QcFrameFormat;
  safeToExecute: boolean;
  frameExports: QcFrameExportPlanItem[];
  unresolvedComparisons: QcUnresolvedComparison[];
  structuralReport: QcStructuralReport;
  summary: {
    comparisons: number;
    frameExports: number;
    unresolvedComparisons: number;
  };
  warnings: string[];
}

const DRIFT_TOLERANCE_SECONDS = 0.05;

function safeOffset(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function joinOutputPath(outputDir: string, fileName: string): string {
  return `${outputDir.replace(/\/+$/, '')}/${fileName}`;
}

function resolveThroughExistingParents(targetPath: string): string {
  const absolutePath = path.resolve(targetPath);
  const missingSegments: string[] = [];
  let current = absolutePath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return absolutePath;
    missingSegments.unshift(path.basename(current));
    current = parent;
  }
  try {
    return path.join(fs.realpathSync(current), ...missingSegments);
  } catch (_) {
    return absolutePath;
  }
}

function isInsideAllowedRoot(outputDir: string, allowedOutputRoot?: string): boolean {
  if (!allowedOutputRoot) return true;
  const resolvedOutput = resolveThroughExistingParents(outputDir);
  const resolvedRoot = resolveThroughExistingParents(allowedOutputRoot);
  const relative = path.relative(resolvedRoot, resolvedOutput);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function roundTime(value: number): number {
  return Number(value.toFixed(3));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundedDrift(expected: number, actual: number): number {
  return roundTime(actual - expected);
}

function buildStructuralReport(findings: QcStructuralFinding[]): QcStructuralReport {
  return {
    passed: findings.length === 0,
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
      timingDrift: findings.filter((finding) => finding.type === 'timing-drift').length,
      sourceDrift: findings.filter((finding) => finding.type === 'source-drift').length,
      missingPlacements: findings.filter((finding) => finding.type === 'missing-placement').length,
      wrongTracks: findings.filter((finding) => finding.type === 'wrong-track').length,
      unsupportedEffects: findings.filter((finding) => finding.type === 'unsupported-effects').length,
    },
  };
}

function addStructuralFinding(findings: QcStructuralFinding[], finding: QcStructuralFinding): void {
  findings.push(finding);
}

function collectStructuralDriftFindings(comparison: StackedConformQcComparison, findings: QcStructuralFinding[]): void {
  const timingDetails: Record<string, unknown> = {};
  if (finiteNumber(comparison.actualStartTime) && Math.abs(comparison.actualStartTime - comparison.startTime) > DRIFT_TOLERANCE_SECONDS) {
    timingDetails.expectedStartTime = comparison.startTime;
    timingDetails.actualStartTime = comparison.actualStartTime;
    timingDetails.startTimeDrift = roundedDrift(comparison.startTime, comparison.actualStartTime);
  }
  if (finiteNumber(comparison.actualDuration) && Math.abs(comparison.actualDuration - comparison.duration) > DRIFT_TOLERANCE_SECONDS) {
    timingDetails.expectedDuration = comparison.duration;
    timingDetails.actualDuration = comparison.actualDuration;
    timingDetails.durationDrift = roundedDrift(comparison.duration, comparison.actualDuration);
  }
  if (Object.keys(timingDetails).length > 0) {
    addStructuralFinding(findings, {
      type: 'timing-drift',
      severity: 'warning',
      offlineClipId: comparison.offlineClipId,
      onlineClipId: comparison.onlineClipId,
      message: 'Online placement timing differs from the expected offline timing.',
      details: timingDetails,
    });
  }

  const sourceDetails: Record<string, unknown> = {};
  if (
    finiteNumber(comparison.expectedSourceInPoint)
    && finiteNumber(comparison.actualSourceInPoint)
    && Math.abs(comparison.actualSourceInPoint - comparison.expectedSourceInPoint) > DRIFT_TOLERANCE_SECONDS
  ) {
    sourceDetails.expectedSourceInPoint = comparison.expectedSourceInPoint;
    sourceDetails.actualSourceInPoint = comparison.actualSourceInPoint;
    sourceDetails.sourceInPointDrift = roundedDrift(comparison.expectedSourceInPoint, comparison.actualSourceInPoint);
  }
  if (
    finiteNumber(comparison.expectedSourceOutPoint)
    && finiteNumber(comparison.actualSourceOutPoint)
    && Math.abs(comparison.actualSourceOutPoint - comparison.expectedSourceOutPoint) > DRIFT_TOLERANCE_SECONDS
  ) {
    sourceDetails.expectedSourceOutPoint = comparison.expectedSourceOutPoint;
    sourceDetails.actualSourceOutPoint = comparison.actualSourceOutPoint;
    sourceDetails.sourceOutPointDrift = roundedDrift(comparison.expectedSourceOutPoint, comparison.actualSourceOutPoint);
  }
  if (Object.keys(sourceDetails).length > 0) {
    addStructuralFinding(findings, {
      type: 'source-drift',
      severity: 'warning',
      offlineClipId: comparison.offlineClipId,
      onlineClipId: comparison.onlineClipId,
      message: 'Online source in/out differs from the expected conform source range.',
      details: sourceDetails,
    });
  }

  const unsupportedEffects = (comparison.unsupportedEffects || []).filter((effect) => effect.trim().length > 0);
  if (unsupportedEffects.length > 0) {
    addStructuralFinding(findings, {
      type: 'unsupported-effects',
      severity: 'warning',
      offlineClipId: comparison.offlineClipId,
      onlineClipId: comparison.onlineClipId,
      message: 'Unsupported source effects require manual review.',
      details: { unsupportedEffects },
    });
  }
}

function buildPlanResult(args: PlanStackedConformQcArgs, values: {
  format: QcFrameFormat;
  frameExports: QcFrameExportPlanItem[];
  unresolvedComparisons: QcUnresolvedComparison[];
  structuralFindings: QcStructuralFinding[];
  warnings: string[];
}): StackedConformQcPlan {
  return {
    sequenceId: args.sequenceId,
    outputDir: args.outputDir,
    format: values.format,
    safeToExecute: values.frameExports.length > 0 && values.unresolvedComparisons.length === 0,
    frameExports: values.frameExports,
    unresolvedComparisons: values.unresolvedComparisons,
    structuralReport: buildStructuralReport(values.structuralFindings),
    summary: {
      comparisons: args.comparisons.length,
      frameExports: values.frameExports.length,
      unresolvedComparisons: values.unresolvedComparisons.length,
    },
    warnings: [...new Set(values.warnings)],
  };
}

export function planStackedConformQc(args: PlanStackedConformQcArgs): StackedConformQcPlan {
  const format = args.format || 'png';
  const sampleOffsets = args.sampleOffsets && args.sampleOffsets.length > 0 ? args.sampleOffsets.map(safeOffset) : [0.5];
  const frameExports: QcFrameExportPlanItem[] = [];
  const unresolvedComparisons: QcUnresolvedComparison[] = [];
  const structuralFindings: QcStructuralFinding[] = [];
  const warnings: string[] = [];

  if (!isInsideAllowedRoot(args.outputDir, args.allowedOutputRoot)) {
    unresolvedComparisons.push({ offlineClipId: '*', reason: 'outputDir must stay inside allowedOutputRoot' });
    addStructuralFinding(structuralFindings, {
      type: 'output-containment',
      severity: 'error',
      offlineClipId: '*',
      message: 'outputDir must stay inside allowedOutputRoot',
    });
    return buildPlanResult(args, { format, frameExports, unresolvedComparisons, structuralFindings, warnings });
  }

  args.comparisons.forEach((comparison, comparisonIndex) => {
    if (!comparison.onlineClipId) {
      unresolvedComparisons.push({ offlineClipId: comparison.offlineClipId, reason: 'onlineClipId is required for QC comparison' });
      addStructuralFinding(structuralFindings, {
        type: 'missing-placement',
        severity: 'error',
        offlineClipId: comparison.offlineClipId,
        message: 'onlineClipId is required for QC comparison',
      });
      return;
    }
    if (!Number.isFinite(comparison.startTime) || !Number.isFinite(comparison.duration) || comparison.duration <= 0) {
      unresolvedComparisons.push({ offlineClipId: comparison.offlineClipId, reason: 'valid startTime and duration are required for QC comparison' });
      addStructuralFinding(structuralFindings, {
        type: 'invalid-comparison',
        severity: 'error',
        offlineClipId: comparison.offlineClipId,
        onlineClipId: comparison.onlineClipId,
        message: 'valid startTime and duration are required for QC comparison',
      });
      return;
    }
    if (comparison.targetTrackIndex <= comparison.sourceTrackIndex) {
      unresolvedComparisons.push({ offlineClipId: comparison.offlineClipId, reason: 'targetTrackIndex must be above sourceTrackIndex for stacked conform QC' });
      addStructuralFinding(structuralFindings, {
        type: 'wrong-track',
        severity: 'error',
        offlineClipId: comparison.offlineClipId,
        onlineClipId: comparison.onlineClipId,
        message: 'targetTrackIndex must be above sourceTrackIndex for stacked conform QC',
        details: {
          sourceTrackIndex: comparison.sourceTrackIndex,
          targetTrackIndex: comparison.targetTrackIndex,
        },
      });
      return;
    }

    collectStructuralDriftFindings(comparison, structuralFindings);

    sampleOffsets.forEach((offset) => {
      const time = roundTime(comparison.startTime + comparison.duration * offset);
      const sampleLabel = String(comparisonIndex).padStart(2, '0');
      const timeLabel = time.toFixed(3);
      const baseName = sanitizeSegment(comparison.offlineClipId);
      frameExports.push({
        comparisonIndex,
        offlineClipId: comparison.offlineClipId,
        onlineClipId: comparison.onlineClipId!,
        view: 'offline',
        time,
        outputPath: joinOutputPath(args.outputDir, `${baseName}_${sampleLabel}_offline_${timeLabel}.${format}`),
        sourceTrackIndex: comparison.sourceTrackIndex,
        targetTrackIndex: comparison.targetTrackIndex,
        format,
      });
      frameExports.push({
        comparisonIndex,
        offlineClipId: comparison.offlineClipId,
        onlineClipId: comparison.onlineClipId!,
        view: 'online',
        time,
        outputPath: joinOutputPath(args.outputDir, `${baseName}_${sampleLabel}_online_${timeLabel}.${format}`),
        sourceTrackIndex: comparison.sourceTrackIndex,
        targetTrackIndex: comparison.targetTrackIndex,
        format,
      });
    });
  });

  return buildPlanResult(args, { format, frameExports, unresolvedComparisons, structuralFindings, warnings });
}
