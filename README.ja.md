# Adobe Premiere Pro MCP Server

[English](README.md)

Adobe Premiere Pro を MCP 経由で操作できます。Codex、Claude Code、Claude Desktop、その他の MCP クライアントに対応しています。

## クイックスタート

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. Premiere Pro で `Window > Extensions > MCP Bridge (CEP)` を開きます。
2. `Temp Directory` を `/tmp/premiere-mcp-bridge` に設定します。
3. `Save Configuration`、`Start Bridge`、`Test Connection` を順に実行します。
4. テストに失敗した場合は `Run Diagnostics` を実行し、`/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json` を共有してください。

## MCP クライアント

- `npm run setup:mac` は macOS の Claude Desktop を自動設定します。
- Codex、Claude Code、その他のクライアントでは、ビルド済み `dist/index.js` と `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge` を使用してください。

## 正式なドキュメント

完全かつ最新のドキュメントは [README.md](README.md) を参照してください。
