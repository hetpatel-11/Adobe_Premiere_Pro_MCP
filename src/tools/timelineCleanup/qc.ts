import fs from 'node:fs';
import path from 'node:path';
import type { TimelineCleanupAction, TimelineCleanupClassification } from './types.js';

export type TimelineCleanupQcFrameView = 'before' | 'after';
export type TimelineCleanupQcFrameFormat = 'png' | 'jpg' | 'tiff';
export type TimelineCleanupQcFindingType = 'output-containment' | 'unsafe-removal' | 'missing-sequence' | 'restore-state';
export type TimelineCleanupQcFindingSeverity = 'error' | 'warning';

export interface TimelineCleanupResultSummary {
  sourceSequenceId: string;
  cleanSequenceId?: string;
  actionsApplied?: Array<Partial<TimelineCleanupAction> & { classification?: TimelineCleanupClassification; type?: string; clipId?: string; trackIndex?: number; trackType?: string }>;
  preservedItems?: Array<{ clipId?: string; trackIndex?: number; trackType?: string; classification: TimelineCleanupClassification; reason?: string }>;
}

export interface PlanTimelineCleanupQcArgs {
  sourceSequenceId: string;
  cleanSequenceId?: string;
  outputDir: string;
  allowedOutputRoot?: string;
  cleanupResult: TimelineCleanupResultSummary;
  sampleTimes?: number[];
  format?: TimelineCleanupQcFrameFormat;
}

export interface TimelineCleanupQcFrameExport {
  view: TimelineCleanupQcFrameView;
  sequenceId: string;
  time: number;
  outputPath: string;
  format: TimelineCleanupQcFrameFormat;
}

export interface TimelineCleanupQcFinding {
  type: TimelineCleanupQcFindingType;
  severity: TimelineCleanupQcFindingSeverity;
  message: string;
  itemId?: string;
  details?: Record<string, unknown>;
}

export interface TimelineCleanupQcStructuralReport {
  passed: boolean;
  findings: TimelineCleanupQcFinding[];
  summary: {
    errors: number;
    warnings: number;
    unsafeRemovals: number;
    outputContainment: number;
  };
}

export interface TimelineCleanupQcPlan {
  sourceSequenceId: string;
  cleanSequenceId?: string;
  outputDir: string;
  format: TimelineCleanupQcFrameFormat;
  safeToExecute: boolean;
  frameExports: TimelineCleanupQcFrameExport[];
  structuralReport: TimelineCleanupQcStructuralReport;
  summary: {
    sampleTimes: number;
    frameExports: number;
    structuralFindings: number;
  };
  warnings: string[];
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
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

function joinOutputPath(outputDir: string, fileName: string): string {
  return `${outputDir.replace(/\/+$/, '')}/${fileName}`;
}

function buildStructuralReport(findings: TimelineCleanupQcFinding[]): TimelineCleanupQcStructuralReport {
  return {
    passed: findings.length === 0,
    findings,
    summary: {
      errors: findings.filter((finding) => finding.severity === 'error').length,
      warnings: findings.filter((finding) => finding.severity === 'warning').length,
      unsafeRemovals: findings.filter((finding) => finding.type === 'unsafe-removal').length,
      outputContainment: findings.filter((finding) => finding.type === 'output-containment').length,
    },
  };
}

function itemIdForAction(action: Partial<TimelineCleanupAction> & { clipId?: string; trackType?: string; trackIndex?: number }): string {
  if (action.clipId) return action.clipId;
  if (action.trackType !== undefined && action.trackIndex !== undefined) return `${action.trackType}:${action.trackIndex}`;
  return '*';
}

function collectUnsafeActionFindings(args: PlanTimelineCleanupQcArgs, findings: TimelineCleanupQcFinding[]): void {
  for (const action of args.cleanupResult.actionsApplied || []) {
    const classification = action.classification;
    const actionType = action.type;
    const knownActionType = actionType === 'removeClip' || actionType === 'removeTrack' || actionType === 'reorganizeClip';
    const executable = knownActionType && (actionType === 'reorganizeClip' ? classification === 'safe_reorganize' : classification === 'safe_remove');
    if (!executable) {
      findings.push({
        type: 'unsafe-removal',
        severity: 'error',
        message: `Cleanup result contains an action that was not classified as executable: ${classification || 'unknown'}`,
        itemId: itemIdForAction(action),
        details: { action },
      });
    }
  }
}

function buildFrameExports(args: PlanTimelineCleanupQcArgs, sampleTimes: number[], format: TimelineCleanupQcFrameFormat): TimelineCleanupQcFrameExport[] {
  const cleanSequenceId = args.cleanSequenceId || args.cleanupResult.cleanSequenceId;
  if (!cleanSequenceId) return [];
  const exports: TimelineCleanupQcFrameExport[] = [];
  sampleTimes.forEach((time, index) => {
    const rounded = roundTime(time);
    const timeSegment = rounded.toFixed(3);
    exports.push({
      view: 'before',
      sequenceId: args.sourceSequenceId,
      time: rounded,
      outputPath: joinOutputPath(args.outputDir, `${sanitizeSegment(args.sourceSequenceId)}_${String(index).padStart(2, '0')}_before_${timeSegment}.${format}`),
      format,
    });
    exports.push({
      view: 'after',
      sequenceId: cleanSequenceId,
      time: rounded,
      outputPath: joinOutputPath(args.outputDir, `${sanitizeSegment(args.sourceSequenceId)}_${String(index).padStart(2, '0')}_after_${timeSegment}.${format}`),
      format,
    });
  });
  return exports;
}

export function planTimelineCleanupQc(args: PlanTimelineCleanupQcArgs): TimelineCleanupQcPlan {
  const format = args.format || 'png';
  const sampleTimes = (args.sampleTimes && args.sampleTimes.length > 0 ? args.sampleTimes : [0])
    .filter((time) => Number.isFinite(time) && time >= 0)
    .map(roundTime);
  const findings: TimelineCleanupQcFinding[] = [];
  const warnings: string[] = [];
  const resolvedOutputDir = resolveThroughExistingParents(args.outputDir);

  if (!args.cleanSequenceId && !args.cleanupResult.cleanSequenceId) {
    findings.push({
      type: 'missing-sequence',
      severity: 'error',
      message: 'cleanSequenceId is required for before/after cleanup QC frame exports',
    });
  }

  if (!isInsideAllowedRoot(args.outputDir, args.allowedOutputRoot)) {
    findings.push({
      type: 'output-containment',
      severity: 'error',
      message: 'outputDir must stay inside allowedOutputRoot',
      details: { outputDir: args.outputDir, resolvedOutputDir, allowedOutputRoot: args.allowedOutputRoot },
    });
  }

  collectUnsafeActionFindings(args, findings);
  const structuralReport = buildStructuralReport(findings);
  const frameExports = structuralReport.summary.errors === 0 ? buildFrameExports({ ...args, outputDir: resolvedOutputDir }, sampleTimes, format) : [];

  const result: TimelineCleanupQcPlan = {
    sourceSequenceId: args.sourceSequenceId,
    outputDir: resolvedOutputDir,
    format,
    safeToExecute: structuralReport.summary.errors === 0,
    frameExports,
    structuralReport,
    summary: {
      sampleTimes: sampleTimes.length,
      frameExports: frameExports.length,
      structuralFindings: findings.length,
    },
    warnings,
  };
  const cleanSequenceId = args.cleanSequenceId || args.cleanupResult.cleanSequenceId;
  if (cleanSequenceId) result.cleanSequenceId = cleanSequenceId;
  return result;
}
