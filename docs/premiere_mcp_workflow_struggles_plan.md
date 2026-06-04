# Premiere MCP workflow struggles remediation plan

Source log: `/Users/mattbot/Movies/HermesPremiereEdits/youtube_5B8_TJ8vsKY_highlight/premiere_mcp_workflow_struggles.md`

## Principles

- Prefer native Premiere/Adobe APIs; when they are not public or reliable, return `supported:false` with exact guidance rather than pretending success.
- No modal-triggering or UI-blocking calls unless a tool is explicitly documented as interactive.
- Every live-mutating workflow should have: preflight, deterministic result payload, postcondition/readback, and a safe scratch-project smoke path.
- Use sidecars and final rendered media QC when native caption objects are not inspectable through ExtendScript.

## Pain-point map and fixes

1. `create_sequence` opened a modal and wedged Premiere.
   - Status: already fixed in `src/bridge/index.ts`: pass a generated non-empty sequence ID to `Project.createNewSequence(name, sequenceID)`, not an empty preset path.
   - Further action: preserve fail-fast unsupported-args behavior for `presetPath`, `width`, `height`, `frameRate`, and `sampleRate`.

2. `create_caption_track` failed on primitive start-time handling.
   - Fix: create a real `Time` object when available, set `.seconds`, and fall back to numeric seconds only if Time construction is unavailable. Return which signature was used.

3. Native captions were hard to verify/remove and could leave stale/hidden captions.
   - Fix: add `remove_caption_tracks` with capability-honest native removal attempts and `dryRun` support.
   - Fix: add `duplicate_sequence_without_captions` as the safer cleanup wrapper: duplicate sequence, remove captions on the duplicate, and read back caption status.
   - Existing: `read_sequence_captions`, `export_captions`, `qc_captions`, and sidecar search/export utilities.

4. Native caption styling and visual burn-in were not controllable.
   - Fix: do not fake unsupported native styling. Add an explicit helper/fallback path via edit-plan/text overlay/MOGRT sidecars where MOGRTs are available, and otherwise return `supported:false` with guidance. For this pass, address through plan/docs and readable capability metadata; do not invent a native API.

5. Export presets were opaque and `format`/`quality` names could fail silently.
   - Fix: add `list_export_presets` to search Adobe/AME preset directories and return `.epr` paths with friendly names.
   - Existing: `export_sequence` now requires absolute `presetPath` and does not claim success on queue failure.

6. Clip assembly required too many low-level calls.
   - Fix: add `assemble_from_edit_plan` as a thin wrapper around `assemble_product_spot`: creates a new sequence, imports each supplied asset path, places clips from a normalized plan, supports existing trim/effect/color/motion fields, and can read back a track-summary postcondition. It does **not** reuse existing project media/sequences, expose per-step `linkAudio`, or compute scale modes.

7. Scale-to-fill/fit required manual Motion math.
   - Fix: add `set_clip_scale_mode` with `fit`, `fill`, and `stretch` modes from explicit `sourceWidth`, `sourceHeight`, `sequenceWidth`, and `sequenceHeight` inputs. It does not discover dimensions from Premiere metadata; missing dimensions return `supported:false` without mutating.

8. Timeline introspection lacked enough postcondition detail.
   - Fix: enrich `list_sequence_tracks` clips with start/end/duration, in/out, enabled, linked, media/project item, track metadata, and nonfatal warnings.

9. Clean-sequence rebuild primitives were needed.
   - Existing: timeline cleanup/conform suite includes `analyze_timeline_cleanup`, `create_clean_timeline_sequence`, and `qc_timeline_cleanup`.
   - Fix: wire caption cleanup into `duplicate_sequence_without_captions` so captionless deliverables no longer require manual guessing.

10. `export_frame` success did not prove final export success.
   - Fix: add `qc_rendered_media` to inspect actual rendered files using `ffprobe`, filesystem size/mtime, duration sanity, and optional expected duration tolerance.

11. Render progress visibility was poor.
   - Existing: `get_render_queue_status` is capability-honest and explains AME limitations.
   - Fix: `qc_rendered_media` doubles as file-growth/post-render verification; `export_sequence` already returns the verification command.

12. Capability boundaries were implicit.
   - Fix: return `supported`, `method`, `warnings`, and `capabilities` fields on new helpers and avoid silent fallbacks.

13. Non-MCP Telegram/channel/tool-side issues.
   - Status: outside the Premiere bridge. Keep notes for Hermes/gateway follow-up, but do not mix into bridge code.

## Test plan

- Unit tests for new schema/tool availability and bridge script generation.
- Unit tests for file-only `list_export_presets` and `qc_rendered_media` using temp files / mocked `ffprobe` behavior where possible.
- Build: `npm run build`.
- Full tests: `npm test -- --runInBand`.
- Live smoke in a disposable Premiere project only:
  - `bridge_health_report` / `test_connection`.
  - `list_export_presets` non-mutating.
  - `create_sequence` name-only in scratch project to ensure no modal.
  - `list_sequence_tracks` on scratch sequence.
  - If sample media is available, import/place one clip, run `set_clip_scale_mode` once with missing dimensions and once with explicit dimensions, run `assemble_from_edit_plan` dry/minimal, and verify postconditions.
  - Avoid mutating the currently open real Taylor Swift project.
