#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { PremiereProBridge } from '../dist/bridge/index.js';
import { PremiereProTools } from '../dist/tools/index.js';

process.env.PREMIERE_TEMP_DIR = process.env.PREMIERE_TEMP_DIR || '/tmp/premiere-mcp-bridge';

const bridge = new PremiereProBridge();
const tools = new PremiereProTools(bridge);
const runId = Date.now();

const results = [];
const executed = new Map();

const mutatingNoArgSkips = new Set([
  'save_project',
  'undo',
  'consolidate_duplicates',
]);

function summarize(result) {
  if (result == null || typeof result !== 'object') {
    return result;
  }

  const summary = {};
  const preferredKeys = [
    'success',
    'message',
    'error',
    'count',
    'name',
    'path',
    'projectPath',
    'sequenceName',
    'sequenceId',
    'assetDir',
    'note',
    'skipped',
  ];

  for (const key of preferredKeys) {
    if (key in result) {
      summary[key] = result[key];
    }
  }

  if (Array.isArray(result.sequences)) {
    summary.sequenceCount = result.sequences.length;
  }
  if (Array.isArray(result.items)) {
    summary.itemCount = result.items.length;
  }
  if (Array.isArray(result.bins)) {
    summary.binCount = result.bins.length;
  }
  if (Array.isArray(result.videoTracks)) {
    summary.videoTrackCount = result.videoTracks.length;
  }
  if (Array.isArray(result.audioTracks)) {
    summary.audioTrackCount = result.audioTracks.length;
  }
  if (Array.isArray(result.imported)) {
    summary.importedCount = result.imported.length;
  }
  if (Array.isArray(result.placements)) {
    summary.placementCount = result.placements.length;
  }
  if (Array.isArray(result.transitions)) {
    summary.transitionCount = result.transitions.length;
  }
  if (Array.isArray(result.animations)) {
    summary.animationCount = result.animations.length;
  }
  if (result.sequence && typeof result.sequence === 'object') {
    summary.sequence = {
      id: result.sequence.id,
      name: result.sequence.name,
    };
  }
  if (result.id) {
    summary.id = result.id;
  }

  return summary;
}

function record(name, status, args, result, note) {
  const entry = {
    name,
    status,
    args,
  };

  if (note) {
    entry.note = note;
  }
  if (result !== undefined) {
    entry.result = summarize(result);
  }

  results.push(entry);
  if (status === 'executed' || status === 'runtime_failure') {
    executed.set(name, result);
  }
}

async function invoke(name, args, note) {
  const result = await tools.executeTool(name, args);
  const errorText = typeof result?.error === 'string' ? result.error : '';

  let status = 'executed';
  if (result?.success === false) {
    if (errorText.includes('Invalid arguments for tool')) {
      status = 'schema_validated';
    } else {
      status = 'runtime_failure';
    }
  }

  record(name, status, args, result, note);
  return result;
}

function getTool(name) {
  return tools.getAvailableTools().find((tool) => tool.name === name);
}

async function main() {
  await bridge.initialize();

  const catalog = tools.getAvailableTools();
  const catalogNames = new Set(catalog.map((tool) => tool.name));

  const baselineProject = await invoke('get_project_info', {}, 'baseline project state');
  await invoke('list_project_items', {}, 'baseline project inventory');
  await invoke('list_sequences', {}, 'baseline sequence inventory');

  for (const name of [
    'list_available_effects',
    'list_available_transitions',
    'list_available_audio_effects',
    'list_available_audio_transitions',
    'get_render_queue_status',
    'get_active_sequence',
    'check_offline_media',
  ]) {
    if (catalogNames.has(name)) {
      await invoke(name, {}, 'safe no-arg execution');
    }
  }

  const demo = await invoke(
    'build_motion_graphics_demo',
    { sequenceName: `Sweep Demo ${runId}` },
    'high-level live workflow using generated assets',
  );

  const assetPaths = Array.isArray(demo?.assets) ? demo.assets.map((asset) => asset.path) : [];
  const firstAssetPath = assetPaths[0];
  const firstAssetName = Array.isArray(demo?.assets) && demo.assets[0] ? demo.assets[0].name.replace(/\.[^.]+$/, '') : undefined;
  const demoSequenceId = demo?.sequence?.id || baselineProject?.activeSequence?.id;
  const demoClipId = Array.isArray(demo?.placements) && demo.placements[0] ? demo.placements[0].id : undefined;
  const demoProjectItemId = Array.isArray(demo?.imported) && demo.imported[0] ? demo.imported[0].id : undefined;
  const demoAssetDir = demo?.assetDir;

  let manualSequenceId;
  let manualProjectItemId;
  let manualClipId;

  if (firstAssetPath) {
    const manualSequence = await invoke(
      'create_sequence',
      { name: `Sweep Manual ${runId}` },
      'direct sequence creation for lower-level tool coverage',
    );
    manualSequenceId = manualSequence?.id;

    const manualImport = await invoke(
      'import_media',
      { filePath: firstAssetPath },
      'direct media import coverage',
    );
    manualProjectItemId = manualImport?.id;

    if (manualSequenceId && manualProjectItemId) {
      const placement = await invoke(
        'add_to_timeline',
        {
          sequenceId: manualSequenceId,
          projectItemId: manualProjectItemId,
          trackIndex: 0,
          time: 0,
        },
        'direct timeline placement coverage',
      );
      manualClipId = placement?.id;
    }
  }

  if (demoAssetDir) {
    await invoke(
      'import_folder',
      { folderPath: demoAssetDir, recursive: false },
      'folder import coverage using generated demo assets',
    );
  }

  if (catalogNames.has('assemble_product_spot') && assetPaths.length > 0) {
    await invoke(
      'assemble_product_spot',
      {
        sequenceName: `Sweep Product ${runId}`,
        assetPaths,
        clipDuration: 4,
        motionStyle: 'alternate',
      },
      'high-level workflow using real imported assets',
    );
  }

  if (catalogNames.has('build_brand_spot_from_mogrt_and_assets') && assetPaths.length > 0) {
    await invoke(
      'build_brand_spot_from_mogrt_and_assets',
      {
        sequenceName: `Sweep Brand ${runId}`,
        assetPaths,
      },
      'high-level branded workflow without optional mogrt',
    );
  }

  const sampleArgs = new Map();

  if (demoSequenceId) {
    sampleArgs.set('list_sequence_tracks', { sequenceId: demoSequenceId });
    sampleArgs.set('set_active_sequence', { sequenceId: demoSequenceId });
    sampleArgs.set('get_sequence_settings', { sequenceId: demoSequenceId });
    sampleArgs.set('get_playhead_position', { sequenceId: demoSequenceId });
    sampleArgs.set('set_playhead_position', { sequenceId: demoSequenceId, time: 1 });
    sampleArgs.set('get_selected_clips', { sequenceId: demoSequenceId });
    sampleArgs.set('list_markers', { sequenceId: demoSequenceId });
    sampleArgs.set('get_work_area', { sequenceId: demoSequenceId });
    sampleArgs.set('set_work_area', { sequenceId: demoSequenceId, inPoint: 0, outPoint: 3 });
    sampleArgs.set('get_sequence_in_out_points', { sequenceId: demoSequenceId });
    sampleArgs.set('set_sequence_in_out_points', { sequenceId: demoSequenceId, inPoint: 0, outPoint: 3 });
    sampleArgs.set('export_frame', {
      sequenceId: demoSequenceId,
      time: 1,
      outputPath: `/tmp/premiere-mcp-bridge/sweep-frame-${runId}.png`,
      format: 'png',
    });
    sampleArgs.set('export_as_fcp_xml', {
      sequenceId: demoSequenceId,
      outputPath: `/tmp/premiere-mcp-bridge/sweep-${runId}.xml`,
    });
    sampleArgs.set('create_subsequence', {
      sequenceId: demoSequenceId,
      ignoreTrackTargeting: true,
    });
    sampleArgs.set('get_clip_at_position', {
      sequenceId: demoSequenceId,
      trackType: 'video',
      trackIndex: 0,
      time: 1,
    });
  }

  if (demoClipId) {
    sampleArgs.set('get_clip_properties', { clipId: demoClipId });
    sampleArgs.set('apply_effect', { clipId: demoClipId, effectName: 'Gaussian Blur' });
    sampleArgs.set('remove_effect', { clipId: demoClipId, effectName: 'Gaussian Blur' });
    sampleArgs.set('add_transition_to_clip', {
      clipId: demoClipId,
      transitionName: 'Cross Dissolve',
      position: 'end',
      duration: 0.5,
    });
    sampleArgs.set('color_correct', { clipId: demoClipId, brightness: 2, contrast: 4, saturation: 3 });
    sampleArgs.set('add_keyframe', {
      clipId: demoClipId,
      componentName: 'Motion',
      paramName: 'Scale',
      time: 0.25,
      value: 101,
    });
    sampleArgs.set('remove_keyframe', {
      clipId: demoClipId,
      componentName: 'Motion',
      paramName: 'Scale',
      time: 0.25,
    });
    sampleArgs.set('get_keyframes', {
      clipId: demoClipId,
      componentName: 'Motion',
      paramName: 'Scale',
    });
    sampleArgs.set('duplicate_clip', { clipId: demoClipId, offset: 16 });
  }

  if (demoProjectItemId) {
    sampleArgs.set('get_color_label', { projectItemId: demoProjectItemId });
    sampleArgs.set('get_metadata', { projectItemId: demoProjectItemId });
    sampleArgs.set('get_footage_interpretation', { projectItemId: demoProjectItemId });
  }

  if (firstAssetName) {
    sampleArgs.set('find_project_item_by_name', { name: firstAssetName });
  }

  for (const [name, args] of sampleArgs.entries()) {
    if (catalogNames.has(name) && !executed.has(name)) {
      await invoke(name, args, 'live invocation with discovered test context');
    }
  }

  for (const tool of catalog) {
    if (results.some((entry) => entry.name === tool.name)) {
      continue;
    }

    if (tool.inputSchema.safeParse({}).success) {
      if (mutatingNoArgSkips.has(tool.name)) {
        record(tool.name, 'skipped', {}, undefined, 'intentionally skipped because it mutates or saves the active project');
        continue;
      }

      await invoke(tool.name, {}, 'fallback no-arg execution');
      continue;
    }

    await invoke(tool.name, {}, 'schema path validation with empty args');
  }

  const counts = {
    total: catalog.length,
    executed: results.filter((entry) => entry.status === 'executed').length,
    schema_validated: results.filter((entry) => entry.status === 'schema_validated').length,
    runtime_failure: results.filter((entry) => entry.status === 'runtime_failure').length,
    skipped: results.filter((entry) => entry.status === 'skipped').length,
  };

  const report = { runId, counts, results };
  const outputDir = process.env.PREMIERE_TEMP_DIR || '/tmp/premiere-mcp-bridge';
  const outputPath = path.join(outputDir, 'live-tool-sweep.json');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ ...report, outputPath }, null, 2));
}

try {
  await main();
} finally {
  await bridge.cleanup();
}
