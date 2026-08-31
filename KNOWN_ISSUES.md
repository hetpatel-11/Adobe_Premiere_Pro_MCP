# Known Issues

This file tracks current, confirmed limits. It is no longer a backlog of already-fixed prototype bugs.

## Current State (August 13, 2026)

The current built tool catalog exposes:

- `286` tools (`115` declared in `src/tools/index.ts`, `171` in `src/tools/expanded.ts`)
- By default `tools/list` advertises 5 always-on tools; the rest are reached with `search_tools` then `invoke_tool`. Set `PREMIERE_MCP_TOOLSET=full` to list the whole catalog.

Counted from the built catalog with `getAvailableTools().length`, not from this file.
The previous figure of `104` was stale by a wide margin; check it against the build
rather than trusting the number written here.

The last broad live sweep in this repository was run on March 4, 2026:

- `43` tools were live-executed against a real Premiere Pro session
- `50` tools were schema-validated in the same sweep
- `3` tools were intentionally skipped because they mutate or save project state during no-arg testing

Run `node scripts/live-tool-sweep.mjs` against a scratch Premiere project before making a new release-level validation claim.

## Confirmed Runtime Limitation

### `detect_silence` requires ffmpeg on PATH, and does not use Premiere's scripting API at all

Status: by design, not a bug

Reason:

- Premiere's ExtendScript/QE DOM surface has no audio-level or RMS/waveform reading
  capability whatsoever -- confirmed by inspecting every existing audio tool in this
  codebase (`adjust_audio_levels`, `add_audio_keyframes`, `apply_audio_effect`), all of
  which only *write* levels, never read them.
- `detect_silence` therefore runs `ffmpeg`'s `silencedetect` audio filter directly via
  `child_process`, analyzing the underlying media file rather than anything inside
  Premiere. It requires `ffmpeg` to be installed and on `PATH`; if it is not found, the
  tool returns an explicit error explaining why, rather than a cryptic spawn failure.
- This is a detection-only tool -- it never cuts anything itself. Use the returned
  intervals with `split_clip`/`ripple_delete`/`razor_timeline_at_time` to actually remove
  silence from a sequence.

### QE reaches sequences Premiere has open, not only the active one

Status: corrects an earlier claim in this file

An earlier revision stated that "QE only reaches `qe.project.getActiveSequence()`; there is
no QE accessor for an arbitrary sequence", and that the resulting limit was "specific to the
QE deletion path". Both statements are wrong, and the second one was wrong in a way that hid
real bugs: the same pattern appeared at sixteen sites in `src/tools/index.ts` and nine in
`src/tools/expanded.ts`.

What is actually true, verified live against 26.0.2:

- `qe.project.getSequenceAt(i)` exists and returns a QE sequence exposing `guid`, which equals
  the DOM's `sequenceID`. Matching on it addresses an arbitrary sequence exactly, with no name
  matching and no assumption that QE and DOM index orders agree.
- A QE sequence resolved that way can be mutated while a *different* sequence is active. Proven
  by adding a track to a non-active sequence and confirming the active one was untouched.
- `qe.project.numSequences` over-reports. It counts sequences that `getSequenceAt()` then
  refuses to return, throwing `Unknown error exception`, so each index must be guarded
  separately or a throw partway through aborts the scan before the target is reached.
- What QE genuinely restricts is which sequences it exposes at all. A sequence created by
  `duplicate_sequence` and never opened in a timeline is invisible to `getSequenceAt()` — even
  while it is the active sequence. `getActiveSequence()` still returns a working handle for it,
  so it is used as a fallback, but only once its `guid` confirms it is the sequence the caller
  asked for.

Current behavior of `delete_track`:

- the target does **not** have to be the active sequence, only addressable by QE
- a sequence QE cannot reach is reported by name with `requiresOpenSequence: true`, replacing
  the earlier and inaccurate `requiresActiveSequence`
- Premiere still exposes no DOM track-deletion API: `sequence.videoTracks.deleteTrack` and
  `sequence.audioTracks.deleteTrack` are both `undefined`. That part of the original note holds.

### QE track items are not the DOM clip list

Status: confirmed behavior, easy to get wrong

A QE track's items include gaps and transitions, so `qeTrack.getItemAt(domClipIndex)` addresses
a different item as soon as anything precedes the target. A test sequence holding three clips
with one gap reports five QE items: DOM clip `2` is QE item `3`, and QE item `2` is the gap.

Applying an effect through the DOM index therefore landed on the gap and returned
`success: true` having modified nothing. Resolve QE items by matching `start.ticks` against the
DOM clip and skipping anything whose `type` is not `"Clip"`.

### The UXP panel does not load

Status: confirmed non-functional

`uxp-plugin/` is shipped and registers cleanly, but the panel body renders empty in
Premiere Pro 26.0.2. Three independent faults, any one of which is sufficient:

- `bridge.js` calls `require('premiere')`. The Premiere UXP module is `premierepro`;
  there is no `premiere` module, so the require throws at load and nothing in the
  file is ever defined.
- Nothing calls `require('uxp').entrypoints.setup(...)`. A manifestVersion 5 panel
  has to register its entrypoint or the body is never attached.
- The manifest declares `permissions`; the key UXP reads is `requiredPermissions`.

Confirmed by contrast with an unrelated UXP plugin that does load and run in the
same Premiere install: it requires `premierepro`, calls `entrypoints.setup()`, and
uses `requiredPermissions`.

`index.html` is also CEP-style markup — 29 plain HTML elements, no Spectrum
components, and a large `<style>` block. UXP supports a restricted subset and
silently renders nothing for markup outside it, so the UI would need rebuilding
even once the script loads.

Practical consequence:

- the CEP panel is the only working bridge
- the file-queue race fixed on the server and CEP sides is still present in
  `uxp-plugin/bridge.js`; it was left alone deliberately, because a fix there
  cannot be executed or verified

### `get_render_queue_status`

Status: expected runtime limitation

Reason:

- this tool depends on Adobe Media Encoder integration
- without AME integration, the server returns a truthful failure instead of fake success

Current behavior:

- the tool is still exposed
- it returns an error explaining that render queue monitoring requires Adobe Media Encoder

### `add_text_overlay` decodes MOGRT text again, but the rest of that path is untested

Status: the blocker is fixed in this change; what sits behind it has not been exercised

The engine ships no `JSON` object at all -- neither `parse` nor `stringify` -- which is
why the prelude fabricates one. It used to install only `stringify`, leaving a `JSON` that
answers `typeof` while the read direction is missing.

`add_text_overlay` needs the read direction. It calls `JSON.parse` inside the generated
script at three sites to decode a component's text payload, trying a four-byte header first
and then the bare string. Before this change both raised
`ReferenceError: JSON.parse is not a function`, both were caught, and the tool reported
"Both JSON parse strategies failed" -- legible, but the path could never succeed. Verified
against a live 26.0.2 host.

The prelude now installs a parser as well, and the same payload shape decodes correctly
through the live bridge. That removes the blocker; it does not establish that the whole
MOGRT flow works, because confirming that needs a real .mogrt asset in a project and has
not been done. Treat the remainder of that path as unverified rather than fixed.

## Operational Limits

These are not hidden bugs; they are boundaries of the current architecture.

### Premiere scripting is incomplete

Some Premiere UI operations are not cleanly exposed through the standard DOM or are only partially accessible through QE / ExtendScript.

Practical consequence:

- the MCP layer can automate a large amount of editing work
- it still cannot promise parity with every click path a senior editor can use manually

### Native Premiere dialogs

The server avoids known dialog-prone calls rather than attempting to dismiss native UI, which CEP cannot do reliably once the scripting host is blocked.

- `create_sequence` requires a real `.sqpreset` and uses Premiere's non-interactive `newSequence` API.
- Footage-driven workflows use `create_sequence_from_clips`; existing-settings workflows use `duplicate_sequence` with `clearContents=true`.
- `import_fcp_xml` suppresses import warnings. `import_edl` is rejected before Premiere because its available API is interactive; convert EDL to FCP7 XML for unattended import.
- Unexpected host/OS dialogs, such as missing media or permission alerts, cannot be globally suppressed and require diagnostics after the user dismisses them.

### Professional motion graphics still need real assets

The server can assemble timelines and apply motion/effect treatments, but polished title design still depends on:

- real MOGRT packages
- real design assets
- real footage and audio

Generated demo assets are useful for verification, not for final client delivery.

### The CEP panel must be live

If the panel is not open and started, the tools cannot reach Premiere even if the MCP server is configured correctly.

Symptoms:

- tool calls timeout
- the client sees the tool catalog but actions do not complete

Fix:

1. Open `Window > Extensions > MCP Bridge (CEP)`.
2. Confirm the temp directory is `/tmp/premiere-mcp-bridge`.
3. Click `Start Bridge`.
4. If bridge code changed, right-click the panel and choose `Reload`.

### Live verification mutates the active project

`node scripts/live-tool-sweep.mjs` creates disposable `Sweep ...` sequences and imports generated assets so the bridge is tested for real.

Use a scratch project if you do not want those fixtures in a working edit.

## Recently Fixed

These issues were real and are now resolved in the current code:

- bridge script validation was incorrectly rejecting valid ExtendScript
- `import_media` could import successfully but fail to locate the new project item
- `add_to_timeline` used the wrong Premiere API path
- the server could delete an externally managed temp directory on shutdown
- the CEP bridge could fail with `ENOENT` when the configured temp directory did not exist
- `create_sequence` could create a sequence in Premiere but still report failure after a bridge timeout
- `create_sequence` could open the native New Sequence dialog because it used the wrong API; it now requires a preset and uses `newSequence`.
- `export_frame` called a non-existent API and now uses the QE export path
- `remove_effect` was advertised even though actual removal is not supported and has been removed from the tool catalog
- the branded workflow response returned the wrong message due to object spread order
- `add_marker`, `update_marker`, `delete_marker`, `list_markers`, `lock_track` and
  `toggle_track_visibility` required a `sequenceId` and then ignored it, always operating on
  `app.project.activeSequence`. A bogus sequence ID returned `success: true` while mutating the
  wrong timeline. They now resolve the ID and return a truthful error when it matches nothing.
- `list_sequence_tracks` and `delete_track` resolved `sequenceId` but silently fell back to the
  active sequence when the lookup missed; `list_sequence_tracks` additionally echoed the
  requested ID back beside the wrong sequence's name. Both now fail truthfully instead.
- `duplicate_sequence` fell back to `app.project.activeSequence` whenever it could not resolve
  the clone, then renamed it and, with `clearContents=true`, removed every clip from it. That
  destroyed the user's open timeline and reported `success: true` with the clip count it had
  just deleted. The fallback now has to prove the sequence is newly created, and refuses to
  clear anything it cannot identify.
- Fourteen tools resolved a clip by id — which searches every sequence in the project — and then
  applied the change through `qe.project.getActiveSequence()`. `color_correct` on a clip in a
  non-active sequence added Lumetri Color to the identically placed clip in the active one and
  left the requested clip untouched, reporting success.
- Five of those tools additionally indexed QE track items with the DOM clip index, so a clip
  sitting behind a gap received nothing at all while the call reported success.
- `export_frame` exported from whatever was on screen rather than the requested sequence, and
  wrote to `shot.png.png` while reporting `shot.png`, because the QE export methods append the
  format extension to the path they are given. It now addresses the requested sequence and
  reports the path actually written. Its argument probe also treated "did not throw" as "did
  export", so an accepted-but-inert call ended the probe and reported success over an empty disk.
- A single control character anywhere in a clip or marker name makes the entire tool response
  unparseable, and a NUL truncates it. **Not addressed here.** The escaper, the U+2028 repair
  and the NUL refusal all live in the bridge, and are covered by the separate change to
  serialization and the file handoff; this file previously described them as done in this
  branch, which they are not.
- `findClip()` and `markerCollectionForTool()` returned a `fail()` string when a `sequenceId`
  could not be resolved. A string is truthy, so every `if (!x)` guard downstream was dead code:
  `get_sequence_markers_by_type` with a bogus id answered "this sequence has no markers" with
  `success: true`, and the clip tools reported a JavaScript TypeError instead of the resolver's
  own message.

## Release Guidance

Before you call this ready for other users, verify these exact commands on a clean macOS machine:

```bash
npm run setup:mac
npm run setup:doctor
npm test -- --runInBand
node scripts/live-tool-sweep.mjs
```

If any of those fail, fix the code or docs before tagging a release.
