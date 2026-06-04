# Timeline Cleanup Executable Roadmap

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build Premiere MCP tools that safely clean and organize messy timelines while preserving visual/audio output.

**Architecture:** Timeline cleanup is a conservative audit-and-duplicate workflow, not a delete pass. The MCP first snapshots a sequence into dependency-aware cleanup records, then produces a dry-run classification report, then duplicates the sequence and applies only actions proven safe. Any clip/track with masks, mattes, blend modes, adjustment behavior, unsupported effects, nesting, opacity/keyframe uncertainty, or visual ambiguity is preserved and reported.

**Tech Stack:** TypeScript MCP server, Zod tool schemas, Jest tests, Premiere ExtendScript bridge, safe live smoke via scratch projects.

---

## Non-negotiable safety rules

1. The original sequence must never be mutated by cleanup execution.
2. Dry-run analysis must exist before any mutation-capable tool.
3. The executor must duplicate first and operate on the duplicate only.
4. Removal is prove-safe-or-preserve. Uncertainty means `manual_review` or `preserve_visual_dependency`, never deletion.
5. A clip being disabled, muted, hidden under upper clips, or on a messy track is not enough proof that it is removable.
6. Potential mattes, track mattes, masks, blend modes, adjustment layers, nests, graphics with alpha, opacity/keyframes, unsupported effects, and unknown component properties must be preserved.
7. Track reorganization must preserve compositing order and track-index dependencies. If track references cannot be proven stable, do not move clips/tracks.
8. QC must compare before/after structure and planned/exported representative frames before reporting live cleanup success.

## Tool suite

- `scan_timeline_cleanup_state`: read-only sequence audit. Produces normalized tracks, clips, dependency hints, risky feature flags, and cleanup roles.
- `analyze_timeline_cleanup`: read-only dry-run classifier. Returns per-clip/per-track categories: `safe_remove`, `safe_reorganize`, `preserve_visual_dependency`, `manual_review`, `unsupported`.
- `create_clean_timeline_sequence`: mutation-capable executor. Defaults to dry-run, validates an analysis plan, duplicates the sequence, and applies only safe actions.
- `qc_timeline_cleanup`: QC planner/executor. Plans before/after frame exports and structural checks for cleanup results.

## Cleanup modes

- `conservative` (default): remove only empty tracks and no-op gaps/items that are provably harmless; preserve disabled clips by default.
- `visual_noop`: may remove disabled clips and fully covered opaque no-op clips only when dependency analysis proves no visual/audio contribution.
- `organize_only`: no deletions; only reports or performs safe track naming/grouping/reorganization where order is unchanged.

## Task 1: Core types and scanner tests

**Objective:** Create cleanup type definitions and RED tests for read-only scanning/catalog exposure.

**Files:**
- Create: `src/tools/timelineCleanup/types.ts`
- Create: `src/tools/timelineCleanup/analyze.ts`
- Create: `src/tools/timelineCleanup/executionPlan.ts`
- Create: `src/tools/timelineCleanup/qc.ts`
- Create: `src/__tests__/tools/timelineCleanup/analyze.test.ts`
- Create: `src/__tests__/tools/timelineCleanup/executionPlan.test.ts`
- Create: `src/__tests__/tools/timelineCleanup/qc.test.ts`
- Modify: `src/tools/index.ts`
- Modify: `src/__tests__/tools/index.test.ts`

**Tests first:**
- Tool catalog includes all four cleanup tools.
- Dispatcher routes all four tools.
- Scan schema requires `sequenceId` and accepts explicit options.
- Scan/snapshot script is read-only and contains no remove/delete/move calls.

## Task 2: Implement `scan_timeline_cleanup_state`

**Objective:** Add a bridge-backed scanner that snapshots track/clip/effect features needed for safe cleanup classification.

**Requirements:**
- Required `sequenceId`; no silent active-sequence fallback.
- Include disabled clips by default.
- Return video/audio tracks, clips, components/effects, opacity/blend/motion/mask hints, nesting hints, adjustment/title/graphic role hints, track enabled/locked/muted/visibility where scriptable, and warnings for unsupported inspection gaps.
- No mutation calls in generated ExtendScript.

**Verification:**
- Focused Jest tests pass.
- Script-shape tests prove read-only behavior.

## Task 3: Implement `analyze_timeline_cleanup`

**Objective:** Build pure TypeScript cleanup classification from a supplied or live scanner snapshot.

**Requirements:**
- Accept either `cleanupSnapshot` or `sequenceId`.
- Classify every clip and track.
- Default mode is `conservative`.
- Disabled clips are preserved by default.
- Covered lower clips are not removable when upper clips have alpha/masks/opacity/blend/motion/effects/keyframes/unknowns.
- Matte/effect/adjustment/nest/title/graphic uncertainty preserves.
- Empty tracks can be `safe_remove` only if no track-index dependency warning exists.
- Return action plan, blockers, manual review list, and summary counts.

**Verification:**
- Synthetic tests for empty tracks, disabled clips, full-cover no-op candidates, masks, mattes, adjustment layers, nests, graphics, opacity/blend/keyframes, unsupported effects.

## Task 4: Implement `create_clean_timeline_sequence`

**Objective:** Add execution-plan validation and a bridge-backed executor that duplicates first and applies only safe actions.

**Requirements:**
- Defaults `dryRun: true`.
- Rejects plans without a matching `analysisId`/source sequence.
- Rejects mutation of source sequence.
- Rejects unsafe/manual/unsupported actions.
- Live execution script duplicates first, then removes only plan-approved clips/tracks on the duplicate.
- No clip movement/reorganization unless the plan says `safe_reorganize` and order/dependency preservation is explicit.

**Verification:**
- Execution-plan tests for rejecting unsafe actions.
- Script-shape tests: duplicate before remove, no source mutation, dry-run has no bridge call.

## Task 5: Implement `qc_timeline_cleanup`

**Objective:** Add QC plan/report generation for before/after structural and frame-export validation.

**Requirements:**
- Defaults `dryRun: true`.
- Requires `allowedOutputRoot` for live exports.
- Symlink-aware output containment.
- Plans samples at boundaries, midpoints, keyframe-risk times, adjustment/matte spans, and user offsets.
- Reports structural drift: removed unsafe clip, track count drift not in plan, missing preserved clip, action mismatch, unsupported items.
- Live execution must restore visibility/state honestly or report restore failures.

**Verification:**
- QC unit tests for containment, samples, structural drift, and unresolved comparisons.

## Task 6: Docs/catalog/build gates

**Objective:** Keep docs and runtime catalog honest.

**Requirements:**
- Update `PREMIERE_TOOL_COVERAGE.md` with timeline-cleanup tools and status labels.
- Build with `npm run build`.
- Run focused cleanup tests.
- Run existing conform tests to avoid regression.
- Run full `npm test` if feasible.
- Run `git diff --check`.

## Task 7: Review gates

**Objective:** Run independent reviews and fix blockers.

**Reviews:**
- Spec review: verify prove-safe-or-preserve semantics and non-destructive execution.
- Code quality review: schema validation, script safety, TypeScript correctness, test coverage, no source sequence mutation.

## Task 8: Live Premiere scratch smoke

**Objective:** Verify the tools against Premiere without touching user projects.

**Smoke:**
- Verify bridge connection.
- Create/open scratch project/sequence.
- Run scan and dry-run analysis on empty/simple timeline.
- Run create-clean in dry-run.
- If safe scratch media setup is available, execute on duplicate and run QC dry-run/live frame planning.
- Report any unsupported host limitations honestly.

## Acceptance criteria

- All four tools are in the runtime catalog.
- Scanner and analyzer are useful without mutation.
- Executor cannot mutate the source sequence and defaults to dry-run.
- Unsafe/matte/mask/adjustment/nest/unknown dependencies are preserved.
- Tests and reviews pass.
- Live Premiere safe smoke succeeds or reports a true host blocker.
