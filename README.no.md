# Adobe Premiere Pro MCP Server

[English](README.md)

Styr Adobe Premiere Pro via MCP med Codex, Claude Code, Claude Desktop eller en annen MCP-klient.

## Hurtigstart

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. Åpne `Window > Extensions > MCP Bridge (CEP)` i Premiere Pro.
2. Sett `Temp Directory` til `/tmp/premiere-mcp-bridge`.
3. Klikk `Save Configuration`, `Start Bridge` og deretter `Test Connection`.
4. Hvis testen feiler, klikk `Run Diagnostics` og del `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## MCP-klienter

- `npm run setup:mac` konfigurerer Claude Desktop automatisk på macOS.
- For Codex, Claude Code og andre klienter bruker du den bygde `dist/index.js` sammen med `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Offisiell dokumentasjon

Den komplette og oppdaterte dokumentasjonen finnes i [README.md](README.md).
