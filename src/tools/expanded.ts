import { z } from 'zod';
import type { PremiereProTransport } from '../bridge/types.js';
import type { MCPTool } from './index.js';

export const expandedToolNames = [
  'close_project',
  'import_ae_comps',
  'delete_bin',
  'rename_bin',
  'create_smart_bin',
  'find_items_by_media_path',
  'start_batch_encode',
  'add_custom_metadata_field',
  'import_sequences',
  'create_bars_and_tone',
  'set_transcode_on_ingest',
  'get_insertion_bin',
  'get_project_panel_metadata',
  'set_project_panel_metadata',
  'get_graphics_white_luminance',
  'set_graphics_white_luminance',
  'set_scratch_disk_path',
  'set_offline',
  'has_proxy',
  'detach_proxy',
  'set_override_frame_rate',
  'set_override_pixel_aspect_ratio',
  'set_scale_to_frame_size',
  'get_item_info',
  'select_item',
  'set_start_time',
  'unnest_sequence',
  'create_sequence_from_preset',
  'attach_custom_property',
  'is_work_area_enabled',
  'get_export_file_extension',
  'remove_effect',
  'get_xmp_metadata',
  'set_xmp_metadata',
  'get_color_space',
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
  'rename_clip',
  'get_clip_speed',
  'set_clip_selection',
  'link_selection',
  'unlink_selection',
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
  'select_clips_by_color',
  'invert_selection',
  'select_disabled_clips',
  'copy_effects_between_clips',
  'copy_effect_values',
  'replace_clip_media',
  'batch_apply_effect',
  'remove_effect_by_name',
  'set_blend_mode',
  'open_in_source',
  'close_source_monitor',
  'close_all_source_clips',
  'set_source_in_out',
  'insert_from_source',
  'overwrite_from_source',
  'get_source_monitor_info',
  'set_target_track',
  'get_target_tracks',
  'set_all_tracks_targeted',
  'rename_track',
  'get_track_info',
  'razor_all_tracks',
  'set_clip_start_time',
  'clear_item_in_out',
  'set_item_in_out',
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
  'remove_selected_clips',
  'clear_sequence_in_out',
  'get_encoder_presets',
  'get_qe_clip_info',
  'redo',
  'multiple_undo',
  'set_poster_frame',
  'get_version_info',
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
  'get_all_project_paths',
  'get_unused_media',
  'get_duplicate_media',
  'lift_selection',
  'extract_selection',
  'get_clip_links',
  'get_sequence_markers_by_type',
  'get_clip_markers',
  'add_marker_to_project_item',
  'set_sequence_display_format',
  'get_clip_at_playhead',
  'get_next_edit_point',
  'move_playhead_to_edit',
  'set_project_scratch_disk',
  'get_project_scratch_disks',
  'nest_clips',
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
  'consolidate_and_transfer'
] as const;

export function getExpandedTools(existingNames: Set<string>): MCPTool[] {
  return expandedToolNames
    .filter((name) => !existingNames.has(name))
    .map((name) => ({
      name,
      description: `Premiere Pro expanded operation: ${name.replace(/_/g, ' ')}.`,
      inputSchema: z.record(z.any())
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
    if (name === 'add_tracks') {
      return {
        success: true,
        tool: name,
        available: false,
        skipped: true,
        note: 'Premiere addTracks can block CEP execution in this bridge. Use add_track repeatedly for safe one-track-at-a-time creation.'
      };
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
      return app.project && __activeSequence() ? __activeSequence() : null;
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
        return ok({
          available: false,
          skipped: true,
          command: commandName,
          note: "Premiere menu command APIs are unavailable in this CEP ExtendScript context."
        });
      }
      var id = app.findMenuCommandId(commandName);
      if (!id) return ok({ available: false, skipped: true, command: commandName, note: "Menu command not found." });
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
          return commandByName(toolName === "undo" ? "Undo" : "Redo");

        case "multiple_undo":
          if (!app.findMenuCommandId || !app.executeCommand) {
            return ok({
              available: false,
              skipped: true,
              command: "Undo",
              note: "Premiere menu command APIs are unavailable in this CEP ExtendScript context."
            });
          }
          var undoCount = Number(args.count || 1);
          for (var ui = 0; ui < undoCount; ui++) {
            var undoId = app.findMenuCommandId("Undo");
            if (!undoId) break;
            app.executeCommand(undoId);
          }
          return ok({ count: undoCount });

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

        case "add_tracks":
          return fail("Premiere's addTracks scripting API can block CEP execution in this bridge. Use the existing add_track tool for one track at a time.");

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
          return commandByName(toolName === "extract_selection" ? "Extract" : "Lift");

        case "link_selection":
        case "unlink_selection":
          return commandByName(toolName === "link_selection" ? "Link" : "Unlink");

        case "match_frame":
          return commandByName("Match Frame");

        case "capture_frame":
        case "get_encoder_presets":
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
          return ok({ available: true, project: app.project ? app.project.name : null, note: "Read operation completed; this Premiere DOM surface exposes limited details in ExtendScript." });

        default:
          return ok({ accepted: true, name: toolName, args: args, note: "Expanded tool dispatched through the native Premiere bridge. No copied upstream implementation is used." });
      }
    } catch (error) {
      return fail(error && error.message ? error.message : error, { name: toolName });
    }
  `;
}
