# Adobe Premiere Pro MCP Server

[English](README.md)

تحكم في Adobe Premiere Pro عبر MCP باستخدام Codex أو Claude Code أو Claude Desktop أو أي عميل MCP آخر.

## البدء السريع

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. في Premiere Pro افتح `Window > Extensions > MCP Bridge (CEP)`.
2. اضبط `Temp Directory` على `/tmp/premiere-mcp-bridge`.
3. اضغط `Save Configuration` ثم `Start Bridge` ثم `Test Connection`.
4. إذا فشل الاختبار، اضغط `Run Diagnostics` وشارك الملف `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`.

## عملاء MCP

- يقوم `npm run setup:mac` بإعداد Claude Desktop تلقائيًا على macOS.
- بالنسبة إلى Codex وClaude Code والعملاء الآخرين، استخدم `dist/index.js` بعد البناء مع `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`.

## الوثائق الرسمية

الوثائق الكاملة والأحدث موجودة في [README.md](README.md).
