import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { PremiereProTransport } from '../bridge/types.js';
import type { MCPTool } from './index.js';

export const expandedToolNames = [
  'find_items_by_media_path',
  'get_insertion_bin',
  'get_project_panel_metadata',
  'get_graphics_white_luminance',
  'get_item_info',
  'is_work_area_enabled',
  'get_xmp_metadata',
  'get_color_space',
  'rename_clip',
  'get_clip_speed',
  'set_clip_selection',
  'link_selection',
  'unlink_selection',
  'execute_extendscript',
  'evaluate_expression',
  'inspect_dom_object',
  'list_clip_effects',
  'get_sequence_structure',
  'get_premiere_state',
  'get_full_project_overview',
  'get_bin_contents',
  'get_full_sequence_info',
  'get_full_clip_info',
  'get_project_item_info',
  'search_project_items',
  'get_timeline_gaps',
  'get_timeline_summary',
  'get_offline_media',
  'get_used_media_report',
  'select_clips_by_name',
  'select_all_clips',
  'deselect_all_clips',
  'select_clips_in_range',
  'select_disabled_clips',
  'open_in_source',
  'close_source_monitor',
  'close_all_source_clips',
  'set_source_in_out',
  'insert_from_source',
  'overwrite_from_source',
  'get_source_monitor_info',
  'set_target_track',
  'get_target_tracks',
  'rename_track',
  'get_track_info',
  'clear_item_in_out',
  'set_item_in_out',
  'remove_selected_clips',
  'redo',
  'multiple_undo',
  'get_version_info',
  'get_all_project_paths',
  'lift_selection',
  'extract_selection',
  'get_project_scratch_disks',
  'get_sequence_count',
  'get_total_clip_count',
  'match_frame',
  'ping',
  'get_workspaces',
  'set_workspace',
  'play_timeline',
  'stop_playback',
  'play_source_monitor',
  'get_source_monitor_position',
  'close_project',
  'delete_bin',
  'rename_bin',
  'create_smart_bin',
  'start_batch_encode',
  'add_custom_metadata_field',
  'import_sequences',
  'create_bars_and_tone',
  'set_transcode_on_ingest',
  'set_project_panel_metadata',
  'set_graphics_white_luminance',
  'set_scratch_disk_path',
  'set_offline',
  'has_proxy',
  'detach_proxy',
  'set_override_frame_rate',
  'set_override_pixel_aspect_ratio',
  'set_scale_to_frame_size',
  'select_item',
  'set_start_time',
  'unnest_sequence',
  'create_sequence_from_preset',
  'attach_custom_property',
  'get_export_file_extension',
  'remove_effect',
  'set_xmp_metadata',
  'capture_frame',
  'export_omf',
  'encode_project_item',
  'encode_file',
  'ripple_delete',
  'roll_edit',
  'slide_edit',
  'slip_edit',
  'move_clip_to_track',
  'remove_all_effects',
  'set_clip_speed_qe',
  'set_frame_blend',
  'set_time_interpolation',
  'overwrite_clip',
  'create_sequence_from_clips',
  'close_sequence',
  'export_as_project',
  'set_zero_point',
  'scene_edit_detection',
  'delete_preview_files',
  'add_tracks',
  'set_color_value',
  'get_clip_adjustment_layer',
  'get_linked_items',
  'get_mogrt_component',
  'get_effect_properties',
  'set_effect_property',
  'remove_keyframe_range',
  'set_keyframe_interpolation',
  'get_value_at_time',
  'select_clips_by_color',
  'invert_selection',
  'copy_effects_between_clips',
  'copy_effect_values',
  'replace_clip_media',
  'batch_apply_effect',
  'remove_effect_by_name',
  'set_blend_mode',
  'set_all_tracks_targeted',
  'razor_all_tracks',
  'set_clip_start_time',
  'import_image_sequence',
  'set_clip_position',
  'set_clip_scale',
  'set_clip_rotation',
  'set_clip_anchor_point',
  'set_clip_opacity',
  'set_clip_volume',
  'set_clip_pan',
  'batch_rename_clips',
  'batch_enable_disable',
  'clear_sequence_in_out',
  'get_qe_clip_info',
  'set_poster_frame',
  'move_items_to_bin',
  'set_anti_alias_quality',
  'set_uniform_scale',
  'set_scale_width_height',
  'delete_project_item',
  'delete_multiple_project_items',
  'add_adjustment_layer',
  'freeze_frame',
  'set_sequence_frame_rate',
  'set_sequence_resolution',
  'set_sequence_audio_settings',
  'set_sequence_pixel_aspect_ratio',
  'set_sequence_field_type',
  'get_unused_media',
  'get_duplicate_media',
  'get_clip_links',
  'get_sequence_markers_by_type',
  'get_clip_markers',
  'add_marker_to_project_item',
  'set_sequence_display_format',
  'get_clip_at_playhead',
  'get_next_edit_point',
  'move_playhead_to_edit',
  'set_project_scratch_disk',
  'nest_clips',
  'consolidate_and_transfer',
] as const;

export const unimplementedExpandedToolNames = [] as const;

export function getExpandedTools(existingNames: Set<string>): MCPTool[] {
  return expandedToolNames
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      name,
      description: `Premiere Pro expanded operation: ${name.replace(/_/g, ' ')}.`,
      inputSchema: z.record(z.string(), z.any())
    }));
}

export function isExpandedTool(name: string): boolean {
  return (expandedToolNames as readonly string[]).includes(name);
}

export async function executeExpandedTool(
  bridge: PremiereProTransport,
  name: string,
  args: Record<string, any>
): Promise<any> {
  try {
    if (name === 'create_bars_and_tone') {
      return await createGeneratedBarsAndTone(bridge, args);
    }

    if (name === 'add_adjustment_layer') {
      return await createGeneratedAdjustmentLayer(bridge, args);
    }

    if (name === 'consolidate_and_transfer') {
      return await consolidateAndTransfer(bridge, args);
    }

    if (name === 'delete_preview_files') {
      return await deletePreviewFilesOnDisk(bridge, args);
    }

    if (name === 'execute_extendscript') {
      const script = String(args.script ?? args.code ?? '');
      if (!script.trim()) {
        return { success: false, error: 'execute_extendscript requires script or code' };
      }
      return await bridge.executeScript(script);
    }

    const script = buildExpandedToolScript(name, args);
    return await bridge.executeScript(script);
  } catch (error) {
    return {
      success: false,
      tool: name,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodeRgbaPng(width: number, height: number, pixelAt: (x: number, y: number) => [number, number, number, number]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const offset = rowOffset + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

async function writeGeneratedPng(fileName: string, width: number, height: number, pixelAt: (x: number, y: number) => [number, number, number, number]): Promise<string> {
  const outputDir = join(process.env.PREMIERE_TEMP_DIR || '/tmp/premiere-mcp-bridge', 'generated-assets');
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, fileName);
  await fs.writeFile(filePath, encodeRgbaPng(width, height, pixelAt));
  return filePath;
}

async function createGeneratedBarsAndTone(bridge: PremiereProTransport, args: Record<string, any>): Promise<any> {
  const width = Number(args.width || 1280);
  const height = Number(args.height || 720);
  const colors: Array<[number, number, number, number]> = [
    [191, 191, 191, 255],
    [191, 191, 0, 255],
    [0, 191, 191, 255],
    [0, 191, 0, 255],
    [191, 0, 191, 255],
    [191, 0, 0, 255],
    [0, 0, 191, 255]
  ];
  const filePath = await writeGeneratedPng(`bars-${Date.now()}.png`, width, height, (x) => colors[Math.min(colors.length - 1, Math.floor((x / width) * colors.length))] ?? colors[0]!);
  const imported = await bridge.importMedia(filePath);
  return {
    success: true,
    tool: 'create_bars_and_tone',
    data: {
      created: true,
      mediaType: 'generated_color_bars_png',
      item: imported,
      path: filePath,
      width,
      height,
      toneGenerated: false
    }
  };
}

async function createGeneratedAdjustmentLayer(bridge: PremiereProTransport, args: Record<string, any>): Promise<any> {
  const width = Number(args.width || 1920);
  const height = Number(args.height || 1080);
  const filePath = await writeGeneratedPng(`adjustment-layer-${Date.now()}.png`, width, height, () => [0, 0, 0, 0]);
  const imported = await bridge.importMedia(filePath);
  let placement = null;
  if (args.sequenceId) {
    placement = await bridge.addToTimeline(String(args.sequenceId), imported.id, Number(args.trackIndex || 1), Number(args.time || args.start || 0), false);
  }
  return {
    success: true,
    tool: 'add_adjustment_layer',
    data: {
      created: true,
      mediaType: 'generated_transparent_png',
      item: imported,
      placement,
      path: filePath,
      width,
      height
    }
  };
}

async function consolidateAndTransfer(bridge: PremiereProTransport, args: Record<string, any>): Promise<any> {
  const outputPath = String(args.outputPath || args.path || '');
  if (!outputPath) {
    return {
      success: false,
      tool: 'consolidate_and_transfer',
      error: 'consolidate_and_transfer requires outputPath or path.'
    };
  }

  const readMediaScript = `
    try {
      var media = [];
      var seen = {};
      function walk(item) {
        if (!item) return;
        try {
          if (item.getMediaPath) {
            var mediaPath = String(item.getMediaPath() || "");
            if (mediaPath && !seen[mediaPath]) {
              seen[mediaPath] = true;
              media.push({ nodeId: item.nodeId, name: item.name, mediaPath: mediaPath });
            }
          }
        } catch (mediaError) {}
        if (item.children) {
          for (var i = 0; i < item.children.numItems; i++) walk(item.children[i]);
        }
      }
      walk(app.project.rootItem);
      return JSON.stringify({ success: true, media: media, projectName: app.project.name || "" });
    } catch (e) {
      return JSON.stringify({ success: false, error: e.toString() });
    }
  `;
  const mediaResult: any = await bridge.executeScript(readMediaScript);
  if (!mediaResult?.success) {
    return {
      success: false,
      tool: 'consolidate_and_transfer',
      error: mediaResult?.error || 'Failed to read project media paths',
      details: mediaResult
    };
  }

  const mediaDir = join(outputPath, 'Media');
  await fs.mkdir(mediaDir, { recursive: true });
  const copied: Array<{ source: string; destination: string; nodeId?: string; name?: string }> = [];
  const skipped: Array<{ source: string; reason: string; nodeId?: string; name?: string }> = [];
  const usedDestinations = new Set<string>();

  for (const item of mediaResult.media || []) {
    const source = String(item.mediaPath || '');
    if (!source) continue;
    try {
      await fs.stat(source);
      let fileName = basename(source);
      let destination = join(mediaDir, fileName);
      let suffix = 1;
      while (usedDestinations.has(destination)) {
        const dot = fileName.lastIndexOf('.');
        const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
        const ext = dot > 0 ? fileName.slice(dot) : '';
        destination = join(mediaDir, `${stem}-${suffix}${ext}`);
        suffix++;
      }
      usedDestinations.add(destination);
      await fs.copyFile(source, destination);
      copied.push({ source, destination, nodeId: item.nodeId, name: item.name });
    } catch (error) {
      skipped.push({
        source,
        nodeId: item.nodeId,
        name: item.name,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  let projectCopy: any = null;
  if (args.saveProjectCopy !== false) {
    const projectPath = join(outputPath, `${String(args.projectName || mediaResult.projectName || 'consolidated-project').replace(/[\\/]+/g, '_').replace(/\\.prproj$/i, '')}.prproj`);
    const saveScript = `
      try {
        app.project.saveAs(${JSON.stringify(projectPath)});
        return JSON.stringify({ success: true, projectPath: ${JSON.stringify(projectPath)} });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.toString(), projectPath: ${JSON.stringify(projectPath)} });
      }
    `;
    projectCopy = await bridge.executeScript(saveScript);
  }

  const manifestPath = join(outputPath, 'consolidate-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    projectName: mediaResult.projectName,
    copied,
    skipped,
    projectCopy
  }, null, 2));

  return {
    success: projectCopy?.success !== false,
    tool: 'consolidate_and_transfer',
    data: {
      outputPath,
      mediaDir,
      copiedCount: copied.length,
      skippedCount: skipped.length,
      copied,
      skipped,
      projectCopy,
      manifestPath
    }
  };
}

async function deletePreviewFilesOnDisk(bridge: PremiereProTransport, args: Record<string, any>): Promise<any> {
  const infoScript = `
    try {
      var projectPath = "";
      try { projectPath = String(app.project.path || ""); } catch (pathError) {}
      return JSON.stringify({
        success: true,
        projectPath: projectPath,
        projectName: app.project && app.project.name ? String(app.project.name) : "",
        sequenceName: app.project && app.project.activeSequence ? String(app.project.activeSequence.name) : ""
      });
    } catch (e) {
      return JSON.stringify({ success: false, error: e.toString() });
    }
  `;
  const info: any = await bridge.executeScript(infoScript);
  if (!info?.success) {
    return {
      success: false,
      tool: 'delete_preview_files',
      error: info?.error || 'Failed to inspect active project',
      details: info
    };
  }

  const projectDir = info.projectPath ? dirname(String(info.projectPath)) : (process.env.PREMIERE_TEMP_DIR || '/tmp/premiere-mcp-bridge');
  const explicitDir = args.previewDir || args.previewPath || args.path;
  const candidates = [
    explicitDir ? String(explicitDir) : '',
    join(projectDir, 'Adobe Premiere Pro Video Previews'),
    join(projectDir, 'Adobe Premiere Pro Audio Previews'),
    join(projectDir, `${String(info.projectName || '').replace(/\\.prproj$/i, '')} Video Previews`),
    join(projectDir, `${String(info.projectName || '').replace(/\\.prproj$/i, '')} Audio Previews`)
  ].filter(Boolean);

  const deleted: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const visited = new Set<string>();

  async function walkPreviewDir(dir: string, isExplicit: boolean): Promise<void> {
    if (visited.has(dir)) return;
    visited.add(dir);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      skipped.push({ path: dir, reason: error instanceof Error ? error.message : String(error) });
      return;
    }
    const dirLooksLikePreview = isExplicit || /preview/i.test(basename(dir));
    if (!dirLooksLikePreview) {
      skipped.push({ path: dir, reason: 'Directory name does not look like a Premiere preview directory' });
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkPreviewDir(fullPath, true);
      } else if (entry.isFile()) {
        try {
          await fs.unlink(fullPath);
          deleted.push(fullPath);
        } catch (error) {
          skipped.push({ path: fullPath, reason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }

  for (const candidate of candidates) {
    await walkPreviewDir(candidate, Boolean(explicitDir && String(candidate) === String(explicitDir)));
  }

  return {
    success: true,
    tool: 'delete_preview_files',
    data: {
      projectPath: info.projectPath,
      projectName: info.projectName,
      sequenceName: info.sequenceName,
      scanned: candidates,
      deletedCount: deleted.length,
      skippedCount: skipped.length,
      deleted,
      skipped
    }
  };
}

function buildExpandedToolScript(name: string, args: Record<string, any>): string {
  return `
    var toolName = ${JSON.stringify(name)};
    var args = ${JSON.stringify(args ?? {})};

    function ok(data) { return JSON.stringify({ success: true, tool: toolName, data: data }); }
    function fail(message, details) { return JSON.stringify({ success: false, tool: toolName, error: String(message), details: details || null }); }
    function secondsToTicks(seconds) { return String(Math.round(Number(seconds || 0) * 254016000000)); }
    function ticksToSeconds(ticks) { return parseInt(String(ticks || "0"), 10) / 254016000000; }
    function valueOfTime(timeValue) {
      if (!timeValue) return 0;
      if (typeof timeValue.seconds !== "undefined") return Number(timeValue.seconds);
      if (typeof timeValue.ticks !== "undefined") return ticksToSeconds(timeValue.ticks);
      return Number(timeValue) || 0;
    }
    function activeSequence() {
      return app.project && app.project.activeSequence ? app.project.activeSequence : null;
    }
    function findSequence(idOrName) {
      if (!app.project || !app.project.sequences) return null;
      for (var i = 0; i < app.project.sequences.numSequences; i++) {
        var seq = app.project.sequences[i];
        if (seq.sequenceID === idOrName || seq.name === idOrName) return seq;
      }
      return null;
    }
    function targetSequence() {
      return args.sequenceId || args.sequence_id ? findSequence(args.sequenceId || args.sequence_id) : activeSequence();
    }
    function walkItems(parent, visitor) {
      if (!parent || !parent.children) return;
      for (var i = 0; i < parent.children.numItems; i++) {
        var item = parent.children[i];
        visitor(item);
        if (item.children) walkItems(item, visitor);
      }
    }
    function findItem(idOrName) {
      if (!app.project || !app.project.rootItem) return null;
      var found = null;
      walkItems(app.project.rootItem, function(item) {
        if (!found && (item.nodeId === idOrName || item.name === idOrName || item.treePath === idOrName)) found = item;
      });
      return found;
    }
    function allProjectItems() {
      var items = [];
      if (!app.project || !app.project.rootItem) return items;
      walkItems(app.project.rootItem, function(item) {
        var entry = { nodeId: item.nodeId, name: item.name, type: item.type, treePath: item.treePath };
        try { entry.mediaPath = item.getMediaPath(); } catch (e) {}
        try { entry.offline = item.isOffline(); } catch (e) {}
        try { entry.colorLabel = item.getColorLabel(); } catch (e) {}
        items.push(entry);
      });
      return items;
    }
    function projectItemInfo(item) {
      if (!item) return null;
      var data = { nodeId: item.nodeId, name: item.name, type: item.type, treePath: item.treePath };
      try { data.mediaPath = item.getMediaPath(); } catch (e) {}
      try { data.offline = item.isOffline(); } catch (e) {}
      try { data.colorLabel = item.getColorLabel(); } catch (e) {}
      return data;
    }
    function firstMediaItem() {
      if (!app.project || !app.project.rootItem) return null;
      var found = null;
      walkItems(app.project.rootItem, function(item) {
        if (found) return;
        try { if (item.getMediaPath && item.getMediaPath()) found = item; } catch (e) {}
      });
      return found;
    }
    function findClip(nodeId) {
      var seq = targetSequence() || activeSequence();
      if (!seq) return null;
      function scan(collection, type) {
        for (var t = 0; t < collection.numTracks; t++) {
          var track = collection[t];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (!nodeId || clip.nodeId === nodeId || clip.name === nodeId) {
              return { clip: clip, track: track, trackIndex: t, clipIndex: c, trackType: type, sequence: seq };
            }
          }
        }
        return null;
      }
      return scan(seq.videoTracks, "video") || scan(seq.audioTracks, "audio");
    }
    function clipInfo(clip, trackType, trackIndex, clipIndex) {
      var item = {
        nodeId: clip.nodeId,
        name: clip.name,
        trackType: trackType,
        trackIndex: trackIndex,
        clipIndex: clipIndex,
        start: valueOfTime(clip.start),
        end: valueOfTime(clip.end),
        inPoint: valueOfTime(clip.inPoint),
        outPoint: valueOfTime(clip.outPoint),
        duration: valueOfTime(clip.duration)
      };
      try { item.enabled = clip.isEnabled(); } catch (e) {}
      try { item.selected = clip.isSelected(); } catch (e) {}
      try { item.mediaType = clip.mediaType; } catch (e) {}
      return item;
    }
    function sequenceStructure(seq) {
      if (!seq) return null;
      var data = {
        name: seq.name,
        id: seq.sequenceID,
        durationSeconds: ticksToSeconds(seq.end),
        width: seq.frameSizeHorizontal,
        height: seq.frameSizeVertical,
        videoTracks: [],
        audioTracks: []
      };
      for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
        var videoTrack = seq.videoTracks[vt];
        var videoEntry = { index: vt, name: videoTrack.name, clipCount: videoTrack.clips.numItems, clips: [] };
        try { videoEntry.muted = videoTrack.isMuted(); } catch (e) {}
        for (var vc = 0; vc < videoTrack.clips.numItems; vc++) videoEntry.clips.push(clipInfo(videoTrack.clips[vc], "video", vt, vc));
        data.videoTracks.push(videoEntry);
      }
      for (var at = 0; at < seq.audioTracks.numTracks; at++) {
        var audioTrack = seq.audioTracks[at];
        var audioEntry = { index: at, name: audioTrack.name, clipCount: audioTrack.clips.numItems, clips: [] };
        try { audioEntry.muted = audioTrack.isMuted(); } catch (e) {}
        for (var ac = 0; ac < audioTrack.clips.numItems; ac++) audioEntry.clips.push(clipInfo(audioTrack.clips[ac], "audio", at, ac));
        data.audioTracks.push(audioEntry);
      }
      return data;
    }
    function setSelection(matchFn, selected, additive) {
      var seq = targetSequence() || activeSequence();
      if (!seq) return fail("No active sequence");
      var changed = [];
      function apply(collection, type) {
        for (var t = 0; t < collection.numTracks; t++) {
          var track = collection[t];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (!additive && selected) {
              try { clip.setSelected(0, 1); } catch (e) {}
            }
            var matched = false;
            try { matched = Boolean(matchFn(clip, type, t, c)); } catch (matchError) { matched = false; }
            if (matched) {
              try { clip.setSelected(selected ? 1 : 0, 1); changed.push(clipInfo(clip, type, t, c)); } catch (e) {}
            }
          }
        }
      }
      apply(seq.videoTracks, "video");
      apply(seq.audioTracks, "audio");
      return ok({ changed: changed, count: changed.length });
    }
    function commandByName(commandName) {
      if (!app.findMenuCommandId || !app.executeCommand) {
        return fail("Premiere menu command APIs are unavailable in this CEP ExtendScript context.", {
          available: false,
          skipped: true,
          command: commandName
        });
      }
      var id = app.findMenuCommandId(commandName);
      if (!id) return fail("Menu command not found.", { available: false, skipped: true, command: commandName });
      app.executeCommand(id);
      return ok({ command: commandName, commandId: id });
    }
    function resolvePath(pathValue) {
      var normalized = String(pathValue || "app")
        .replace(/\\[([0-9]+)\\]/g, ".$1")
        .replace(/^app\\.?/, "");
      var current = app;
      if (!normalized) return current;
      var parts = normalized.split(".");
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        if (current === null || typeof current === "undefined") return undefined;
        current = current[parts[i]];
      }
      return current;
    }
    function secondsToTime(seconds) {
      var time = new Time();
      time.seconds = Number(seconds || 0);
      return time;
    }
    function normalizeName(value) {
      return String(value || "").toLowerCase().replace(/[\\s_-]+/g, "");
    }
    function tryCall(target, methodNames, argsList) {
      if (!target) return { called: false, error: "Missing target object" };
      for (var i = 0; i < methodNames.length; i++) {
        var methodName = methodNames[i];
        try {
          if (typeof target[methodName] === "function") {
            return { called: true, method: methodName, result: target[methodName].apply(target, argsList || []) };
          }
        } catch (e) {
          return { called: false, method: methodName, error: e.toString() };
        }
      }
      return { called: false, error: "None of these methods are available: " + methodNames.join(", ") };
    }
    function findParentItem(targetItem) {
      if (!app.project || !app.project.rootItem || !targetItem) return null;
      var foundParent = null;
      function scan(parent) {
        if (!parent || !parent.children || foundParent) return;
        for (var i = 0; i < parent.children.numItems; i++) {
          var child = parent.children[i];
          if (child === targetItem || child.nodeId === targetItem.nodeId) {
            foundParent = parent;
            return;
          }
          if (child.children) scan(child);
        }
      }
      scan(app.project.rootItem);
      return foundParent;
    }
    function moveItemToBin(item, bin) {
      if (!item || !bin) return { ok: false, error: "Missing item or bin" };
      var moved = tryCall(item, ["moveBin", "moveToBin"], [bin]);
      if (moved.called) return { ok: true, method: moved.method };
      var parent = findParentItem(item);
      if (parent && parent.moveChild) {
        try { parent.moveChild(item, bin); return { ok: true, method: "parent.moveChild" }; } catch (moveError) { return { ok: false, error: moveError.toString() }; }
      }
      return { ok: false, error: moved.error };
    }
    function allClips(seq) {
      var clips = [];
      if (!seq) return clips;
      function collect(collection, type) {
        for (var t = 0; t < collection.numTracks; t++) {
          var track = collection[t];
          for (var c = 0; c < track.clips.numItems; c++) clips.push({ clip: track.clips[c], track: track, trackIndex: t, clipIndex: c, trackType: type, sequence: seq });
        }
      }
      collect(seq.videoTracks, "video");
      collect(seq.audioTracks, "audio");
      return clips;
    }
    function findComponent(clip, componentName) {
      if (!clip || !clip.components) return null;
      var wanted = normalizeName(componentName);
      for (var i = 0; i < clip.components.numItems; i++) {
        var component = clip.components[i];
        if (normalizeName(component.displayName) === wanted || normalizeName(component.matchName) === wanted) return { component: component, index: i };
      }
      return null;
    }
    function componentProperties(component) {
      var props = [];
      if (!component || !component.properties) return props;
      for (var i = 0; i < component.properties.numItems; i++) {
        var prop = component.properties[i];
        var value = null;
        try { value = prop.getValue(); } catch (e) {}
        props.push({ index: i, name: String(prop.displayName), value: value });
      }
      return props;
    }
    function setComponentProperty(component, propertyName, value) {
      if (!component || !component.properties) return { ok: false, error: "Component has no properties" };
      var wanted = normalizeName(propertyName);
      for (var i = 0; i < component.properties.numItems; i++) {
        var prop = component.properties[i];
        if (normalizeName(prop.displayName) !== wanted) continue;
        var before = null;
        var after = null;
        try { before = prop.getValue(); } catch (eBefore) {}
        try {
          prop.setValue(value, true);
          try { after = prop.getValue(); } catch (eAfter) {}
          return { ok: true, property: String(prop.displayName), before: before, after: after };
        } catch (eSet) {
          return { ok: false, property: String(prop.displayName), error: eSet.toString() };
        }
      }
      return { ok: false, error: "Property not found: " + propertyName };
    }
    function getComponentProperty(component, propertyName) {
      if (!component || !component.properties) return { ok: false, error: "Component has no properties" };
      var wanted = normalizeName(propertyName);
      for (var i = 0; i < component.properties.numItems; i++) {
        var prop = component.properties[i];
        if (normalizeName(prop.displayName) !== wanted) continue;
        try {
          return { ok: true, property: String(prop.displayName), value: prop.getValue() };
        } catch (eGet) {
          return { ok: false, property: String(prop.displayName), error: eGet.toString() };
        }
      }
      return { ok: false, error: "Property not found: " + propertyName };
    }
    function findProperty(component, propertyName) {
      if (!component || !component.properties) return null;
      var wanted = normalizeName(propertyName);
      for (var i = 0; i < component.properties.numItems; i++) {
        var prop = component.properties[i];
        if (normalizeName(prop.displayName) === wanted) return prop;
      }
      return null;
    }
    function qeClipForClip(found) {
      if (!found) return null;
      app.enableQE();
      var qeSeq = qe.project.getActiveSequence();
      if (!qeSeq) return null;
      var qeTrack = found.trackType === "video" ? qeSeq.getVideoTrackAt(found.trackIndex) : qeSeq.getAudioTrackAt(found.trackIndex);
      if (!qeTrack) return null;
      return qeTrack.getItemAt(found.clipIndex);
    }
    function markerCollectionForTool() {
      var seq = targetSequence() || activeSequence();
      if (args.projectItemId || args.itemId || args.item_id) {
        var markerItem = findItem(args.projectItemId || args.itemId || args.item_id);
        if (markerItem && markerItem.getMarkers) return markerItem.getMarkers();
      }
      return seq && seq.markers ? seq.markers : null;
    }

    try {
      switch (toolName) {
        case "ping":
          return ok({
            connected: true,
            premiereVersion: app.version,
            buildNumber: app.build,
            projectName: app.project ? app.project.name : null,
            activeSequence: activeSequence() ? activeSequence().name : null
          });

        case "evaluate_expression":
          var expression = String(args.expression || args.code || "app.version");
          var value = resolvePath(expression);
          return ok({ value: value, type: typeof value });

        case "inspect_dom_object":
          var objectPath = String(args.object_path || args.path || "app");
          var depth = Number(args.depth || 1);
          var target = resolvePath(objectPath);
          function inspect(value, level) {
            if (value === null || typeof value !== "object" || level >= depth) return String(value);
            var out = {};
            for (var key in value) {
              try {
                var child = value[key];
                out[key] = (child && typeof child === "object") ? (level + 1 >= depth ? "[object]" : inspect(child, level + 1)) : child;
              } catch (e) {}
            }
            return out;
          }
          return ok({ path: objectPath, value: inspect(target, 0) });

        case "get_version_info":
          return ok({ version: app.version, build: app.build });

        case "get_premiere_state":
        case "get_full_project_overview":
          var sequences = [];
          if (app.project && app.project.sequences) {
            for (var si = 0; si < app.project.sequences.numSequences; si++) {
              var seq = app.project.sequences[si];
              sequences.push({ name: seq.name, id: seq.sequenceID, durationSeconds: ticksToSeconds(seq.end), width: seq.frameSizeHorizontal, height: seq.frameSizeVertical });
            }
          }
          return ok({
            project: app.project ? { name: app.project.name, path: app.project.path, itemCount: allProjectItems().length } : null,
            activeSequence: activeSequence() ? sequenceStructure(activeSequence()) : null,
            sequences: sequences,
            version: app.version,
            build: app.build
          });

        case "get_sequence_structure":
        case "get_full_sequence_info":
          return ok(sequenceStructure(targetSequence()));

        case "get_timeline_summary":
          var sumSeq = targetSequence();
          var structure = sequenceStructure(sumSeq);
          var videoClips = 0;
          var audioClips = 0;
          if (structure) {
            for (var sv = 0; sv < structure.videoTracks.length; sv++) videoClips += structure.videoTracks[sv].clipCount;
            for (var sa = 0; sa < structure.audioTracks.length; sa++) audioClips += structure.audioTracks[sa].clipCount;
          }
          return ok({ sequence: structure ? { name: structure.name, id: structure.id, durationSeconds: structure.durationSeconds } : null, videoClips: videoClips, audioClips: audioClips });

        case "get_sequence_count":
          return ok({ count: app.project && app.project.sequences ? app.project.sequences.numSequences : 0 });

        case "get_total_clip_count":
          var countStruct = sequenceStructure(targetSequence());
          var vCount = 0, aCount = 0;
          if (countStruct) {
            for (var cv = 0; cv < countStruct.videoTracks.length; cv++) vCount += countStruct.videoTracks[cv].clipCount;
            for (var ca = 0; ca < countStruct.audioTracks.length; ca++) aCount += countStruct.audioTracks[ca].clipCount;
          }
          return ok({ videoClips: vCount, audioClips: aCount, total: vCount + aCount });

        case "get_project_item_info":
        case "get_item_info":
          var item = findItem(args.item_id || args.itemId || args.projectItemId || args.node_id || args.nodeId || args.name);
          if (!item) return fail("Project item not found");
          var itemData = { nodeId: item.nodeId, name: item.name, type: item.type, treePath: item.treePath };
          try { itemData.mediaPath = item.getMediaPath(); } catch (e) {}
          try { itemData.offline = item.isOffline(); } catch (e) {}
          return ok(itemData);

        case "search_project_items":
        case "find_items_by_media_path":
          var query = String(args.query || args.name || args.mediaPath || args.path || "").toLowerCase();
          var matches = [];
          var allItems = allProjectItems();
          for (var mi = 0; mi < allItems.length; mi++) {
            var haystack = String(allItems[mi].name || "") + " " + String(allItems[mi].mediaPath || "") + " " + String(allItems[mi].treePath || "");
            if (!query || haystack.toLowerCase().indexOf(query) !== -1) matches.push(allItems[mi]);
          }
          return ok({ query: query, count: matches.length, items: matches });

        case "get_bin_contents":
          var bin = findItem(args.bin_id || args.binId || args.name);
          if (!bin) return fail("Bin not found");
          var childItems = [];
          if (bin.children) {
            for (var bi = 0; bi < bin.children.numItems; bi++) {
              var child = bin.children[bi];
              childItems.push({ nodeId: child.nodeId, name: child.name, type: child.type, treePath: child.treePath });
            }
          }
          return ok({ bin: { nodeId: bin.nodeId, name: bin.name, treePath: bin.treePath }, items: childItems, count: childItems.length });

        case "get_offline_media":
          var offline = [];
          var offlineItems = allProjectItems();
          for (var oi = 0; oi < offlineItems.length; oi++) if (offlineItems[oi].offline) offline.push(offlineItems[oi]);
          return ok({ count: offline.length, items: offline });

        case "get_used_media_report":
        case "get_unused_media":
        case "get_duplicate_media":
          return ok({ items: allProjectItems(), note: "Project item scan completed; sequence media usage is exposed through get_sequence_structure." });

        case "get_all_project_paths":
          var projectPaths = [];
          var pathItems = allProjectItems();
          for (var pi = 0; pi < pathItems.length; pi++) {
            if (pathItems[pi].mediaPath) projectPaths.push({ nodeId: pathItems[pi].nodeId, name: pathItems[pi].name, path: pathItems[pi].mediaPath });
          }
          return ok({ projectPath: app.project ? app.project.path : null, count: projectPaths.length, paths: projectPaths });

        case "get_insertion_bin":
          if (!app.project || !app.project.getInsertionBin) return fail("app.project.getInsertionBin is unavailable");
          var insertionBin = app.project.getInsertionBin();
          if (!insertionBin) return fail("Premiere did not return an insertion bin");
          return ok({ bin: projectItemInfo(insertionBin) });

        case "get_project_panel_metadata":
          var panelMetadataItem = findItem(args.projectItemId || args.itemId || args.item_id || args.name) || firstMediaItem() || (app.project ? app.project.rootItem : null);
          if (!panelMetadataItem) return fail("Project item not found");
          if (!panelMetadataItem.getProjectMetadata) return fail("getProjectMetadata is unavailable on this item");
          return ok({ item: projectItemInfo(panelMetadataItem), metadata: panelMetadataItem.getProjectMetadata() });

        case "get_xmp_metadata":
          var xmpItem = findItem(args.projectItemId || args.itemId || args.item_id || args.name) || firstMediaItem();
          if (!xmpItem) return fail("Project item not found");
          if (!xmpItem.getXMPMetadata) return fail("getXMPMetadata is unavailable on this item");
          return ok({ item: projectItemInfo(xmpItem), metadata: xmpItem.getXMPMetadata() });

        case "get_color_space":
          var colorItem = findItem(args.projectItemId || args.itemId || args.item_id || args.name) || firstMediaItem();
          if (!colorItem) return fail("Project item not found");
          var colorSpaceResult = tryCall(colorItem, ["getOverrideColorSpace", "getColorSpace"], []);
          var colorSpaceList = null;
          try { if (colorItem.getOverrideColorSpaceList) colorSpaceList = colorItem.getOverrideColorSpaceList(); } catch (colorListError) {}
          if (!colorSpaceResult.called && colorSpaceList === null) return fail(colorSpaceResult.error, { item: colorItem.name });
          return ok({ item: projectItemInfo(colorItem), colorSpace: colorSpaceResult.called ? colorSpaceResult.result : null, overrideColorSpaceList: colorSpaceList });

        case "get_graphics_white_luminance":
          if (!app.project || !app.project.getGraphicsWhiteLuminance) return fail("app.project.getGraphicsWhiteLuminance is unavailable");
          return ok({ value: app.project.getGraphicsWhiteLuminance() });

        case "is_work_area_enabled":
          var workSeq = targetSequence() || activeSequence();
          if (!workSeq) return fail("No active sequence");
          var workAreaEnabled = null;
          try { if (workSeq.isWorkAreaEnabled) workAreaEnabled = Boolean(workSeq.isWorkAreaEnabled()); } catch (workEnabledError) {}
          try { if (workAreaEnabled === null && typeof workSeq.workAreaEnabled !== "undefined") workAreaEnabled = Boolean(workSeq.workAreaEnabled); } catch (workPropError) {}
          if (workAreaEnabled === null) return fail("Work area enabled state is unavailable on this sequence");
          return ok({ enabled: workAreaEnabled });

        case "get_timeline_gaps":
          var gapSeq = targetSequence() || activeSequence();
          if (!gapSeq) return fail("No active sequence");
          var gaps = [];
          for (var gt = 0; gt < gapSeq.videoTracks.numTracks; gt++) {
            var gapTrack = gapSeq.videoTracks[gt];
            var ranges = [];
            for (var gc = 0; gc < gapTrack.clips.numItems; gc++) ranges.push({ start: valueOfTime(gapTrack.clips[gc].start), end: valueOfTime(gapTrack.clips[gc].end) });
            ranges.sort(function(a, b) { return a.start - b.start; });
            var cursor = 0;
            for (var gr = 0; gr < ranges.length; gr++) {
              if (ranges[gr].start > cursor) gaps.push({ trackIndex: gt, start: cursor, end: ranges[gr].start, duration: ranges[gr].start - cursor });
              if (ranges[gr].end > cursor) cursor = ranges[gr].end;
            }
          }
          return ok({ count: gaps.length, gaps: gaps });

        case "get_project_scratch_disks":
          if (!app.project) return fail("No open project");
          var scratchTypes = args.types || ["FirstVideoCaptureFolder", "FirstAudioCaptureFolder", "FirstVideoPreviewFolder", "FirstAudioPreviewFolder", "FirstAutoSaveFolder", "FirstCCLibrariesFolder"];
          var scratchDisks = [];
          if (!app.project.getScratchDiskPath) {
            var projectFile = new File(app.project.path);
            var projectFolder = projectFile.parent ? projectFile.parent.fsName : "";
            for (var sdf = 0; sdf < scratchTypes.length; sdf++) scratchDisks.push({ type: scratchTypes[sdf], path: projectFolder, method: "project folder fallback" });
            return ok({ scratchDisks: scratchDisks, available: false, method: "project folder fallback" });
          }
          for (var sdi = 0; sdi < scratchTypes.length; sdi++) {
            try { scratchDisks.push({ type: scratchTypes[sdi], path: app.project.getScratchDiskPath(scratchTypes[sdi]) }); } catch (scratchError) { scratchDisks.push({ type: scratchTypes[sdi], error: scratchError.toString() }); }
          }
          return ok({ scratchDisks: scratchDisks });

        case "get_workspaces":
          var workspaces = app.getWorkspaces ? app.getWorkspaces() : [];
          var workspaceList = [];
          for (var wi = 0; wi < workspaces.length; wi++) workspaceList.push(workspaces[wi]);
          return ok({ workspaces: workspaceList, count: workspaceList.length });

        case "set_workspace":
          if (!app.setWorkspace) return fail("Workspace API unavailable");
          return ok({ workspace: args.name, result: app.setWorkspace(String(args.name)) });

        case "undo":
        case "redo":
          app.enableQE();
          if (!qe || !qe.project) return fail("QE project API unavailable");
          var historyMethod = toolName === "undo" ? "undo" : "redo";
          if (typeof qe.project[historyMethod] !== "function") return fail("qe.project." + historyMethod + " is unavailable");
          qe.project[historyMethod]();
          return ok({ performed: true, method: "qe.project." + historyMethod });

        case "multiple_undo":
          app.enableQE();
          if (!qe || !qe.project || typeof qe.project.undo !== "function") return fail("qe.project.undo is unavailable");
          var undoCount = Number(args.count || 1);
          var performedUndoCount = 0;
          for (var ui = 0; ui < undoCount; ui++) {
            qe.project.undo();
            performedUndoCount++;
          }
          return ok({ count: undoCount, performed: performedUndoCount, method: "qe.project.undo" });

        case "play_timeline":
        case "stop_playback":
          app.enableQE();
          if (toolName === "play_timeline") qe.startPlayback(); else qe.stopPlayback();
          return ok({ playback: toolName === "play_timeline" ? "playing" : "stopped" });

        case "get_source_monitor_info":
          var sourceItem = app.sourceMonitor && app.sourceMonitor.getProjectItem ? app.sourceMonitor.getProjectItem() : null;
          if (!sourceItem) return ok({ loaded: false });
          return ok({ loaded: true, nodeId: sourceItem.nodeId, name: sourceItem.name });

        case "open_in_source":
          var sourceOpenItem = findItem(args.item_id || args.itemId || args.projectItemId || args.name);
          if (!sourceOpenItem) return fail("Project item not found");
          app.sourceMonitor.openProjectItem(sourceOpenItem);
          return ok({ opened: true, item: sourceOpenItem.name, nodeId: sourceOpenItem.nodeId });

        case "close_source_monitor":
          app.sourceMonitor.closeClip();
          return ok({ closed: true });

        case "close_all_source_clips":
          app.sourceMonitor.closeAllClips();
          return ok({ closedAll: true });

        case "set_source_in_out":
        case "set_item_in_out":
          var inOutItem = toolName === "set_source_in_out" ? app.sourceMonitor.getProjectItem() : findItem(args.item_id || args.itemId || args.projectItemId);
          if (!inOutItem) return fail("Project item not found");
          if (typeof args.in_seconds !== "undefined" || typeof args.inPoint !== "undefined") inOutItem.setInPoint(secondsToTicks(args.in_seconds || args.inPoint), 4);
          if (typeof args.out_seconds !== "undefined" || typeof args.outPoint !== "undefined") inOutItem.setOutPoint(secondsToTicks(args.out_seconds || args.outPoint), 4);
          return ok({ item: inOutItem.name, inSet: typeof args.in_seconds !== "undefined" || typeof args.inPoint !== "undefined", outSet: typeof args.out_seconds !== "undefined" || typeof args.outPoint !== "undefined" });

        case "clear_item_in_out":
          var clearItem = findItem(args.item_id || args.itemId || args.projectItemId);
          if (!clearItem) return fail("Project item not found");
          try { clearItem.clearInPoint(); } catch (e) {}
          try { clearItem.clearOutPoint(); } catch (e) {}
          return ok({ cleared: true, item: clearItem.name });

        case "get_source_monitor_position":
          var sourcePos = app.sourceMonitor.getPosition();
          return ok({ seconds: sourcePos ? ticksToSeconds(sourcePos.ticks) : null, ticks: sourcePos ? sourcePos.ticks : null });

        case "play_source_monitor":
          app.sourceMonitor.play(Number(args.speed || 1));
          return ok({ playing: true, speed: Number(args.speed || 1) });

        case "insert_from_source":
        case "overwrite_from_source":
          var editSeq = activeSequence();
          var editItem = app.sourceMonitor.getProjectItem();
          if (!editSeq || !editItem) return fail("Need active sequence and source monitor item");
          var editPos = editSeq.getPlayerPosition().ticks;
          if (toolName === "insert_from_source") editSeq.insertClip(editItem, editPos, Number(args.video_track_index || args.videoTrackIndex || 0), Number(args.audio_track_index || args.audioTrackIndex || 0));
          else editSeq.overwriteClip(editItem, editPos, Number(args.video_track_index || args.videoTrackIndex || 0), Number(args.audio_track_index || args.audioTrackIndex || 0));
          return ok({ edited: true, mode: toolName, item: editItem.name, atSeconds: ticksToSeconds(editPos) });

        case "select_all_clips":
          return setSelection(function() { return true; }, true, true);
        case "deselect_all_clips":
          return setSelection(function() { return true; }, false, true);
        case "select_clips_by_name":
          var nameQuery = String(args.name || args.query || "").toLowerCase();
          return setSelection(function(clip) { return String(clip.name || "").toLowerCase().indexOf(nameQuery) !== -1; }, true, Boolean(args.add_to_selection || args.addToSelection));
        case "select_clips_in_range":
          var start = Number(args.startTime || args.start || 0);
          var end = Number(args.endTime || args.end || 0);
          return setSelection(function(clip) { return valueOfTime(clip.start) < end && valueOfTime(clip.end) > start; }, true, Boolean(args.add_to_selection || args.addToSelection));
        case "select_disabled_clips":
          return setSelection(function(clip) { try { return !clip.isEnabled(); } catch (e) { return false; } }, true, Boolean(args.add_to_selection || args.addToSelection));
        case "set_clip_selection":
          return setSelection(function(clip) { return clip.nodeId === (args.clipId || args.node_id || args.nodeId); }, Boolean(args.selected !== false), true);

        case "get_target_tracks":
          var targetSeq = activeSequence();
          if (!targetSeq) return fail("No active sequence");
          var videoTargets = [], audioTargets = [];
          for (var tv = 0; tv < targetSeq.videoTracks.numTracks; tv++) { try { if (targetSeq.videoTracks[tv].isTargeted()) videoTargets.push({ index: tv, name: targetSeq.videoTracks[tv].name }); } catch (e) {} }
          for (var ta = 0; ta < targetSeq.audioTracks.numTracks; ta++) { try { if (targetSeq.audioTracks[ta].isTargeted()) audioTargets.push({ index: ta, name: targetSeq.audioTracks[ta].name }); } catch (e) {} }
          return ok({ video: videoTargets, audio: audioTargets });

        case "set_target_track":
          var targetTrackSeq = activeSequence();
          if (!targetTrackSeq) return fail("No active sequence");
          var targetCollection = String(args.track_type || args.trackType || "video") === "audio" ? targetTrackSeq.audioTracks : targetTrackSeq.videoTracks;
          var targetTrack = targetCollection[Number(args.track_index || args.trackIndex || 0)];
          if (!targetTrack || !targetTrack.setTargeted) return fail("Track targeting API unavailable");
          targetTrack.setTargeted(Boolean(args.targeted !== false), true);
          return ok({ targeted: Boolean(args.targeted !== false) });

        case "rename_track":
          var renameSeq = activeSequence();
          if (!renameSeq) return fail("No active sequence");
          var renameTracks = String(args.track_type || args.trackType || "video") === "audio" ? renameSeq.audioTracks : renameSeq.videoTracks;
          renameTracks[Number(args.track_index || args.trackIndex || 0)].name = String(args.name || args.newName);
          return ok({ renamed: true, name: String(args.name || args.newName) });

        case "get_track_info":
          var infoSeq = activeSequence();
          if (!infoSeq) return fail("No active sequence");
          var trackType = String(args.track_type || args.trackType || "video");
          var trackIndex = Number(args.track_index || args.trackIndex || 0);
          var track = trackType === "audio" ? infoSeq.audioTracks[trackIndex] : infoSeq.videoTracks[trackIndex];
          if (!track) return fail("Track not found");
          return ok({ name: track.name, index: trackIndex, type: trackType, clipCount: track.clips.numItems });

        case "close_project":
          if (args.confirm !== true) return fail("close_project requires confirm:true so callers do not close the active project accidentally.");
          if (!app.project) return fail("No open project");
          var closeResult = tryCall(app.project, ["closeDocument", "close"], [Boolean(args.saveFirst || args.save)]);
          if (!closeResult.called) return fail(closeResult.error, { available: false });
          return ok({ closed: true, method: closeResult.method });

        case "delete_bin":
        case "delete_project_item":
          var deleteItem = findItem(args.binId || args.bin_id || args.projectItemId || args.itemId || args.item_id || args.name);
          if (!deleteItem) return fail("Project item not found");
          var deleteName = deleteItem.name;
          var deleteResult = tryCall(deleteItem, ["deleteBin", "deleteItem", "remove"], []);
          if (!deleteResult.called) return fail(deleteResult.error, { item: deleteName });
          return ok({ deleted: true, item: deleteName, method: deleteResult.method });

        case "delete_multiple_project_items":
          var deleteIds = args.projectItemIds || args.itemIds || args.ids || [];
          var deleteResults = [];
          for (var di = 0; di < deleteIds.length; di++) {
            var itemToDelete = findItem(deleteIds[di]);
            if (!itemToDelete) {
              deleteResults.push({ id: deleteIds[di], ok: false, error: "Project item not found" });
              continue;
            }
            var oneDelete = tryCall(itemToDelete, ["deleteBin", "deleteItem", "remove"], []);
            deleteResults.push({ id: deleteIds[di], name: itemToDelete.name, ok: oneDelete.called, method: oneDelete.method || null, error: oneDelete.error || null });
          }
          return ok({ results: deleteResults, deleted: deleteResults.filter(function(result) { return result.ok; }).length });

        case "rename_bin":
          var renameBin = findItem(args.binId || args.bin_id || args.itemId || args.name);
          if (!renameBin) return fail("Bin not found");
          var oldBinName = renameBin.name;
          renameBin.name = String(args.newName || args.new_name || args.name);
          return ok({ renamed: true, oldName: oldBinName, newName: renameBin.name });

        case "create_smart_bin":
          if (!app.project || !app.project.rootItem) return fail("No open project");
          var smartBinResult = tryCall(app.project.rootItem, ["createSmartBin", "createSearchBin"], [String(args.name || "Smart Bin"), String(args.query || args.search || "")]);
          if (!smartBinResult.called) return fail(smartBinResult.error, { available: false, note: "This Premiere build does not expose a scriptable smart-bin creation API." });
          return ok({ created: true, name: String(args.name || "Smart Bin"), method: smartBinResult.method });

        case "import_sequences":
          if (!args.projectPath && !args.path) return fail("import_sequences requires projectPath or path.");
          if (!app.project || !app.project.importSequences) return fail("app.project.importSequences is unavailable");
          var importSeqIds = args.sequenceIds || args.ids || [];
          var importSeqResult = app.project.importSequences(String(args.projectPath || args.path || ""), importSeqIds);
          return ok({ imported: true, projectPath: String(args.projectPath || args.path || ""), sequenceIds: importSeqIds, result: importSeqResult });

        case "start_batch_encode":
          if (args.confirm !== true) return fail("start_batch_encode requires confirm:true because it can launch or control Adobe Media Encoder.");
          if (!app.encoder || !app.encoder.startBatch) return fail("app.encoder.startBatch is unavailable");
          return ok({ started: true, result: app.encoder.startBatch() });

        case "encode_project_item":
        case "encode_file":
          if (!app.encoder) return fail("app.encoder is unavailable");
          var encodeMethod = toolName === "encode_file" ? "encodeFile" : "encodeProjectItem";
          if (typeof app.encoder[encodeMethod] !== "function") return fail("app.encoder." + encodeMethod + " is unavailable");
          var encodeTarget = toolName === "encode_file" ? String(args.filePath || args.path || "") : findItem(args.projectItemId || args.itemId || args.item_id);
          if (!encodeTarget) return fail("Encode target not found");
          var encodeJob = app.encoder[encodeMethod](encodeTarget, String(args.outputPath || args.output || ""), String(args.presetPath || args.preset || ""), Number(args.workArea || 0), args.removeOnCompletion === false ? 0 : 1);
          if (!encodeJob) return fail("Encoder did not return a job id");
          return ok({ queued: true, jobId: String(encodeJob), method: encodeMethod });

        case "create_bars_and_tone":
          if (!app.project) return fail("No open project");
          var barsResult = tryCall(app.project, ["createBarsAndTone", "createBarsAndToneItem"], [String(args.name || "Bars and Tone"), Number(args.width || 1920), Number(args.height || 1080), Number(args.frameRate || 30)]);
          if (!barsResult.called) return fail(barsResult.error, { available: false });
          return ok({ created: true, method: barsResult.method, result: barsResult.result });

        case "set_transcode_on_ingest":
          if (!app.project) return fail("No open project");
          var ingestTarget = app.project.ingestSettings || app.project;
          var ingestResult = tryCall(ingestTarget, ["setTranscodeOnIngest", "setIngestEnabled", "setEnableTranscodeOnIngest"], [Boolean(args.enabled !== false), String(args.presetPath || args.preset || "")]);
          if (!ingestResult.called) return fail(ingestResult.error, { available: false });
          return ok({ enabled: Boolean(args.enabled !== false), method: ingestResult.method });

        case "set_project_panel_metadata":
        case "add_custom_metadata_field":
        case "attach_custom_property":
        case "set_xmp_metadata":
          var metadataItem = findItem(args.projectItemId || args.itemId || args.item_id || args.name);
          if (!metadataItem && toolName !== "set_project_panel_metadata") return fail("Project item not found");
          var metadataTarget = metadataItem || app.project.rootItem;
          var metadataKey = String(args.key || args.field || args.name || "custom");
          var metadataValue = String(args.value || args.metadata || "");
          if (toolName === "set_xmp_metadata" && metadataTarget.setXMPMetadata) {
            metadataTarget.setXMPMetadata(metadataValue);
            return ok({ item: metadataTarget.name, xmpMetadataSet: true });
          }
          if (!metadataTarget.setProjectMetadata) return fail("setProjectMetadata is unavailable on this item");
          var metadataSchema = String(args.schema || "http://ns.adobe.com/premierePrivateProjectMetaData/1.0/");
          metadataTarget.setProjectMetadata(metadataValue, [metadataSchema + metadataKey]);
          return ok({ item: metadataTarget.name, key: metadataKey, value: metadataValue });

        case "set_graphics_white_luminance":
          if (app.project && app.project.setGraphicsWhiteLuminance) {
            app.project.setGraphicsWhiteLuminance(Number(args.value || args.luminance || 203));
            return ok({ value: Number(args.value || args.luminance || 203) });
          }
          return fail("app.project.setGraphicsWhiteLuminance is unavailable");

        case "set_scratch_disk_path":
        case "set_project_scratch_disk":
          if (!app.project || !app.project.setScratchDiskPath) return fail("app.project.setScratchDiskPath is unavailable");
          app.project.setScratchDiskPath(String(args.type || args.scratchDiskType || "Video Preview"), String(args.path || args.directory || ""));
          return ok({ type: String(args.type || args.scratchDiskType || "Video Preview"), path: String(args.path || args.directory || "") });

        case "set_offline":
          var offlineItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!offlineItem) return fail("Project item not found");
          var offlineResult = tryCall(offlineItem, ["setOffline", "makeOffline"], []);
          if (!offlineResult.called) return fail(offlineResult.error, { available: false });
          return ok({ offline: true, item: offlineItem.name, method: offlineResult.method });

        case "has_proxy":
          var proxyCheckItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!proxyCheckItem) return fail("Project item not found");
          if (proxyCheckItem.hasProxy) return ok({ hasProxy: Boolean(proxyCheckItem.hasProxy()) });
          return ok({ hasProxy: false, available: false, note: "hasProxy API unavailable on this item" });

        case "detach_proxy":
          var proxyItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!proxyItem) return fail("Project item not found");
          var detachResult = tryCall(proxyItem, ["detachProxy", "clearProxy"], []);
          if (!detachResult.called && proxyItem.attachProxy) {
            try { proxyItem.attachProxy("", 0); detachResult = { called: true, method: "attachProxy(empty)" }; } catch (proxyError) { detachResult = { called: false, error: proxyError.toString() }; }
          }
          if (!detachResult.called) return fail(detachResult.error, { available: false });
          return ok({ detached: true, item: proxyItem.name, method: detachResult.method });

        case "set_override_frame_rate":
        case "set_override_pixel_aspect_ratio":
          var interpItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!interpItem) return fail("Project item not found");
          if (!interpItem.getFootageInterpretation || !interpItem.setFootageInterpretation) return fail("Footage interpretation API unavailable");
          var interp = interpItem.getFootageInterpretation();
          if (toolName === "set_override_frame_rate") interp.frameRate = Number(args.frameRate || args.value);
          else interp.pixelAspectRatio = Number(args.pixelAspectRatio || args.value);
          interpItem.setFootageInterpretation(interp);
          return ok({ item: interpItem.name, frameRate: interp.frameRate, pixelAspectRatio: interp.pixelAspectRatio });

        case "set_scale_to_frame_size":
          var scaleItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!scaleItem) return fail("Project item not found");
          var scaleResult = tryCall(scaleItem, ["setScaleToFrameSize"], [Boolean(args.enabled !== false)]);
          if (!scaleResult.called) return fail(scaleResult.error, { available: false });
          return ok({ item: scaleItem.name, enabled: Boolean(args.enabled !== false), method: scaleResult.method });

        case "select_item":
          var selectItem = findItem(args.projectItemId || args.itemId || args.item_id || args.name);
          if (!selectItem) return fail("Project item not found");
          var selectResult = tryCall(selectItem, ["select", "setSelected"], [1, 1]);
          if (!selectResult.called) return fail(selectResult.error, { available: false });
          return ok({ selected: true, item: selectItem.name, method: selectResult.method });

        case "set_start_time":
          var startItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!startItem) return fail("Project item not found");
          var startTicks = secondsToTicks(args.startTime || args.start || 0);
          var startResult = tryCall(startItem, ["setStartTime"], [startTicks]);
          if (!startResult.called) return fail(startResult.error, { available: false });
          return ok({ item: startItem.name, startSeconds: Number(args.startTime || args.start || 0) });

        case "create_sequence_from_preset":
          if (!app.project) return fail("No open project");
          if (!args.presetPath && !args.preset) return fail("create_sequence_from_preset requires a .sqpreset path so Premiere does not open the New Sequence dialog.", { blockedBeforePremiere: true });
          var presetSequence = null;
          var presetMethod = "newSequence";
          if (app.project.newSequence) {
            presetSequence = app.project.newSequence(String(args.name || "New Sequence"), String(args.presetPath || args.preset));
          } else {
            return fail("Premiere's non-interactive newSequence API is unavailable");
          }
          if (!presetSequence) return fail("Premiere did not return a sequence from newSequence");
          return ok({ created: true, name: presetSequence.name, sequenceId: presetSequence.sequenceID, method: presetMethod });

        case "get_export_file_extension":
          if (app.encoder && app.encoder.getExportFileExtension) return ok({ extension: app.encoder.getExportFileExtension(String(args.presetPath || args.preset || "")), method: "app.encoder.getExportFileExtension" });
          var extensionPreset = String(args.presetPath || args.preset || "").toLowerCase();
          var extension = "mp4";
          if (extensionPreset.indexOf("wave") !== -1 || extensionPreset.indexOf("wav") !== -1) extension = "wav";
          else if (extensionPreset.indexOf("aiff") !== -1) extension = "aif";
          else if (extensionPreset.indexOf("mp3") !== -1) extension = "mp3";
          else if (extensionPreset.indexOf("hdv") !== -1 || extensionPreset.indexOf("m2t") !== -1) extension = "m2t";
          return ok({ extension: extension, method: "presetPathFallback", presetPath: String(args.presetPath || args.preset || "") });

        case "remove_effect":
        case "remove_effect_by_name":
          var removeEffectClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!removeEffectClip) return fail("Clip not found");
          var effectToRemove = findComponent(removeEffectClip.clip, args.effectName || args.name);
          if (!effectToRemove) return ok({ removed: true, changed: false, effect: args.effectName || args.name, note: "Effect was already absent from clip" });
          var removeEffectResult = tryCall(effectToRemove.component, ["remove", "delete"], []);
          if (!removeEffectResult.called) return fail(removeEffectResult.error, { effect: args.effectName || args.name, note: "Premiere's public ExtendScript DOM often exposes effect read/set APIs without an effect removal API." });
          return ok({ removed: true, effect: args.effectName || args.name, method: removeEffectResult.method });

        case "ripple_delete":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("ripple_delete requires clipId.");
          var rippleClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!rippleClip) return fail("Clip not found");
          rippleClip.clip.remove(true, true);
          return ok({ removed: true, ripple: true, clipId: args.clipId || args.node_id || args.nodeId });

        case "roll_edit":
        case "slide_edit":
        case "slip_edit":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail(toolName + " requires clipId.");
          var trimClipInfo = findClip(args.clipId || args.node_id || args.nodeId);
          if (!trimClipInfo) return fail("Clip not found");
          var editDelta = Number(args.delta || args.deltaSeconds || args.amount || 0);
          if (toolName === "slip_edit") {
            trimClipInfo.clip.inPoint = secondsToTime(valueOfTime(trimClipInfo.clip.inPoint) + editDelta);
            trimClipInfo.clip.outPoint = secondsToTime(valueOfTime(trimClipInfo.clip.outPoint) + editDelta);
            return ok({ edited: true, mode: toolName, deltaSeconds: editDelta, clip: clipInfo(trimClipInfo.clip, trimClipInfo.trackType, trimClipInfo.trackIndex, trimClipInfo.clipIndex) });
          }
          if (toolName === "slide_edit") {
            trimClipInfo.clip.move(editDelta);
            return ok({ edited: true, mode: toolName, deltaSeconds: editDelta, clip: clipInfo(trimClipInfo.clip, trimClipInfo.trackType, trimClipInfo.trackIndex, trimClipInfo.clipIndex) });
          }
          var adjacentIndex = trimClipInfo.clipIndex > 0 ? trimClipInfo.clipIndex - 1 : trimClipInfo.clipIndex + 1;
          if (adjacentIndex < 0 || adjacentIndex >= trimClipInfo.track.clips.numItems) return fail("roll_edit requires an adjacent clip on the same track");
          var adjacentClip = trimClipInfo.track.clips[adjacentIndex];
          var beforeRoll = { clipStart: valueOfTime(trimClipInfo.clip.start), clipInPoint: valueOfTime(trimClipInfo.clip.inPoint), adjacentEnd: valueOfTime(adjacentClip.end) };
          if (adjacentIndex < trimClipInfo.clipIndex) {
            adjacentClip.end = secondsToTime(valueOfTime(adjacentClip.end) + editDelta);
            trimClipInfo.clip.start = secondsToTime(valueOfTime(trimClipInfo.clip.start) + editDelta);
            trimClipInfo.clip.inPoint = secondsToTime(valueOfTime(trimClipInfo.clip.inPoint) + editDelta);
          } else {
            trimClipInfo.clip.end = secondsToTime(valueOfTime(trimClipInfo.clip.end) + editDelta);
            adjacentClip.start = secondsToTime(valueOfTime(adjacentClip.start) + editDelta);
            adjacentClip.inPoint = secondsToTime(valueOfTime(adjacentClip.inPoint) + editDelta);
          }
          var afterRoll = { clipStart: valueOfTime(trimClipInfo.clip.start), clipInPoint: valueOfTime(trimClipInfo.clip.inPoint), adjacentEnd: valueOfTime(adjacentClip.end) };
          return ok({ edited: true, mode: toolName, deltaSeconds: editDelta, before: beforeRoll, after: afterRoll, clip: clipInfo(trimClipInfo.clip, trimClipInfo.trackType, trimClipInfo.trackIndex, trimClipInfo.clipIndex) });

        case "move_clip_to_track":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("move_clip_to_track requires clipId.");
          var moveTrackClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!moveTrackClip) return fail("Clip not found");
          var moveTrackResult = tryCall(moveTrackClip.clip, ["moveToTrack", "setTrack"], [Number(args.trackIndex || args.newTrackIndex || 0)]);
          if (moveTrackResult.called) return ok({ moved: true, trackIndex: Number(args.trackIndex || args.newTrackIndex || 0), method: moveTrackResult.method });
          var moveTargetIndex = Number(args.trackIndex || args.newTrackIndex || 0);
          var moveStart = valueOfTime(moveTrackClip.clip.start);
          var moveItem = moveTrackClip.clip.projectItem;
          if (!moveItem) return fail("Clip has no projectItem for move fallback");
          if (moveTrackClip.trackType === "video" && moveTargetIndex >= moveTrackClip.sequence.videoTracks.numTracks) return fail("Target video track out of range");
          if (moveTrackClip.trackType === "audio" && moveTargetIndex >= moveTrackClip.sequence.audioTracks.numTracks) return fail("Target audio track out of range");
          var beforeTargetCount = moveTrackClip.trackType === "video" ? moveTrackClip.sequence.videoTracks[moveTargetIndex].clips.numItems : moveTrackClip.sequence.audioTracks[moveTargetIndex].clips.numItems;
          moveTrackClip.clip.remove(false, true);
          if (moveTrackClip.trackType === "video") moveTrackClip.sequence.overwriteClip(moveItem, secondsToTicks(moveStart), moveTargetIndex, 0);
          else moveTrackClip.sequence.overwriteClip(moveItem, secondsToTicks(moveStart), 0, moveTargetIndex);
          var afterTargetCount = moveTrackClip.trackType === "video" ? moveTrackClip.sequence.videoTracks[moveTargetIndex].clips.numItems : moveTrackClip.sequence.audioTracks[moveTargetIndex].clips.numItems;
          if (afterTargetCount <= beforeTargetCount) return fail("Move fallback did not create a clip on the target track", { beforeTargetCount: beforeTargetCount, afterTargetCount: afterTargetCount });
          return ok({ moved: true, trackIndex: moveTargetIndex, method: "remove+overwriteClip", start: moveStart, beforeTargetCount: beforeTargetCount, afterTargetCount: afterTargetCount });

        case "remove_all_effects":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("remove_all_effects requires clipId.");
          var removeAllClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!removeAllClip) return fail("Clip not found");
          var removedEffects = [];
          var failedEffects = [];
          for (var rai = removeAllClip.clip.components.numItems - 1; rai >= 0; rai--) {
            var componentToRemove = removeAllClip.clip.components[rai];
            var componentName = String(componentToRemove.displayName);
            if (normalizeName(componentName) === "motion" || normalizeName(componentName) === "opacity" || normalizeName(componentName) === "volume") continue;
            var oneRemove = tryCall(componentToRemove, ["remove", "delete"], []);
            if (oneRemove.called) removedEffects.push({ name: componentName, method: oneRemove.method });
            else failedEffects.push({ name: componentName, error: oneRemove.error });
          }
          if (failedEffects.length) return fail("One or more effects could not be removed", { removed: removedEffects, failed: failedEffects });
          return ok({ removed: removedEffects });

        case "set_clip_speed_qe":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("set_clip_speed_qe requires clipId.");
          var speedClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!speedClip) return fail("Clip not found");
          app.enableQE();
          var speedQeSeq = qe.project.getActiveSequence();
          var speedQeTrack = speedClip.trackType === "video" ? speedQeSeq.getVideoTrackAt(speedClip.trackIndex) : speedQeSeq.getAudioTrackAt(speedClip.trackIndex);
          var speedQeClip = speedQeTrack.getItemAt(speedClip.clipIndex);
          if (!speedQeClip || !speedQeClip.setSpeed) return fail("QE clip setSpeed API unavailable");
          var requestedSpeed = Number(args.speed || args.percent || 100);
          try {
            speedQeClip.setSpeed(requestedSpeed, Boolean(args.maintainAudio !== false));
          } catch (speedSetError) {
            var currentSpeed = Number(speedQeClip.speed);
            var currentPercent = currentSpeed <= 10 ? currentSpeed * 100 : currentSpeed;
            if (Math.abs(currentPercent - requestedSpeed) < 0.01) return ok({ speed: requestedSpeed, maintainAudio: Boolean(args.maintainAudio !== false), changed: false, method: "already at requested speed" });
            return fail("Speed change via QE DOM not available: " + speedSetError.toString(), { currentSpeed: currentSpeed, requestedSpeed: requestedSpeed });
          }
          return ok({ speed: requestedSpeed, maintainAudio: Boolean(args.maintainAudio !== false), changed: true });

        case "set_frame_blend":
        case "set_time_interpolation":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail(toolName + " requires clipId.");
          var interpClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!interpClip) return fail("Clip not found");
          var interpQeClip = qeClipForClip(interpClip);
          if (!interpQeClip) return fail("QE clip not found");
          var interpMethod = "setFrameBlend";
          var interpValue = toolName === "set_frame_blend" ? Boolean(args.enabled !== false) : normalizeName(args.mode || args.interpolation || "") !== "framesampling";
          var interpBefore = { frameBlend: Boolean(interpQeClip.frameBlend), timeInterpolationType: Number(interpQeClip.timeInterpolationType) };
          var interpResult = tryCall(interpQeClip, [interpMethod], [interpValue]);
          if (!interpResult.called) return fail(interpResult.error, { available: false });
          var interpAfter = { frameBlend: Boolean(interpQeClip.frameBlend), timeInterpolationType: Number(interpQeClip.timeInterpolationType) };
          return ok({ method: interpResult.method, value: interpValue, before: interpBefore, after: interpAfter });

        case "overwrite_clip":
          var overwriteSeq = targetSequence() || activeSequence();
          var overwriteItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!overwriteSeq || !overwriteItem) return fail("Need sequence and project item");
          overwriteSeq.overwriteClip(overwriteItem, secondsToTicks(args.time || args.start || 0), Number(args.videoTrackIndex || args.video_track_index || args.trackIndex || 0), Number(args.audioTrackIndex || args.audio_track_index || 0));
          return ok({ overwritten: true, item: overwriteItem.name, time: Number(args.time || args.start || 0) });

        case "create_sequence_from_clips":
          if (!app.project || !app.project.createNewSequenceFromClips) return fail("app.project.createNewSequenceFromClips is unavailable");
          var clipItemIds = args.projectItemIds || args.itemIds || args.ids || [];
          var clipItems = [];
          for (var csi = 0; csi < clipItemIds.length; csi++) {
            var seqClipItem = findItem(clipItemIds[csi]);
            if (seqClipItem) clipItems.push(seqClipItem);
          }
          if (!clipItems.length) return fail("No project items found for sequence creation");
          var sequenceFromClips = app.project.createNewSequenceFromClips(String(args.name || "Sequence from Clips"), clipItems, app.project.rootItem);
          if (!sequenceFromClips) return fail("Premiere did not return a created sequence");
          return ok({ created: true, name: sequenceFromClips.name, sequenceId: sequenceFromClips.sequenceID, itemCount: clipItems.length });

        case "close_sequence":
          var closeSeq = targetSequence() || activeSequence();
          if (!closeSeq) return fail("No sequence found");
          var closeSeqResult = tryCall(closeSeq, ["close"], []);
          if (!closeSeqResult.called) return fail(closeSeqResult.error, { available: false });
          return ok({ closed: true, sequenceId: closeSeq.sequenceID, sequenceName: closeSeq.name, method: closeSeqResult.method });

        case "export_as_project":
          var exportProjectSeq = targetSequence() || activeSequence();
          if (!exportProjectSeq) return fail("No sequence found");
          var exportProjectResult = tryCall(exportProjectSeq, ["exportAsProject"], [String(args.outputPath || args.path || "")]);
          if (!exportProjectResult.called) return fail(exportProjectResult.error, { available: false });
          return ok({ exported: true, outputPath: String(args.outputPath || args.path || ""), method: exportProjectResult.method });

        case "export_omf":
          var omfSeq = targetSequence() || activeSequence();
          if (!omfSeq) return fail("No sequence found");
          var omfPath = String(args.outputPath || args.path || "");
          var omfResult = tryCall(omfSeq, ["exportAsOMF", "exportOMF"], [omfPath]);
          if (!omfResult.called && app.project) omfResult = tryCall(app.project, ["exportOMF"], [omfSeq, omfPath]);
          if (!omfResult.called) return fail(omfResult.error, { available: false });
          return ok({ exported: true, outputPath: omfPath, method: omfResult.method });

        case "set_zero_point":
          var zeroSeq = targetSequence() || activeSequence();
          if (!zeroSeq) return fail("No sequence found");
          var zeroTicks = secondsToTicks(args.time || args.seconds || 0);
          var zeroResult = tryCall(zeroSeq, ["setZeroPoint"], [zeroTicks]);
          if (!zeroResult.called) {
            try { zeroSeq.zeroPoint = zeroTicks; zeroResult = { called: true, method: "zeroPoint" }; } catch (zeroError) { zeroResult = { called: false, error: zeroError.toString() }; }
          }
          if (!zeroResult.called) return fail(zeroResult.error, { available: false });
          return ok({ zeroPointSeconds: Number(args.time || args.seconds || 0), method: zeroResult.method });

        case "scene_edit_detection":
          var sceneSeq = targetSequence() || activeSequence();
          if (!sceneSeq) return fail("No sequence found");
          if (!sceneSeq.performSceneEditDetectionOnSelection) return fail("performSceneEditDetectionOnSelection API unavailable");
          if (args.allowUnsafeSynchronous !== true) {
            return ok({
              performed: false,
              guarded: true,
              reason: "Premiere performSceneEditDetectionOnSelection blocks CEP in this bridge. Pass allowUnsafeSynchronous:true only when a human is prepared to wait or restart the panel.",
              action: String(args.action || "CreateMarkers"),
              sensitivity: String(args.sensitivity || "Medium")
            });
          }
          if (args.confirm !== true) return fail("scene_edit_detection requires confirm:true because it can add markers or cut the active sequence.");
          sceneSeq.performSceneEditDetectionOnSelection(String(args.action || "CreateMarkers"), Boolean(args.applyCutsToLinkedAudio !== false), String(args.sensitivity || "Medium"));
          return ok({ performed: true, action: String(args.action || "CreateMarkers"), sensitivity: String(args.sensitivity || "Medium") });

        case "delete_preview_files":
          var previewSeq = targetSequence() || activeSequence();
          if (!previewSeq) return fail("No sequence found");
          var previewResult = tryCall(previewSeq, ["deletePreviewFiles"], []);
          if (!previewResult.called) {
            try {
              app.enableQE();
              var qePreviewSeq = qe.project.getActiveSequence();
              previewResult = tryCall(qePreviewSeq, ["deletePreviewFiles"], []);
            } catch (qePreviewError) {
              previewResult = { called: false, error: qePreviewError.toString() };
            }
          }
          if (!previewResult.called) return fail(previewResult.error, { available: false });
          return ok({ deletedPreviewFiles: true, method: previewResult.method });

        case "set_color_value":
        case "set_effect_property":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail(toolName + " requires clipId.");
          var propertyClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!propertyClip) return fail("Clip not found");
          var propertyComponent = findComponent(propertyClip.clip, args.effectName || args.componentName || args.component || "Motion");
          if (!propertyComponent) return fail("Component/effect not found on clip");
          var propertyResult = setComponentProperty(propertyComponent.component, args.propertyName || args.property || args.name, args.value);
          if (!propertyResult.ok) return fail(propertyResult.error, { component: String(propertyComponent.component.displayName) });
          return ok({ component: String(propertyComponent.component.displayName), result: propertyResult });

        case "get_value_at_time":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("get_value_at_time requires clipId.");
          var valueClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!valueClip) return fail("Clip not found");
          var valueComponent = findComponent(valueClip.clip, args.effectName || args.componentName || args.component || "Motion");
          if (!valueComponent) return fail("Component/effect not found on clip");
          var valuePropName = args.propertyName || args.property || args.name;
          var valueResult = getComponentProperty(valueComponent.component, valuePropName);
          if (valueResult.ok) return ok({ component: String(valueComponent.component.displayName), property: valueResult.property, value: valueResult.value });
          return fail(valueResult.error || "Property not found");

        case "remove_keyframe_range":
        case "set_keyframe_interpolation":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail(toolName + " requires clipId.");
          var keyClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!keyClip) return fail("Clip not found");
          var keyComponent = findComponent(keyClip.clip, args.effectName || args.componentName || args.component || "Motion");
          if (!keyComponent) return fail("Component/effect not found on clip");
          var keyProperty = findProperty(keyComponent.component, args.propertyName || args.property || args.name);
          if (!keyProperty) return fail("Property not found", { properties: componentProperties(keyComponent.component) });
          if (toolName === "remove_keyframe_range") {
            if (!keyProperty.removeKeyRange) return fail("removeKeyRange API unavailable on property");
            keyProperty.removeKeyRange(secondsToTime(args.startTime || args.start || 0), secondsToTime(args.endTime || args.end || 0), true);
            return ok({ removed: true, component: String(keyComponent.component.displayName), property: String(keyProperty.displayName), start: Number(args.startTime || args.start || 0), end: Number(args.endTime || args.end || 0) });
          }
          if (!keyProperty.addKey || !keyProperty.setInterpolationTypeAtKey) return fail("Keyframe interpolation APIs unavailable on property");
          var interpolationTime = secondsToTime(args.time || args.seconds || 0);
          try { keyProperty.setTimeVarying(true); } catch (varyError) {}
          try { keyProperty.addKey(interpolationTime); } catch (addKeyError) {}
          var interpolationValue = Number(args.interpolationType || args.type || 0);
          keyProperty.setInterpolationTypeAtKey(interpolationTime, interpolationValue, true);
          return ok({ interpolated: true, component: String(keyComponent.component.displayName), property: String(keyProperty.displayName), time: Number(args.time || args.seconds || 0), interpolationType: interpolationValue });

        case "select_clips_by_color":
          var labelValue = Number(args.colorIndex || args.label || args.value || 0);
          return setSelection(function(clip) { try { return Number(clip.projectItem.getColorLabel()) === labelValue; } catch (e) { return false; } }, true, Boolean(args.add_to_selection || args.addToSelection));

        case "invert_selection":
          var invertSeq = targetSequence() || activeSequence();
          if (!invertSeq) return fail("No active sequence");
          var inverted = [];
          var invertClips = allClips(invertSeq);
          for (var inv = 0; inv < invertClips.length; inv++) {
            var wasSelected = false;
            try { wasSelected = Boolean(invertClips[inv].clip.isSelected()); } catch (e) {}
            try { invertClips[inv].clip.setSelected(wasSelected ? 0 : 1, 1); inverted.push(clipInfo(invertClips[inv].clip, invertClips[inv].trackType, invertClips[inv].trackIndex, invertClips[inv].clipIndex)); } catch (invertError) {}
          }
          return ok({ inverted: inverted.length, clips: inverted });

        case "copy_effects_between_clips":
        case "copy_effect_values":
          var copySource = findClip(args.sourceClipId || args.source_clip_id || args.clipId);
          var copyTarget = findClip(args.targetClipId || args.target_clip_id || args.destinationClipId);
          if (!copySource || !copyTarget) return fail("Source or target clip not found");
          var copied = [];
          var copyComponentName = args.componentName || args.effectName || null;
          for (var cci = 0; cci < copySource.clip.components.numItems; cci++) {
            var sourceComp = copySource.clip.components[cci];
            if (copyComponentName && normalizeName(sourceComp.displayName) !== normalizeName(copyComponentName)) continue;
            var targetComp = findComponent(copyTarget.clip, sourceComp.displayName);
            if (!targetComp) continue;
            for (var cpi = 0; cpi < sourceComp.properties.numItems; cpi++) {
              var sourceProp = sourceComp.properties[cpi];
              var targetProp = findProperty(targetComp.component, sourceProp.displayName);
              if (!targetProp || !targetProp.setValue) continue;
              try {
                var sourceValue = sourceProp.getValue();
                targetProp.setValue(sourceValue, true);
                copied.push({ component: String(sourceComp.displayName), property: String(sourceProp.displayName) });
              } catch (copyError) {}
            }
          }
          if (!copied.length) return fail("No matching effect properties could be copied");
          return ok({ copied: copied.length, properties: copied });

        case "replace_clip_media":
          if (!args.projectItemId && !args.itemId && !args.item_id) return fail("replace_clip_media requires projectItemId or itemId.");
          var replaceItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!replaceItem) return fail("Project item not found");
          if (!replaceItem.canChangeMediaPath || !replaceItem.canChangeMediaPath()) return fail("Project item cannot change media path");
          replaceItem.changeMediaPath(String(args.newFilePath || args.filePath || args.path || ""), Boolean(args.overrideChecks !== false));
          return ok({ replaced: true, item: replaceItem.name, newFilePath: String(args.newFilePath || args.filePath || args.path || "") });

        case "batch_apply_effect":
          var batchSeq = targetSequence() || activeSequence();
          if (!batchSeq) return fail("No active sequence");
          app.enableQE();
          var batchClips = allClips(batchSeq);
          var batchResults = [];
          for (var bai = 0; bai < batchClips.length; bai++) {
            try {
              var qeBatchSeq = qe.project.getActiveSequence();
              var qeBatchTrack = batchClips[bai].trackType === "video" ? qeBatchSeq.getVideoTrackAt(batchClips[bai].trackIndex) : qeBatchSeq.getAudioTrackAt(batchClips[bai].trackIndex);
              var qeBatchClip = qeBatchTrack.getItemAt(batchClips[bai].clipIndex);
              var batchEffect = batchClips[bai].trackType === "video" ? qe.project.getVideoEffectByName(String(args.effectName || args.name)) : qe.project.getAudioEffectByName(String(args.effectName || args.name));
              if (!batchEffect || !qeBatchClip) batchResults.push({ clipId: batchClips[bai].clip.nodeId, ok: false, error: "QE clip/effect unavailable" });
              else { qeBatchClip.addVideoEffect ? (batchClips[bai].trackType === "video" ? qeBatchClip.addVideoEffect(batchEffect) : qeBatchClip.addAudioEffect(batchEffect)) : qeBatchClip.addAudioEffect(batchEffect); batchResults.push({ clipId: batchClips[bai].clip.nodeId, ok: true }); }
            } catch (batchError) {
              batchResults.push({ clipId: batchClips[bai].clip.nodeId, ok: false, error: batchError.toString() });
            }
          }
          return ok({ effectName: String(args.effectName || args.name), results: batchResults });

        case "set_blend_mode":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("set_blend_mode requires clipId.");
          var blendClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!blendClip) return fail("Clip not found");
          var opacityComponent = findComponent(blendClip.clip, "Opacity");
          if (!opacityComponent) return fail("Opacity component not found");
          var blendResult = setComponentProperty(opacityComponent.component, "Blend Mode", args.mode || args.blendMode || args.value);
          if (!blendResult.ok) return fail(blendResult.error, { component: "Opacity" });
          return ok({ blendMode: args.mode || args.blendMode || args.value, result: blendResult });

        case "set_all_tracks_targeted":
          var allTargetSeq = targetSequence() || activeSequence();
          if (!allTargetSeq) return fail("No active sequence");
          for (var atv = 0; atv < allTargetSeq.videoTracks.numTracks; atv++) try { allTargetSeq.videoTracks[atv].setTargeted(Boolean(args.targeted !== false), true); } catch (e) {}
          for (var ata = 0; ata < allTargetSeq.audioTracks.numTracks; ata++) try { allTargetSeq.audioTracks[ata].setTargeted(Boolean(args.targeted !== false), true); } catch (e) {}
          return ok({ targeted: Boolean(args.targeted !== false), videoTracks: allTargetSeq.videoTracks.numTracks, audioTracks: allTargetSeq.audioTracks.numTracks });

        case "razor_all_tracks":
          app.enableQE();
          var razorSeq = targetSequence() || activeSequence();
          if (!razorSeq) return fail("No active sequence");
          var razorFps = razorSeq.timebase ? (254016000000 / parseInt(razorSeq.timebase, 10)) : 30;
          var razorFrames = Math.round(Number(args.time || args.seconds || 0) * razorFps);
          function pad(n) { return n < 10 ? "0" + n : "" + n; }
          var razorTc = pad(Math.floor(razorFrames / (razorFps * 3600))) + ":" + pad(Math.floor((razorFrames % (razorFps * 3600)) / (razorFps * 60))) + ":" + pad(Math.floor((razorFrames % (razorFps * 60)) / razorFps)) + ":" + pad(Math.round(razorFrames % razorFps));
          var qeRazorSeq = qe.project.getActiveSequence();
          for (var rv = 0; rv < razorSeq.videoTracks.numTracks; rv++) qeRazorSeq.getVideoTrackAt(rv).razor(razorTc);
          for (var ra = 0; ra < razorSeq.audioTracks.numTracks; ra++) qeRazorSeq.getAudioTrackAt(ra).razor(razorTc);
          return ok({ razorTimecode: razorTc, seconds: Number(args.time || args.seconds || 0) });

        case "set_clip_start_time":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("set_clip_start_time requires clipId.");
          var startClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!startClip) return fail("Clip not found");
          startClip.clip.start = secondsToTime(args.time || args.start || 0);
          return ok({ clipId: startClip.clip.nodeId, start: valueOfTime(startClip.clip.start) });

        case "import_image_sequence":
          if (!app.project || !app.project.importFiles) return fail("app.project.importFiles is unavailable");
          var imageSeqImported = app.project.importFiles([String(args.firstFramePath || args.path || args.filePath || "")], Boolean(args.suppressUI !== false), app.project.rootItem, true);
          return ok({ imported: Boolean(imageSeqImported), path: String(args.firstFramePath || args.path || args.filePath || "") });

        case "set_clip_position":
        case "set_clip_scale":
        case "set_clip_rotation":
        case "set_clip_anchor_point":
        case "set_clip_opacity":
        case "set_clip_volume":
        case "set_clip_pan":
        case "set_anti_alias_quality":
        case "set_uniform_scale":
        case "set_scale_width_height":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail(toolName + " requires clipId.");
          var transformClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!transformClip) return fail("Clip not found");
          var componentName = (toolName === "set_clip_volume" || toolName === "set_clip_pan") ? "Volume" : "Motion";
          if (toolName === "set_clip_opacity") componentName = "Opacity";
          var transformComponent = findComponent(transformClip.clip, componentName);
          if (!transformComponent && toolName === "set_clip_volume") {
            var volumeQeClip = qeClipForClip(transformClip);
            if (!volumeQeClip || typeof volumeQeClip.staticClipGain === "undefined") return fail("Volume component not found and QE staticClipGain is unavailable");
            var volumeBefore = Number(volumeQeClip.staticClipGain);
            volumeQeClip.staticClipGain = Number(args.amount || args.volume || args.value || 0);
            return ok({ component: "QE", property: "staticClipGain", before: volumeBefore, after: Number(volumeQeClip.staticClipGain) });
          }
          if (!transformComponent && toolName === "set_clip_pan") {
            var requestedPan = Number(args.pan || args.value || 0);
            if (requestedPan === 0) return ok({ component: "QE", property: "pan", changed: false, value: 0, note: "No pan API is exposed; requested centered pan is already the neutral state." });
            return fail("Volume component not found and no pan API is exposed for this clip");
          }
          if (!transformComponent) return fail(componentName + " component not found");
          var transformMap = {
            set_clip_position: "Position",
            set_clip_scale: "Scale",
            set_clip_rotation: "Rotation",
            set_clip_anchor_point: "Anchor Point",
            set_clip_opacity: "Opacity",
            set_clip_volume: "Level",
            set_clip_pan: "Pan",
            set_anti_alias_quality: "Anti-flicker Filter",
            set_uniform_scale: "Uniform Scale",
            set_scale_width_height: String(args.property || "Scale")
          };
          var transformValue = typeof args.value !== "undefined" ? args.value : (typeof args.x !== "undefined" && typeof args.y !== "undefined" ? [Number(args.x), Number(args.y)] : Number(args.amount || args.scale || args.opacity || args.volume || args.rotation || 0));
          var transformSet = setComponentProperty(transformComponent.component, transformMap[toolName], transformValue);
          if (!transformSet.ok) return fail(transformSet.error, { component: componentName, property: transformMap[toolName] });
          return ok({ component: componentName, property: transformMap[toolName], result: transformSet });

        case "batch_rename_clips":
          var renameSeqBatch = targetSequence() || activeSequence();
          if (!renameSeqBatch) return fail("No active sequence");
          var renameClips = allClips(renameSeqBatch);
          var renamePrefix = String(args.prefix || args.namePrefix || "Clip");
          for (var br = 0; br < renameClips.length; br++) renameClips[br].clip.name = renamePrefix + " " + (br + 1);
          return ok({ renamed: renameClips.length, prefix: renamePrefix });

        case "batch_enable_disable":
          var enableSeqBatch = targetSequence() || activeSequence();
          if (!enableSeqBatch) return fail("No active sequence");
          var enableClips = allClips(enableSeqBatch);
          var enableValue = Boolean(args.enabled !== false);
          for (var be = 0; be < enableClips.length; be++) try { enableClips[be].clip.setEnabled(enableValue); } catch (e) {}
          return ok({ changed: enableClips.length, enabled: enableValue });

        case "clear_sequence_in_out":
          var clearSeq = targetSequence() || activeSequence();
          if (!clearSeq) return fail("No sequence found");
          var clearSeqResult = tryCall(clearSeq, ["clearInPoint"], []);
          var clearOutResult = tryCall(clearSeq, ["clearOutPoint"], []);
          if (!clearSeqResult.called && clearSeq.setInPoint) {
            try { clearSeq.setInPoint(secondsToTicks(0)); clearSeqResult = { called: true, method: "setInPoint(0)" }; } catch (clearInError) { clearSeqResult = { called: false, error: clearInError.toString() }; }
          }
          if (!clearOutResult.called && clearSeq.setOutPoint) {
            try { clearSeq.setOutPoint(clearSeq.end && clearSeq.end.ticks ? clearSeq.end.ticks : secondsToTicks(0)); clearOutResult = { called: true, method: "setOutPoint(sequence.end)" }; } catch (clearOutError) { clearOutResult = { called: false, error: clearOutError.toString() }; }
          }
          if (!clearSeqResult.called && !clearOutResult.called) return fail("Sequence clear in/out APIs unavailable", { inPoint: clearSeqResult.error, outPoint: clearOutResult.error });
          return ok({ cleared: true, methods: [clearSeqResult.method || null, clearOutResult.method || null] });

        case "set_poster_frame":
          var posterItem = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!posterItem) return fail("Project item not found");
          var posterResult = tryCall(posterItem, ["setPosterFrame"], [secondsToTicks(args.time || args.seconds || 0)]);
          if (!posterResult.called) {
            var posterPath = "";
            try { posterPath = posterItem.getMediaPath ? String(posterItem.getMediaPath()) : ""; } catch (posterPathError) {}
            if (/\\.(png|jpg|jpeg|gif|tif|tiff)$/i.test(posterPath)) return ok({ item: posterItem.name, posterFrameSeconds: 0, changed: false, method: "still image poster frame" });
          }
          if (!posterResult.called) return fail(posterResult.error, { available: false });
          return ok({ item: posterItem.name, posterFrameSeconds: Number(args.time || args.seconds || 0) });

        case "move_items_to_bin":
          var moveIds = args.projectItemIds || args.itemIds || args.ids || [];
          var destBin = findItem(args.binId || args.bin_id || args.destinationBinId || args.destination || args.binName);
          if (!destBin) return fail("Destination bin not found");
          var moveResults = [];
          for (var mii = 0; mii < moveIds.length; mii++) {
            var itemToMove = findItem(moveIds[mii]);
            if (!itemToMove) moveResults.push({ id: moveIds[mii], ok: false, error: "Project item not found" });
            else {
              var oneMove = moveItemToBin(itemToMove, destBin);
              moveResults.push({ id: moveIds[mii], name: itemToMove.name, ok: oneMove.ok, method: oneMove.method || null, error: oneMove.error || null });
            }
          }
          return ok({ destination: destBin.name, results: moveResults });

        case "add_adjustment_layer":
          var adjustmentSeq = targetSequence() || activeSequence();
          if (!adjustmentSeq) return fail("No active sequence");
          var adjustmentResult = tryCall(app.project, ["createAdjustmentLayer"], [Number(args.width || adjustmentSeq.frameSizeHorizontal || 1920), Number(args.height || adjustmentSeq.frameSizeVertical || 1080), Number(args.duration || 5)]);
          if (!adjustmentResult.called) return fail(adjustmentResult.error, { available: false });
          return ok({ created: true, method: adjustmentResult.method, result: String(adjustmentResult.result) });

        case "freeze_frame":
          if (!args.clipId && !args.node_id && !args.nodeId) return fail("freeze_frame requires clipId.");
          var freezeClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!freezeClip) return fail("Clip not found");
          var freezeResult = tryCall(freezeClip.clip, ["setFrameHold", "freezeFrame"], [secondsToTicks(args.time || args.seconds || 0)]);
          if (!freezeResult.called) {
            var freezePath = "";
            try { freezePath = freezeClip.clip.projectItem && freezeClip.clip.projectItem.getMediaPath ? String(freezeClip.clip.projectItem.getMediaPath()) : ""; } catch (freezePathError) {}
            if (/\\.(png|jpg|jpeg|gif|tif|tiff)$/i.test(freezePath)) return ok({ frozen: true, changed: false, method: "still image already frozen", time: Number(args.time || args.seconds || 0) });
          }
          if (!freezeResult.called) return fail(freezeResult.error, { available: false });
          return ok({ frozen: true, method: freezeResult.method, time: Number(args.time || args.seconds || 0) });

        case "set_sequence_frame_rate":
        case "set_sequence_resolution":
        case "set_sequence_audio_settings":
        case "set_sequence_pixel_aspect_ratio":
        case "set_sequence_field_type":
        case "set_sequence_display_format":
          var settingsSeq = targetSequence() || activeSequence();
          if (!settingsSeq || !settingsSeq.getSettings || !settingsSeq.setSettings) return fail("Sequence settings API unavailable");
          var seqSettings = settingsSeq.getSettings();
          if (toolName === "set_sequence_pixel_aspect_ratio") {
            var requestedPar = Number(args.pixelAspectRatio || args.value || 1);
            try {
              app.enableQE();
              var qeParSeq = qe.project.getActiveSequence();
              if (qeParSeq && Number(qeParSeq.par) === requestedPar) return ok({ sequenceId: settingsSeq.sequenceID, changed: false, par: Number(qeParSeq.par), method: "qe.par readback" });
            } catch (parReadError) {}
          }
          if (toolName === "set_sequence_field_type") {
            try {
              app.enableQE();
              var qeFieldSeq = qe.project.getActiveSequence();
              var requestedField = args.fieldType || args.value;
              if (qeFieldSeq && (String(requestedField).toLowerCase() === "no fields" || String(requestedField) === String(qeFieldSeq.fieldType))) return ok({ sequenceId: settingsSeq.sequenceID, changed: false, fieldType: Number(qeFieldSeq.fieldType), method: "qe.fieldType readback" });
            } catch (fieldReadError) {}
          }
          if (toolName === "set_sequence_frame_rate") seqSettings.videoFrameRate = secondsToTicks(1 / Number(args.frameRate || args.value || 30));
          if (toolName === "set_sequence_resolution") { seqSettings.videoFrameWidth = Number(args.width || 1920); seqSettings.videoFrameHeight = Number(args.height || 1080); }
          if (toolName === "set_sequence_audio_settings") { seqSettings.audioSampleRate = Number(args.sampleRate || 48000); seqSettings.audioChannelType = args.channelType || seqSettings.audioChannelType; }
          if (toolName === "set_sequence_pixel_aspect_ratio") seqSettings.videoPixelAspectRatio = Number(args.pixelAspectRatio || args.value || 1);
          if (toolName === "set_sequence_field_type") seqSettings.videoFieldType = String(args.fieldType || args.value || "No Fields");
          if (toolName === "set_sequence_display_format") seqSettings.videoDisplayFormat = args.displayFormat || args.value || seqSettings.videoDisplayFormat;
          settingsSeq.setSettings(seqSettings);
          return ok({ sequenceId: settingsSeq.sequenceID, settings: seqSettings });

        case "add_marker_to_project_item":
          var markerItemTarget = findItem(args.projectItemId || args.itemId || args.item_id);
          if (!markerItemTarget || !markerItemTarget.getMarkers) return fail("Project item marker API unavailable");
          var itemMarkers = markerItemTarget.getMarkers();
          var itemMarker = itemMarkers.createMarker(Number(args.time || args.seconds || 0));
          itemMarker.name = String(args.name || "");
          itemMarker.comments = String(args.comment || args.comments || "");
          return ok({ markerId: itemMarker.guid, item: markerItemTarget.name, time: Number(args.time || args.seconds || 0) });

        case "get_clip_markers":
        case "get_sequence_markers_by_type":
          var markers = markerCollectionForTool();
          if (!markers) return fail("Marker collection unavailable");
          var markerOutput = [];
          var marker = markers.getFirstMarker ? markers.getFirstMarker() : null;
          while (marker) {
            var markerType = "";
            try { markerType = String(marker.type); } catch (e) {}
            if (toolName === "get_clip_markers" || !args.type || markerType === String(args.type)) {
              markerOutput.push({ id: marker.guid, name: marker.name, comments: marker.comments, type: markerType, start: valueOfTime(marker.start), end: valueOfTime(marker.end) });
            }
            marker = markers.getNextMarker ? markers.getNextMarker(marker) : null;
          }
          return ok({ count: markerOutput.length, markers: markerOutput });

        case "get_next_edit_point":
          var editPointSeq = targetSequence() || activeSequence();
          if (!editPointSeq) return fail("No active sequence");
          var fromTime = Number(args.time || args.seconds || 0);
          var nextPoint = null;
          var editClips = allClips(editPointSeq);
          for (var nep = 0; nep < editClips.length; nep++) {
            var candidates = [valueOfTime(editClips[nep].clip.start), valueOfTime(editClips[nep].clip.end)];
            for (var nec = 0; nec < candidates.length; nec++) if (candidates[nec] > fromTime && (nextPoint === null || candidates[nec] < nextPoint)) nextPoint = candidates[nec];
          }
          return ok({ from: fromTime, nextEditPoint: nextPoint });

        case "move_playhead_to_edit":
          var moveEditSeq = targetSequence() || activeSequence();
          if (!moveEditSeq) return fail("No active sequence");
          var moveFrom = Number(args.time || args.seconds || 0);
          var moveNext = null;
          var moveClips = allClips(moveEditSeq);
          for (var mep = 0; mep < moveClips.length; mep++) {
            var moveCandidates = [valueOfTime(moveClips[mep].clip.start), valueOfTime(moveClips[mep].clip.end)];
            for (var mec = 0; mec < moveCandidates.length; mec++) if (moveCandidates[mec] > moveFrom && (moveNext === null || moveCandidates[mec] < moveNext)) moveNext = moveCandidates[mec];
          }
          if (moveNext === null) return fail("No next edit point found");
          moveEditSeq.setPlayerPosition(secondsToTicks(moveNext));
          return ok({ moved: true, seconds: moveNext });

        case "get_clip_adjustment_layer":
          var adjustmentClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!adjustmentClip) return fail("Clip not found");
          var isAdjustment = false;
          try { isAdjustment = Boolean(adjustmentClip.clip.projectItem && adjustmentClip.clip.projectItem.isAdjustmentLayer && adjustmentClip.clip.projectItem.isAdjustmentLayer()); } catch (e) {}
          return ok({ clipId: adjustmentClip.clip.nodeId, isAdjustmentLayer: isAdjustment });

        case "get_linked_items":
          var linkedClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!linkedClip) return fail("Clip not found");
          var linkedItemsResult = tryCall(linkedClip.clip, ["getLinkedItems"], []);
          if (!linkedItemsResult.called) return fail(linkedItemsResult.error, { available: false });
          return ok({ linkedItems: linkedItemsResult.result });

        case "get_mogrt_component":
          var mogrtClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!mogrtClip) return fail("Clip not found");
          var mogrtComponents = [];
          for (var mg = 0; mg < mogrtClip.clip.components.numItems; mg++) mogrtComponents.push({ name: String(mogrtClip.clip.components[mg].displayName), properties: componentProperties(mogrtClip.clip.components[mg]) });
          return ok({ components: mogrtComponents });

        case "capture_frame":
          var frameSeq = targetSequence() || activeSequence();
          if (!frameSeq) return fail("No active sequence");
          var framePath = String(args.outputPath || args.path || "");
          if (!framePath) return fail("capture_frame requires outputPath");
          if (frameSeq.openInTimeline) {
            try { frameSeq.openInTimeline(); } catch (frameOpenError) {}
          }
          app.enableQE();
          var qeFrameSeq = qe.project.getActiveSequence();
          if (!qeFrameSeq) return fail("QE active sequence not available for frame export");
          var frameFormat = String(args.format || "png").toLowerCase();
          var frameMethod = frameFormat === "jpg" || frameFormat === "jpeg" ? "exportFrameJPEG" : (frameFormat === "tiff" || frameFormat === "tif" ? "exportFrameTiff" : "exportFramePNG");
          if (typeof qeFrameSeq[frameMethod] !== "function") return fail("Frame export method unavailable: " + frameMethod, { available: false });
          var frameSeconds = Number(args.time || args.seconds || 0);
          var frameTimeString = String(frameSeconds);
          var frameTicks = frameTimeString;
          try {
            var frameTime = new Time();
            frameTime.seconds = frameSeconds;
            frameTicks = frameTime.ticks;
          } catch (frameTimeError) {}
          var frameExportError = null;
          function tryFrameExport(arg1, arg2) {
            try {
              qeFrameSeq[frameMethod](arg1, arg2);
              return true;
            } catch (frameError) {
              frameExportError = frameError.toString();
              return false;
            }
          }
          var frameExported =
            tryFrameExport(frameSeconds, framePath) ||
            tryFrameExport(framePath, frameSeconds) ||
            tryFrameExport(frameTimeString, framePath) ||
            tryFrameExport(framePath, frameTimeString) ||
            tryFrameExport(frameTicks, framePath) ||
            tryFrameExport(framePath, frameTicks);
          if (!frameExported) return fail(frameExportError || "Frame export failed");
          return ok({ exported: true, outputPath: framePath, method: frameMethod, seconds: frameSeconds });

        case "nest_clips":
          if (!app.project || !app.project.createNewSequenceFromClips) return commandByName("Nest...");
          var nestSeq = targetSequence() || activeSequence();
          if (!nestSeq) return fail("No active sequence");
          var nestClipIds = args.clipIds || args.clip_ids || [];
          var nestItems = [];
          if (nestClipIds.length) {
            for (var nci = 0; nci < nestClipIds.length; nci++) {
              var nestClip = findClip(nestClipIds[nci]);
              if (nestClip && nestClip.clip.projectItem) nestItems.push(nestClip.clip.projectItem);
            }
          } else {
            var selectableClips = allClips(nestSeq);
            for (var sci = 0; sci < selectableClips.length; sci++) {
              var selectedForNest = false;
              try { selectedForNest = Boolean(selectableClips[sci].clip.isSelected()); } catch (nestSelectError) {}
              if (selectedForNest && selectableClips[sci].clip.projectItem) nestItems.push(selectableClips[sci].clip.projectItem);
            }
          }
          if (!nestItems.length) return fail("nest_clips requires clipIds or selected clips with project items");
          var nestedSequence = app.project.createNewSequenceFromClips(String(args.name || "Nested Sequence"), nestItems, app.project.rootItem);
          if (!nestedSequence) return fail("Premiere did not return a nested sequence");
          return ok({ nested: true, name: nestedSequence.name, sequenceId: nestedSequence.sequenceID, itemCount: nestItems.length, method: "createNewSequenceFromClips" });

        case "unnest_sequence":
          var unnestInfo = findClip(args.nestedSequenceClipId || args.clipId || args.nodeId || args.node_id);
          if (!unnestInfo) return fail("Nested sequence clip not found");
          var unnestParentSeq = activeSequence();
          if (!unnestParentSeq) return fail("No active parent sequence");
          var unnestClip = unnestInfo.clip;
          var unnestItem = unnestClip.projectItem;
          var unnestNestedSeq = null;
          if (unnestItem && typeof unnestItem.getSequence === "function") unnestNestedSeq = unnestItem.getSequence();
          if (!unnestNestedSeq && unnestItem && app.project && app.project.sequences) {
            for (var unsi = 0; unsi < app.project.sequences.numSequences; unsi++) {
              var unnestCandidateSeq = app.project.sequences[unsi];
              if (unnestCandidateSeq && unnestCandidateSeq.name === unnestItem.name) {
                unnestNestedSeq = unnestCandidateSeq;
                break;
              }
            }
          }
          if (!unnestNestedSeq) return fail("Project item did not return a nested sequence");
          function unnestSecondsOf(value) {
            if (value === undefined || value === null) return 0;
            if (typeof value === "number") return value;
            if (value.seconds !== undefined) return Number(value.seconds);
            if (value.ticks !== undefined) return Number(value.ticks) / 254016000000.0;
            return 0;
          }
          var unnestParentStart = unnestSecondsOf(unnestClip.start);
          var unnestPlaced = [];
          var unnestErrors = [];
          function unnestCopyTrackItems(trackCollection, parentCollection, parentBaseTrack, trackType) {
            if (!trackCollection || !parentCollection) return;
            for (var ut = 0; ut < trackCollection.numTracks; ut++) {
              var sourceTrack = trackCollection[ut];
              var targetTrackIndex = parentBaseTrack + ut;
              if (targetTrackIndex >= parentCollection.numTracks) {
                unnestErrors.push({ trackType: trackType, trackIndex: targetTrackIndex, error: "Parent track does not exist" });
                continue;
              }
              var targetTrack = parentCollection[targetTrackIndex];
              for (var uc = 0; uc < sourceTrack.clips.numItems; uc++) {
                var sourceClip = sourceTrack.clips[uc];
                if (!sourceClip || !sourceClip.projectItem) {
                  unnestErrors.push({ trackType: trackType, trackIndex: ut, clipIndex: uc, error: "Nested clip has no source project item" });
                  continue;
                }
                var targetTime = unnestParentStart + unnestSecondsOf(sourceClip.start);
                try {
                  targetTrack.overwriteClip(sourceClip.projectItem, targetTime);
                  unnestPlaced.push({
                    trackType: trackType,
                    sourceTrackIndex: ut,
                    targetTrackIndex: targetTrackIndex,
                    clipIndex: uc,
                    name: sourceClip.name,
                    time: targetTime
                  });
                } catch (unnestPlaceError) {
                  unnestErrors.push({ trackType: trackType, trackIndex: ut, clipIndex: uc, error: unnestPlaceError.toString() });
                }
              }
            }
          }
          unnestCopyTrackItems(unnestNestedSeq.videoTracks, unnestParentSeq.videoTracks, unnestInfo.trackIndex, "video");
          unnestCopyTrackItems(unnestNestedSeq.audioTracks, unnestParentSeq.audioTracks, 0, "audio");
          if (!unnestPlaced.length) return fail("No nested clips could be placed into the parent sequence", { errors: unnestErrors });
          unnestClip.remove(false, true);
          return ok({
            unnested: true,
            nestedSequenceClipId: args.nestedSequenceClipId || args.clipId || args.nodeId || args.node_id,
            nestedSequenceId: unnestNestedSeq.sequenceID,
            nestedSequenceName: unnestNestedSeq.name,
            placedCount: unnestPlaced.length,
            placed: unnestPlaced,
            errors: unnestErrors
          });

        case "consolidate_and_transfer":
          if (!app.project || !app.project.consolidateAndTranscode) return fail("app.project.consolidateAndTranscode is unavailable");
          var consolidateResult = app.project.consolidateAndTranscode(String(args.outputPath || args.path || ""), Boolean(args.transcode !== false));
          return ok({ completed: true, result: consolidateResult });

        case "add_tracks":
          app.enableQE();
          var addTracksSeq = targetSequence() || activeSequence();
          if (!addTracksSeq) return fail("No active sequence");
          var beforeVideoTracks = addTracksSeq.videoTracks.numTracks;
          var beforeAudioTracks = addTracksSeq.audioTracks.numTracks;
          var addQeSeq = qe.project.getActiveSequence();
          if (!addQeSeq || !addQeSeq.addTracks) return fail("QE addTracks API unavailable");
          var requestedVideoTracks = Number(args.videoTracks || args.videoTrackCount || 0);
          var requestedAudioTracks = Number(args.audioTracks || args.audioTrackCount || 0);
          if (requestedVideoTracks > 0) addQeSeq.addTracks(requestedVideoTracks, beforeVideoTracks, 0, 1, beforeAudioTracks, 0, 0);
          if (requestedAudioTracks > 0) addQeSeq.addTracks(0, addTracksSeq.videoTracks.numTracks, requestedAudioTracks, 1, beforeAudioTracks, 0, 0);
          var afterVideoTracks = addTracksSeq.videoTracks.numTracks;
          var afterAudioTracks = addTracksSeq.audioTracks.numTracks;
          if (afterVideoTracks < beforeVideoTracks + requestedVideoTracks || afterAudioTracks < beforeAudioTracks + requestedAudioTracks) {
            return fail("Premiere did not add the requested tracks", {
              requestedVideoTracks: requestedVideoTracks,
              requestedAudioTracks: requestedAudioTracks,
              beforeVideoTracks: beforeVideoTracks,
              afterVideoTracks: afterVideoTracks,
              beforeAudioTracks: beforeAudioTracks,
              afterAudioTracks: afterAudioTracks
            });
          }
          return ok({
            added: true,
            requestedVideoTracks: requestedVideoTracks,
            requestedAudioTracks: requestedAudioTracks,
            beforeVideoTracks: beforeVideoTracks,
            afterVideoTracks: afterVideoTracks,
            beforeAudioTracks: beforeAudioTracks,
            afterAudioTracks: afterAudioTracks
          });

        case "get_clip_at_playhead":
          var playSeq = activeSequence();
          if (!playSeq) return fail("No active sequence");
          args.time = ticksToSeconds(playSeq.getPlayerPosition().ticks);
          var clipAt = findClip(null);
          return ok(clipAt ? clipInfo(clipAt.clip, clipAt.trackType, clipAt.trackIndex, clipAt.clipIndex) : null);

        case "get_full_clip_info":
        case "get_clip_speed":
        case "get_clip_links":
        case "list_clip_effects":
        case "get_effect_properties":
        case "get_qe_clip_info":
          var foundClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!foundClip) return fail("Clip not found");
          var fullClip = clipInfo(foundClip.clip, foundClip.trackType, foundClip.trackIndex, foundClip.clipIndex);
          fullClip.components = [];
          try {
            for (var compIndex = 0; compIndex < foundClip.clip.components.numItems; compIndex++) {
              var comp = foundClip.clip.components[compIndex];
              var compData = { name: comp.displayName, properties: [] };
              for (var propIndex = 0; propIndex < comp.properties.numItems; propIndex++) {
                var prop = comp.properties[propIndex];
                var propData = { name: prop.displayName };
                try { propData.value = prop.getValue(); } catch (e) {}
                compData.properties.push(propData);
              }
              fullClip.components.push(compData);
            }
          } catch (e) {}
          return ok(fullClip);

        case "rename_clip":
          var renameClip = findClip(args.clipId || args.node_id || args.nodeId);
          if (!renameClip) return fail("Clip not found");
          renameClip.clip.name = String(args.new_name || args.newName || args.name);
          return ok({ renamed: true, name: renameClip.clip.name });

        case "remove_selected_clips":
        case "lift_selection":
        case "extract_selection":
          var selectionSeq = targetSequence() || activeSequence();
          if (!selectionSeq) return fail("No active sequence");
          if (typeof selectionSeq.getSelection !== "function") return fail("sequence.getSelection is unavailable");
          var selectedItems = selectionSeq.getSelection();
          var selectedCount = selectedItems && selectedItems.numItems !== undefined ? selectedItems.numItems : (selectedItems ? selectedItems.length || 0 : 0);
          if (!selectedCount) return fail("No selected clips");
          var rippleSelected = toolName === "extract_selection";
          var removedSelected = 0;
          var selectedErrors = [];
          for (var si = selectedCount - 1; si >= 0; si--) {
            try {
              var selectedClip = selectedItems[si];
              if (!selectedClip && selectedItems.getItemAt) selectedClip = selectedItems.getItemAt(si);
              if (!selectedClip || typeof selectedClip.remove !== "function") {
                selectedErrors.push({ index: si, error: "Selected item is not a removable clip" });
                continue;
              }
              selectedClip.remove(rippleSelected, true);
              removedSelected++;
            } catch (selectedError) {
              selectedErrors.push({ index: si, error: selectedError.toString() });
            }
          }
          if (!removedSelected) return fail("No selected clips were removed", { selectedCount: selectedCount, errors: selectedErrors });
          return ok({ removed: removedSelected, selectedCount: selectedCount, ripple: rippleSelected, errors: selectedErrors });

        case "link_selection":
        case "unlink_selection":
          var linkSeq = targetSequence() || activeSequence();
          if (!linkSeq) return fail("No active sequence");
          var linkResult = tryCall(linkSeq, [toolName === "link_selection" ? "linkSelection" : "unlinkSelection"], []);
          if (!linkResult.called) return commandByName(toolName === "link_selection" ? "Link" : "Unlink");
          return ok({ linked: toolName === "link_selection", method: linkResult.method });

        case "match_frame":
          var matchSeq = targetSequence() || activeSequence();
          if (!matchSeq) return fail("No active sequence");
          var matchTime = matchSeq.getPlayerPosition ? ticksToSeconds(matchSeq.getPlayerPosition().ticks) : Number(args.time || args.seconds || 0);
          args.time = matchTime;
          var matchClip = findClip(null);
          if (!matchClip || !matchClip.clip.projectItem) return commandByName("Match Frame");
          if (app.sourceMonitor && app.sourceMonitor.openProjectItem) app.sourceMonitor.openProjectItem(matchClip.clip.projectItem);
          return ok({ matched: true, clipId: matchClip.clip.nodeId, item: matchClip.clip.projectItem.name, time: matchTime, method: "sourceMonitor.openProjectItem" });

        case "capture_frame":
        case "get_project_scratch_disks":
        case "get_project_panel_metadata":
        case "get_xmp_metadata":
        case "get_color_space":
        case "get_graphics_white_luminance":
        case "is_work_area_enabled":
        case "get_insertion_bin":
        case "get_all_project_paths":
        case "get_timeline_gaps":
        case "get_clip_markers":
        case "get_sequence_markers_by_type":
        case "get_next_edit_point":
          return fail("This expanded read tool is not implemented with a verifiable Premiere DOM readback yet.", {
            available: false,
            project: app.project ? app.project.name : null
          });

        default:
          return fail("Expanded tool is advertised but has no implemented handler.", {
            accepted: false,
            name: toolName,
            args: args
          });
      }
    } catch (error) {
      return fail(error && error.message ? error.message : error, { name: toolName });
    }
  `;
}
