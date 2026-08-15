# Changelog

All notable changes are documented here. Releases use semantic versioning.

## [Unreleased]

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
