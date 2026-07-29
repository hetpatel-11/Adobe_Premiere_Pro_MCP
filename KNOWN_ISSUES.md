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

## Fixed: create_sequence opened a modal and could not run unattended

Status: **fixed** — `createSequence` now uses `qe.project.newSequence`.

`app.project.createNewSequence` opens Premiere's modal **New Sequence** dialog and blocks until
somebody clicks it, which made the tool unusable in unattended agent workflows.
`qe.project.newSequence` takes the same two arguments, prompts for nothing, and returns
immediately. Measured on Premiere Pro 26.0.2 / Windows:

| Path | Preset | Elapsed | Dialog |
| --- | --- | --- | --- |
| `app.project.createNewSequence` | explicit `.sqpreset` | blocks indefinitely | yes |
| `app.project.createNewSequence` | none | blocks indefinitely | yes |
| `qe.project.newSequence` | explicit `.sqpreset` | **0.5s** | no |
| `qe.project.newSequence` | none | **0.3s** | no |

End to end through the MCP tool, unattended: **0.3s**, no dialog.

`qe.project.newSequence` returns a boolean rather than the sequence object, so the new sequence
is located by name afterwards — logic this function already had as a fallback. The response now
carries `createdVia`: `"qe"` means nothing prompted, `"dom"` means the fallback ran and a human
clicked, so an unattended caller seeing `"dom"` should expect the next call to hang.

The DOM call is kept as a fallback for hosts without QE. Everything below documents the
original behaviour, which is what that fallback still does.

### Original diagnosis

`create_sequence` opens Premiere's modal **New Sequence** dialog and blocks until somebody
clicks it. Confirmed on Premiere Pro 26.0.2 / Windows by enumerating the host's windows while
a call was in flight:

```
[OWNED/DIALOG] enabled=True   class=#32770        title='New Sequence'
[TOP]          enabled=False  class=Premiere Pro  title='Adobe Premiere - ...'
```

`#32770` is the standard Win32 dialog class, and the main window being **disabled** is the
signature of an application-modal dialog. It appears whether or not `presetPath` is supplied —
tested with an explicit `.sqpreset` from Premiere's own `Settings/SequencePresets`, which still
blocked and still had to be dismissed by hand.

**The elapsed time of this call is human reaction time, not Premiere's.** Three runs here
measured 39.2s, >180s, and 29.3s, which looks like wildly variable performance and is nothing
of the sort — it is how long someone took to notice the dialog. The >180s run was nobody
watching.

Consequences:

- With nobody at the keyboard, `create_sequence` **never returns**. That makes it unusable in
  exactly the unattended agent workflows this server exists to support.
- While the dialog is open, Premiere's whole scripting host is blocked, so *unrelated* calls
  fail too — `list_sequences` and `get_premiere_state` hit the CEP panel's own 45s watchdog
  with `ExtendScript execution timed out after 45000ms`. The bridge is healthy; the host is
  not answering.
- Premiere still reports `Responding=True` at the OS level throughout, so process-level health
  checks will not catch this.

`createSequence` passes a 180s timeout. That is not a fix — a longer timeout only waits longer
for a click. It exists so an *attended* run succeeds instead of reporting a failure for a
sequence Premiere did create.

If you are driving this from an agent:

- treat a `create_sequence` timeout as **unknown**, never as **failed**
- read the sequence list back before retrying, or you will stack up duplicates
- expect any call issued while the dialog is open to fail regardless of what it does

Anyone who knows a Premiere scripting path that creates a sequence without prompting —
`createNewSequenceFromClips`, a QE call, or a preset form that suppresses the dialog — that is
the real fix and is very welcome.

## Modal-dialog audit

`create_sequence` blocked on a modal dialog (fixed above), so the rest of the catalog's DOM
calls were audited for the same failure mode. A blocking dialog does not just fail its own
call — it freezes the entire ExtendScript host, so unrelated tools start timing out too, and
Premiere still reports `Responding=True` to the OS throughout.

| Call | Tool | Status |
| --- | --- | --- |
| `app.project.createNewSequence` | `create_sequence` | **fixed** — now uses `qe.project.newSequence` |
| `app.project.importFiles(..., false, ...)` | `import_fcp_xml`, `import_edl` fallback | **fixed** — `suppressUI` now `true`, matching `import_media` |
| `app.importEDL` | `import_edl` | **known to prompt.** Premiere shows an interactive sequence-settings dialog and the API takes no argument to suppress it. Cannot run unattended. |
| `app.newProject` | `create_project` | **verified clean** — 0.7–2.2s, no dialog |
| `app.openDocument` | `open_project` | **verified clean** for modals, but see the separate defect below |
| `app.project.saveAs` | `save_project_as` | **verified clean** — 0.7s, no dialog |
| `app.project.exportAAF` | `export_aaf` | **verified clean** — 0.7s, no dialog |
| `app.project.consolidateDuplicates` | `consolidate_duplicates` | **verified clean** — 0.7s, no dialog |
| `app.project.save` | `save_project` | **verified clean** — 0.7s, no dialog |
| `app.executeCommand` | `undo`, `redo`, `lift_selection`, `extract_selection`, `match_frame` | **varies by command.** Menu commands can open dialogs; the ones wired up here do not |
| `app.project.importFiles(..., true, ...)` | `import_media` | fine |
| `qe.project.*` | effects, transitions, playback | fine — QE calls do not prompt |

Verified on Premiere Pro 26.0.2 / Windows by firing each call while polling the host's window
list for an owned `#32770` window alongside a disabled main window. Run in both states: with a
clean project, and with unsaved changes pending — the case that would most plausibly raise a
save-changes prompt. Nothing prompted in either.

`create_sequence` appears to be the only modal-prone call in the catalog.

## Observed: open_project can silently fail to switch, trigger unknown

Status: detected and reported honestly. **Cause not established — do not treat this as diagnosed.**

`app.openDocument` was seen once to not switch projects at all: no prompt, no throw, nothing
opened, Premiere simply stayed where it was.

`openProject` catches it, because it compares `app.project.path` against the requested path
afterwards and refuses to claim success on a mismatch. That check is the only reason this did
not surface as a phantom success.

```
"Premiere Pro did not activate the requested project"
actualPath: "C:\\Users\\Admin\\...\\switch-probe.prproj"
```

A `save_project` followed by the identical call then succeeded, which suggested unsaved changes
as the cause — but a later deliberate test, opening a different project with unsaved changes
pending, switched without complaint. So that theory does not hold and the real trigger is
unknown. It is recorded here as an observation, not a diagnosis.

If you can reproduce it, the useful details are what the previous project was, how it was
created, and whether it had ever been saved.

## Fixed: activeSequence went stale after a project switch

Status: **fixed** — reads now go through a `__activeSequence()` membership guard.

`app.project.activeSequence` keeps returning a sequence from a previously open project.
Reproduced deterministically: create a sequence, switch to a fresh empty project, and the
empty project still reports the old sequence as active. The stale object stays readable rather
than throwing, so nothing downstream notices.

```json
{
  "name": "guard-probe.prproj",
  "sequenceCount": 0,
  "activeSequence": { "id": "e268ece2-...", "name": "Guard Probe 2790" }
}
```

A project containing zero sequences cannot have an active one. Any tool reading project state
got a phantom, and an agent targeting `activeSequence` operated on something that did not exist.

The stale value is detectable — its `sequenceID` is absent from `app.project.sequences` — so
`EXTENDSCRIPT_HELPERS` gained `__activeSequence()`, which checks membership and returns `null`
instead. All 44 read sites across `bridge/`, `tools/`, and `resources/` now call it. The two
assignments (`app.project.activeSequence = seq`) are untouched, and the helper itself is the
only remaining place that reads the raw property.

Verified on Premiere Pro 26.0.2: in a freshly created empty project the raw property still
returns `"Guard Probe 5164"` while `__activeSequence()` returns `null` and `get_project_info`
reports `activeSequence: null, hasActiveSequence: false`. With a valid active sequence,
`ping`, `get_project_info`, and `get_premiere_state` all still report it correctly.

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
