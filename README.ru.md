# Adobe Premiere Pro MCP Server

[English](README.md)

Управляйте Adobe Premiere Pro через MCP с помощью Codex, Claude Code, Claude Desktop или любого другого MCP-клиента.

## Быстрый старт

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. В Premiere Pro откройте `Window > Extensions > MCP Bridge (CEP)`.
2. Установите `Temp Directory` в `/tmp/premiere-mcp-bridge`.
3. Нажмите `Save Configuration`, затем `Start Bridge`, затем `Test Connection`.
4. Если тест не пройдет, нажмите `Run Diagnostics` и отправьте `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## MCP-клиенты

- `npm run setup:mac` автоматически настраивает Claude Desktop на macOS.
- Для Codex, Claude Code и других клиентов используйте собранный `dist/index.js` и `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## Основная документация

Полная и актуальная документация находится в [README.md](README.md).
