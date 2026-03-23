# Quick Start

This is the shortest path to a working install.

## Claude Desktop (macOS)

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

Then do this once inside Premiere Pro:

1. Open `Premiere Pro > Preferences > Plugins` and enable **UXP Plugins > Enable developer mode**.
2. Restart Premiere Pro if the setting was changed.
3. Open `Window > Extensions > MCP Bridge (CEP)`.
4. Set `Temp Directory` to `/tmp/premiere-mcp-bridge`.
5. Click `Save Configuration`.
6. Click `Start Bridge`.
7. Click `Test Connection`.
8. If it fails, click `Run Diagnostics` and send back `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

Visual reference:

![Enable UXP developer mode in Premiere Pro](images/uxp-developer-mode.png)

Then restart Claude Desktop and ask:

```text
What's my current Premiere Pro project info?
```

For better editing behavior, attach `premiere://config/get_instructions` before asking the model to change a project.

## Codex / Claude Code

Build the server:

```bash
npm install
npm run build
```

Add the MCP entry on one line:

```bash
codex mcp add premiere_pro --env PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge -- node /absolute/path/to/Adobe_Premiere_Pro_MCP/dist/index.js
```

Then:

1. Restart the client.
2. Open the Premiere CEP panel.
3. Confirm the temp directory is `/tmp/premiere-mcp-bridge`.
4. Click `Start Bridge`.

## Sanity Checks

Run:

```bash
npm run setup:doctor
```

For a real end-to-end verification, use a scratch project and run:

```bash
node scripts/live-tool-sweep.mjs
```

That sweep creates disposable `Sweep ...` sequences so the live bridge is actually exercised.

## Common Failure Cases

### The client sees the MCP server but tool calls fail

- Premiere is not open
- no project is open
- the CEP panel is not started
- the temp directory in the panel is not `/tmp/premiere-mcp-bridge`
- the panel needs a right-click `Reload` after bridge updates
- diagnostics are available from the CEP panel via `Run Diagnostics`

### `codex mcp add` fails

- the command was split across lines
- the path to `dist/index.js` is wrong
- the client was not restarted after config changes

### `setup:doctor` fails

- the CEP extension is not installed
- `dist/index.js` was not built
- Adobe CEP debug mode is disabled
- the Claude Desktop config entry points to the wrong path

For the full release notes and current limits, see `README.md` and `KNOWN_ISSUES.md`.
