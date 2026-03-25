# Adobe Premiere Pro MCP Server

[English](README.md)

Upravljajte Adobe Premiere Pro kroz MCP pomoću Codexa, Claude Codea, Claude Desktopa ili bilo kojeg drugog MCP klijenta.

## Brzi početak

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. U Premiere Pro otvorite `Window > Extensions > MCP Bridge (CEP)`.
2. Postavite `Temp Directory` na `/tmp/premiere-mcp-bridge`.
3. Kliknite `Save Configuration`, `Start Bridge`, pa zatim `Test Connection`.
4. Ako test ne uspije, kliknite `Run Diagnostics` i pošaljite `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## MCP klijenti

- `npm run setup:mac` automatski podešava Claude Desktop na macOS-u.
- Za Codex, Claude Code i druge klijente koristite izgrađeni `dist/index.js` sa `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Zvanična dokumentacija

Potpuna i najnovija dokumentacija je u [README.md](README.md).
