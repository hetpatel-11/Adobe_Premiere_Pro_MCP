# Adobe Premiere Pro MCP Server

[English](README.md)

透過 MCP 使用 Codex、Claude Code、Claude Desktop 或其他 MCP 用戶端控制 Adobe Premiere Pro。

## 快速開始

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. 在 Premiere Pro 中開啟 `Window > Extensions > MCP Bridge (CEP)`。
2. 將 `Temp Directory` 設定為 `/tmp/premiere-mcp-bridge`。
3. 依序按下 `Save Configuration`、`Start Bridge` 與 `Test Connection`。
4. 如果測試失敗，請按下 `Run Diagnostics`，並提供 `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`。

## MCP 用戶端

- `npm run setup:mac` 會在 macOS 上自動設定 Claude Desktop。
- 對於 Codex、Claude Code 與其他用戶端，請使用已建置的 `dist/index.js`，並設定 `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`。

## 正式文件

完整且最新的文件請參閱 [README.md](README.md)。
