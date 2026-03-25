# Adobe Premiere Pro MCP Server

[English](README.md)

Controle o Adobe Premiere Pro via MCP usando Codex, Claude Code, Claude Desktop ou qualquer outro cliente MCP.

## Início rápido

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. No Premiere Pro, abra `Window > Extensions > MCP Bridge (CEP)`.
2. Defina `Temp Directory` como `/tmp/premiere-mcp-bridge`.
3. Clique em `Save Configuration`, `Start Bridge` e depois em `Test Connection`.
4. Se o teste falhar, clique em `Run Diagnostics` e compartilhe `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## Clientes MCP

- `npm run setup:mac` configura automaticamente o Claude Desktop no macOS.
- Para Codex, Claude Code e outros clientes, use o `dist/index.js` já compilado com `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Documentação oficial

A documentação completa e mais atual está em [README.md](README.md).
