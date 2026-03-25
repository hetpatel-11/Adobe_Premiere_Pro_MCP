# Adobe Premiere Pro MCP Server

[English](README.md)

通过 MCP 使用 Codex、Claude Code、Claude Desktop 或其他 MCP 客户端控制 Adobe Premiere Pro。

## 快速开始

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. 在 Premiere Pro 中打开 `Window > Extensions > MCP Bridge (CEP)`。
2. 将 `Temp Directory` 设置为 `/tmp/premiere-mcp-bridge`。
3. 依次点击 `Save Configuration`、`Start Bridge` 和 `Test Connection`。
4. 如果测试失败，请点击 `Run Diagnostics`，并提供 `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`。

## MCP 客户端

- `npm run setup:mac` 会在 macOS 上自动配置 Claude Desktop。
- 对于 Codex、Claude Code 和其他客户端，请使用构建后的 `dist/index.js`，并设置 `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`。

## 正式文档

完整且最新的文档请查看 [README.md](README.md)。
