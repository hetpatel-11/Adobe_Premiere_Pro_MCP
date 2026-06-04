# Stacked Online Conform Executable Roadmap

> **For Hermes:** Execute this with TDD and subagent review gates. Public tools must be safe for Premiere projects: dry-run first, duplicate before mutation, and stack online media above offline clips without replacing the offline edit.

**Goal:** Implement a complete Adobe Premiere Pro MCP stacked online conform workflow: scan media/sequence metadata, analyze offline-to-online matches, create a duplicated stacked conform sequence, copy supported Motion/Opacity state, and produce QC reports.

**Architecture:** Pure TypeScript conform helpers perform deterministic frame/timecode math, matching, track planning, transform conversion, and QC planning. `src/tools/index.ts` exposes public MCP tools and builds guarded ExtendScript bridge scripts for read-only scans and live-safe sequence mutations. Execution starts from an explicit reviewed placement plan and refuses unsafe plans by default.

**Tech Stack:** TypeScript, Jest, Zod, Premiere ExtendScript bridge, existing MCP tool catalog in `src/tools/index.ts`.

---

## Ground Rules

- Online clips are stacked on upper video tracks; offline/proxy clips remain underneath and are never removed or replaced.
- Analyzer tools are read-only and must report `mutationPlanned: false`.
- Execution defaults to duplicate the source sequence; original sequence mutation is not allowed unless explicitly requested by mode and still preflighted.
- Reel/timecode matching is preferred; filename-only matching is diagnostic unless policy allows it.
- Frame/timecode math uses integer frames once frame rate is known.
- Motion/Opacity copy starts with known scriptable built-ins. Unsupported effects are reported, not silently claimed.
- Live Premiere smoke tests must use scratch media/sequences where possible.
- Current live bridge state before implementation: bridge installed but round-trip timed out with stale command files. Final live smoke is blocked until the CEP bridge panel is open/running.

---

## Slice 1 — Scan Primitives

**Objective:** Add the data model, timecode/source-range helpers, read-only media metadata scan, and sequence conform snapshot.

**Files:**
- Create: `src/tools/conform/types.ts`
- Create: `src/tools/conform/timecode.ts`
- Create: `src/tools/conform/sourceRange.ts`
- Modify: `src/tools/index.ts`
- Create tests: `src/__tests__/tools/conform/timecode.test.ts`
- Create tests: `src/__tests__/tools/conform/sourceRange.test.ts`
- Modify tests: `src/__tests__/tools/index.test.ts`

**TDD tasks:**
1. RED: timecode parse/format tests for 24, 23.976 rational metadata, malformed values, and drop-frame diagnostics.
2. GREEN: implement integer frame timecode helpers.
3. RED: source-range containment/missing-handle tests.
4. GREEN: implement source range math.
5. RED: catalog/schema/dispatcher/script-shape tests for `scan_conform_media_metadata` and `snapshot_sequence_for_conform`.
6. GREEN: implement read-only ExtendScript-backed scan/snapshot tools.

**Verification:**
```bash
npm test -- src/__tests__/tools/conform/timecode.test.ts --runInBand
npm test -- src/__tests__/tools/conform/sourceRange.test.ts --runInBand
npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='scan_conform_media_metadata|snapshot_sequence_for_conform|current tool catalog'
npm run build
```

---

## Slice 2 — Dry-Run Analyzer

**Objective:** Build deterministic match/confidence/handle/track/transform planning and expose `analyze_stacked_online_conform`.

**Files:**
- Create: `src/tools/conform/matching.ts`
- Create: `src/tools/conform/trackPlan.ts`
- Create: `src/tools/conform/transformConversion.ts`
- Create: `src/tools/conform/analyze.ts`
- Modify: `src/tools/index.ts`
- Create tests under `src/__tests__/tools/conform/`
- Modify: `src/__tests__/tools/index.test.ts`

**TDD tasks:**
1. RED/GREEN: match scoring tests for reel+timecode, filename fallback, ambiguity, missing handles.
2. RED/GREEN: track planner tests for target upper tracks and passthrough warnings.
3. RED/GREEN: transform conversion tests for Motion Scale/Position/Anchor/Rotation/Opacity.
4. RED/GREEN: analyzer composition tests with safe/unsafe summaries.
5. RED/GREEN: MCP tool catalog/schema/dispatcher tests.

**Verification:**
```bash
npm test -- src/__tests__/tools/conform --runInBand
npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='analyze_stacked_online_conform|current tool catalog'
npm run build
```

---

## Slice 3 — Stacked Sequence Executor

**Objective:** Expose `create_stacked_online_conform_sequence` to duplicate a sequence, add online tracks, place online media, set source timing, and refuse unsafe plans by default.

**Files:**
- Modify: `src/tools/index.ts`
- Modify/create: `src/tools/conform/executionPlan.ts`
- Modify: `src/__tests__/tools/index.test.ts`

**TDD tasks:**
1. RED: unsafe plan refuses before bridge mutation.
2. GREEN: preflight/refusal implementation.
3. RED: safe dry-run returns planned operations without mutation.
4. GREEN: dry-run planner.
5. RED: safe execution script shape duplicates sequence, adds tracks, inserts online clips above offline, applies source in/out, and never calls replace/remove.
6. GREEN: minimal execution script.

**Verification:**
```bash
npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='create_stacked_online_conform_sequence|stacked conform execution|current tool catalog'
npm run build
```

---

## Slice 4 — Effect/Transform Copy

**Objective:** Expose `copy_conform_clip_effects` with resolution-aware Motion/Opacity copying and unsupported reporting.

**Files:**
- Create/modify: `src/tools/conform/effects.ts`
- Modify: `src/tools/conform/transformConversion.ts`
- Modify: `src/tools/index.ts`
- Create/modify tests under `src/__tests__/tools/conform/`
- Modify: `src/__tests__/tools/index.test.ts`

**TDD tasks:**
1. RED/GREEN: normalize effect snapshots and duplicate property selectors.
2. RED/GREEN: effect-copy policy tests for report-only/copy/resolution-aware.
3. RED/GREEN: MCP tool schema/dispatcher/script-shape tests.
4. Integrate Motion/Opacity copy result into execution reports when requested.

**Verification:**
```bash
npm test -- src/__tests__/tools/conform/effects.test.ts --runInBand
npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='copy_conform_clip_effects|current tool catalog'
npm run build
```

---

## Slice 5 — QC Reporting

**Objective:** Expose `qc_stacked_online_conform` for structural QC and optional frame-export planning/live execution.

**Files:**
- Create: `src/tools/conform/qc.ts`
- Modify: `src/tools/index.ts`
- Create tests: `src/__tests__/tools/conform/qc.test.ts`
- Modify: `src/__tests__/tools/index.test.ts`

**TDD tasks:**
1. RED/GREEN: pure QC summary identifies missing placements, timing drift, wrong tracks, unsupported effects, and sample frames.
2. RED/GREEN: output path containment/rejection where frame export is enabled.
3. RED/GREEN: MCP tool schema/dispatcher/script-shape tests.

**Verification:**
```bash
npm test -- src/__tests__/tools/conform/qc.test.ts --runInBand
npm test -- src/__tests__/tools/index.test.ts --runInBand --testNamePattern='qc_stacked_online_conform|current tool catalog'
npm run build
```

---

## Review Gates

After implementation slices, run subagent reviews with:

1. **Spec compliance review:** Verify stacked semantics, dry-run safety, sequence duplication, no replace/remove behavior, frame/timecode math, and honest unsupported reporting.
2. **Code quality review:** Verify TypeScript/Zod quality, schema strictness, script escaping, test coverage, maintainability, and no accidental broad mutation.

Fix all blockers before final verification.

---

## Final Verification

```bash
npm run build
npm test -- --runInBand
git diff --check
node --input-type=module - <<'NODE'
import { PremiereProTools } from './dist/tools/index.js';
const mockBridge = { executeScript: async () => ({ success: true }), executeCommand: async () => ({ success: true }) };
const tools = new PremiereProTools(mockBridge);
const names = tools.getAvailableTools().map((tool) => tool.name).filter((name) => name.includes('conform'));
console.log(JSON.stringify({ names }, null, 2));
NODE
```

Live Premiere smoke requirements:
- `bridge_health_report` passes with round-trip success.
- Read-only media scan/snapshot on scratch project succeeds.
- Analyzer dry-run returns no mutation and expected match report.
- Execution dry-run returns operations only.
- Safe one-clip execution creates duplicated conform sequence with online on upper track and offline still underneath.
- Effect copy readback verifies supported Motion/Opacity values or reports limitations.
- QC returns structural report and optional frame export plan/result.

If live bridge remains unavailable, report that honestly as the only blocker rather than claiming live validation.
