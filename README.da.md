# Adobe Premiere Pro MCP Server

[English](README.md)

Styr Adobe Premiere Pro via MCP med Codex, Claude Code, Claude Desktop eller en anden MCP-klient.

## Hurtig start

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. Åbn `Window > Extensions > MCP Bridge (CEP)` i Premiere Pro.
2. Sæt `Temp Directory` til `/tmp/premiere-mcp-bridge`.
3. Klik på `Save Configuration`, `Start Bridge` og derefter `Test Connection`.
4. Hvis testen fejler, klik på `Run Diagnostics` og del `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## MCP-klienter

- `npm run setup:mac` konfigurerer automatisk Claude Desktop på macOS.
- For Codex, Claude Code og andre klienter skal du bruge den byggede `dist/index.js` sammen med `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Officiel dokumentation

Den fulde og opdaterede dokumentation findes i [README.md](README.md).
