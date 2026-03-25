# Adobe Premiere Pro MCP Server

[English](README.md)

Controlla Adobe Premiere Pro tramite MCP con Codex, Claude Code, Claude Desktop o qualsiasi altro client MCP.

## Avvio rapido

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. In Premiere Pro, apri `Window > Extensions > MCP Bridge (CEP)`.
2. Imposta `Temp Directory` su `/tmp/premiere-mcp-bridge`.
3. Fai clic su `Save Configuration`, `Start Bridge` e poi `Test Connection`.
4. Se il test fallisce, fai clic su `Run Diagnostics` e condividi `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## Client MCP

- `npm run setup:mac` configura automaticamente Claude Desktop su macOS.
- Per Codex, Claude Code e gli altri client, usa `dist/index.js` già compilato con `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Documentazione ufficiale

La documentazione completa e aggiornata si trova in [README.md](README.md).
