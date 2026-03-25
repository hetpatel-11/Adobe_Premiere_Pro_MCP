# Adobe Premiere Pro MCP Server

[English](README.md)

Steuere Adobe Premiere Pro über MCP mit Codex, Claude Code, Claude Desktop oder einem anderen MCP-Client.

## Schnellstart

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. Öffne in Premiere Pro `Window > Extensions > MCP Bridge (CEP)`.
2. Setze `Temp Directory` auf `/tmp/premiere-mcp-bridge`.
3. Klicke auf `Save Configuration`, `Start Bridge` und danach `Test Connection`.
4. Wenn der Test fehlschlägt, klicke auf `Run Diagnostics` und sende `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## MCP-Clients

- `npm run setup:mac` konfiguriert Claude Desktop auf macOS automatisch.
- Für Codex, Claude Code und andere Clients verwende die gebaute `dist/index.js` mit `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Offizielle Dokumentation

Die vollständige und aktuelle Dokumentation steht in [README.md](README.md).
