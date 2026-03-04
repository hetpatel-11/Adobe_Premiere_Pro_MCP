# Known Issues

This file tracks current, confirmed limits. It is no longer a backlog of already-fixed prototype bugs.

## Current State (March 4, 2026)

The locally validated tool surface is:

- `97` exposed tools
- `43` live-executed against a real Premiere Pro session
- `50` schema-validated in the same sweep
- `3` intentionally skipped because they mutate or save project state during no-arg testing

## Confirmed Runtime Limitation

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
