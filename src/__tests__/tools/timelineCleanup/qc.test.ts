import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planTimelineCleanupQc } from '../../../tools/timelineCleanup/qc.js';

const cleanupResult = {
  sourceSequenceId: 'seq-1',
  cleanSequenceId: 'seq-clean',
  actionsApplied: [
    { type: 'removeClip' as const, clipId: 'disabled-clip', classification: 'safe_remove' as const, reason: 'disabled clip explicitly allowed' },
  ],
  preservedItems: [
    { clipId: 'matte-source', classification: 'preserve_visual_dependency' as const, reason: 'track matte source' },
  ],
};

const baseArgs = {
  sourceSequenceId: 'seq-1',
  cleanSequenceId: 'seq-clean',
  outputDir: '/tmp/timeline-cleanup-qc',
  allowedOutputRoot: '/tmp',
  cleanupResult,
};

describe('timeline cleanup QC planning', () => {
  it('plans before/after frame exports at representative sample points', () => {
    const result = planTimelineCleanupQc({
      ...baseArgs,
      sampleTimes: [0, 5, 10],
      format: 'png',
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.frameExports).toHaveLength(6);
    expect(result.frameExports.map((entry) => entry.view)).toEqual(['before', 'after', 'before', 'after', 'before', 'after']);
    expect(result.frameExports[0].outputPath).toBe(path.join(fs.realpathSync('/tmp'), 'timeline-cleanup-qc', 'seq-1_00_before_0.000.png'));
    expect(result.summary).toEqual({ sampleTimes: 3, frameExports: 6, structuralFindings: 0 });
  });

  it('canonicalizes accepted output directories before planning live frame exports', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-cleanup-canonical-root-'));
    const outputDir = path.join(root, 'nested', 'qc');
    const relativeOutputDir = path.relative(process.cwd(), outputDir);

    const result = planTimelineCleanupQc({
      ...baseArgs,
      outputDir: relativeOutputDir,
      allowedOutputRoot: root,
      sampleTimes: [0],
      format: 'png',
    });

    expect(result.safeToExecute).toBe(true);
    expect(path.isAbsolute(result.outputDir)).toBe(true);
    const canonicalOutputDir = path.join(fs.realpathSync(root), 'nested', 'qc');
    expect(result.outputDir).toBe(canonicalOutputDir);
    expect(result.frameExports).toHaveLength(2);
    expect(result.frameExports.every((entry) => path.isAbsolute(entry.outputPath))).toBe(true);
    expect(result.frameExports[0].outputPath).toBe(path.join(canonicalOutputDir, 'seq-1_00_before_0.000.png'));
  });

  it('rejects live frame export outside the allowed output root', () => {
    const result = planTimelineCleanupQc({
      ...baseArgs,
      outputDir: '/Users/mattbot/Desktop/timeline-cleanup-qc',
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.frameExports).toEqual([]);
    expect(result.structuralReport.findings).toContainEqual(expect.objectContaining({
      type: 'output-containment',
      severity: 'error',
    }));
  });

  it('rejects symlink escapes from the allowed root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-cleanup-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-cleanup-outside-'));
    const symlink = path.join(root, 'linked-outside');
    fs.symlinkSync(outside, symlink, 'dir');

    const result = planTimelineCleanupQc({
      ...baseArgs,
      outputDir: path.join(symlink, 'qc'),
      allowedOutputRoot: root,
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.frameExports).toEqual([]);
    expect(result.structuralReport.findings).toContainEqual(expect.objectContaining({
      type: 'output-containment',
      severity: 'error',
    }));
  });

  it('reports removed unsafe clips as structural errors', () => {
    const result = planTimelineCleanupQc({
      ...baseArgs,
      cleanupResult: {
        ...cleanupResult,
        actionsApplied: [{ type: 'removeClip' as const, clipId: 'matte', classification: 'preserve_visual_dependency' as const, reason: 'matte source' }],
      },
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.structuralReport.findings).toContainEqual(expect.objectContaining({
      type: 'unsafe-removal',
      severity: 'error',
      itemId: 'matte',
    }));
  });

  it('accepts safe cleanup actions emitted by live execution without false unsafe-removal findings', () => {
    const result = planTimelineCleanupQc({
      ...baseArgs,
      cleanupResult: {
        ...cleanupResult,
        actionsApplied: [{ type: 'removeTrack' as const, trackType: 'video' as const, trackIndex: 1, classification: 'safe_remove' as const, reason: 'empty track' }],
      },
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.structuralReport.summary.unsafeRemovals).toBe(0);
    expect(result.structuralReport.findings.filter((finding) => finding.type === 'unsafe-removal')).toEqual([]);
  });

  it('rejects unknown action types even if a caller labels them safe', () => {
    const result = planTimelineCleanupQc({
      ...baseArgs,
      cleanupResult: {
        ...cleanupResult,
        actionsApplied: [{ type: 'mysteryAction' as any, clipId: 'clip-1', classification: 'safe_remove' as const, reason: 'caller supplied bad type' }],
      },
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.structuralReport.findings).toContainEqual(expect.objectContaining({
      type: 'unsafe-removal',
      severity: 'error',
      itemId: 'clip-1',
    }));
  });
});
