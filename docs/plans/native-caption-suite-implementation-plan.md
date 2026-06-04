# Native Adobe Caption Suite Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a full Premiere MCP caption suite centered on Adobe/Premiere-native transcript and caption workflows, with no third-party STT providers.

**Architecture:** Add tested sidecar caption utilities for SRT/VTT/CSV/JSON parsing, formatting, QC, search, and export. Add MCP tools that use those utilities plus existing Premiere caption read/import primitives. Add native transcription/caption-generation tools as capability-honest ExtendScript probes/actions: they attempt only Adobe/Premiere-exposed APIs and return `supported:false` with diagnostics when the host does not expose scriptable speech-to-text controls.

**Tech Stack:** TypeScript, Jest, zod schemas, Node fs/promises, Premiere CEP/ExtendScript bridge.

**Implementation status (2026-06-03):** Tasks 1-5 are implemented and unit/build validated. Post-review regressions are covered for named IIFE bridge returns, honest native capability flags, unsupported sidecar formats, overwrite safety, CSV quoting/newlines, sequence readback failures, `read_sequence_captions` non-fabrication, and `create_caption_track` script string safety. Live Premiere validation remains blocked unless the CEP panel becomes responsive or the user approves a Premiere restart.

---

## Scope rules

- No Whisper, OpenAI, external STT, or third-party transcription integrations in this slice.
- Sidecar caption processing is allowed: SRT/VTT/CSV/JSON parsing/serialization, QC, formatting, export.
- Native transcription is Adobe/Premiere-only and must be honest: probe first, mutate only when a known scriptable native method exists.
- If Premiere’s UI feature is not scriptable through ExtendScript/QE/CEP on the current host, tools must report `supported:false`; never fake transcript/caption generation.
- Do not restart or force-quit Premiere during live checks unless the user explicitly authorizes it.

---

## Task 1: Add pure caption sidecar model, parser, serializer, formatter, QC, and search helpers

**Objective:** Create a tested `src/tools/captions/sidecar.ts` utility module that does not call Premiere.

**Files:**
- Create: `src/tools/captions/sidecar.ts`
- Create: `src/__tests__/tools/captions/sidecar.test.ts`

**TDD steps:**
1. Write RED tests for:
   - parsing SRT with indexes, multiline text, and comma milliseconds
   - parsing WebVTT with `WEBVTT` header and dot milliseconds
   - serializing SRT/VTT/CSV/JSON
   - formatting/wrapping caption lines to max chars and max lines
   - QC findings: overlap, empty text, too-fast CPS, too-long line, too-many lines, out-of-bounds, banned term
   - literal and regex caption search with context
2. Run: `npm test -- --runInBand src/__tests__/tools/captions/sidecar.test.ts`
   - Expected RED: missing module / functions.
3. Implement minimal utility functions and exported types.
4. Run the same test to GREEN.
5. Run: `npm run build`.

**Acceptance:** Pure utilities pass focused tests and build without Premiere.

---

## Task 2: Add MCP tool schemas/catalog entries for caption suite

**Objective:** Expose the caption suite tools in `getAvailableTools()` without implementation regressions.

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `src/__tests__/tools/index.test.ts`

**Tools to expose:**
- `probe_native_transcription_capabilities`
- `generate_sequence_transcript`
- `generate_captions_from_premiere_transcript`
- `format_captions`
- `qc_captions`
- `search_captions`
- `export_captions`
- `import_captions_to_sequence`

**TDD steps:**
1. Write RED catalog test expecting all names above.
2. Run focused catalog test and verify failure.
3. Add zod schemas with range/finite checks.
4. Run focused catalog test to GREEN.
5. Run: `npm run build`.

**Acceptance:** Tool catalog exposes all requested caption capabilities with honest descriptions.

---

## Task 3: Implement sidecar-backed MCP tools

**Objective:** Implement `format_captions`, `qc_captions`, `search_captions`, and `export_captions` using sidecar utilities and existing `readSequenceCaptions` when sequence data is requested.

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `src/__tests__/tools/index.test.ts`

**TDD steps:**
1. Write RED tests for:
   - `export_captions` serializes caller-provided captions to SRT and writes output path
   - `export_captions` calls bridge-backed read when no captions/input path is provided
   - `qc_captions` returns deterministic findings from caller-provided captions
   - `search_captions` returns matches and context from caller-provided captions
   - `format_captions` writes wrapped captions to requested format
2. Run focused tests and verify failures.
3. Implement shared caption-source loader: `captions` argument, `inputPath`, or `sequenceId` via `readSequenceCaptions`.
4. Implement each tool minimally.
5. Run focused tests to GREEN.
6. Run: `npm run build`.

**Acceptance:** File/sidecar workflows work without live Premiere; sequence workflows route through `readSequenceCaptions`.

---

## Task 4: Harden caption import/create behavior

**Objective:** Add `import_captions_to_sequence` and improve `create_caption_track` format handling.

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `src/__tests__/tools/index.test.ts`

**TDD steps:**
1. Write RED tests asserting:
   - friendly caption formats map to `Sequence.CAPTION_FORMAT_*` constants in generated ExtendScript
   - invalid unsupported caption formats fail validation or return a clear error
   - `import_captions_to_sequence` imports a file path, creates a caption track, and requests readback verification in the generated script
2. Run focused tests to verify RED.
3. Implement friendly format mapping in ExtendScript, not arbitrary string passthrough.
4. Implement import/create/readback script for `import_captions_to_sequence`.
5. Run tests to GREEN and build.

**Acceptance:** Caption import no longer passes UI strings blindly; import tool verifies readback when supported.

---

## Task 5: Implement native Adobe transcription/caption capability probes and actions

**Objective:** Add Premiere-native-only transcription/caption-generation tools that attempt scriptable Adobe APIs only after introspection.

**Files:**
- Modify: `src/tools/index.ts`
- Modify: `src/__tests__/tools/index.test.ts`
- Update: `docs/captioning-mcp-coverage-deep-dive.md`

**TDD steps:**
1. Write RED tests asserting generated scripts contain a read-only introspection function for `probe_native_transcription_capabilities` that scans app/project/sequence/qe objects for transcript/caption/speech methods/properties.
2. Write RED tests asserting `generate_sequence_transcript` and `generate_captions_from_premiere_transcript`:
   - diagnose public/native surfaces without mutation
   - never call speculative/private transcript or caption-generation methods
   - return `supported:false` with diagnostics until a public/live-verified scriptable method exists
   - include `dryRun` support
3. Run focused tests to verify RED.
4. Implement scripts conservatively.
5. Run tests to GREEN and build.

**Acceptance:** Native Adobe caption/transcript surfaces are exposed safely. Auto-transcription and caption-from-transcript tools are diagnostic-only until Adobe exposes a public/live-verified scripting API; they honestly report unsupported rather than invoking UI-only/private surfaces.

---

## Task 6: Final verification and review

**Objective:** Verify the suite and run independent review.

**Commands:**
- `npm test -- --runInBand src/__tests__/tools/captions/sidecar.test.ts`
- `npm test -- --runInBand src/__tests__/tools/index.test.ts --testNamePattern="caption|Caption|getAvailableTools"`
- `npm run build`
- `git diff --check`
- `mcp_premiere_bridge_health_report` and `mcp_premiere_test_connection` if live bridge is responsive

**Review:**
- Spec-compliance review after each implementation task.
- Code-quality review after spec review passes.
- Final integration review before reporting completion.

**Acceptance:** Tests/build pass; docs say exactly what is built vs conditional; live Premiere verification is either completed or explicitly blocked by bridge health.
