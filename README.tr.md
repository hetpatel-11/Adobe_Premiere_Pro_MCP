# Adobe Premiere Pro MCP Server

[English](README.md)

Adobe Premiere Pro'yu MCP üzerinden Codex, Claude Code, Claude Desktop veya başka bir MCP istemcisiyle kontrol edin.

## Hızlı başlangıç

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. Premiere Pro içinde `Window > Extensions > MCP Bridge (CEP)` bölümünü açın.
2. `Temp Directory` değerini `/tmp/premiere-mcp-bridge` olarak ayarlayın.
3. `Save Configuration`, `Start Bridge` ve ardından `Test Connection` düğmelerine tıklayın.
4. Test başarısız olursa `Run Diagnostics` düğmesine tıklayın ve `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json` dosyasını paylaşın.

## MCP istemcileri

- `npm run setup:mac`, macOS üzerinde Claude Desktop yapılandırmasını otomatik yapar.
- Codex, Claude Code ve diğer istemciler için derlenmiş `dist/index.js` ile `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge` kullanın.

## Resmi belgeler

Tam ve güncel belgeler [README.md](README.md) dosyasındadır.
