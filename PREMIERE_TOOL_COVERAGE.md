# Premiere MCP Tool Coverage

Generated from the local Adobe Premiere Pro MCP repo/runtime inventory.

## Current summary

- Runtime MCP tools exposed: **131**
- Source catalog tools: **131**
- Runtime/source mismatch: **none**
- Current implementation path: **Node MCP server → `/tmp/premiere-mcp-bridge` → CEP panel → Premiere ExtendScript/QE DOM**
- Validation note: this document inventories implemented/exposed tools. A full live sweep should be run in a scratch Premiere project because `scripts/live-tool-sweep.mjs` mutates the active project.

## Status key

- **BUILT / exposed** — visible through MCP introspection and backed by an implementation.
- **CONDITIONAL** — exposed and implemented, but success depends on Premiere API availability, project/media state, external files, or Adobe app integrations.
- **LIMITED / intentional failure** — exposed but currently returns truthful guidance/failure instead of pretending unsupported behavior works.
- **HIDDEN / not exposed** — code path exists internally but is not in the public MCP tool catalog.
- **FUTURE** — desired tool not currently exposed/built.

## Current exposed tools by category

### Discovery Tools (NEW) (10)

- `test_connection` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Fast bridge smoke test that checks Premiere app, active project, CEP panel, temp dir, and round-trip latency. Implementation: `testConnection`; API hints: app.version, app.project.
- `bridge_health_report` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge and local filesystem checks. Description: Single JSON health report covering MCP server, CEP panel status, temp bridge files, Premiere version, active project, and last command errors. Implementation: `bridgeHealthReport`; API hints: app.version, app.project.
- `live_tool_sweep_safe` — **BUILT / exposed**. Implemented as an MCP tool that creates/opens a disposable scratch project and runs a smoke-only validation path. Description: Scratch-project-only validation command for safe bridge/tool smoke testing; requires explicit scratchProjectDir and rejects report path escapes/symlinks. Implementation: `liveToolSweepSafe`; API hints: bridge/helper-specific.
- `list_project_items` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all media items, bins, and assets in the current Premiere Pro project. Use this to discover available media before performing operations. Implementation: `listProjectItems`; API hints: app.project.
- `list_sequences` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all sequences in the current Premiere Pro project with their IDs, names, and basic properties. Implementation: `listSequences`; API hints: app.project, videoTracks, audioTracks.
- `list_sequence_tracks` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all video and audio tracks in a specific sequence with their properties and clips. Implementation: `listSequenceTracks`; API hints: app.project, videoTracks, audioTracks.
- `get_project_info` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets comprehensive information about the current project including name, path, settings, and status. Implementation: `getProjectInfo`; API hints: app.project.
- `build_motion_graphics_demo` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Generates clean demo stills, creates a sequence, lays the shots out on the timeline, adds dissolves, and applies subtle scale animation for a polished minimalist ad-style demo. Implementation: `buildMotionGraphicsDemo`; API hints: bridge/helper-specific.
- `assemble_product_spot` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Builds a production-oriented promo timeline from real media assets. Supports either template defaults or an explicit clipPlan for LLM-directed pacing, transitions, motion, trims, and per-clip effects. Implementation: `assembleProductSpot`; API hints: bridge/helper-specific.
- `build_brand_spot_from_mogrt_and_assets` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Builds a branded ad assembly from real media assets, supports optional MOGRT overlay, and allows explicit clipPlan control. Default polish is optional so creative direction can come from LLM planning instead of hardcoded passes. Implementation: `buildBrandSpotFromMogrtAndAssets`; API hints: bridge/helper-specific.

### Project Management (4)

- `create_project` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Creates a new Adobe Premiere Pro project. Use this when the user wants to start a new video editing project from scratch. Implementation: `createProject`; API hints: bridge/helper-specific.
- `open_project` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Opens an existing Adobe Premiere Pro project from a specified file path. Implementation: `openProject`; API hints: bridge/helper-specific.
- `save_project` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Saves the currently active Adobe Premiere Pro project. Implementation: `saveProject`; API hints: bridge/helper-specific.
- `save_project_as` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Saves the current project with a new name and location. Implementation: `saveProjectAs`; API hints: app.project.

### Media Management (5)

- `import_media` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Imports a media file (video, audio, image) into the current Premiere Pro project. Implementation: `importMedia`; API hints: importFiles.
- `import_fcp_xml` — **CONDITIONAL / XML validity**. Depends on valid FCP7 XML and available source media paths. Description: Imports a Final Cut Pro 7 XML (XMEML) file into the current project. Premiere creates a new sequence with the cuts/clips defined in the XML, atomically. Use for importing pre-built timelines from external tools (NOT for FCPXML 1.x modern format from Final Cut Pro X — only legacy FCP7 XML is supported by app.openFCPXML). Implementation: `importFcpXml`; API hints: app.project, importFiles.
- `import_edl` — **CONDITIONAL / may prompt**. Premiere EDL import can prompt for sequence settings/source media. Description: Imports a CMX 3600 EDL file into the current project. Premiere prompts for sequence settings and source media, then creates a new sequence with all cuts applied atomically. Use for atomic timeline import from cut-list-based pipelines. Note: the resulting sequence inherits its timebase/video standard from the project defaults or from the interactive sequence-settings dialog Premiere shows on import — `app.importEDL` does not accept a video-standard argument. Implementation: `importEdl`; API hints: app.project, importFiles.
- `import_folder` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Imports all media files from a folder into the current Premiere Pro project. Implementation: `importFolder`; API hints: app.project, importFiles.
- `create_bin` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Creates a new bin (folder) in the project panel to organize media. Implementation: `createBin`; API hints: app.project.

### Sequence Management (3)

- `create_sequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Creates a new sequence in the project. A sequence is a timeline where you edit clips. Implementation: `createSequence`; API hints: bridge/helper-specific.
- `duplicate_sequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Creates a copy of an existing sequence with a new name. Implementation: `duplicateSequence`; API hints: app.project.
- `delete_sequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Deletes a sequence from the project. Implementation: `deleteSequence`; API hints: app.project.

### Timeline Operations (6)

- `add_to_timeline` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a media clip from the project panel to a sequence timeline at a specific track and time. Implementation: `addToTimeline`; API hints: bridge/helper-specific.
- `remove_from_timeline` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Removes a clip from the timeline. Pass sequenceId when the clip ID came from list_sequence_tracks for a non-active sequence. Implementation: `removeFromTimeline`; API hints: bridge/helper-specific.
- `move_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Moves a clip to a different position on the timeline. Implementation: `moveClip`; API hints: bridge/helper-specific.
- `trim_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adjusts the in and out points of a clip on the timeline, effectively shortening it. Implementation: `trimClip`; API hints: bridge/helper-specific.
- `split_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Splits a clip at a specific time point, creating two separate clips. Implementation: `splitClip`; API hints: app.project, app.enableQE, qe.project.
- `razor_timeline_at_time` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Cuts across multiple tracks in a sequence at an absolute timeline time. If no track arrays are provided, all video and audio tracks are cut. Implementation: `razorTimelineAtTime`; API hints: app.project, app.enableQE, qe.project, videoTracks, audioTracks.

### Effects and Transitions (12)

- `apply_effect` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Applies a visual or audio effect to a specific clip on the timeline. Implementation: `applyEffect`; API hints: app.enableQE, qe.project, components.
- `list_clip_effects` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists components/effects applied to a timeline clip, including component match names and best-effort property values. Pass sequenceId when the clip ID came from a non-active sequence. Implementation: `listClipEffects`; API hints: app.project, components.
- `set_effect_parameter` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets an existing clip component/effect property by component and property name, matchName, or index. Use `list_clip_effects` first to discover selectors. Implementation: `setEffectParameter`; API hints: app.project, components, setValue.
- `set_clip_opacity` — **BUILT / exposed**. Implemented as a dedicated helper over the same reviewed effect-parameter setter. Description: Sets a timeline clip opacity percentage (0-100) via the built-in Opacity component. Pass sequenceId for clips outside the active sequence. Implementation: `setClipOpacity`; API hints: app.project, components, setValue.
- `set_clip_blend_mode` — **BUILT / exposed**. Implemented as a dedicated helper over the same reviewed effect-parameter setter. Description: Sets a timeline clip Opacity > Blend Mode numeric value; use `list_clip_effects` first because Premiere exposes duplicate Blend Mode properties. Defaults to component property index 1, verified live against Premiere Pro 2026. Implementation: `setClipBlendMode`; API hints: app.project, components, setValue.
- `set_clip_scale` — **BUILT / exposed**. Implemented as a dedicated helper over the same reviewed effect-parameter setter. Description: Sets a timeline clip Motion > Scale percentage. Pass sequenceId for clips outside the active sequence. Implementation: `setClipScale`; API hints: app.project, components, setValue.
- `set_clip_position` — **BUILT / exposed**. Implemented as a dedicated helper over the same reviewed effect-parameter setter. Description: Sets a timeline clip Motion > Position using X/Y values. Premiere may expose these as normalized coordinates; use `list_clip_effects` first to inspect current values. Pass sequenceId for clips outside the active sequence. Implementation: `setClipPosition`; API hints: app.project, components, setValue.
- `batch_set_clip_properties` — **BUILT / exposed**. Implements batch clip property updates in one bridge roundtrip. Description: Sets opacity, Opacity > Blend Mode, Motion scale/scale width/uniform scale/position/rotation/anchor point/anti-flicker/crop, and optional positive QE speed percent with preflight checks before component mutation. Use `reverse_clip` for reverse playback until reverse-speed behavior is live-verified. Implementation: `batchSetClipProperties`; API hints: app.project, components, setValue, app.enableQE, qe.project.
- `set_clip_speed_settings` — **BUILT / exposed with conditional QE speed**. Implements verified source timing controls and explicit speed-attempt reporting. Description: Sets source in/out/duration through real Premiere `Time.seconds` objects and optionally attempts positive QE speed percent while returning a truthful success/error object when Premiere rejects the QE call. Invalid source ranges are rejected before mutation; reverse playback should use `reverse_clip` until reverse-speed behavior is live-verified. Live smoke on Premiere Pro 2026 verified source timing changes/restores and observed QE speed rejection as `Illegal Parameter type` without mutating clip speed. Implementation: `setClipSpeedSettings`; API hints: app.project, Time, app.enableQE, qe.project.
- `set_clip_time_remap_settings` — **CONDITIONAL / honest unsupported on current host**. Exposed as a guarded Time Remapping > Speed helper. Description: attempts static Time Remapping speed values/keyframes only after discovering a real Time Remapping component/property on the clip; if Premiere does not expose that property, returns `supported:false` with component/QE diagnostics and performs no mutation. Live smoke on Premiere Pro 2026 scratch clip found only Opacity and Motion components, so the tool returned `supported:false` instead of pretending time-remap mutation worked. Implementation: `setClipTimeRemapSettings`; API hints: app.project, components, setValue, setTimeVarying, addKey, setValueAtKey, app.enableQE, qe.project.
- `add_transition` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a transition (e.g., cross dissolve) between two adjacent clips on the timeline. Implementation: `addTransition`; API hints: app.project, app.enableQE, qe.project.
- `add_transition_to_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a transition to the beginning or end of a single clip. Implementation: `addTransitionToClip`; API hints: app.project, app.enableQE, qe.project.

### Audio Operations (4)

- `adjust_audio_levels` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adjusts the volume (gain) of an audio clip on the timeline. Implementation: `adjustAudioLevels`; API hints: components.
- `add_audio_keyframes` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds keyframes to audio levels for dynamic volume changes. Implementation: `addAudioKeyframes`; API hints: components.
- `setup_ducking` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: High-level wrapper around add_audio_keyframes that builds a ducking curve from a base level + ducking windows. Computes 4 keyframes per window (pre-fade, duck-in, duck-out, post-fade) plus boundary keyframes at clip start/end. Replaces the manual "8 keyframes per video" pattern from Sprint 3. Times are clip-source-time absolute (same convention as add_audio_keyframes). Implementation: `setupDucking`; API hints: components.
- `mute_track` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Mutes or unmutes an entire audio track. Implementation: `muteTrack`; API hints: audioTracks.

### Text and Graphics (1)

- `add_text_overlay` — **CONDITIONAL / MOGRT required**. Works by importing/editing a .mogrt; not native title creation from scratch. Description: Adds a text layer (title) over the video timeline. Requires a MOGRT (.mogrt) template file path. Supports up to 4 text fields (text, text2, text3, text4) — each populates the Nth "AE.ADBE Text" component in the MOGRT (e.g., for Basic Lower Third: text=main title, text2=subtitle). Implementation: `addTextOverlay`; API hints: app.project, components, importMGT.

### Color Correction (2)

- `color_correct` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Applies basic color correction adjustments to a video clip. Implementation: `colorCorrect`; API hints: app.enableQE, qe.project, components.
- `apply_lut` — **CONDITIONAL / Lumetri/effect path**. Applies LUT through available color/effect controls; depends on LUT path and effect/property availability. Description: Applies a Look-Up Table (LUT) to a clip for color grading. Implementation: `applyLut`; API hints: app.enableQE, qe.project, components.

### Export and Rendering (2)

- `export_sequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Renders and exports a sequence to a video file. This is for creating the final video. Implementation: `exportSequence`; API hints: app.encoder.
- `export_frame` — **CONDITIONAL / QE API**. Implemented through QE frame-export methods; availability can vary by Premiere/API format support. Description: Exports a single frame from a sequence as an image file. Implementation: `exportFrame`; API hints: app.enableQE, qe.project.

### Markers (4)

- `add_marker` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a marker to the timeline for navigation or notes. Implementation: `addMarker`; API hints: app.project, markers.
- `delete_marker` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Deletes a marker from the timeline. Implementation: `deleteMarker`; API hints: app.project, markers.
- `update_marker` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Updates an existing marker's properties. Implementation: `updateMarker`; API hints: app.project, markers.
- `list_markers` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all markers in a sequence. Implementation: `listMarkers`; API hints: app.project, markers.

### Track Management (7)

- `add_track` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a new video or audio track to the sequence. Implementation: `addTrack`; API hints: app.project, app.enableQE, qe.project, videoTracks, audioTracks.
- `delete_track` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Deletes a track from the sequence. Implementation: `deleteTrack`; API hints: app.project, videoTracks, audioTracks.
- `lock_track` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Locks or unlocks a track to prevent/allow editing. Implementation: `lockTrack`; API hints: app.project, videoTracks, audioTracks.
- `toggle_track_visibility` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Shows or hides a video track. Implementation: `toggleTrackVisibility`; API hints: app.project, videoTracks.
- `link_audio_video` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Links or unlinks audio and video components of a clip. Implementation: `linkAudioVideo`; API hints: app.project.
- `apply_audio_effect` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Applies an audio effect to a clip. Implementation: `applyAudioEffect`; API hints: bridge/helper-specific.
- `apply_audio_effect_to_all_clips` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Bulk: applies a single audio effect to ALL audio clips of a sequence in one ExtendScript call. Returns per-clip results. Saves N MCP roundtrips when calibrating or applying same chain. Implementation: `applyAudioEffectToAllClips`; API hints: app.project, app.enableQE, qe.project, audioTracks, components.

### Additional Clip Operations (4)

- `duplicate_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Duplicates a clip on the timeline. Implementation: `duplicateClip`; API hints: bridge/helper-specific.
- `reverse_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Reverses the playback of a clip. Implementation: `reverseClip`; API hints: bridge/helper-specific.
- `enable_disable_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Enables or disables a clip on the timeline. Implementation: `enableDisableClip`; API hints: bridge/helper-specific.
- `replace_clip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Replaces a clip on the timeline with another media item. Implementation: `replaceClip`; API hints: bridge/helper-specific.

### Project Settings (4)

- `get_sequence_settings` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the settings for a sequence (resolution, framerate, etc.). Implementation: `getSequenceSettings`; API hints: bridge/helper-specific.
- `set_sequence_settings` — **LIMITED / intentional failure**. Premiere does not allow changing most sequence settings after creation through this path; create a new sequence instead. Description: Updates sequence settings. Implementation: `setSequenceSettings`; API hints: bridge/helper-specific.
- `get_clip_properties` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets detailed properties of a clip. Pass sequenceId when the clip ID came from list_sequence_tracks for a non-active sequence. Implementation: `getClipProperties`; API hints: bridge/helper-specific.
- `set_clip_properties` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets properties of a clip. Implementation: `setClipProperties`; API hints: components.

### Render Queue (2)

- `add_to_render_queue` — **CONDITIONAL / export wrapper**. Delegates to export_sequence; not a full Adobe Media Encoder queue manager. Description: Adds a sequence to the Adobe Media Encoder render queue. Implementation: `addToRenderQueue`; API hints: bridge/helper-specific.
- `get_render_queue_status` — **LIMITED / AME dependency**. Exposed, but returns guidance/failure unless Adobe Media Encoder queue telemetry is integrated. Description: Reports whether render queue monitoring is available. This currently returns guidance for Adobe Media Encoder rather than live queue telemetry. Implementation: `getRenderQueueStatus`; API hints: bridge/helper-specific.

### Advanced Features (2)

- `stabilize_clip` — **CONDITIONAL / effect availability**. Applies Warp Stabilizer via QE; depends on effect availability and clip/sequence context. Description: Applies video stabilization to reduce camera shake. Implementation: `stabilizeClip`; API hints: app.enableQE, qe.project, components.
- `speed_change` — **CONDITIONAL / legacy QE path**. Exposed, but live probing on Premiere Pro 2026 returned `Illegal Parameter type` for the legacy QE speed call. Prefer `set_clip_speed_settings` for verified source timing controls and explicit speed-attempt reporting. Description: Changes the playback speed of a clip. Implementation: `speedChange`; API hints: app.enableQE, qe.project.

### Playhead & Work Area (3)

- `get_playhead_position` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the current playhead (CTI) position in the specified sequence. Implementation: `getPlayheadPosition`; API hints: bridge/helper-specific.
- `set_playhead_position` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets the playhead (CTI) position in the specified sequence. Implementation: `setPlayheadPosition`; API hints: setPlayerPosition.
- `get_selected_clips` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets all currently selected clips in the specified sequence. Implementation: `getSelectedClips`; API hints: bridge/helper-specific.

### Effect & Transition Discovery (4)

- `list_available_effects` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all available video effects in Premiere Pro. Implementation: `listAvailableEffects`; API hints: app.enableQE, qe.project.
- `list_available_transitions` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all available video transitions in Premiere Pro. Implementation: `listAvailableTransitions`; API hints: app.enableQE, qe.project.
- `list_available_audio_effects` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all available audio effects in Premiere Pro. Implementation: `listAvailableAudioEffects`; API hints: app.enableQE, qe.project.
- `list_available_audio_transitions` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Lists all available audio transitions in Premiere Pro. Implementation: `listAvailableAudioTransitions`; API hints: app.enableQE, qe.project.

### Keyframes (3)

- `add_keyframe` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a keyframe to a clip component parameter at a specific time. Implementation: `addKeyframe`; API hints: components.
- `remove_keyframe` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Removes a keyframe from a clip component parameter at a specific time. Implementation: `removeKeyframe`; API hints: components.
- `get_keyframes` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets all keyframes for a clip component parameter. Implementation: `getKeyframes`; API hints: components.

### Work Area (2)

- `set_work_area` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets the work area in/out points for a sequence. Implementation: `setWorkArea`; API hints: bridge/helper-specific.
- `get_work_area` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the work area in/out points for a sequence. Implementation: `getWorkArea`; API hints: bridge/helper-specific.

### Batch Operations (1)

- `batch_add_transitions` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Adds a transition to all clip boundaries on a track. Useful for quickly adding cross dissolves or other transitions between every clip. Implementation: `batchAddTransitions`; API hints: app.enableQE, qe.project, videoTracks.

### Project Item Discovery & Management (2)

- `find_project_item_by_name` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Searches for project items by name. Useful for finding media files, sequences, or bins. Implementation: `findProjectItemByName`; API hints: app.project.
- `move_item_to_bin` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Moves a project item into a different bin (folder). Implementation: `moveItemToBin`; API hints: bridge/helper-specific.
- `rename_project_item` — **BUILT / exposed**. Renames a project item (sequence, bin, clip) by setting its name. Use this when duplicate_sequence does not propagate the new name to the project panel. Implementation: `renameProjectItem`; API hints: bridge/helper-specific.

### Active Sequence Management (2)

- `set_active_sequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets the active sequence in the project. Implementation: `setActiveSequence`; API hints: app.project.
- `get_active_sequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets information about the currently active sequence. Implementation: `getActiveSequence`; API hints: app.project, videoTracks, audioTracks.

### Clip Lookup (1)

- `get_clip_at_position` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the clip at a specific time position on a track. Implementation: `getClipAtPosition`; API hints: videoTracks, audioTracks.

### Auto Reframe (1)

- `auto_reframe_sequence` — **CONDITIONAL / Premiere API**. Depends on Premiere exposing auto-reframe APIs for the sequence/version. Description: Automatically reframes a sequence to a new aspect ratio using AI-powered motion tracking. Implementation: `autoReframeSequence`; API hints: autoReframeSequence.

### Scene Edit Detection (1)

- `detect_scene_edits` — **CONDITIONAL / Premiere API**. Depends on Premiere exposing scene edit detection APIs and selected/valid sequence context. Description: Detects scene changes in selected clips and optionally adds cuts or markers. Implementation: `detectSceneEdits`; API hints: performSceneEditDetection.

### Captions and native transcript workflow (10)

- `create_caption_track` — **CONDITIONAL / native caption import**. Creates a Premiere caption track from an already-imported caption/subtitle project item. The bridge script safely embeds identifiers and maps only the public native format keys `subtitle`, `cea-608`, `cea-708`, and `teletext` to `Sequence.CAPTION_FORMAT_*` constants/numeric fallbacks. Practical success still depends on Premiere accepting the caption project item. Implementation: `createCaptionTrack`; API hints: `Sequence.createCaptionTrack`.
- `read_sequence_captions` — **CONDITIONAL / readable native caption tracks only**. Reads real native caption track collections when Premiere exposes `sequence.getCaptionTracks()` or `sequence.captionTracks`; reports `supported:false` only when no readable caption-track API is exposed, and reports `supported:true` with zero captions when an exposed collection is empty. It never fabricates captions from ordinary video clip names. Implementation: `readSequenceCaptions`; API hints: `sequence.getCaptionTracks`, `sequence.captionTracks`.
- `probe_native_transcription_capabilities` — **BUILT / read-only diagnostic**. Inspects app/project/sequence surfaces for diagnostic native Adobe transcript/caption/speech-analysis indicators and does not trigger the Premiere Speech to Text UI. Implementation: `probeNativeTranscriptionCapabilities`; API hints: introspection only.
- `generate_sequence_transcript` — **UNSUPPORTED / honest native diagnostic**. Does not invoke speculative or private transcription methods. It returns `supported:false` with diagnostics because Premiere's Transcribe Sequence UI is not publicly scriptable through the live-verified MCP/ExtendScript surface. Implementation: `generateSequenceTranscript`; API hints: diagnostic introspection only.
- `generate_captions_from_premiere_transcript` — **UNSUPPORTED / honest native diagnostic**. Does not invoke speculative or private caption-generation methods. It returns `supported:false` with diagnostics and does not fake caption generation. Implementation: `generateCaptionsFromPremiereTranscript`; API hints: diagnostic introspection only.
- `format_captions` — **BUILT / sidecar workflow**. Formats inline, sidecar, or readable sequence captions with wrapping/line limits and optional adjacent-cue merge. Can write `srt`, `vtt`, `json`, or `csv` outputs with overwrite protection. Implementation: `formatCaptions`; API hints: local sidecar utilities.
- `qc_captions` — **BUILT / sidecar workflow**. Runs deterministic caption QC for timing, overlaps, reading speed, line length/count, empty text, banned terms, and sequence bounds. Can write a JSON report with overwrite protection. Implementation: `qcCaptionsTool`; API hints: local sidecar utilities.
- `search_captions` — **BUILT / sidecar workflow**. Searches inline, sidecar, or readable sequence captions with literal/regex matching and context cues; can write a JSON report with overwrite protection. Implementation: `searchCaptionsTool`; API hints: local sidecar utilities.
- `export_captions` — **BUILT / sidecar workflow**. Exports inline, sidecar, or readable sequence captions as `srt`, `vtt`, `json`, or `csv`; refuses unsupported formats and existing output files unless `overwrite=true`. Implementation: `exportCaptions`; API hints: local sidecar utilities plus `readSequenceCaptions` when sequence source is requested.
- `import_captions_to_sequence` — **CONDITIONAL / native import plus create track**. Accepts or serializes SRT/VTT captions, imports the sidecar into Premiere, calls `createCaptionTrack`, and requests readback verification when supported. JSON/CSV remain local sidecar interchange formats for export/QC/search; they are not passed to Premiere native caption import. Implementation: `importCaptionsToSequence`; API hints: `app.project.importFiles`, `Sequence.createCaptionTrack`.

### Subclip (1)

- `create_subclip` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Creates a subclip from a project item with specified in/out points. Implementation: `createSubclip`; API hints: createSubClip.

### Media Management - Relink & Metadata (20)

- `relink_media` — **CONDITIONAL / item capability**. Works only when Premiere reports item.canChangeMediaPath() for the project item. Description: Relinks an offline or moved media file to a new file path. Implementation: `relinkMedia`; API hints: changeMediaPath.
- `set_color_label` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets the color label on a project item. Implementation: `setColorLabel`; API hints: bridge/helper-specific.
- `get_color_label` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the color label index of a project item. Implementation: `getColorLabel`; API hints: bridge/helper-specific.
- `get_metadata` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets project metadata and XMP metadata for a project item. Implementation: `getMetadata`; API hints: bridge/helper-specific.
- `set_metadata` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets a project metadata value on a project item. Implementation: `setMetadata`; API hints: bridge/helper-specific.
- `get_footage_interpretation` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the footage interpretation settings (frame rate, pixel aspect ratio, field type, etc.) for a project item. Implementation: `getFootageInterpretation`; API hints: bridge/helper-specific.
- `set_footage_interpretation` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets footage interpretation settings (frame rate, pixel aspect ratio) for a project item. Implementation: `setFootageInterpretation`; API hints: bridge/helper-specific.
- `check_offline_media` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Checks all project items and returns a list of any that are offline (missing media). Implementation: `checkOfflineMedia`; API hints: app.project.
- `export_as_fcp_xml` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Exports a sequence as Final Cut Pro XML. Implementation: `exportAsFcpXml`; API hints: exportAsFinalCutProXML.
- `undo` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Performs an undo operation in Premiere Pro. Implementation: `undo`; API hints: app.enableQE, qe.project.
- `set_sequence_in_out_points` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Sets the in and/or out points on a sequence timeline. Implementation: `setSequenceInOutPoints`; API hints: setInPoint, setOutPoint.
- `get_sequence_in_out_points` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Gets the in and out points of a sequence timeline. Implementation: `getSequenceInOutPoints`; API hints: bridge/helper-specific.
- `export_aaf` — **CONDITIONAL / interchange API**. Uses Premiere AAF export; practical success depends on sequence/media/export settings. Description: Exports a sequence as an AAF file for interchange with other editing/audio applications. Implementation: `exportAaf`; API hints: app.project.
- `consolidate_duplicates` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Consolidates duplicate media items in the project. Implementation: `consolidateDuplicates`; API hints: app.project.
- `refresh_media` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Refreshes the media for a project item, reloading it from disk. Implementation: `refreshMedia`; API hints: bridge/helper-specific.
- `import_sequences_from_project` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Imports sequences from another Premiere Pro project file. Implementation: `importSequencesFromProject`; API hints: app.project.
- `create_subsequence` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Creates a subsequence from the in/out points of a sequence. Implementation: `createSubsequence`; API hints: bridge/helper-specific.
- `import_mogrt` — **BUILT / exposed**. Implemented as an MCP tool backed by the CEP/ExtendScript bridge. Description: Imports a Motion Graphics Template (.mogrt) file into a sequence. Implementation: `importMogrt`; API hints: importMGT.
- `import_mogrt_from_library` — **CONDITIONAL / Creative Cloud Library**. Requires the named Creative Cloud Library and MOGRT to be available to Premiere. Description: Imports a Motion Graphics Template from a Creative Cloud Library. Implementation: `importMogrtFromLibrary`; API hints: importMGT, importMGTFromLibrary.
- `manage_proxies` — **CONDITIONAL / proxy API**. Proxy operations depend on proxy file availability and Premiere project item support. Description: Checks proxy status, attaches a proxy file, or gets the proxy path for a project item. Implementation: `manageProxies`; API hints: attachProxy.

## Internal code paths that are not exposed as MCP tools

- `create_nested_sequence` — **HIDDEN / not exposed**. Internal stub returns implementation-pending; nesting requires selection/nesting APIs not implemented here.
- `remove_effect` — **HIDDEN / not exposed**. Internal method exists but returns failure because ExtendScript does not support reliable effect removal. Intentionally not public.
- `unnest_sequence` — **HIDDEN / not exposed**. Internal stub returns unsupported because Premiere scripting does not expose a clean unnest operation.

## Future tools / backlog we likely want

### Timeline and clip convenience

- `list_track_clips` — **FUTURE**. Dedicated per-track clip listing; friendlier than parsing list_sequence_tracks for a single track.
- `get_clip_info` — **FUTURE**. Alias/expanded version of get_clip_properties with project item, media path, effects, labels, markers, and linked audio details.
- `remove_clip` — **FUTURE**. Alias for remove_from_timeline for compatibility with UXP/PR33 naming.

- `ripple_delete_gap` — **FUTURE**. Remove a gap and ripple later timeline content.
- `close_gap_between_clips` — **FUTURE**. Find and close gaps on a track or all tracks.
- `select_clips_by_range` — **FUTURE**. Select clips by time range/track/type so manual and automated operations can combine.

### Nested sequence and multicam

- `create_nested_sequence` — **FUTURE**. Real nest selected clips/range into a sequence if a reliable API/UI automation path is found.
- `unnest_sequence` — **FUTURE**. Best-effort unnest or paste-contents workflow if feasible.
- `create_multicam_source_sequence` — **FUTURE**. Create multicam source sequence from clips using audio/timecode/in-points.
- `switch_multicam_angle` — **FUTURE**. Switch multicam angle over a time range.
- `flatten_multicam` — **FUTURE**. Flatten multicam edits to source clips.

### Effects and color

- `remove_effect` — **FUTURE**. Reliable effect removal if a UXP/native API or UI automation path is found.
- `disable_effect` — **FUTURE**. Toggle effect enabled state if exposed.
- `reorder_effects` — **FUTURE**. Move effect order in stack if supported.
- `apply_lumetri_preset` — **FUTURE**. Dedicated Lumetri preset/application helper.
- `set_lumetri_basic_correction` — **FUTURE**. Exposure/contrast/highlights/shadows/temperature/tint/vibrance/saturation controls.
- `set_lumetri_curves_or_hsl` — **FUTURE**. Deeper Lumetri curves/HSL secondary support where scriptable.
- `shot_match_color` — **FUTURE**. Analyze reference and target clips and apply approximate matching.

### Text, graphics, and templates

- `create_native_text_layer` — **FUTURE**. Create a Premiere-native text/title layer without requiring MOGRT, if UXP or another API exposes it.
- `list_mogrt_properties` — **FUTURE**. Probe a MOGRT and return editable fields before placement.
- `set_mogrt_property` — **FUTURE**. Update arbitrary MOGRT property by display name/index after import.
- `render_external_graphic_overlay` — **FUTURE**. Generate PNG/ProRes overlay externally and place it when native text is insufficient.
- `apply_template` — **FUTURE**. Apply a reusable edit template/clip plan/style preset to assets.
- `analyze_look` — **FUTURE**. Inspect an existing sequence and summarize pacing, transitions, effects, typography, and color treatment.

### Audio and transcription

- `analyze_audio_loudness` — **FUTURE**. Measure LUFS/peaks using external tools and write report/markers.
- `normalize_loudness` — **FUTURE**. Apply gain/keyframes to hit target LUFS when feasible.
- `essential_sound_tag` — **FUTURE**. Set Essential Sound classifications if scriptable.
- `transcribe_sequence_audio` — **FUTURE**. Generate transcript via Whisper/Adobe/external STT and import captions/markers.
- `text_based_edit` — **FUTURE**. Find transcript phrases and cut/select/marker corresponding timeline ranges.
- `remove_silence` — **FUTURE**. Detect silence and create cuts/markers or ripple-delete ranges.

### Captions and subtitles

- `generate_captions_from_transcript` — **FUTURE**. Create captions from transcript/SRT/VTT with styling options.
- `export_captions` — **FUTURE**. Export sequence captions as SRT/VTT/CSV/JSON.
- `style_captions` — **FUTURE**. Set caption font, size, position, colors if scriptable.
- `search_captions` — **FUTURE**. Find phrases in caption clips and return timecodes.

### Export, render, and delivery

- `ame_queue_status` — **FUTURE**. Real Adobe Media Encoder queue status/progress.
- `ame_cancel_job` — **FUTURE**. Cancel queued/running AME job.
- `ame_pause_resume` — **FUTURE**. Pause/resume AME queue.
- `export_preset_catalog` — **FUTURE**. List available export presets and validate preset paths.
- `qc_export_with_ffprobe` — **FUTURE**. Run ffprobe/mediainfo QC after export and return duration, codec, dimensions, audio layout, bitrate.
- `package_deliverable` — **FUTURE**. Export, QC, checksum, thumbnail/contact sheet, and package deliverables.
- `upload_delivery_link` — **FUTURE**. Upload final deliverable to Google Drive and return share link.

### Project hygiene and collaboration

- `cleanup_sequences` — **FUTURE**. Delete or archive temporary/test sequences by pattern/date.
- `dedupe_bins` — **FUTURE**. Find duplicate bins/items and consolidate safely.
- `collect_project_media` — **FUTURE**. Collect/copy used media to a delivery/conform folder.
- `generate_project_report` — **FUTURE**. Markdown/JSON report of project, sequences, media, offline items, proxies, markers, exports.
- `team_project_status` — **FUTURE**. Team Projects/Productions status if API access exists.
- `production_open_project` — **FUTURE**. Productions-aware project open/add/remove helpers if scriptable.

### Interchange and conform

- `import_otio` — **FUTURE**. Import OpenTimelineIO via conversion to XML/EDL then Premiere import.
- `export_otio` — **FUTURE**. Export sequence to OTIO via FCP XML conversion.
- `reconform_from_edl_xml` — **FUTURE**. Compare existing sequence to EDL/XML and relink/replace/flag mismatches.
- `marker_import_export_csv` — **FUTURE**. Round-trip markers through CSV/JSON for producer notes.
- `apply_review_notes` — **FUTURE**. Map notes/timecodes to markers, selects, or edits.

### UXP bridge parity / unsafe-by-default tools

- `uxp_bridge_adapter` — **FUTURE**. Support UXP action protocol alongside CEP script protocol.
- `eval_code` — **FUTURE**. Optional disabled-by-default developer tool for raw ExtendScript/UXP eval in trusted local debugging only.
- `batch_script_transaction` — **FUTURE**. Run multiple operations with preflight and rollback/undo guidance.

## Recommended build priorities

- **P0:** `test_connection`, `bridge_health_report`, scratch-project `live_tool_sweep_safe` — These reduce setup/support friction immediately.
- **P1:** `list_clip_effects`, `set_effect_parameter`, dedicated clip property helpers, `batch_set_clip_properties`, `set_clip_speed_settings`, `set_clip_time_remap_settings` — These make current editing operations much more controllable without huge new architecture; Time Remapping remains conditional because Premiere Pro 2026 did not expose a scriptable Time Remapping component on the scratch clip.
- **P1:** `qc_export_with_ffprobe`, `package_deliverable`, `upload_delivery_link` — Matches real post/delivery workflows and can be implemented mostly outside Premiere.
- **P2:** MOGRT probing/property tools and external graphic overlay workflow — Best path around weak native title scripting.
- **P2:** Transcript/caption/search tools — High leverage for editorial note finding and social/commercial cuts.
- **P3:** AME queue telemetry, multicam, nested sequence automation, deep Lumetri/Essential Sound — High value but likely blocked by Adobe API limitations or requires UXP/UI automation research.

## Verification commands

```bash
npm run build
npm test -- --runInBand
node scripts/live-tool-sweep.mjs   # only in a scratch Premiere project
```
