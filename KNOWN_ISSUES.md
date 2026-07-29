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

## Confirmed: Premiere 26.x rejects unsigned CEP extensions regardless of PlayerDebugMode

Status: confirmed on Premiere Pro 26.0.2 (CEP 12), Windows 11

The standard way to load an unsigned CEP extension is `PlayerDebugMode=1`. That does not work
on Premiere 26.x. Both halves were tested on the same machine, one variable at a time:

| Extension | `PlayerDebugMode` | Result |
| --- | --- | --- |
| unsigned | `REG_SZ` `1` on CSXS.9–14, written 10 min before launch | `ERROR Signature verification failed for extension com.mcp.premiere.cepbridge.panel` in `%TEMP%\CEP12-PPRO.log`; panel absent from `Window > Extensions` |
| self-signed | removed from every CSXS key | loads clean, zero errors, bridge round-trip verified |

Every other CEP extension on that machine that loaded successfully carried `META-INF`.

Fix: sign the extension. `scripts/sign-windows.ps1` generates a self-signed certificate, signs
`cep-plugin/`, and installs the result. CEP accepts self-signed certificates; it only requires
that the signature be intact.

Notes:

- `-tsa` crashes ZXPSignCmd 4.1.103 on Windows with an access violation (`0xC0000005`). Sign
  without a timestamp. The signature then expires with the certificate, so re-sign after that.
- The signed `.zxp` is extracted straight into the extensions folder rather than installed
  through UPIA. Adobe's own [known-issue note](https://github.com/Adobe-CEP/CEP-Resources/blob/master/ZXPSignCMD/KnownIssue2024.md)
  records that UPIA installs can break signature verification by extracting symlinks as text.
- A signed extension does not need `PlayerDebugMode`. Leaving it on lets any unsigned CEP
  extension load in every Adobe app on that account.

## Confirmed: create_sequence is slow, and its cost is wildly variable

Status: mitigated, not solved

Three `create_sequence` runs on Premiere Pro 26.0.2 / Windows, same empty project, no other
load:

| Run | Elapsed | Result |
| --- | --- | --- |
| 1 | 39.2s | success |
| 2 | >180s | never returned |
| 3 | 29.3s | success |

Even the fastest run is half the 60s default bridge timeout. When it overruns, the caller gets
a timeout failure for a sequence Premiere actually created — the false negative recorded below
as a fixed issue — and an agent that retries on failure then stacks up duplicate sequences.

`createSequence` now passes an explicit 180s timeout, which covers the observed successful
range. It cannot cover run 2.

In run 2 the ExtendScript host stopped answering entirely: subsequent unrelated calls
(`list_sequences`, `get_premiere_state`) hit the CEP panel's own 45s watchdog with
`ExtendScript execution timed out after 45000ms`. Premiere reported `Responding=True` at the OS
level, had no modal dialog open (window enumeration confirmed a single enabled top-level
window), and the panel was still consuming command files — so the bridge was healthy and
Premiere's scripting engine was not. It recovered on its own without intervention.

No timeout value fixes that. Callers should treat a `create_sequence` timeout as *unknown*
rather than *failed*, and read the sequence list back before retrying.

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

## Operational Limits

These are not hidden bugs; they are boundaries of the current architecture.

### Premiere scripting is incomplete

Some Premiere UI operations are not cleanly exposed through the standard DOM or are only partially accessible through QE / ExtendScript.

Practical consequence:

- the MCP layer can automate a large amount of editing work
- it still cannot promise parity with every click path a senior editor can use manually

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
