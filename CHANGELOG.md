# Changelog

All notable changes are documented here. Releases use semantic versioning.

## [Unreleased]

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
