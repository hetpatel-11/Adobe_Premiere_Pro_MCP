# Adobe Premiere Pro MCP Server

Control Adobe Premiere Pro through MCP using Claude Desktop, Claude Code, or Codex.

<a href="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@hetpatel-11/Adobe_Premiere_Pro_MCP/badge" alt="Adobe Premiere Pro MCP server" />
</a>

## Current Status

This repository is currently validated for:

- macOS
- Adobe Premiere Pro 2020+
- Node.js 18+
- Claude Desktop with the included installer
- Claude Code / Codex with a manual MCP entry

Current local validation as of March 4, 2026:

- `97` tools are exposed
- `43` tools were live-executed against a real Premiere session
- `50` tools were schema-validated in the same sweep
- `3` destructive no-arg tools were intentionally skipped (`save_project`, `undo`, `consolidate_duplicates`)
- `1` live runtime limitation remains: `get_render_queue_status` requires Adobe Media Encoder integration

The full live sweep output is written to `/tmp/premiere-mcp-bridge/live-tool-sweep.json` when you run the verifier.

## What You Get

The server covers project operations, ingest, sequence creation, timeline editing, transitions, effects, keyframes, metadata, exports, and higher-level assembly workflows.

Example prompts:

- "List all sequences and show me which one is active."
- "Import these three shots and build a rough product spot."
- "Add cross dissolves to every cut on video track 1."
- "Apply Gaussian Blur to the middle clip."
- "Export the active sequence as FCP XML."

High-level workflow tools included:

- `build_motion_graphics_demo`
- `assemble_product_spot`
- `build_brand_spot_from_mogrt_and_assets`

## Fastest Install (Claude Desktop on macOS)

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

That installer will:

- install dependencies
- build `dist/index.js`
- enable Adobe CEP debug mode
- install the `MCP Bridge (CEP)` extension
- create `/tmp/premiere-mcp-bridge`
- add the `premiere-pro` MCP entry to Claude Desktop

After the installer finishes:

1. Quit and reopen Claude Desktop.
2. Quit and reopen Premiere Pro.
3. Open `Window > Extensions > MCP Bridge (CEP)`.
4. Set `Temp Directory` to `/tmp/premiere-mcp-bridge`.
5. Click `Save Configuration`.
6. Click `Start Bridge`.
7. Click `Test Connection`.

If the panel reports that Premiere is ready, the bridge is live.

## Claude Code / Codex Setup

The macOS installer only updates Claude Desktop automatically. For Claude Code or Codex, build locally and add the server yourself.

```bash
npm install
npm run build
```

Add the MCP server on a single line:

```bash
codex mcp add premiere_pro --env PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge -- node /absolute/path/to/Adobe_Premiere_Pro_MCP/dist/index.js
```

Important:

- keep the command on one line
- use the real absolute path to `dist/index.js`
- restart the client after adding or updating the MCP entry

If you use Claude Code config files instead, point your MCP entry at the same `dist/index.js` and set `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Verify the Install

Run the built-in checks:

```bash
npm run setup:doctor
```

That validates:

- Node.js version
- built server output
- CEP extension install
- `/tmp/premiere-mcp-bridge`
- Adobe CEP debug mode
- Claude Desktop config entry

For a deeper end-to-end check, use a disposable Premiere project and run:

```bash
node scripts/live-tool-sweep.mjs
```

This creates temporary `Sweep ...` sequences in the currently open project so the toolchain is exercised against real data.

## How the Bridge Works

```text
+-----------+        +-----------+        +-----------+
|  Client   |  MCP   | Node.js   | Files  | CEP Panel |
| (Claude)  |<------>| MCP Server|<------>| (Premiere)|
+-----------+        +-----------+        +-----------+
                                                 |
                                                 v
                                          +-----------+
                                          | Premiere  |
                                          | DOM / QE  |
                                          +-----------+
```

1. The client calls an MCP tool.
2. The Node server generates ExtendScript plus shared helpers.
3. The script is written into `/tmp/premiere-mcp-bridge`.
4. The CEP panel polls that directory and runs the script through `CSInterface.evalScript()`.
5. The panel writes the result back to the response file.
6. The server returns structured JSON to the MCP client.

## Tool Coverage

The `97` exposed tools are grouped roughly like this:

- Discovery and project inspection
- Project and sequence management
- Media import and bin management
- Timeline placement and clip operations
- Effects, transitions, color, and keyframes
- Markers, metadata, labels, and work-area control
- Export and interchange helpers
- MOGRT, captions, proxies, and relink helpers
- High-level ad / promo assembly workflows

Use MCP introspection in your client to see the full tool catalog and exact schemas.

## Real Limits

This project is much more usable than the original prototype, but it is not magic.

- Premiere scripting still does not expose every UI operation cleanly.
- Professional title design still depends on real MOGRT assets or external graphics workflows.
- `get_render_queue_status` is only useful when Adobe Media Encoder integration is available.
- The best results come from real source footage, real audio, and real brand assets. The automation layer assembles and manipulates them; it does not replace editorial judgment.

## Troubleshooting

If the tools are visible but calls fail:

1. Confirm Premiere Pro is open with a project loaded.
2. Open `Window > Extensions > MCP Bridge (CEP)`.
3. Confirm the temp directory is exactly `/tmp/premiere-mcp-bridge`.
4. Click `Start Bridge`.
5. If you updated the bridge code, right-click the panel and choose `Reload`.
6. Retry the command.

If the MCP client cannot find the server:

1. Verify the absolute path to `dist/index.js`.
2. Verify `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.
3. Restart the MCP client after changing config.
4. Run `npm run setup:doctor`.

## Developer Notes

Useful commands:

```bash
npm run build
npm test -- --runInBand
npm run setup:doctor
node scripts/live-tool-sweep.mjs
```

See:

- `QUICKSTART.md` for the shortest install path
- `KNOWN_ISSUES.md` for current limits
- `CONTRIBUTING.md` for development workflow
