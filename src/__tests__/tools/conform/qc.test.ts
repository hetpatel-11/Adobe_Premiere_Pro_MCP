import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planStackedConformQc } from '../../../tools/conform/qc.js';

describe('stacked conform QC planning', () => {
  it('plans paired offline/online frame exports at sample points', () => {
    const result = planStackedConformQc({
      sequenceId: 'seq-1',
      outputDir: '/tmp/conform-qc',
      allowedOutputRoot: '/tmp',
      comparisons: [
        {
          offlineClipId: 'offline-1',
          onlineClipId: 'online-1',
          sourceTrackIndex: 0,
          targetTrackIndex: 1,
          startTime: 10,
          duration: 4,
        },
      ],
      sampleOffsets: [0.25, 0.75],
      format: 'png',
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.frameExports).toHaveLength(4);
    expect(result.frameExports.map((entry) => entry.time)).toEqual([11, 11, 13, 13]);
    expect(result.frameExports.map((entry) => entry.view)).toEqual(['offline', 'online', 'offline', 'online']);
    expect(result.frameExports[0].outputPath).toBe('/tmp/conform-qc/offline-1_00_offline_11.000.png');
    expect(result.summary).toEqual({ comparisons: 1, frameExports: 4, unresolvedComparisons: 0 });
  });

  it('flags unresolved comparisons instead of generating misleading exports', () => {
    const result = planStackedConformQc({
      sequenceId: 'seq-1',
      outputDir: '/tmp/conform-qc',
      comparisons: [
        {
          offlineClipId: 'offline-1',
          sourceTrackIndex: 0,
          targetTrackIndex: 1,
          startTime: 10,
          duration: 4,
        },
      ],
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.frameExports).toEqual([]);
    expect(result.unresolvedComparisons).toEqual([{ offlineClipId: 'offline-1', reason: 'onlineClipId is required for QC comparison' }]);
    expect(result.structuralReport.findings).toContainEqual(expect.objectContaining({
      type: 'missing-placement',
      offlineClipId: 'offline-1',
      severity: 'error',
    }));
  });

  it('reports timing drift, source drift, and unsupported effects structurally', () => {
    const result = planStackedConformQc({
      sequenceId: 'seq-1',
      outputDir: '/tmp/conform-qc',
      comparisons: [
        {
          offlineClipId: 'offline-1',
          onlineClipId: 'online-1',
          sourceTrackIndex: 0,
          targetTrackIndex: 1,
          startTime: 10,
          duration: 4,
          actualStartTime: 10.25,
          actualDuration: 4.5,
          expectedSourceInPoint: 5,
          actualSourceInPoint: 5.25,
          expectedSourceOutPoint: 9,
          actualSourceOutPoint: 9.5,
          unsupportedEffects: ['Third Party Glow'],
        },
      ],
    });

    expect(result.safeToExecute).toBe(true);
    expect(result.structuralReport.passed).toBe(false);
    expect(result.structuralReport.summary).toEqual({
      errors: 0,
      warnings: 3,
      timingDrift: 1,
      sourceDrift: 1,
      missingPlacements: 0,
      wrongTracks: 0,
      unsupportedEffects: 1,
    });
    expect(result.structuralReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'timing-drift', severity: 'warning', offlineClipId: 'offline-1', onlineClipId: 'online-1' }),
      expect.objectContaining({ type: 'source-drift', severity: 'warning', offlineClipId: 'offline-1', onlineClipId: 'online-1' }),
      expect.objectContaining({ type: 'unsupported-effects', severity: 'warning', offlineClipId: 'offline-1', onlineClipId: 'online-1', details: { unsupportedEffects: ['Third Party Glow'] } }),
    ]));
  });

  it('rejects output directories outside the allowed containment root', () => {
    const result = planStackedConformQc({
      sequenceId: 'seq-1',
      outputDir: '/Users/mattbot/Desktop/qc',
      allowedOutputRoot: '/tmp',
      comparisons: [
        {
          offlineClipId: 'offline-1',
          onlineClipId: 'online-1',
          sourceTrackIndex: 0,
          targetTrackIndex: 1,
          startTime: 10,
          duration: 4,
        },
      ],
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.frameExports).toEqual([]);
    expect(result.unresolvedComparisons).toEqual([{ offlineClipId: '*', reason: 'outputDir must stay inside allowedOutputRoot' }]);
  });

  it('rejects output directories that escape allowed root through a symlinked parent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conform-qc-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'conform-qc-outside-'));
    const symlink = path.join(root, 'linked-outside');
    fs.symlinkSync(outside, symlink, 'dir');

    const result = planStackedConformQc({
      sequenceId: 'seq-1',
      outputDir: path.join(symlink, 'qc'),
      allowedOutputRoot: root,
      comparisons: [
        {
          offlineClipId: 'offline-1',
          onlineClipId: 'online-1',
          sourceTrackIndex: 0,
          targetTrackIndex: 1,
          startTime: 10,
          duration: 4,
        },
      ],
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.frameExports).toEqual([]);
    expect(result.unresolvedComparisons).toEqual([{ offlineClipId: '*', reason: 'outputDir must stay inside allowedOutputRoot' }]);
  });

  it('fails wrong-track comparisons instead of exporting misleading QC frames', () => {
    const result = planStackedConformQc({
      sequenceId: 'seq-1',
      outputDir: '/tmp/conform-qc',
      comparisons: [
        {
          offlineClipId: 'offline-1',
          onlineClipId: 'online-1',
          sourceTrackIndex: 2,
          targetTrackIndex: 1,
          startTime: 10,
          duration: 4,
        },
      ],
    });

    expect(result.safeToExecute).toBe(false);
    expect(result.frameExports).toEqual([]);
    expect(result.unresolvedComparisons).toEqual([{ offlineClipId: 'offline-1', reason: 'targetTrackIndex must be above sourceTrackIndex for stacked conform QC' }]);
  });
});
