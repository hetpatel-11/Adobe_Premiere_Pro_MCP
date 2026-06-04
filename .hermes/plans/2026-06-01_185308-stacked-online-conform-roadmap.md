# Stacked Online Conform MCP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Do not implement from this plan without strict TDD: RED test, verify failure, minimal GREEN, verify pass, refactor, full gate, docs, review.

**Goal:** Build a production-safe Adobe Premiere Pro MCP workflow that creates an online/color layer above an offline/proxy edit, matching high-resolution media by reel/source timecode/metadata, preserving the original offline sequence underneath for reference and QC.

**Architecture:** Treat conform as a two-stage system: first a dry-run analyzer that produces a deterministic conform plan with confidence, warnings, target tracks, timing math, transform conversions, and unsupported features; then an executor that duplicates or prepares a conform sequence and places online clips on upper tracks without destroying or replacing offline clips. Keep reusable conform logic in pure TypeScript modules with unit tests, and keep Premiere DOM/ExtendScript mutations guarded, capability-probed, and live-smoked.

**Tech Stack:** TypeScript, Jest, Zod, MCP tool catalog in `src/tools/index.ts`, Premiere CEP/ExtendScript bridge in `src/bridge/index.ts`, existing file bridge at `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`, docs in `PREMIERE_TOOL_COVERAGE.md`.

---

## 0. Current Context and Ground Rules

### Existing primitives to build on

The current MCP server already has useful low-level tools:

- Sequence/project reads: `list_sequences`, `list_sequence_tracks`, `get_sequence_settings`, `list_project_items`, `get_clip_properties`, `list_clip_effects`, `get_metadata`.
- Safety/scaffolding: `duplicate_sequence`, `add_track`, `lock_track`, `mute_track`.
- Placement/timing: `add_to_timeline`, `set_clip_speed_settings`, `trim_clip`, `move_clip`.
- Properties/effects: `batch_set_clip_properties`, `set_effect_parameter`, `set_clip_scale`, `set_clip_position`, `set_clip_opacity`, `get_keyframes`, `add_keyframe`.
- QC/export: `export_frame`, `export_sequence`, `export_as_fcp_xml`, `export_aaf`.

### Non-negotiable workflow semantics

- **Do not center the conform around `replace_clip`.** The desired workflow stacks/rebuilds online clips above offline/proxy clips.
- **Default execution must duplicate or create a conform sequence.** The source/offline sequence is not destructively mutated.
- **Dry-run first.** The analyzer must be able to report every match, mismatch, missing handle, ambiguity, and unsupported feature without changing Premiere state.
- **Online clips sit above offline clips.** Offline clips remain underneath for reference/QC.
- **High-res/color source offsets come from reel/timecode math.** Filename matching is fallback only.
- **Resolution conversion is property-specific.** Do not blindly copy every numeric effect value.
- **Capability-honest.** If Premiere does not expose a property or method, report it; do not fake success.
- **Use strict TDD for every implementation task.** No production code without first watching a relevant test fail.

### Key design nuance: track roles

Real timelines often contain picture tracks, titles, graphics, adjustment layers, nests, and matte/reference layers. A naive “add online above everything” can cover titles or bypass adjustment layers. The conform engine must distinguish:

- `picture`: offline/proxy camera/editorial clips to be matched with online/color media.
- `passthrough`: titles, graphics, adjustment layers, overlays, nested sequences, mattes, or other timeline elements that should remain visible above the online picture.
- `ignore`: temp/reference tracks not included in online QC.
- `audio`: usually keep original offline/mix audio by default; optional online audio placement only when explicitly requested.

Initial implementation should support explicit track-role input and conservative auto-classification with `needsReview` warnings.

---

## 1. Proposed MCP Tool Surface

### 1.1 `scan_conform_media_metadata`

**Purpose:** Normalize project/bin media into source identity records usable for conform matching.

**Inputs:**

- `projectItemIds?: string[]`
- `binId?: string`
- `includeOffline?: boolean = false`
- `includeSequences?: boolean = false`
- `metadataFields?: string[]`

**Output shape:**

- `success`
- `items[]`
  - `projectItemId`
  - `name`
  - `treePath`
  - `mediaPath`
  - `type`
  - `isOffline`
  - `hasVideo`, `hasAudio`
  - `width`, `height`, `pixelAspectRatio`
  - `frameRate` as `{ numerator, denominator, fps }`
  - `durationFrames`
  - `durationSeconds`
  - `sourceStartTimecode`
  - `sourceStartFrame`
  - `sourceEndTimecode`
  - `sourceEndFrame`
  - `reel`, `tapeName`, `cameraRoll`, `clipName`, `scene`, `take`
  - `rawMetadataSummary`
  - `metadataConfidence`
  - `warnings[]`

**Implementation note:** This starts as a diagnostic read. Mutation is not allowed.

### 1.2 `snapshot_sequence_for_conform`

**Purpose:** Create a normalized, frame-accurate snapshot of an offline sequence and its selected tracks.

**Inputs:**

- `sequenceId: string`
- `trackRoles?: { video?: Record<number, 'picture'|'passthrough'|'ignore'>, audio?: Record<number, 'audio'|'ignore'> }`
- `includeEffects?: boolean = true`
- `includeKeyframes?: boolean = true`
- `includeDisabled?: boolean = true`

**Output shape:**

- `success`
- `sequence`
  - `sequenceId`, `name`, `frameRate`, `width`, `height`, `durationFrames`
- `tracks[]`
  - `trackType`, `trackIndex`, `role`, `clipCount`, `warnings[]`
- `clips[]`
  - `offlineClipId`
  - `trackIndex`, `trackType`, `clipIndex`
  - `timelineStartFrame`, `timelineEndFrame`, `timelineDurationFrames`
  - `sourceInFrame`, `sourceOutFrame`, `sourceDurationFrames`
  - `projectItemId`, `name`, `mediaPath`
  - `mediaIdentity` subset from `scan_conform_media_metadata`
  - `effectsSnapshot`
  - `keyframeSummary`
  - `speedSummary`
  - `unsupportedFeatures[]`
  - `warnings[]`

### 1.3 `analyze_stacked_online_conform`

**Purpose:** Dry-run matcher/planner. It must not mutate Premiere state.

**Inputs:**

- `sequenceId: string`
- `onlineBinId?: string`
- `onlineProjectItemIds?: string[]`
- `trackRoles?: ...`
- `matchRules?: { preferReelTimecode?: boolean, allowFilenameFallback?: boolean, filenameSuffixesToIgnore?: string[], fpsTolerance?: number, durationToleranceFrames?: number }`
- `transformPolicy?: { mode: 'copy'|'resolutionAware'|'reportOnly', strictAspectMatch?: boolean }`
- `audioPolicy?: 'keepOfflineOnly'|'stackOnlineMuted'|'stackOnlineLinked'`
- `passthroughPolicy?: 'leaveInPlace'|'duplicateAboveOnline'|'reportOnly'`

**Output shape:**

- `success`
- `mutationPlanned: false`
- `summary`
  - `offlineClipCount`
  - `matchedCount`
  - `unmatchedCount`
  - `ambiguousCount`
  - `missingHandleCount`
  - `unsupportedFeatureCount`
  - `safeToExecute`
- `trackPlan`
  - `offlineVideoTrackCount`
  - `onlineVideoTrackCountToAdd`
  - `targetTrackByOfflineTrack`
  - `passthroughHandling`
- `clipPlans[]`
  - `offlineClipId`
  - `status: 'matched'|'unmatched'|'ambiguous'|'missingHandles'|'unsupported'`
  - `selectedOnlineProjectItemId?`
  - `candidateMatches[]`
  - `confidence`
  - `targetTrackIndex`
  - `timelineStartFrame`, `timelineEndFrame`
  - `onlineSourceInFrame`, `onlineSourceOutFrame`
  - `timecodeMath`
  - `transformPlan`
  - `effectPlan`
  - `warnings[]`, `errors[]`

### 1.4 `create_stacked_online_conform_sequence`

**Purpose:** Execute a previously reviewed dry-run conform plan.

**Inputs:**

- `sequenceId: string`
- `analysisPlan?: object` or `analysisPlanId?: string` if persisted later
- `outputSequenceName?: string`
- `executeMode: 'duplicateSequenceAndStack'|'stackInExistingDuplicateOnly'`
- `allowAmbiguous?: boolean = false`
- `allowMissingHandles?: boolean = false`
- `transformPolicy?: ...`
- `audioPolicy?: ...`
- `passthroughPolicy?: ...`
- `dryRun?: boolean = false`

**Behavior:**

1. Validate/generate analysis plan.
2. Reject execution if unsafe unless explicit allow flags are set.
3. Duplicate sequence by default.
4. Add online tracks above offline picture tracks.
5. Place each online clip using `add_to_timeline`-style logic on target upper track.
6. Set source in/out/duration using verified `Time` object assignments.
7. Copy/convert scriptable properties/effects.
8. Leave offline clips untouched underneath.
9. Add markers/report metadata for failures.
10. Return per-clip execution results.

### 1.5 `copy_clip_effect_stack_for_conform`

**Purpose:** Reusable helper/tool for copying one clip’s scriptable visual state to another clip with optional resolution-aware conversion.

**Inputs:**

- `sourceClipId`, `targetClipId`, `sequenceId`
- `sourceMediaRaster`, `targetMediaRaster`, `sequenceRaster`
- `copyKeyframes?: boolean = true`
- `conversionPolicy?: 'copyOnly'|'resolutionAware'|'reportOnly'`
- `effectAllowlist?: string[]`
- `effectDenylist?: string[]`

**Output:**

- copied static properties
- copied keyframes
- converted properties
- unsupported/skipped properties
- readback verification failures

### 1.6 `qc_stacked_online_conform`

**Purpose:** Generate a QC report for the stacked online sequence.

**Inputs:**

- `sequenceId`
- `conformReport`
- `samplePolicy: 'allCuts'|'firstMidLast'|'failuresOnly'|'everyN'`
- `outputDir`
- `exportFrames?: boolean = true`

**Output:**

- missing/ambiguous/unplaced clips
- timeline duration drift
- source timing drift
- unsupported effects summary
- representative frame paths if exported
- optional notes for manual review

---

## 2. Data Model and Matching Rules

### 2.1 Internal frame/timecode representation

Create pure TypeScript helpers that never use floating seconds as the source of truth once frame rates are known.

**Files:**

- Create: `src/tools/conform/types.ts`
- Create: `src/tools/conform/timecode.ts`
- Test: `src/__tests__/tools/conform/timecode.test.ts`

**Concepts:**

- `FrameRate = { numerator: number; denominator: number; fps: number; dropFrame?: boolean }`
- `Timecode = { text: string; frame: number; dropFrame: boolean }`
- `FrameRange = { startFrame: number; endFrame: number; durationFrames: number }`

**Rules:**

- Parse non-drop `HH:MM:SS:FF`.
- Parse drop-frame `HH;MM;SS;FF` conservatively.
- Reject negative frames unless explicitly representing offsets.
- Store absolute source TC as integer frames at source frame rate.
- Treat mixed frame rates as warnings until live-verified.

### 2.2 Matching confidence

**Files:**

- Create: `src/tools/conform/matching.ts`
- Test: `src/__tests__/tools/conform/matching.test.ts`

**Confidence hierarchy:**

- `1.00`: reel/tape/cameraRoll exact + source TC range fully contained + fps compatible.
- `0.90`: reel exact + filename stem close + duration compatible + TC contained.
- `0.75`: filename stem exact + TC contained + fps compatible.
- `0.50`: filename fuzzy + duration compatible, no reel/TC proof.
- `<0.50`: report only; do not auto-execute.

**Containment math for trimmed online:**

- `offlineNeededStart = offlineClip.mediaStartTC + sourceInFrame`
- `offlineNeededEnd = offlineClip.mediaStartTC + sourceOutFrame`
- `onlineMediaStart = onlineCandidate.sourceStartFrame`
- `onlineMediaEnd = onlineCandidate.sourceEndFrame`
- Valid if `offlineNeededStart >= onlineMediaStart && offlineNeededEnd <= onlineMediaEnd`.
- `onlineSourceInFrame = offlineNeededStart - onlineMediaStart`.
- `onlineSourceOutFrame = offlineNeededEnd - onlineMediaStart`.

If invalid, classify as `missingHandles` and include missing head/tail frame counts.

### 2.3 Track planning

**Files:**

- Create: `src/tools/conform/trackPlan.ts`
- Test: `src/__tests__/tools/conform/trackPlan.test.ts`

**Rules:**

- Default picture track mapping: offline V1 index `0` maps to online V`N+1` index `N`, offline V2 index `1` maps to index `N+1`, etc.
- If passthrough tracks exist above picture tracks and Premiere cannot insert tracks in the middle, execution must either:
  - duplicate passthrough items above the new online stack, or
  - report `requiresManualTrackStrategy` until that behavior is implemented.
- Do not place online clips on tracks that already contain offline media unless explicitly requested.
- Preflight target track occupancy before overwriting.

### 2.4 Resolution-aware transform conversion

**Files:**

- Create: `src/tools/conform/transformConversion.ts`
- Test: `src/__tests__/tools/conform/transformConversion.test.ts`

**Initial conversion map:**

- Motion `Position`: copy directly when sequence raster is unchanged; it is sequence-space in common Premiere behavior.
- Motion `Scale`: `targetScale = sourceScale * (sourceRaster.width / targetRaster.width)` when aspect ratio and pixel aspect match.
- Motion `Scale Width`: same axis-specific ratio if non-uniform scaling is active.
- Motion `Anchor Point`: `targetAnchorX = sourceAnchorX * (targetRaster.width / sourceRaster.width)`, `targetAnchorY = sourceAnchorY * (targetRaster.height / sourceRaster.height)`.
- Motion `Rotation`: copy directly.
- Opacity: copy directly.
- Crop percentages: copy directly if confirmed percentage-based; otherwise report-only until live-verified.
- Transform effect: report-only first, then add property-specific conversions after live probes.
- Masks, corner pin, Lumetri masks, time remap: report unsupported/conditional until explicitly verified.

**Strict mode:** If aspect ratio or pixel aspect differs, do not auto-convert; report `aspectMismatch` unless user allows heuristic conversion.

---

## 3. Executable Roadmap

Each task below is intentionally small. Implementation should proceed one task at a time. Every task that changes code must use RED-GREEN-REFACTOR.

### Task 1: Add conform plan documentation scaffold

**Objective:** Create user/developer-facing documentation for the stacked conform architecture before code.

**Files:**

- Create: `docs/stacked-online-conform.md` or append a section to `PREMIERE_TOOL_COVERAGE.md` if this repo prefers one-doc inventory.

**Steps:**

1. Document the stacked conform workflow: duplicate sequence, keep offline underneath, add online clips above, dry-run first.
2. Document tool roadmap names and capability status as `PLANNED`.
3. Run: `git diff --check`.
4. Expected: no whitespace errors.

**No production code.**

### Task 2: Add pure conform type definitions

**Objective:** Establish shared types for media identities, timecodes, clips, tracks, and conform plans.

**Files:**

- Create: `src/tools/conform/types.ts`
- Test: none required if type-only, but build must pass.

**Steps:**

1. Create types only.
2. Run: `npm run build`.
3. Expected: TypeScript passes.

### Task 3: Implement timecode parser with RED tests

**Objective:** Convert timecode strings to integer frames and back.

**Files:**

- Create: `src/tools/conform/timecode.ts`
- Create: `src/__tests__/tools/conform/timecode.test.ts`

**RED tests:**

- Parses `01:00:00:00` at 24fps to `86400` frames.
- Parses `01:00:10:12` at 24fps to expected frames.
- Rejects malformed timecodes.
- Handles 23.976 as rational `24000/1001` without float drift where possible.
- Marks semicolon timecode as drop-frame and either parses or returns a clear unsupported/drop-frame diagnostic depending implementation choice.

**Commands:**

- RED: `npm test -- src/__tests__/tools/conform/timecode.test.ts --runInBand`
- GREEN: same command.
- Regression: `npm run build && npm test -- src/__tests__/tools/conform/timecode.test.ts --runInBand`

### Task 4: Implement trimmed-online range math

**Objective:** Calculate online source in/out from offline needed source TC and online media start TC.

**Files:**

- Modify: `src/tools/conform/timecode.ts` or create `src/tools/conform/sourceRange.ts`
- Test: `src/__tests__/tools/conform/sourceRange.test.ts`

**RED tests:**

- Online starts earlier than offline needed range → returns positive online source in/out.
- Online starts exactly at offline needed start → online source in is `0`.
- Online starts after offline needed start → `missingHeadFrames`.
- Online ends before offline needed end → `missingTailFrames`.
- Frame-rate mismatch returns warning/rejection based on strict mode.

**Commands:**

- `npm test -- src/__tests__/tools/conform/sourceRange.test.ts --runInBand`

### Task 5: Implement media matching engine

**Objective:** Score online candidates for each offline clip with deterministic confidence and ambiguity handling.

**Files:**

- Create: `src/tools/conform/matching.ts`
- Create: `src/__tests__/tools/conform/matching.test.ts`

**RED tests:**

- Exact reel + contained TC beats filename-only match.
- Ambiguous equal-confidence matches are not auto-selected.
- Missing handles classify as `missingHandles`, not `unmatched`.
- Filename suffix normalization handles `_proxy`, `_offline`, `_graded`, `_color`, `_online`.
- Fallback filename matches never reach “safe execute” confidence without TC unless policy allows it.

**Commands:**

- `npm test -- src/__tests__/tools/conform/matching.test.ts --runInBand`

### Task 6: Implement track planner

**Objective:** Plan target upper tracks without touching Premiere.

**Files:**

- Create: `src/tools/conform/trackPlan.ts`
- Create: `src/__tests__/tools/conform/trackPlan.test.ts`

**RED tests:**

- 3 offline picture tracks produce target video tracks 3, 4, 5 when indices are zero-based.
- Ignored tracks are not mirrored.
- Passthrough tracks above picture tracks trigger `passthroughRequiresHandling`.
- Existing target occupancy marks plan unsafe.
- Audio defaults to `keepOfflineOnly`.

**Commands:**

- `npm test -- src/__tests__/tools/conform/trackPlan.test.ts --runInBand`

### Task 7: Implement transform conversion helpers

**Objective:** Convert Motion/Opacity values for resolution differences using explicit per-property rules.

**Files:**

- Create: `src/tools/conform/transformConversion.ts`
- Create: `src/__tests__/tools/conform/transformConversion.test.ts`

**RED tests:**

- 1920x1080 proxy scale 100 to 3840x2160 online becomes 50.
- Position copies when sequence raster unchanged.
- Anchor point 960,540 on 1920x1080 becomes 1920,1080 on 3840x2160.
- Rotation and opacity copy directly.
- Aspect mismatch returns report-only warning in strict mode.
- Unknown effect/property returns unsupported conversion.

**Commands:**

- `npm test -- src/__tests__/tools/conform/transformConversion.test.ts --runInBand`

### Task 8: Add `scan_conform_media_metadata` schema/catalog RED tests

**Objective:** Add tool contract tests before production implementation.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`

**RED tests:**

- Tool catalog includes `scan_conform_media_metadata`.
- Schema rejects empty project item IDs.
- Tool routes to bridge script without mutation calls.
- Script shape includes safe project item lookup and metadata extraction diagnostics.

**Command:**

- `npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='scan_conform_media_metadata|current tool catalog'`

Expected first run: FAIL because the tool is missing.

### Task 9: Implement `scan_conform_media_metadata`

**Objective:** Return normalized metadata from project items/bins.

**Files:**

- Modify: `src/tools/index.ts`
- Possibly create helper: `src/tools/conform/metadataNormalize.ts`
- Test: `src/__tests__/tools/index.test.ts`

**Implementation requirements:**

- Use JSON serialization for structured args.
- No mutation.
- Return raw and normalized metadata.
- Include diagnostics when APIs are unavailable.
- Use `.finite()` for numeric schema fields where applicable.
- Do not promise reel/timecode fields if host does not expose them.

**Commands:**

- Focused: `npm run build && npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='scan_conform_media_metadata|current tool catalog'`
- Full: `npm test -- --runInBand`

### Task 10: Live probe metadata capabilities

**Objective:** Verify what Premiere 2026 exposes for project item reel/timecode/raster metadata.

**Files:**

- No production files unless docs/tests need updates.
- Optional scratch notes: `.hermes/plans/live-probes/metadata-probe-notes.md`.

**Steps:**

1. Use scratch project/media when available.
2. Run tool through built `dist` with real bridge:
   - `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge node --input-type=module ...`
3. Verify returned fields for imported media.
4. If reel/source TC are not available via DOM, plan XML/XMP fallback before execution tools depend on them.
5. Update docs with actual capability status.

**Expected output:** Honest capability matrix: DOM direct, XMP raw, XML fallback, unavailable.

### Task 11: Add `snapshot_sequence_for_conform` RED tests

**Objective:** Contract for normalized offline sequence snapshot.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`

**RED tests:**

- Catalog includes `snapshot_sequence_for_conform`.
- Requires `sequenceId`.
- Accepts explicit track roles.
- Script includes `sequenceId` lookup and does not fall back silently to active sequence.
- Output includes frame-based timing fields and warnings arrays.

**Command:**

- `npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='snapshot_sequence_for_conform|current tool catalog'`

### Task 12: Implement `snapshot_sequence_for_conform`

**Objective:** Build a read-only sequence snapshot tool with optional effect/keyframe summaries.

**Files:**

- Modify: `src/tools/index.ts`
- Reuse pure helpers from `src/tools/conform/*`

**Implementation requirements:**

- No mutation.
- Require exact `sequenceId`; no active-sequence fallback.
- Include video and audio track roles.
- Include every clip’s timeline range and source range in seconds and frames when possible.
- Include media/project item node IDs.
- Include effect summary, but do not bulk-read every keyframe until safe; start with `hasKeyframes` and static values.
- Report unsupported/unknown clip types.

**Commands:**

- Focused build/test.
- Full `npm test -- --runInBand` after green.

### Task 13: Live smoke sequence snapshot

**Objective:** Verify timeline read semantics on a scratch sequence.

**Steps:**

1. Create/use a scratch sequence with at least two video tracks and one audio track.
2. Place two proxy clips with known timeline starts/durations.
3. Apply Motion scale/position and Opacity to one clip.
4. Run `snapshot_sequence_for_conform`.
5. Verify returned track indices, clip IDs, timeline frames, source in/out, and effects summary.
6. Restore or discard scratch project.

**Pass criteria:** Snapshot matches the actual scratch timeline and does not mutate it.

### Task 14: Add `analyze_stacked_online_conform` RED tests

**Objective:** Contract for dry-run analysis.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`
- Test pure logic in `src/__tests__/tools/conform/matching.test.ts` and `trackPlan.test.ts` already.

**RED tests:**

- Catalog includes `analyze_stacked_online_conform`.
- Requires `sequenceId` and online bin/items.
- Returns `mutationPlanned:false` in mocked bridge output.
- Rejects execution-only flags because this is analysis only.
- Routes through scan/snapshot/matching helpers or script with no mutation calls.

**Command:**

- `npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='analyze_stacked_online_conform|current tool catalog'`

### Task 15: Implement `analyze_stacked_online_conform`

**Objective:** Compose media scan + sequence snapshot + matching + track plan + transform plan into one dry-run report.

**Files:**

- Modify: `src/tools/index.ts`
- Modify/create: `src/tools/conform/analyze.ts`
- Test: `src/__tests__/tools/conform/analyze.test.ts`

**Implementation requirements:**

- Must not mutate Premiere.
- Must return `safeToExecute:false` if any clip is ambiguous, missing handles, unsupported critical feature, or below confidence threshold.
- Must include per-clip target track and timing plan.
- Must classify passthrough/graphics/adjustment concerns.
- Must report exact reasons for unsafe execution.

**Commands:**

- Pure: `npm test -- src/__tests__/tools/conform/analyze.test.ts --runInBand`
- Tool: `npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='analyze_stacked_online_conform|current tool catalog'`
- Full: `npm run build && npm test -- --runInBand`

### Task 16: Live smoke dry-run analyzer

**Objective:** Prove analyzer can match a tiny scratch offline sequence to online media without mutation.

**Scratch setup:**

- Proxy clip: 1920x1080, known source timecode.
- Online clip: 3840x2160, same reel/timecode, optionally trimmed start.
- Offline sequence: one clip on V1, timeline start not zero, source in not zero.

**Pass criteria:**

- Dry-run reports one match.
- Confidence high when reel/timecode available.
- Online source in/out calculated correctly.
- Target track is above offline V1.
- No mutation occurs.

**Fallback if live TC metadata cannot be set/read:** Use test fixtures/mocked metadata and mark live metadata limitation in docs.

### Task 17: Add `prepare_stacked_online_tracks` or internal track-prep RED tests

**Objective:** Safely duplicate sequence and add target tracks before placement.

**Decision point:** This may be an internal step of `create_stacked_online_conform_sequence` rather than a public tool. Prefer internal unless separate manual use is valuable.

**RED tests:**

- Duplicate sequence is called by default.
- Adds exactly required online video tracks.
- Does not delete, replace, or remove offline clips.
- Rejects unsafe passthrough strategy unless explicitly handled.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`
- Modify: `src/tools/index.ts`

### Task 18: Implement track prep live-safe behavior

**Objective:** Duplicate sequence and add upper tracks with readback verification.

**Implementation requirements:**

- Never mutate original sequence unless mode explicitly says existing duplicate.
- After duplicate, read back track count.
- After each added track, verify new track count/index.
- Return target mapping.
- If Premiere only appends tracks at top, document and encode this behavior.

**Live probe requirement:** Confirm whether `add_track` appends above all tracks, can insert in middle, and how indices map to V1/V2/etc.

### Task 19: Add `create_stacked_online_conform_sequence` RED tests for safe refusal

**Objective:** Execution tool refuses unsafe plans before any mutation.

**RED tests:**

- Catalog includes `create_stacked_online_conform_sequence`.
- Requires `sequenceId`.
- Refuses ambiguous matches by default.
- Refuses missing handles by default.
- Refuses plans with unsupported critical effects if policy is strict.
- Does not call duplicate/add/placement scripts when preflight fails.

**Command:**

- `npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='create_stacked_online_conform_sequence|unsafe conform'`

### Task 20: Implement safe refusal path for execution tool

**Objective:** Add public execution tool that can validate but not yet place clips.

**Files:**

- Modify: `src/tools/index.ts`
- Modify: `PREMIERE_TOOL_COVERAGE.md`

**Implementation requirements:**

- Schema includes allow flags.
- Starts with analysis plan/preflight.
- If unsafe, return structured refusal with no mutation.
- Tests verify no bridge mutation call on unsafe input.

### Task 21: Add placement RED tests for execution tool

**Objective:** Verify the happy path places online clips above offline and captures new clip IDs.

**RED tests:**

- Given safe plan with one clip, generated script/bridge path calls duplicate sequence, adds target track, places project item at timeline start.
- Uses `add_to_timeline`-style placement and captures `placedClip.nodeId`.
- Applies source in/out after placement using Time objects.
- Does not remove or replace offline clip.
- Preflights target track occupancy before overwrite.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`

### Task 22: Implement minimal one-clip placement GREEN

**Objective:** Execute a safe one-clip stacked conform with source timing and no effect copy yet.

**Implementation requirements:**

- Duplicate sequence.
- Add online target track.
- Place online project item at offline timeline start.
- Set online clip source in/out/duration.
- Return `placedOnlineClipId`.
- Verify resulting duration equals offline clip duration.
- Leave offline clip untouched.

**Commands:**

- Focused test command from Task 21.
- `npm run build`.

### Task 23: Live smoke one-clip stacked placement

**Objective:** Prove live placement works in Premiere on scratch media.

**Pass criteria:**

- New conform sequence exists.
- Offline proxy clip remains on lower track.
- Online/color clip appears on upper track at same timeline start/end.
- Online source in/out match dry-run math.
- No offline clip removed/replaced.

**Command pattern:**

- Use built tools with real bridge and `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.
- Save JSON result to scratch output for review.

### Task 24: Add effect copy snapshot tests

**Objective:** Define a stable serializable effect snapshot format.

**Files:**

- Create: `src/tools/conform/effectSnapshot.ts`
- Create: `src/__tests__/tools/conform/effectSnapshot.test.ts`

**RED tests:**

- Motion/Opacity built-ins normalize into known selectors.
- Duplicate display names require property index/matchName disambiguation.
- Unsupported/custom UI parameters are preserved as report entries, not silently skipped.
- Keyframed property reports keyframe count and needs bulk copy.

### Task 25: Add `copy_clip_effect_stack_for_conform` RED tests

**Objective:** Define effect copy contract from source clip to target clip.

**RED tests:**

- Catalog includes tool.
- Requires source/target clip IDs and sequence ID.
- Copies Motion Scale/Position/Anchor/Rotation and Opacity via batch helper.
- Converts scale/anchor based on raster policy.
- Reports unsupported effect properties.
- Does not mutate when `mode:'reportOnly'`.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`

### Task 26: Implement Motion/Opacity-only effect copy

**Objective:** First useful effect preservation slice.

**Implementation requirements:**

- Read source effects/properties.
- Compute converted Motion/Opacity values.
- Apply with `batch_set_clip_properties`-equivalent logic or shared helper.
- Read back target properties and report verification.
- Do not attempt arbitrary effect stack cloning yet.

**Live smoke:**

- Offline proxy: scale 100, position offset, opacity 75.
- Online 2x raster should get scale 50, same position, opacity 75.
- Export/check/readback property values.

### Task 27: Integrate Motion/Opacity copy into execution tool

**Objective:** Stacked conform places online clips and applies first-pass visual state.

**RED tests:**

- Execution result includes effect copy result per clip.
- If effect copy fails in strict mode, execution marks clip as failed/needs review.
- In permissive mode, placement remains but warnings are returned.

**Commands:**

- Focused tests.
- Full tests.
- Live one-clip smoke with Motion/Opacity.

### Task 28: Add keyframe bulk copy plan and tests

**Objective:** Preserve basic keyframed Motion/Opacity values.

**Files:**

- Modify/create: `src/tools/conform/keyframes.ts`
- Test: `src/__tests__/tools/conform/keyframes.test.ts`
- Modify: `src/tools/index.ts` if adding sequence-aware keyframe helpers.

**RED tests:**

- Converts keyframe times relative to clip/timeline correctly.
- Converts scale/anchor values per raster policy at every keyframe.
- Rejects unsupported interpolation copying honestly.
- Adds `sequenceId` support to keyframe operations.

**Implementation caution:** Existing keyframe tools are primitive and may not preserve interpolation. Mark interpolation unsupported until live-verified.

### Task 29: Implement keyframed Motion/Opacity copy

**Objective:** Support common edit effects like push-ins/reframes.

**Implementation requirements:**

- Add/read keyframes with sequence-scoped clip lookup.
- Copy values after conversion.
- Read back keyframe count/values.
- Report interpolation limitations.

**Live smoke:** Scratch offline clip with two scale/position keyframes; conform online clip; verify readback keyframes.

### Task 30: Add arbitrary effect stack copy as conditional capability

**Objective:** Extend beyond built-ins without overclaiming.

**RED tests:**

- Applies known effect by match/display name when target lacks it.
- Sets static scriptable parameters.
- Reports parameters that cannot be set/read back.
- Does not fail whole conform in permissive mode.

**Implementation scope:** Start with common effects only after live probes: Crop, Transform, Lumetri static values if exposed. Do not claim full plugin support.

### Task 31: Handle passthrough/graphics/adjustment tracks

**Objective:** Preserve visual stack when titles/graphics/adjustment layers exist.

**Design options to implement in order:**

1. `reportOnly`: detect passthrough tracks and require user/manual confirmation.
2. `leaveInPlace`: allowed only if online tracks can be inserted below passthrough tracks.
3. `duplicateAboveOnline`: duplicate passthrough items above online stack if insertion is unavailable and duplication APIs are reliable.

**Tests:**

- Passthrough above picture makes plan unsafe under strict policy.
- Explicit `duplicateAboveOnline` creates planned copies and warns if unsupported.

**Live smoke:** Use a title/adjustment layer track above V1 and verify it remains visible above online picture.

### Task 32: Add audio policy handling

**Objective:** Avoid wrecking editorial audio while optionally stacking online audio.

**Default:** `keepOfflineOnly`.

**Tests:**

- Default plan does not place online audio.
- `stackOnlineMuted` adds audio target tracks and mutes/labels them if supported.
- Linked audio from `add_to_timeline` is suppressed when `linkAudio:false` for online picture-only conform.

**Live smoke:** Ensure online video placement does not overwrite existing offline audio.

### Task 33: Add `qc_stacked_online_conform` RED tests

**Objective:** Define a QC reporting tool.

**RED tests:**

- Catalog includes `qc_stacked_online_conform`.
- Requires conform sequence ID and report/plan.
- Produces summary even with frame export disabled.
- Exports frame samples to a contained output path when enabled.
- Rejects unsafe output paths/symlinks using existing path containment patterns.

**Files:**

- Modify: `src/__tests__/tools/index.test.ts`
- Possibly reuse `src/utils/security.ts`.

### Task 34: Implement QC report without image comparison

**Objective:** First QC slice: structural verification and optional frame exports.

**Checks:**

- Every matched plan has placed online clip ID.
- Timeline start/end matches offline.
- Source in/out matches calculated plan.
- Target track correct.
- Missing/ambiguous/unsupported lists preserved.
- Optional representative frame exports.

**Commands:**

- Focused tests.
- Live smoke on one-clip conform.

### Task 35: Add optional visual/geometry QC

**Objective:** Provide practical visual review artifacts.

**Possible outputs:**

- Contact sheet of online-visible frames.
- Contact sheet of offline reference frames if track toggling/visibility is supported.
- Side-by-side review sequence or exported stills if non-destructive toggling is unreliable.

**Important:** Do not overclaim automatic image match because online/color files differ visually. Geometry checks should compare framing/edges where feasible, not color identity.

### Task 36: FCP XML fallback/research spike

**Objective:** Evaluate whether XML export/import should be an alternate backend for full-sequence rebuild.

**Scope:** Throwaway spike only; if code is written, discard and restart with TDD for production.

**Questions:**

- Does `export_as_fcp_xml` preserve enough Motion/effect/keyframe data?
- Are reel/source timecodes represented cleanly?
- Can an XML rewrite stack online tracks above offline while preserving passthrough layers?
- Does Premiere import rewritten FCP7 XML without prompting or losing effects?

**Outcome:** Decision doc: DOM-first, XML-first, or hybrid. Do not block core stacked DOM conform unless XML proves clearly superior.

### Task 37: End-to-end fixture/live test harness

**Objective:** Make conform testing repeatable.

**Files:**

- Create: `scripts/create-conform-fixtures.sh` or `scripts/create-conform-fixtures.mjs` if appropriate.
- Create: `docs/conform-test-fixtures.md`.

**Fixture requirements:**

- Generated proxy and online clips with known raster differences.
- Known frame rate and timecode metadata if possible.
- One full-length online match.
- One trimmed online match.
- One missing-head-handle case.
- One ambiguous filename-only case.
- One Motion/Opacity static case.
- One keyframed Motion case.

**Caution:** This script may depend on `ffmpeg`; tests should skip live fixture generation gracefully if unavailable.

### Task 38: Full integration smoke: safe dry run

**Objective:** Run analyzer on fixture project and verify report.

**Expected:**

- matched count correct.
- ambiguous/missing handle cases correct.
- target tracks correct.
- transform conversion plan correct.
- `safeToExecute:false` when fixture includes intentional failures.

### Task 39: Full integration smoke: execute safe subset

**Objective:** Execute conform only for safe fixture clips.

**Expected:**

- conform sequence duplicated/created.
- offline clips remain underneath.
- online clips appear above.
- source timing correct.
- Motion/Opacity copied/converted.
- keyframes copied if that milestone is complete.
- QC report generated.

### Task 40: Documentation and coverage update

**Objective:** Make the feature understandable and capability-honest.

**Files:**

- Modify: `PREMIERE_TOOL_COVERAGE.md`
- Modify/create: `docs/stacked-online-conform.md`
- Optional: `README.md` section if project maintains user-facing tool docs.

**Docs must include:**

- Stacked workflow overview.
- Dry-run first requirement.
- Required metadata for robust matching.
- Track role configuration.
- Known limitations: time remap, arbitrary plugins, passthrough/adjustment layers, mixed FPS, drop-frame TC if unresolved.
- Example prompt/user flow.
- Live smoke status.

### Task 41: Final verification gate

**Objective:** Prove the completed slice is stable.

**Commands:**

```bash
npm run build
npm test -- --runInBand
git diff --check
node --input-type=module - <<'NODE'
import { PremiereProTools } from './dist/tools/index.js';
const mockBridge = { executeScript: async () => ({ success: true }), executeCommand: async () => ({ success: true }) };
const tools = new PremiereProTools(mockBridge);
const list = await tools.getToolList();
console.log(JSON.stringify({ count: list.length, names: list.map(t => t.name).filter(n => n.includes('conform')) }, null, 2));
NODE
```

Expected:

- Build passes.
- All Jest tests pass.
- Diff check passes.
- Runtime catalog count matches `PREMIERE_TOOL_COVERAGE.md`.
- Conform tools appear in runtime tool list.

### Task 42: Independent review

**Objective:** Get an independent code/design review before calling the feature production-ready.

**Review prompt should include:**

- User workflow: online stacked above offline, not replacement.
- Dry-run safety requirement.
- Timecode/reel matching logic.
- Transform conversion assumptions.
- Live smoke results.
- Known unsupported/conditional features.
- Exact verification commands and outputs.

**Pass criteria:** Review returns `APPROVED` or all `REQUEST_CHANGES` blockers are fixed with tests.

---

## 4. Suggested Milestone Boundaries

### Milestone A: Read-only conform intelligence

Deliver:

- `scan_conform_media_metadata`
- `snapshot_sequence_for_conform`
- `analyze_stacked_online_conform`
- Pure helpers for timecode, matching, track planning, transform planning.

Definition of done:

- Dry-run can report a whole timeline plan.
- No mutation tools yet except existing primitives.
- Live smoke proves read-only analysis does not change sequence.

### Milestone B: Minimal stacked placement

Deliver:

- `create_stacked_online_conform_sequence` safe refusal + one-clip/multi-clip placement.
- Duplicate sequence, add online tracks, place online clips above offline, set source in/out.
- No effect copying beyond maybe basic Motion static values.

Definition of done:

- One scratch conform creates an online upper track and leaves offline underneath.
- Missing handles and ambiguities refuse by default.

### Milestone C: Visual preservation v1

Deliver:

- Motion/Opacity static copy.
- Resolution-aware Scale/Anchor conversion.
- Position/Rotation/Opacity copy.
- Readback verification.

Definition of done:

- 2x online raster visually matches proxy framing for simple static transforms.

### Milestone D: Visual preservation v2

Deliver:

- Motion/Opacity keyframes.
- Crop/Transform/Lumetri static properties if live-verified.
- Unsupported effect reporting.

Definition of done:

- Common editorial reframes and opacity fades survive conform.
- Unsupported features are clearly listed, not silently dropped.

### Milestone E: QC and production workflow

Deliver:

- `qc_stacked_online_conform`
- frame/contact-sheet export support
- docs and operator workflow
- end-to-end live fixture smoke

Definition of done:

- Tool can produce a reviewable conform report and visual QC artifacts for a test sequence.

---

## 5. Testing Matrix

### Pure unit tests

- `src/__tests__/tools/conform/timecode.test.ts`
- `src/__tests__/tools/conform/sourceRange.test.ts`
- `src/__tests__/tools/conform/matching.test.ts`
- `src/__tests__/tools/conform/trackPlan.test.ts`
- `src/__tests__/tools/conform/transformConversion.test.ts`
- `src/__tests__/tools/conform/effectSnapshot.test.ts`
- `src/__tests__/tools/conform/analyze.test.ts`

### Tool contract tests

- `src/__tests__/tools/index.test.ts`
  - catalog exposure
  - schema validation
  - dispatcher routing
  - script shape/safety
  - safe refusal before mutation
  - JSON serialization
  - `sequenceId` scoping

### Live smoke tests

Use:

```bash
PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge node --input-type=module <scratch script>
```

Live smokes should cover:

1. metadata scan on imported media.
2. sequence snapshot on scratch timeline.
3. dry-run analysis with no mutation.
4. one-clip stacked placement.
5. multi-track stacked placement.
6. source timing for trimmed online media.
7. Motion/Opacity conversion/readback.
8. keyframe copy/readback if implemented.
9. QC frame export if available.

### Full gate

Run after each milestone:

```bash
npm run build
npm test -- --runInBand
git diff --check
```

Also verify runtime tool count and coverage docs after adding public tools.

---

## 6. Risks and Open Questions

### Premiere metadata exposure

Open question: Does Premiere’s DOM expose reliable reel/tape/source start TC for all imported media, or do we need XML/XMP parsing fallback?

Mitigation:

- Build `scan_conform_media_metadata` as diagnostic first.
- Do live probes before execution depends on a field.
- If missing, add XML/XMP fallback as its own TDD slice.

### Track insertion behavior

Open question: Can Premiere insert tracks below passthrough/title tracks, or only append at top?

Mitigation:

- Live-probe `add_track` behavior.
- Keep explicit `trackRoles` and `passthroughPolicy`.
- Start with report-only passthrough handling if insertion/duplication is not verified.

### Effect stack cloning

Open question: Which effects expose scriptable parameters and can be applied by matchName/displayName?

Mitigation:

- Start with built-in Motion/Opacity.
- Add effects incrementally after live probes.
- Always return unsupported reports.

### Time remapping and speed ramps

Current fact: live Premiere 2026 did not expose Time Remapping as a normal writable component on the scratch clip. The existing `set_clip_time_remap_settings` returns honest unsupported diagnostics when not exposed.

Mitigation:

- Treat time remap as conditional/unsupported in conform v1.
- Preserve/report speed settings where supported.
- Do not claim exact speed-ramp conform until live-verified.

### Mixed frame rates/drop-frame timecode

Risk: TC math can drift if implemented with floats or naive fps.

Mitigation:

- Use integer frame math and rational frame rates.
- Add explicit tests for 23.976/29.97 and drop-frame notation.
- Strictly warn/reject mixed frame rates until policy is specified.

### Online/offline aspect mismatch

Risk: Scaling formula only works for matching aspect and pixel aspect.

Mitigation:

- Strict mode rejects aspect mismatch.
- Add report-only transform plan first.
- Require user policy for crop/fill/letterbox handling.

### Audio handling

Risk: Online video placement can bring linked audio and overwrite/mess with offline mix.

Mitigation:

- Default `audioPolicy:'keepOfflineOnly'` and `linkAudio:false` for online picture placement.
- Live smoke that offline audio remains intact.

---

## 7. Operator Workflow Once Built

Expected user-level flow:

1. User provides/open Premiere project with offline sequence and online/color bin.
2. Run `analyze_stacked_online_conform`.
3. Review report:
   - matched/unmatched/ambiguous/missing handles
   - track plan
   - transform/effect limitations
4. If clean, run `create_stacked_online_conform_sequence`.
5. Run `qc_stacked_online_conform`.
6. Review online clips stacked above offline reference.
7. Fix ambiguous/missing clips manually or rerun with adjusted match rules.

Example natural-language prompt once implemented:

> Analyze sequence `Offline_v12` against bin `Color_Returns_A001_A003`. Stack online clips above offline picture tracks, keep offline audio, use reel/timecode matching, report filename-only matches as unsafe, convert Motion scale for 3840 online to 1920 sequence, and do not execute until I approve the dry-run.

---

## 8. Recommended First Build Order

Start with Milestone A. Do not begin execution tools until the dry-run analyzer is excellent.

1. Timecode/source range helpers.
2. Matching confidence engine.
3. Track planner.
4. Transform conversion planner.
5. `scan_conform_media_metadata` read-only tool.
6. `snapshot_sequence_for_conform` read-only tool.
7. `analyze_stacked_online_conform` dry-run tool.
8. Live dry-run smoke.
9. Only then build `create_stacked_online_conform_sequence`.

This avoids the worst failure mode: a tool that confidently edits a timeline before it can prove it understands the media and timeline.
