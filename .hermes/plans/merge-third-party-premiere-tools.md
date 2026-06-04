# Plan: Merge High-Value Tools from leancoderkavy/premiere-pro-mcp into Adobe_Premiere_Pro_MCP

Date: 2026-06-04

Primary repo: `/Users/mattbot/Documents/Code/Adobe_Premiere_Pro_MCP`

Third-party reference checkout: `/tmp/premiere-pro-mcp-review/premiere-pro-mcp`

Third-party reviewed commit: `7f8d8c964d5c`

Primary repo baseline when this plan was written: branch `main`, commit `4cec1663dc25`

## 1. Goal

Port the useful, lower-risk tool coverage from `leancoderkavy/premiere-pro-mcp` into our Premiere MCP server while preserving our existing bridge architecture, safety posture, tests, and live-scratch-project verification workflow.

This plan is intended to be pasted into a Hermes Goal for implementation. The implementer should work in small feature branches/commits, test each batch, and avoid broad unreviewed drops from the external repo.

## 2. Non-goals and hard exclusions

Do **not** replace our bridge with the third-party bridge.

Rationale:
- Our bridge already has stronger temp-dir handling, stale command/response diagnostics, session-specific safety, and proven CEP/ExtendScript bridge health reporting.
- Recent live smoke passed against Premiere Pro 26.2.2 using `/tmp/premiere-mcp-bridge`.
- Existing live smoke report: `/tmp/premiere-mcp-safe-sweeps/live-smoke-20260604.json`.

Do **not** publicly expose arbitrary raw scripting tools from the third-party repo:
- `execute_extendscript`
- `evaluate_expression`
- `inspect_dom_object`
- `sendRawCommand`
- Any equivalent raw ExtendScript evaluator, DOM inspector, or generic code execution surface.

If debug scripting is ever needed, it must be behind an explicit local dev/debug gate, disabled by default, documented as dangerous, and omitted from the public MCP catalog unless the user explicitly requests a separate dev-only pathway.

Do **not** import the third-party HTTP/landing-page/server stack just to get tool coverage.

Rationale:
- It increases attack surface.
- It adds dependency-audit noise.
- It is not needed for our local CEP/file bridge workflow.

Do **not** copy code wholesale without adapting it to our conventions:
- Use our TypeScript/Zod schema style.
- Use our `PremiereProTools` catalog and `executeTool` dispatch conventions.
- Use our `PremiereProTransport.executeScript` path.
- Preserve sequence-aware helpers and explicit no-silent-fallback behavior where relevant.
- Preserve dry-run defaults for destructive or broad operations where feasible.

## 3. Source facts from prior evaluation

External repo: `leancoderkavy/premiere-pro-mcp`

Useful facts already verified:
- License: MIT.
- External package version: 1.1.1.
- External tests: 288 Vitest tests passed at reviewed checkout.
- External parser counted 266 tool definitions across 28 tool modules.
- Local runtime catalog counted 140 tools at baseline.
- Exact-name overlap: 97 tools.
- Third-party-only names: 169 tools.
- Local-only names: 43 tools.
- External dependency audit at review time found 11 vulnerabilities: 1 critical, 7 high, 3 moderate, mostly transitive/dev/HTTP/test stack.

Reference artifacts:
- `/tmp/premiere-pro-mcp-review/final-eval-report.json`
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/tools/*.ts`
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/bridge/script-builder.ts`
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/bridge/file-bridge.ts`

Our current roadmap/reference doc:
- `PREMIERE_TOOL_COVERAGE.md`

Our current tool implementation concentration:
- `src/tools/index.ts`

Our current tests:
- `src/__tests__/tools/index.test.ts`
- `src/__tests__/bridge/index.test.ts`
- `src/__tests__/integration/server.test.ts`
- plus specialized tests under `src/__tests__/**`.

Build/test commands:
- `npm test`
- `npm run build`
- `npm run lint` if available/healthy; if lint has pre-existing noise, document exact failure and do not hide it.

Live smoke command/tool:
- Use MCP tool `live_tool_sweep_safe` against `/tmp/premiere-mcp-safe-sweeps`.
- Use MCP tool `bridge_health_report` before and after live sweeps.
- The bridge temp dir should remain `/tmp/premiere-mcp-bridge` unless explicitly changed.

## 4. Implementation principles

### 4.1 Safety first

Every newly ported tool must clearly fall into one of these classes:

1. Read-only: can run against an active user project if it only reports state.
2. Bounded mutation: can mutate but requires explicit IDs/paths and clear scope.
3. Broad/destructive mutation: must default to `dryRun: true`, duplicate the sequence/project first, or require explicit confirmation-style args such as `allowMutatingSourceSequence: true` only if the tool is inherently unsafe.
4. Unsupported/speculative: returns `supported:false` with diagnostics rather than pretending an unverified Premiere API works.

Never silently mutate the active sequence when a sequence ID is supplied but cannot be found. Preserve the repo's existing safety pattern: if `sequenceId` is provided, resolve it or fail.

### 4.2 Capability honesty

Premiere ExtendScript and QE DOM support varies by version and host state. For every ported tool:
- If API support is uncertain, implement a diagnostic branch that reports `supported:false` or `available:false` with a useful reason.
- If QE DOM is used, call `app.enableQE()` in the script and return explicit QE failure diagnostics rather than swallowing all errors.
- If a third-party implementation swallows exceptions, improve it before porting.
- Avoid claims like `success:true` unless the script verified the postcondition where practical.

### 4.3 Our API style

Prefer camelCase input names in our MCP tool schemas, matching existing local style:
- Third-party `item_id` becomes `projectItemId` or `itemId`, depending on existing local terminology.
- Third-party `track_type` becomes `trackType`.
- Third-party `track_index` becomes `trackIndex`.
- Third-party `time_seconds` becomes `timeSeconds` or `time`, matching nearby local tools.
- Third-party `output_path` becomes `outputPath`.

Use existing local names if a near-equivalent already exists.

When adding a tool with a third-party name that conflicts with an existing local tool:
- Prefer keeping the existing local public name and improving its behavior if the third-party code is better.
- Add aliases only if there is clear user value.
- Do not regress existing schemas.

### 4.4 Atomic branch/commit workflow

Use a feature branch:
- `feature/merge-third-party-premiere-tools`

Use atomic conventional commits. Suggested commits:
1. `docs: add third-party premiere tool merge plan`
2. `refactor: add shared extendscript tool helpers`
3. `feat: add source monitor tools`
4. `feat: add timeline selection tools`
5. `feat: add track targeting tools`
6. `feat: add project and media inspection helpers`
7. `feat: add export and qc utility tools`
8. `feat: add keyframe helper tools`
9. `test: expand live scratch smoke coverage for merged tools`
10. `docs: update premiere tool coverage for merged tools`

If a phase grows too large, split by tool family and keep each commit independently buildable/testable.

## 5. Recommended port order

### Phase 0 — Setup, inventory, and guardrails

Purpose: establish an exact implementation baseline and prevent accidental public exposure of dangerous tools.

Tasks:
1. Ensure clean working tree:
   - `git status --short`
   - `git rev-parse --abbrev-ref HEAD`
   - `git rev-parse --short=12 HEAD`
2. Create branch:
   - `git checkout -b feature/merge-third-party-premiere-tools`
3. Confirm third-party checkout and reviewed commit:
   - `git -C /tmp/premiere-pro-mcp-review/premiere-pro-mcp rev-parse --short=12 HEAD`
4. Read reference artifacts:
   - `/tmp/premiere-pro-mcp-review/final-eval-report.json`
   - `PREMIERE_TOOL_COVERAGE.md`
5. Generate a fresh local/external tool inventory using a small local script or Node/TS helper, writing output to a throwaway file under `/tmp` or a checked-in docs artifact only if useful.
6. Create or update an internal allowlist/exclusion list in the plan/checklist for tools to port vs. skip.
7. Add a test that asserts raw scripting tools are not in `getAvailableTools()`:
   - `execute_extendscript`
   - `evaluate_expression`
   - `inspect_dom_object`
   - `sendRawCommand`
   - any imported equivalent.

Acceptance gates:
- Branch created.
- Tool inventory regenerated.
- Public catalog exclusion test passes.
- `npm test -- --runInBand` or `npm test` passes before feature work starts.
- `npm run build` passes before feature work starts.

### Phase 1 — Shared ExtendScript helper layer

Purpose: reduce copy/paste before adding many tool scripts.

Third-party reference:
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/bridge/script-builder.ts`

Do not replace our bridge. Instead, extract safe ideas into local helper utilities.

Suggested local destination:
- `src/tools/extendscript.ts` or `src/utils/extendscript.ts`

Potential helper functions:
- `escapeForExtendScript(value: string): string`
- `literalForExtendScript(value: unknown): string` for JSON-safe literal injection where needed.
- `buildPremiereScript(body: string, functionName?: string): string` that wraps body in a self-invoking function and returns JSON/stringified result using our existing bridge helper compatibility.
- Optional snippets for common script operations if they are not already in bridge helpers:
  - resolve active or requested sequence with no silent fallback.
  - resolve project item by nodeId/name/path with explicit matching mode.
  - convert seconds/ticks.
  - collect clip summaries.
  - safe QE enable/lookup.

Important adaptation:
- Our bridge already injects `EXTENDSCRIPT_HELPERS` with `__findSequence`, `__findClip`, `__findProjectItem`, `__ticksToSeconds`, and `__secondsToTicks`.
- Do not duplicate conflicting helper names unless necessary.
- If helper names are duplicated, use a local prefix and write tests confirming scripts are not double-wrapped or broken.

Tests:
- Unit tests for escaping quotes, backslashes, newlines, tabs, and Unicode text.
- Unit tests for generated script shape if a builder is added.
- Regression test using `mockBridge.executeScript` to confirm a representative new tool script contains escaped args and expected Premiere API calls.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- No public tool behavior changes except test-only helper coverage.

### Phase 2 — Source Monitor tools

Priority: highest. These fill a real gap and are useful for assistant-driven editing workflows.

Third-party reference:
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/tools/source-monitor.ts`

Candidate tools to port:
1. `open_in_source` -> recommended local public name: `open_in_source_monitor`
2. `close_source_monitor`
3. `close_all_source_clips`
4. `set_source_in_out` -> recommended local public name: `set_source_monitor_in_out`
5. `insert_from_source` -> recommended local public name: `insert_source_monitor_clip`
6. `overwrite_from_source` -> recommended local public name: `overwrite_source_monitor_clip`
7. `get_source_monitor_info`

Schema recommendations:
- `open_in_source_monitor`
  - `projectItemId: string` required.
  - Optional `matchBy?: 'id' | 'name' | 'path'` only if needed; default should use node ID/project item ID.
- `set_source_monitor_in_out`
  - `inSeconds?: number >= 0`
  - `outSeconds?: number >= 0`
  - refinement: at least one supplied; if both supplied, `outSeconds > inSeconds`.
- `insert_source_monitor_clip`
  - `sequenceId?: string`
  - `videoTrackIndex?: integer >= 0`
  - `audioTrackIndex?: integer >= 0`
  - `time?: number >= 0`; default current playhead.
- `overwrite_source_monitor_clip`
  - same as insert.
- `get_source_monitor_info`
  - no args or optional `includeMetadata?: boolean` if low-cost.

Implementation notes:
- Use `app.sourceMonitor.openProjectItem(item)` for opening.
- Use `app.sourceMonitor.getProjectItem()` for current item when available.
- For setting in/out, verify whether `ProjectItem.setInPoint` and `setOutPoint` want ticks string vs Time ticks. The third-party code uses `item.setInPoint(inTime.ticks, 4)`. Live validate before marking full support.
- For insert/overwrite, prefer sequence-aware behavior. If `sequenceId` supplied, set/resolve that sequence or fail. If omitted, use active sequence.
- For insert/overwrite, third-party code uses `seq.insertClip(item, pos, vTrack, aTrack)` and `seq.overwriteClip(item, pos, vTrack, aTrack)`. Live validate argument shape in Premiere 26.2.2.
- Return postcondition fields: sequenceId, item name/id, timeline time, track indices, operation.

Tests:
- Catalog test includes all new source monitor tools.
- Zod validation tests for bad negative times and invalid in/out ordering.
- Mock bridge script-shape tests for each operation:
  - open calls `app.sourceMonitor.openProjectItem`.
  - close calls `app.sourceMonitor.closeClip`.
  - close all calls `app.sourceMonitor.closeAllClips`.
  - get info calls `app.sourceMonitor.getProjectItem`.
  - insert/overwrite call `insertClip`/`overwriteClip` and include track indices.
- Live scratch smoke:
  1. Create scratch project with `live_tool_sweep_safe` or a more focused scratch helper.
  2. Import a small generated media/still asset.
  3. Open it in source monitor.
  4. Set source in/out where supported.
  5. Insert to a scratch sequence.
  6. List sequence tracks and verify a clip was placed.
  7. Close source monitor.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- Focused live smoke passes or records `supported:false` with honest diagnostics for host-limited operations.
- No user project is mutated; only disposable scratch project is touched.

### Phase 3 — Timeline selection tools

Priority: high. Selection primitives are useful for downstream edit operations and can be verified structurally.

Third-party reference:
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/tools/selection.ts`

Candidate tools to port:
1. `select_clips_by_name`
2. `select_all_clips`
3. `deselect_all_clips`
4. `select_clips_in_range`
5. `select_clips_by_color`
6. `invert_selection`
7. If present in remaining external module lines, include additional selection helpers only after review.

Schema recommendations:
- Common `sequenceId?: string` should be added to avoid active-sequence-only behavior where practical.
- `trackType?: 'video' | 'audio' | 'both'`, default `both`.
- `trackIndex?: integer >= 0`.
- `addToSelection?: boolean`, default `false`, where applicable.
- `select_clips_by_name`: `name: string` required, optional `caseSensitive?: boolean` if easy.
- `select_clips_in_range`: `startTime: number >= 0`, `endTime: number > startTime`.
- `select_clips_by_color`: `colorIndex: integer 0..15`.

Implementation notes:
- Third-party code uses `clip.setSelected(true, true)` and `clip.setSelected(false, true)`.
- Preserve selected/deselected counts.
- Use explicit sequence resolution if `sequenceId` is provided.
- Do not assume selection APIs behave identically for linked A/V clips; return counts separately by video/audio if possible.
- Existing local `get_selected_clips` can be used for verification; improve it if needed rather than duplicating.

Tests:
- Catalog test includes new selection tools.
- Validation tests for invalid ranges, invalid `trackType`, invalid `colorIndex`.
- Mock bridge script-shape tests for selection calls and sequence resolution.
- Unit tests ensure `select_clips_in_range` uses overlap semantics: `clip.start < end && clip.end > start`.
- Live scratch smoke:
  1. Build a scratch sequence with at least two clips on one or more tracks.
  2. Select by name and read selected clips.
  3. Deselect all and verify selected count zero.
  4. Select by range and verify expected clip(s).
  5. If color labels can be set/read in scratch, test `select_clips_by_color`; otherwise return host-limited diagnostics.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- Scratch selection smoke verifies at least by-name, all/deselect, and range selection.

### Phase 4 — Track targeting, detailed track info, and QE razor helpers

Priority: high, with extra caution around QE DOM.

Third-party reference:
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/tools/track-targeting.ts`

Candidate tools to port or merge:
1. `set_target_track`
2. `get_target_tracks`
3. `set_all_tracks_targeted`
4. `rename_track`
5. `get_track_info`
6. `razor_all_tracks` only if it adds value beyond local `razor_timeline_at_time`.
7. `set_clip_start_time`
8. `clear_item_in_out`
9. Review the rest of `track-targeting.ts` for additional high-value, low-risk tools after line 320.

Overlap handling:
- We already have track tools such as `add_track`, `delete_track`, `lock_track`, `toggle_track_visibility`, `mute_track`, and `razor_timeline_at_time`.
- Do not add duplicate names unless the semantics differ.
- If external `get_track_info` is better than local `list_sequence_tracks` for detailed single-track state, add it as a focused tool.
- If `razor_all_tracks` is redundant, either skip it or implement it as a convenience wrapper around local `razor_timeline_at_time` with clear naming.

Schema recommendations:
- `sequenceId?: string` on all sequence tools.
- `trackType: 'video' | 'audio'` or `'video' | 'audio' | 'both'` where applicable.
- `trackIndex: integer >= 0` when targeting one track.
- `targeted: boolean` required for setters.
- `name: string` required for renaming.
- `time?: number >= 0` for razor; default playhead if omitted.

Implementation notes:
- Track targeting APIs may be version-sensitive:
  - `track.setTargeted(targeted, isVideo)`
  - `track.isTargeted()`
- Live validate these before claiming support.
- Track renaming through `track.name = ...` must be postcondition-verified by reading back `track.name`.
- QE razor should call `app.enableQE()` and confirm `qe.project.getActiveSequence()` exists.
- Return explicit diagnostics for unsupported QE methods.

Tests:
- Catalog/validation tests.
- Mock bridge script-shape tests for `setTargeted`, `isTargeted`, track renaming, QE razor path.
- Live scratch smoke:
  1. Create/open disposable scratch sequence.
  2. Add an extra track if needed.
  3. Rename a scratch track and verify via `list_sequence_tracks` or `get_track_info`.
  4. Set target track and verify via `get_target_tracks`.
  5. Razor a known clip at a known time and verify clip count increases, but only in scratch.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- Live scratch smoke verifies target/rename; QE razor either passes or returns clear unsupported diagnostics.

### Phase 5 — Project/media hygiene and inspection tools

Priority: medium-high. Useful for production workflows, especially conform and QC.

Third-party reference modules:
- `src/tools/inspection.ts`
- `src/tools/media.ts`
- `src/tools/project.ts`
- `src/tools/project-manager.ts`
- `src/tools/metadata.ts`
- `src/tools/utility.ts`

Candidate capabilities to port after review:
- More detailed project item inspection if it exceeds local `list_project_items`, `get_metadata`, `scan_conform_media_metadata`, and `check_offline_media`.
- Media path diagnostics and item availability checks.
- Duplicate/media hygiene helpers if safer or more detailed than local `consolidate_duplicates`.
- Project/bin recursive listing improvements.
- Source-media metadata fields that can help offline-to-online conform: reel, tape, timecode, duration, frame rate, raster, audio channel layout.

Overlap handling:
- We already have strong conform-specific tools:
  - `scan_conform_media_metadata`
  - `snapshot_sequence_for_conform`
  - `analyze_stacked_online_conform`
  - `create_stacked_online_conform_sequence`
  - `copy_conform_clip_effects`
  - `qc_stacked_online_conform`
- Do not duplicate these with weaker generic inspectors.
- Prefer improving existing conform/media scanners with third-party ideas.

Safety requirements:
- Inspection tools should be read-only by default.
- Any cleanup/consolidation operation must have dry-run and explicit action plans.
- No automatic relink/delete/move across a real project without explicit item IDs and dry-run review.

Tests:
- Unit tests for metadata normalization helpers.
- Mock bridge tests for recursive project traversal scripts.
- Regression tests for offline media diagnostics.
- If improving conform scanner, add no-lookahead/no-side-effect tests where applicable.

Live scratch smoke:
- Create scratch project.
- Import generated media/stills.
- Verify project/media inspector returns expected item names, IDs, media paths, type classifications.
- If offline media tests are practical, relink/remove only disposable scratch assets and verify diagnostics.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- Scratch project inspection smoke passes.
- No destructive media operations without dry-run/action-plan gating.

### Phase 6 — Export, OMF/AAF/FCP XML, capture-frame QC utilities

Priority: medium-high, especially for post-production deliverables and QC.

Third-party reference:
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/tools/export.ts`

Candidates:
1. Capture/export current frame improvements if superior to local `export_frame`.
2. OMF export if present and live-verifiable.
3. AAF/FCP XML improvements if third-party behavior is stronger than local `export_aaf` and `export_as_fcp_xml`.
4. Render queue helpers only if they can provide honest status or better queueing.
5. Subclip helper improvements if better than local `create_subclip`.

Overlap handling:
- Existing local tools already include:
  - `export_sequence`
  - `export_frame`
  - `export_as_fcp_xml`
  - `export_aaf`
  - `add_to_render_queue`
  - `get_render_queue_status`
  - `create_subclip`
  - `qc_rendered_media`
  - `list_export_presets`
- Prefer improving existing local tools rather than creating duplicates.

Safety and verification:
- All file output paths must be absolute or safely resolved inside an allowed output root where appropriate.
- For rendered media or frame exports, verify the file exists on disk after export.
- Use `qc_rendered_media` for media outputs where possible.
- For `export_frame`, verify size > 0 and expected extension/format.
- For AME queue status, do not claim live queue telemetry unless it is actually available. Existing local behavior is capability-honest; preserve that.

Tests:
- Unit tests for path validation and unsupported/host-limited paths.
- Mock bridge script tests for export calls.
- Disk verification tests for local file QC helpers.

Live scratch smoke:
- Export one frame from a scratch sequence to `/tmp/premiere-mcp-safe-sweeps/...` and verify with file stat.
- Export FCP XML from scratch sequence and verify file exists and contains XML-like content.
- AAF/OMF only if the host supports it without modal dialogs; otherwise return supported:false or document manual limitation.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- Frame export scratch smoke passes.
- Any queue/export host limits are documented honestly.

### Phase 7 — Keyframe helper tools

Priority: medium. Useful, but property/component behavior can be tricky.

Third-party reference:
- `/tmp/premiere-pro-mcp-review/premiere-pro-mcp/src/tools/keyframes.ts`

Candidate capabilities:
- Keyframe interpolation helpers.
- Property value helpers.
- Color/value-specific keyframe convenience wrappers if present.
- Bulk keyframe read/write helpers if they are safer or more expressive than local `add_keyframe`, `remove_keyframe`, `get_keyframes`, `add_audio_keyframes`, and `setup_ducking`.

Overlap handling:
- Existing local keyframe tools:
  - `add_keyframe`
  - `remove_keyframe`
  - `get_keyframes`
  - `add_audio_keyframes`
  - `setup_ducking`
- Prefer additive helpers that reduce roundtrips or add missing interpolation/easing support.
- Avoid duplicating simple keyframe set/remove functions unless local behavior is materially improved.

Safety/capability requirements:
- Always require `clipId` and preferably `sequenceId` for predictable lookup.
- Use `list_clip_effects` style selectors where possible: component display name/matchName/index plus property display name/matchName/index.
- Validate keyframes are sorted by increasing time.
- Validate keyframe values are finite numbers unless a specific property type supports non-number values.
- If Premiere does not expose interpolation APIs through ExtendScript for a property, return `supported:false` rather than silently ignoring.

Tests:
- Schema validation for non-monotonic keyframes.
- Mock script tests for property lookup by component/property selectors.
- Tests for unsupported component/property results.

Live scratch smoke:
- Apply scale or opacity keyframes to a scratch clip.
- Read back keyframes with existing `get_keyframes` or new helper.
- Verify count and times.

Acceptance gates:
- `npm test` passes.
- `npm run build` passes.
- Keyframe scratch smoke passes for at least one built-in Motion/Opacity property or returns clear unsupported diagnostics.

### Phase 8 — Additional timeline/playback/workspace/clipboard utilities

Priority: lower, after high-value post workflows are covered.

Third-party reference modules:
- `timeline.ts`
- `playback.ts`
- `playhead.ts`
- `workspace.ts`
- `clipboard.ts`
- `advanced.ts`
- `transitions.ts`
- `effects.ts`
- `audio.ts`
- `text.ts`
- `captions.ts`

Candidate approach:
1. Compare each tool to local equivalents.
2. Classify each as:
   - already covered locally,
   - improve existing local implementation,
   - add as new public tool,
   - dev-only/skip,
   - unsafe/unsupported.
3. Prioritize only tools that support known user workflows: conform, QC, post deliverables, timeline cleanup, edit assembly, source monitor editing.

Likely useful if not already covered:
- More robust playback/work area helpers, if they verify state.
- Workspace/project panel organization helpers, if non-destructive.
- Clipboard utilities only if they work reliably and do not depend on UI focus in brittle ways.
- Transition/effects enumeration improvements if they provide better metadata than current `list_available_effects` and `list_available_transitions`.

Skip or defer:
- UI-focus-dependent tools that cannot be verified through bridge state.
- Broad timeline mutation tools without safe dry-run or duplication strategy.
- Any tool that opens modal dialogs or requires manual Premiere UI interaction in normal operation.

Acceptance gates:
- Same unit/build/live-smoke standard as prior phases.
- Lower-priority utilities should not block merging high-value phases.

## 6. Implementation mechanics in `src/tools/index.ts`

The current local repo has a single large `PremiereProTools` class. Keep changes consistent with current structure unless refactoring is deliberately scoped.

For each new tool:
1. Add TypeScript interface for args if complex.
2. Add a Zod schema near related schemas.
3. Add catalog entry in `getAvailableTools()` with a clear, capability-honest description.
4. Add dispatch case in `executeTool()`.
5. Add a private method implementing the tool.
6. Use `this.bridge.executeScript(script)` for Premiere operations.
7. Return structured JSON with `success`, operation-specific fields, diagnostics, and warnings if applicable.
8. Add tests in the nearest relevant `src/__tests__` file or create a new focused test file if the main test file becomes unwieldy.

If `src/tools/index.ts` becomes too large to safely maintain, perform a small refactor first:
- Extract only pure helper functions and types into separate files.
- Avoid broad behavior changes during extraction.
- Verify test/build after extraction before adding new tools.

## 7. Testing strategy

### 7.1 Static/unit test gates for every phase

Run after each phase:
- `npm test`
- `npm run build`
- `npm run lint` if lint is expected to pass. If lint fails due pre-existing issues, document output and ensure new files do not introduce obvious style/type errors.

Unit tests should cover:
- Catalog exposure.
- Public exclusion of raw scripting tools.
- Zod schema validation.
- Script-shape expectations using mocked bridge.
- Error conversion from bridge failures.
- Non-bridge helpers that can be tested purely.

### 7.2 Live smoke gates

Live tests must use disposable projects only.

Default live directories:
- Scratch projects: `/tmp/premiere-mcp-safe-sweeps`
- Bridge temp: `/tmp/premiere-mcp-bridge`
- Frame/QC outputs: subdirectories under `/tmp/premiere-mcp-safe-sweeps`

Before live smoke:
1. `bridge_health_report({ staleAfterSeconds: 300 })`
2. `test_connection()`
3. Confirm no stale bridge files and active bridge mode is healthy.

For each high-value phase, create or reuse a scratch project with generated disposable assets.

After live smoke:
1. `bridge_health_report({ staleAfterSeconds: 300 })`
2. Verify generated report/output files exist on disk.
3. Record tool pass/fail/unsupported results.

Never run broad live sweeps against a real user project.

### 7.3 Suggested expanded live smoke matrix

Add a new `mode` to `live_tool_sweep_safe`, or create a focused scratch smoke helper, after the first batch of tools lands.

Possible modes:
- `smoke`: existing basic create/test/list checks.
- `source_monitor`: import/open/set in-out/insert/list tracks/close.
- `selection`: select by name/range/deselect/get selected.
- `tracks`: rename/target/get info/razor scratch clip.
- `export_qc`: frame export/FCP XML/stat verification.
- `keyframes`: apply/read simple Motion or Opacity keyframes.

Each mode should:
- Create or open a disposable project under the allowed scratch root.
- Avoid existing user projects.
- Return a structured JSON report.
- Include runtime failures count and unsupported count.

## 8. Documentation updates

Update `PREMIERE_TOOL_COVERAGE.md` after each merged phase.

For every tool, document:
- Tool name.
- Category.
- Status: `implemented`, `live-smoked`, `unit-tested`, `host-limited`, `deferred`, or `excluded`.
- Safety class: read-only, bounded mutation, dry-run/action-plan mutation, or excluded unsafe.
- Notes about Premiere API/QE DOM limitations.

Add a section for excluded third-party tools:
- raw scripting tools excluded for safety.
- HTTP/landing/server stack excluded as architecture mismatch.
- duplicate tools merged into existing local implementation.

Update README or tool docs only after the public API names stabilize.

## 9. Acceptance criteria for the overall goal

The goal is complete when:

1. A feature branch exists with atomic conventional commits.
2. Source Monitor tools are merged and live-smoked, or any host-limited APIs are honestly reported.
3. Selection tools are merged and live-smoked.
4. Track targeting/info tools are merged and live-smoked where supported.
5. At least one project/media inspection improvement is merged, or documented as already covered by existing stronger local tools.
6. Export/frame QC improvements are merged if they add value over existing local tools.
7. Keyframe helpers are merged if they add real capability over existing local keyframe tools.
8. Raw scripting tools are explicitly absent from the public catalog and covered by tests.
9. `npm test` passes.
10. `npm run build` passes.
11. Live scratch smoke passes for all implemented live-safe tool families, with reports saved under `/tmp/premiere-mcp-safe-sweeps`.
12. `PREMIERE_TOOL_COVERAGE.md` is updated with implemented/deferred/excluded status.
13. Final git status is clean except intended commits, and the branch is ready for PR.

## 10. Suggested goal prompt for implementation

Use the following prompt when turning this plan into a Hermes Goal:

```text
Implement the plan in /Users/mattbot/Documents/Code/Adobe_Premiere_Pro_MCP/.hermes/plans/merge-third-party-premiere-tools.md.

Work in /Users/mattbot/Documents/Code/Adobe_Premiere_Pro_MCP. Create branch feature/merge-third-party-premiere-tools from current main unless already on a matching feature branch. Use /tmp/premiere-pro-mcp-review/premiere-pro-mcp at reviewed commit 7f8d8c964d5c only as a reference. Do not replace our bridge. Do not expose raw scripting tools publicly. Preserve our safety conventions, Zod schemas, sequenceId no-silent-fallback behavior, and live scratch-project workflow.

Implement in small atomic conventional commits. After each phase, run npm test and npm run build. Use live scratch Premiere smoke tests only against /tmp/premiere-mcp-safe-sweeps with bridge temp dir /tmp/premiere-mcp-bridge. Update PREMIERE_TOOL_COVERAGE.md. Final deliverable: branch with commits, passing unit/build tests, live smoke report paths, and a concise summary of implemented, deferred, and excluded tools.
```

## 11. Risks and mitigations

Risk: Third-party tools assume active sequence and silently mutate the wrong project.
Mitigation: Add optional `sequenceId`; if supplied and unresolved, fail. Use scratch-only live tests.

Risk: QE DOM methods vary across Premiere versions.
Mitigation: Gate QE tools with diagnostics, live validate in Premiere 26.2.2, and return unsupported rather than fake success.

Risk: Tool catalog bloat degrades usability.
Mitigation: Port by user-value priority; improve existing tools where possible; document deferred/duplicate tools.

Risk: Raw scripting tools create arbitrary code execution risk.
Mitigation: Explicit public-catalog exclusion tests.

Risk: Export/render tools produce files but do not verify them.
Mitigation: stat outputs and reuse `qc_rendered_media` where applicable.

Risk: `src/tools/index.ts` becomes too large and fragile.
Mitigation: Extract pure helpers first; defer broad architectural refactor unless necessary.

Risk: Modal dialogs or UI-focus-dependent APIs stall automation.
Mitigation: Avoid modal-prone APIs; return host-limited diagnostics; live smoke in disposable projects only.

## 12. First implementation slice recommendation

The first actual coding goal should stop after Phase 3 unless time remains:
1. Phase 0 inventory/guardrail test.
2. Phase 1 helper layer.
3. Phase 2 Source Monitor tools.
4. Phase 3 Selection tools.
5. Build/test/live smoke.
6. Commit and report.

This yields high user value while limiting risk. Track targeting/QE helpers should be the second slice because they require more live validation.
