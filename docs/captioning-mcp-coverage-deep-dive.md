# Captioning MCP Coverage Deep Dive

Generated: 2026-06-03T19:04:00Z

## Scope

This document tracks the native-focused Premiere MCP caption/transcript work:

- Native Adobe/Premiere transcript and caption capability probing.
- Existing caption-track import/readback through Premiere when scriptable.
- Sidecar workflows for SRT/VTT/JSON/CSV formatting, QC, search, import, and export.
- Honest limitations: no third-party STT in this slice and no claim that Premiere's Speech to Text UI can be triggered through public ExtendScript.

## Architecture

Current bridge path remains:

Node MCP server -> `/tmp/premiere-mcp-bridge` -> CEP panel -> Premiere ExtendScript/QE DOM.

Sidecar-only tools run locally in Node/TypeScript and do not require a live Premiere bridge unless the caller uses `sequenceId` as the source.

## Current caption/transcript MCP tools

Current catalog total after this slice: **131 tools**.

Caption/transcript-specific tools now exposed:

- `create_caption_track`
- `read_sequence_captions`
- `probe_native_transcription_capabilities`
- `generate_sequence_transcript`
- `generate_captions_from_premiere_transcript`
- `format_captions`
- `qc_captions`
- `search_captions`
- `export_captions`
- `import_captions_to_sequence`

Adjacent but not caption-specific:

- `add_text_overlay` — MOGRT-based graphics/text overlay workflow, not a native caption tool.

## Native Adobe API status

The public Premiere scripting surface clearly exposes caption import via:

- `Sequence.createCaptionTrack(projectItem, startAtTime, captionFormat)`

The public ExtendScript/QE surfaces inspected so far do **not** expose a reliable scriptable equivalent of the Premiere UI commands:

- Transcribe Sequence
- Generate captions from transcript

Therefore:

- `probe_native_transcription_capabilities` is read-only and diagnostic-only: it reports `supported:false` plus the native Adobe transcript/caption/speech method names and property types the current host exposes, without treating speculative method-name matches as supported APIs.
- `generate_sequence_transcript` and `generate_captions_from_premiere_transcript` are capability-honest diagnostic tools. They do not call speculative/private methods; they return `supported:false` with diagnostics until a public/live-verified scriptable method exists.
- The implementation does not use Whisper, OpenAI, cloud STT, private UI automation, or fabricated transcript data.

## Current coverage by workflow

### Import/place captions

- `create_caption_track` creates a native caption track from an already-imported caption project item and maps only public/native format keys: `subtitle`, `cea-608`, `cea-708`, `teletext`.
- `import_captions_to_sequence` accepts inline captions or sidecar paths that can be serialized/imported as SRT/VTT, imports the sidecar, and requests native caption-track creation/readback.
- Local sidecar export/QC/search formats are intentionally limited to implemented formats: `srt`, `vtt`, `json`, `csv`. Premiere-native caption import is intentionally narrower: SRT/VTT only.

### Read captions

- `read_sequence_captions` attempts real native caption-track collections only: `sequence.getCaptionTracks()` or `sequence.captionTracks`.
- It no longer scans ordinary video tracks or uses clip names as caption text, because that can fabricate captions from edit item names.
- If the Premiere host does not expose readable caption tracks, it returns `supported:false` with guidance instead of pretending success.

### Format/export/search/QC

- `format_captions` wraps/splits text, can merge adjacent cues by gap, and can write sidecars.
- `export_captions` writes SRT/VTT/JSON/CSV.
- `qc_captions` checks timing, overlap, readability/CPS, line length/count, empty text, banned terms, and optional bounds.
- `search_captions` supports literal or regex search with context cue windows.
- Output file writing is overwrite-safe by default; callers must pass `overwrite=true` to replace an existing output path.

### Native auto-transcription

- Not implemented as a fake wrapper around the UI.
- Current tool behavior is honest capability probing plus `supported:false` when the host lacks a scriptable method.
- Manual Premiere workflow remains: use Premiere's UI to transcribe/generate captions, then export/read/import sidecars through the MCP suite.

## Validation completed after review fixes

Commands run after the review-driven fixes:

- `npm test -- --runInBand src/__tests__/tools/index.test.ts --testNamePattern='overwrite|unsupported caption sidecar imports|imports supported SRT|unsupported create_caption_track|maps create_caption_track|fabricating|capability-honest'`
  - PASS: 7 focused review-regression tests.
- `npm run build`
  - PASS: TypeScript `tsc`.
- `npm test -- --runInBand src/__tests__/tools/captions/sidecar.test.ts src/__tests__/bridge/index.test.ts src/__tests__/tools/index.test.ts --testNamePattern='caption|Caption|IIFE|self-invoking|native transcript|overwrite|unsupported|fabricating|capability-honest'`
  - PASS: 3 suites, 31 focused caption/bridge tests.
- `npm test`
  - PASS: 18 suites, 283 tests.

Regression coverage added for review findings:

- Named self-invoking ExtendScript functions are no longer double-wrapped by the bridge.
- Caption readback no longer fabricates text from ordinary video clip names.
- `create_caption_track` safely embeds sequence IDs/error strings in generated ExtendScript and maps only native format keys (`subtitle`, `cea-608`, `cea-708`, `teletext`) to Premiere constants/fallbacks.
- `import_captions_to_sequence` rejects unsupported Premiere-native import sidecars before touching Premiere and only imports SRT/VTT.
- Sidecar export/QC/search formats are restricted to `srt`, `vtt`, `json`, and `csv`.
- CSV parsing supports quoted fields, escaped quotes, CRLF, BOM, and embedded newlines.
- Output file writes require `overwrite=true` before replacing existing files, including `export_captions`.
- Sequence readback failures surface as errors/warnings instead of silent empty exports; exposed-but-empty caption collections report `supported:true` with zero captions.
- Probe flags are diagnostic-only (`supported:false`) and report method-name/type observations without treating transcript/caption/speech-analysis matches as live-supported APIs.
- Transcript/caption generation tools are diagnostic-only and do not invoke speculative native methods until a public/live-verified API exists.

## Live smoke status

Live bridge validation is still separate from unit/build validation.

Verified in this session:

- Premiere Pro 2026 / PPRO 26.2.2 is installed at `/Applications/Adobe Premiere Pro 2026/Adobe Premiere Pro 2026.app`.
- `/tmp/premiere-mcp-bridge` exists and is readable/writable.
- The MCP CEP extension exists in both the app bundle and user CEP extension paths.
- CEP logs show Premiere discovers `com.mcp.premiere.cepbridge.panel`.
- Before restart, bridge round trips timed out with stale command files.
- After user-approved force restart, Premiere/CEP processes were killed directly, stale bridge files were cleared, and Premiere was relaunched twice.
- After relaunch, the Premiere process exists and the bridge dir starts clean, but no MCP CEP host/panel process appears; AppleEvent activation/menu access times out; a desktop screenshot showed no visible Premiere UI.
- Post-restart `mcp_premiere_test_connection` still fails with bridge response timeout.
- Post-restart `mcp_premiere_bridge_health_report({ staleAfterSeconds: 60 })` still fails: install/extension paths are valid, but the round trip times out and a command file becomes stale.

Conclusion: code/build/unit validation is complete, but live Premiere validation is blocked until the MCP Bridge CEP/UXP panel can be opened and started in the GUI with temp dir `/tmp/premiere-mcp-bridge`.

## Remaining backlog

- Live-verify `import_captions_to_sequence` and `read_sequence_captions` in a disposable scratch project once the CEP bridge is healthy.
- Implement a native/styled caption overlay fallback only if requested: e.g. transparent overlay render/MOGRT workflow, not part of native Speech to Text.
- Add package-level caption deliverable bundling: sidecar + QC JSON/Markdown + checksums + optional preview artifact.
