# Changelog

All notable changes are documented here. Releases use semantic versioning.

## [Unreleased]

- The generated-script identifier guard treats `ProjectItemType` as a Premiere host global, the same class as `Sequence` and `File`.
- `detect_silence` on Linux puts `sudo apt-get install -y ffmpeg` in `nextStep`, matching the macOS and Windows install hints.

## [1.2.11] - 2026-10-24

- `import_media` puts the file in `binName` when that bin exists, and returns failure when it does not. The previous call imported to the project root and echoed the bin name anyway.
- `move_clip_to_track` parks past every track and removes the extra audio clip Premiere creates for the parked copy. The original linked audio stays where it was.
- `ripple_delete` removes the clip and its linked audio, closes the gap, and reports `ripple: true` only after the later clips have moved.
- `add_adjustment_layer` places an adjustment layer that is already in the project across the requested range. It no longer imports a transparent PNG, which does not pass effects through.
- `verify_premiere_connection` reports `readOnly` from the project file's readonly attribute. It was a hardcoded `true`.
- The CEP heartbeat records the last time Premiere finished an ExtendScript call. A timeout while that timestamp is stale says the scripting thread is stuck, instead of treating a fresh panel heartbeat as a healthy host.
- The CEP manifest names Premiere as the dispatch host, and the macOS installer enables PlayerDebugMode for CSXS 9 through 15. Windows doctor fails when that value is a DWORD, which CEP ignores, and when the CEP log shows the panel's signature was rejected.
- `detect_silence` looks outside `PATH` for ffmpeg and, when it is missing, returns the install command for this machine instead of a generic not-found error.
- `export_frame` reports the timecode failure from Premiere 26. A later raw-seconds attempt no longer replaces that error with "Illegal Parameter type".

## [1.2.10] - 2026-10-24

- `apply_lut` stores the `.cube` or `.3dl` on Lumetri's Input LUT path and selects that custom LUT. The previous call wrote the path onto the numeric LUT menu, swallowed the type error, and still returned success. A missing file, or a path Premiere does not keep, is now a failure. The second Input LUT menu on the same effect is left alone, because writing it clears the first. `apply_effect` uses the same path when Lumetri's `Input LUT` parameter is a file path.
- Telemetry sends at most one launch per install per UTC day and at most one
  failed tool call per UTC day. Successful tool calls are not sent. The ingest
  Worker stores at most one launch per install per day and no longer traces
  every request. Published copies through 1.2.9 keep the old request rate
  until they are updated.

## [1.2.9] - 2026-10-12

- `export_sequence` finds Adobe Media Encoder inside the Creative Cloud folder
  (`/Applications/Adobe Media Encoder 2026/Adobe Media Encoder 2026.app`). The
  1.2.8 check only matched an `.app` directly under `/Applications`, so a normal
  macOS install always returned `MEDIA_ENCODER_NOT_INSTALLED`.
- `get_encoder_presets` also looks in `~/Documents/Adobe/Adobe Media Encoder/<version>/Presets`,
  which is where Media Encoder saves user presets. The Application Support path
  is still searched.

## [1.2.8] - 2026-09-02

- `move_clip_to_track` parks past the last clip on the destination, restores
  source in/out and timeline `end`, slides into the occupancy-checked span, then
  lifts the source. The 1.2.6 fallback called `overwriteClip` at the destination
  using the project item's own duration, so a trimmed still could take out a
  neighbour the guard never saw. Failures leave the source clip in place.
- The CEP update banner copies
  `npm install -g adobe-premiere-pro-mcp@latest && premiere-pro-mcp --install-cep`
  instead of spawning npm from Premiere. Adobe's CEP PATH preferred
  `/usr/local/bin/npm`, which then failed with EACCES writing `/usr/local`.
- `--install-cep` copies over the live extension instead of `rm -rf`.
- Removed the GitHub Actions `Publish npm package` workflow. The repo `NPM_TOKEN`
  cannot publish `adobe-premiere-pro-mcp`; releases go up with a local
  `npm publish` after `npm login`.

## [1.2.7] - 2026-08-31

- Premiere 26 QE cannot enumerate sequences (`getSequenceAt` throws; `openInTimeline` is missing). `__qeSequenceFor` now activates the requested sequence via `openSequence` / `activeSequence` so QE tools address that timeline, not whatever is on screen.
- `set_sequence_field_type` writes numeric field type `0` / `1` / `2` instead of the string `"No Fields"`.
- `set_metadata` no longer coerces `value` to a number when a metadata `key` is present.
- Expanded tools that need a clip or project item now require `clipId` / `projectItemId` in the schema.
- `add_transition` matches `add_transition_to_clip` (`applied_verified` / `accepted_unverified`). Transition verification no longer exports FCP XML, which opened Translation Results dialogs.
- `apply_audio_effect` rejects video-only clips with `clip_has_no_audio`.
- `import_fcp_xml` warns that Premiere may still show Translation Results windows.
- Removed `remove_effect`, `remove_effect_by_name`, and `remove_all_effects`. Premiere 26 has no effect-removal API. Catalog is 283 tools.

## [1.2.6] - 2026-08-31

- Prelude now defines `__ticksToSeconds` / `__secondsToTicks` (and accepts Premiere
  `Time` objects, not just tick strings). `list_sequences`, `get_active_sequence`,
  `set_playhead_position`, `create_sequence`, work area, MOGRT import, and subclip
  tools no longer throw `ReferenceError` on a Connected panel. Tests derive the
  host-global allowlist from the prelude so a missing helper cannot ship again.
- `replace_clip` honors `preserveEffects` (default true): restore source in/out,
  enabled, Motion, and re-apply other effects. It no longer reports success after
  dropping Scale/enabled/trim.
- `move_clip_to_track` restores source in/out, skips the source clip in occupancy
  checks, refuses an occupied destination unless `overwrite` is true, and places
  onto the destination track only (no longer `sequence.overwriteClip` onto A1).
- `trim_clip` duration writes `clip.end` and, only after that duration actually
  applies, syncs source `outPoint`. Unsupported graphic extensions still leave
  `outPoint` untouched.
- `create_sequence_from_clips` parses JSON-encoded id arrays (`["000f4241"]`) and
  comma-separated hex ids. The import helper `createSequenceFromProjectItems`
  uses `__resolveProjectItem` / `__idsMatch`.
- `apply_effect` matches parameter names with locale aliases (`Exposure` /
  `Exposition`) and coerces values before `setValue`. Effect removal tries
  `components.remove` and QE named-remove APIs, then verifies the component is gone.
- The CEP panel auto-starts the bridge when it loads. `verify_premiere_connection`
  launches Premiere when it is installed and the heartbeat is missing, then waits
  for the panel. MCP `instructions` tell the agent to call that once and stop
  with `userActionRequired` instead of spraying tools at a closed Premiere.
  Launch paths are joined with posix/win32 keyed off `process.platform`, so a
  darwin stub on Windows CI no longer feeds backslashes to `open -a`.
- Tool search (Anthropic-style BM25 + regex): `tools/list` advertises
  `search_tools`, `get_tool_schema`, `invoke_tool`, `verify_premiere_connection`,
  and `list_sequences` by default. The other 280+ Premiere tools stay in the
  catalog and run through `invoke_tool`. Empty `search_tools` lists categories.
  Set `PREMIERE_MCP_TOOLSET=full` to restore a flat list for hosts that natively
  defer MCP schemas. Unknown-tool errors no longer dump every tool name.

## [1.2.5] - 2026-08-30

- Clip, effect, and transition names now match localized Premiere labels
  (Motion/Movimento, Scale/Escala, Volume/Lautstärke, Gaussian Blur/Flou
  gaussien, Cross Dissolve, Crop, and the same family of aliases). 1.2.4 only
  compared case.
- `add_keyframe`, `set_clip_properties`, `adjust_audio_levels`, and the
  expanded property helpers resolve Opacity on Motion, Position X/Y as the
  Position array plus an axis, and refuse to pass arrays into scalar Scale.
- `__findSequence` accepts a GUID, sequence name, or hex `projectItem.nodeId`
  (`000f4344`). `__resolveProjectItem` also accepts a timeline clip id and
  returns `clip.projectItem`. 1.2.4's hex/decimal `__idsMatch` only equated
  two forms of the same object.
- `export_frame` converts seconds to `HH:MM:SS:FF` first and retries QE after
  opening the sequence. `apply_effect` reuses a component that is already
  present. Transitions settle ~150ms then resolve by localized name.
- `capture_frame` writes to `tmpdir()/premiere-mcp-frame-*.png` when the
  agent omits `outputPath`.

## [1.2.4] - 2026-08-28

- `speed_change` and `set_clip_speed_qe` now call QE `setSpeed` with its real
  five-argument form (multiplier, duration ticks as a string, reverse, pitch,
  ripple). The previous two-argument percent call is what Premiere rejected as
  "Not Enough Parameters" / "Illegal Parameter type".
- `create_sequence_from_clips` resolves timeline clip ids on any sequence, and
  treats padded-hex Premiere `nodeId`s (`000f4242`) as the same as their decimal
  form.
- `add_text_overlay` no longer requires a 50-character JSON blob to recognize a
  text parameter; it also scans past a binary prefix to the first `{` and writes
  `mTextString` when that is the field Premiere exposes.
- Telemetry `error_detail` now replaces quoted sequence names with `<name>`.
- The CEP panel and MCP server check npm for a newer package and show **Update now** / **Later**. Later snoozes the prompt for 7 days. Opt out with `PREMIERE_MCP_UPDATE_CHECK=0`.

## [1.2.3] - 2026-08-27

- `add_transition_to_clip` now accepts a numeric string for `duration` and a
  case-insensitive `position` (`End`, `in`/`head`, `out`/`tail`). Agents were
  sending those shapes and getting a Zod rejection in ~12ms without Premiere
  ever running; two installs retried the same invalid call ~50 times.
- Tool arguments now accept snake_case aliases (`sequence_id`, `clip_id`,
  `project_item_id`, …) and numeric strings for times, durations, and indexes,
  which is what produced the remaining short validation failures.
- `speed_change` now converts multipliers (`0.5`, `2`) to QE percents (`50`,
  `200`). It previously passed the multiplier through, which Premiere rejected.
- `create_sequence_from_clips` accepts a single `projectItemId` or a timeline
  clip id, and `add_keyframe` matches Motion/Opacity parameter names without
  regard to case.
- Connection checks no longer sit for 60 seconds when Premiere is not
  listening. The panel writes a heartbeat; if it is missing the server fails in
  about two seconds with "open the MCP Bridge panel and click Start Bridge" and
  `retry: false`, so agents stop looping. `ping` and `verify_premiere_connection`
  also cap at 8s even when the panel is alive.
- `add_text_overlay` without a `.mogrt` fails immediately instead of round-tripping
  Premiere. Premiere cannot create titles from text alone.
- Failed tool calls now send a path-stripped error template, Zod field names, and an
  error code (`zod.invalid_type`, `bridge.panel_absent`, …) to the telemetry worker
  so the next failure cluster can be diagnosed without guessing from duration.

## [1.2.2] - 2026-08-26

- The MCP server now sends anonymous usage telemetry by default: install id, tool
  names, success or failure, duration, OS, and version. Project names, media paths,
  arguments, and results are not sent. Opt out from the CEP panel, with
  `PREMIERE_MCP_TELEMETRY=0`, `DO_NOT_TRACK=1`, or `"telemetry": false` in
  `~/.premiere-mcp-bridge/config.json`. See [PRIVACY.md](PRIVACY.md).

## [1.2.1] - 2026-08-26

- The CEP panel no longer starts a second `evalScript` after a JavaScript timeout while
  the first native call is still outstanding. Overlapping `evalScript` calls can wedge
  the ExtendScript channel until Premiere restarts (GitHub issue
  [#86](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP/issues/86)). A timed-out
  waiter now fails that one command; the next command waits until the original callback
  arrives. Result handling is also deferred off the `evalScript` stack.

## [1.2.0] - 2026-08-17

- Fixed `add_marker`, `update_marker`, `delete_marker`, `list_markers`, `lock_track` and
  `toggle_track_visibility` ignoring the required `sequenceId` and always operating on the
  active sequence. They now act on the requested sequence and return a truthful error when the
  ID resolves to nothing, instead of reporting `success: true` against the wrong timeline.
- Fixed `list_sequence_tracks` and `delete_track` silently falling back to the active sequence
  when `sequenceId` did not resolve. `list_sequence_tracks` also no longer echoes the requested
  ID back next to a different sequence's name.
- `delete_track` now works across sequences. Premiere exposes no DOM track-deletion API, so it
  falls through to the QE DOM, which reaches any sequence Premiere has open rather than only the
  active one. A sequence QE cannot address is reported by name instead of having a track deleted
  from whichever timeline is on screen.
- Fixed `create_bin` and `import_folder` resolving a named parent with `children[name]`, which
  never matches: `ProjectItemCollection` is index-only, so the lookup always fell through to the
  project root while the response echoed the requested name back.
- Fixed `add_to_timeline` reporting a pre-existing clip as the one it placed, and removing linked
  audio matched against that clip's start time, whenever the placement could not be confirmed.
- Fixed `insertMode` being accepted and echoed but never applied; `insert` now inserts and shifts
  rather than overwriting.
- Fixed `duplicate_sequence` falling back to the active sequence when the clone could not be
  resolved, then renaming it and, with `clearContents`, emptying it.
- Caller-supplied strings interpolated into generated ExtendScript are now serialised, closing an
  arbitrary-code-execution path and fixing ordinary names containing a double quote.
- Fixed `set_sequence_settings` never writing anything. It compared the requested width and
  height against the current ones, wrote no settings, and reported a match; a caller asking for
  a different frame size got `success: true` and an unchanged sequence. It now applies the
  settings and reports what it wrote. Frame size can be changed after creation — assigned
  through `getSettings()`/`setSettings()` and confirmed by read-back on 26.0.2.
- Fixed the bridge's response serializer silently passing raw control characters through
  instead of escaping them. A single stray control character anywhere in a clip or marker
  name could make the entire tool response unparseable, not just that field. The bridge and
  CEP panel now share a conformant serializer, tested against the platform's own parser plus
  a large generated corpus.
- Added the missing `JSON.parse` read direction to the ExtendScript prelude. The engine ships
  no native `JSON` object; the prelude previously installed only `stringify`, so any generated
  script that needed to *decode* a payload — including `add_text_overlay`'s MOGRT text
  decoding — failed with `JSON.parse is not a function` on every call.
- Made the command/response file handoff between the server and CEP panel atomic (write to a
  scratch name, then rename into place) instead of writing directly to the polled filename.
  Previously a truncated read during a write could permanently fail a command that had
  actually executed, and a slow response could be overwritten before the caller read it.

### Security

- Fixed an ExtendScript injection vulnerability ([GHSA-rc48-rh69-7487](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP/security/advisories/GHSA-rc48-rh69-7487)):
  a small set of tool arguments (including `clipId` in `split_clip`, `add_transition`, and
  `add_transition_to_clip`) were interpolated unquoted into generated ExtendScript. A value
  containing a double quote could break out of the string literal and execute arbitrary
  ExtendScript, including forging a fake `success: true` tool result. All interpolated values
  are now serialised with `JSON.stringify` at the point of use. Reported and patched by
  [@medazizktata](https://github.com/medazizktata).

### Breaking

- `move_clip` now rejects `newTrackIndex` instead of accepting and ignoring it. The parameter
  never moved a clip between tracks; callers that passed it were silently getting a time-only
  move. Use `move_clip_to_track`, which on this build is a remove-and-reinsert: it can overwrite
  whatever occupies the destination and gives the clip a new id, so it is a separate call rather
  than an option here.
- `add_marker` and `update_marker` now reject a `color` outside the eight-name palette instead of
  silently storing green. Any name Premiere does not have was previously accepted and produced a
  green marker, so a caller asking for `magenta` got green and no error.
- Tools that resolve a `sequenceId` now fail when it does not resolve, where many previously fell
  back to the active sequence and reported success. Callers relying on a bad or stale id to mean
  "use whatever is open" will now see an error; pass no id for that behaviour.

- Sequence-scoped marker and track tools now reject an empty `sequenceId` at the schema layer
  and report the resolved `sequenceId`/`sequenceName` they acted on.

## [1.1.6] - 2026-08-05

- Added `get_capabilities`, a read-only report of local bridge installation, catalog coverage, and optional live connection status.
- Added installable Codex and Claude Code plugin packages that reuse the supported local MCP server and Premiere editing skill.
- Reworked the README entry path around client-specific installation and read-only connection verification.

## [1.1.5] - 2026-08-05

- Added reproducible CEP ZXP signing, verification, and release-upload workflows.
- Added a local macOS helper that creates a private self-signed certificate and stores its password in the macOS Keychain.

## [1.1.4] - 2026-08-05

- Added the official Claude Desktop MCPB bundle to the release artifact workflow.
- Added `verify_premiere_connection`, a read-only CEP bridge and Premiere host readiness check.
- Added release notes and a security policy, and clarified supported CEP, unsigned archive, and experimental UXP status.

## [1.1.3] - 2026-08-05

- Stabilized the release artifact workflow with a clean CI test run.
- Published the first verified unsigned CEP release archive.

## [1.1.2] - 2026-08-05

- Added the public npm package, `premiere-pro-mcp` CLI, CEP installer, and diagnostics command.
- Added package-content verification and npm publishing workflow.

## [1.1.1] - 2026-08-05

- Renamed the published package identifier to `adobe-premiere-pro-mcp`.

## [1.1.0] - 2026-08-05

- Added dialog-safe handling for FCP XML import, sequence creation, EDL import, and Media Encoder availability.
- Migrated the MCP server to the current v2 transport implementation.
