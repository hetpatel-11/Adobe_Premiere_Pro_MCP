# Known Issues

This file tracks current, confirmed limits. It is no longer a backlog of already-fixed prototype bugs.

## Current State

The current built tool catalog exposes:

- `108` core tools with a real dispatch in `src/tools/index.ts`
- `62` expanded tools with a real handler in `src/tools/expanded.ts`
- `170` advertised in total (expanded names that duplicate a core name are filtered out)

`111` further names are declared in `unimplementedExpandedToolNames` and are deliberately
**not** advertised. See the next section for why.

## Fixed: expanded tools reported fake success

Status: fixed

The expanded catalog advertised `173` names but only `62` had a handler. Everything else fell
through to:

```js
default:
  return ok({ accepted: true, name: toolName, args: args, note: "..." });
```

`ok()` sets `success: true`. So `ripple_delete`, `roll_edit`, `slip_edit`, `remove_effect`,
`scene_edit_detection`, `move_clip_to_track`, `set_effect_property`, `replace_clip_media`,
`export_omf` and roughly ninety others returned a success to the calling agent while doing
nothing to the project. A further `14` read tools returned
`{ available: true, note: "Read operation completed..." }` with no data, and `add_tracks`
returned `success: true` alongside `skipped: true`.

For an agent driving an edit this is the worst possible failure mode: it believes the timeline
changed, and it builds its next several calls on that belief.

Now:

- unimplemented names are parked in `unimplementedExpandedToolNames` and never advertised
- `executeExpandedTool` rejects them explicitly if one is reached anyway
- the generated ExtendScript `default:` branch returns `fail(...)`, not `ok(...)`
- `src/__tests__/tools/expanded.test.ts` pins the invariant so the list and the switch cannot
  drift apart silently again

Implementing one of the parked tools means adding a real handler and moving its name into
`expandedToolNames`.

## Known: the jest suite does not run under ESM

Status: pre-existing, not addressed here

`npm test` fails with `ReferenceError: jest is not defined` in five of the six original suites.
Under `ts-jest/presets/default-esm` Jest does not inject globals, so each suite needs
`import { jest } from '@jest/globals'`, and the `jest.mock(...)` calls need porting to
`jest.unstable_mockModule`. `src/__tests__/tools/expanded.test.ts` takes the import route and
passes; the older suites still need the mock rewrite.

Run the passing suite with:

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest src/__tests__/tools/expanded.test.ts
```

## Live sweep

The last broad live sweep in this repository was run on March 4, 2026, against the pre-trim
catalog:

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
