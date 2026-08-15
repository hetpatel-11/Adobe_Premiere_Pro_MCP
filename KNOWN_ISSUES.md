# Known Issues

This file tracks current, confirmed limits. It is no longer a backlog of already-fixed prototype bugs.

## Current State (May 16, 2026)

The current built tool catalog exposes:

- `104` tools

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

### `get_render_queue_status`

Status: expected runtime limitation

Reason:

- this tool depends on Adobe Media Encoder integration
- without AME integration, the server returns a truthful failure instead of fake success

Current behavior:

- the tool is still exposed
- it returns an error explaining that render queue monitoring requires Adobe Media Encoder

### `add_text_overlay` cannot read MOGRT text on this engine

Status: pre-existing, unfixed here, found while measuring the serialization change

The engine ships no `JSON` object at all. `JSON.parse` is `undefined` and nothing in the
prelude assigns it, which is why the prelude fabricates `JSON` and installs a `stringify`
onto it. Serialization only ever needed the write direction, so that is all it provides.

`add_text_overlay`'s MOGRT path needs the read direction. It calls `JSON.parse` inside the
generated script at three sites to decode a component's text payload, trying a four-byte
header first and then the bare string. Both calls raise
`ReferenceError: JSON.parse is not a function`, both are caught, and the tool reports
"Both JSON parse strategies failed" — so the failure is legible but the path can never
succeed. Verified by running both strategies through the live bridge on 26.0.2.

Not fixed here because the repair is a real ES3 JSON parser, which is well outside a
serialization change. The obvious shortcut is closed: `eval` exists on the host, but the
panel rejects any script matching `eval(` before running it, so a one-line polyfill in the
prelude would make the panel refuse every call.

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

## Release Guidance

Before you call this ready for other users, verify these exact commands on a clean macOS machine:

```bash
npm run setup:mac
npm run setup:doctor
npm test -- --runInBand
node scripts/live-tool-sweep.mjs
```

If any of those fail, fix the code or docs before tagging a release.
