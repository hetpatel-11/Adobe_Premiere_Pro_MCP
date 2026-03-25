# Adobe Premiere Pro MCP Server

[English](README.md)

Codex, Claude Code, Claude Desktop 또는 다른 MCP 클라이언트를 통해 MCP로 Adobe Premiere Pro를 제어합니다.

## 빠른 시작

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. Premiere Pro에서 `Window > Extensions > MCP Bridge (CEP)`를 엽니다.
2. `Temp Directory`를 `/tmp/premiere-mcp-bridge`로 설정합니다.
3. `Save Configuration`, `Start Bridge`, `Test Connection`을 순서대로 클릭합니다.
4. 테스트가 실패하면 `Run Diagnostics`를 클릭하고 `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json` 파일을 공유해 주세요.

## MCP 클라이언트

- `npm run setup:mac`는 macOS에서 Claude Desktop을 자동으로 구성합니다.
- Codex, Claude Code 및 기타 클라이언트는 빌드된 `dist/index.js`와 `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`를 사용하세요.

## 공식 문서

전체 최신 문서는 [README.md](README.md)에 있습니다.
