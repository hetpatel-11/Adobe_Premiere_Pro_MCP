# Adobe Premiere Pro MCP Server

[English](README.md)

គ្រប់គ្រង Adobe Premiere Pro តាមរយៈ MCP ដោយប្រើ Codex, Claude Code, Claude Desktop ឬ MCP client ផ្សេងទៀត។

## ចាប់ផ្តើមរហ័ស

```bash
git clone https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP.git
cd Adobe_Premiere_Pro_MCP
npm run setup:mac
```

1. នៅក្នុង Premiere Pro បើក `Window > Extensions > MCP Bridge (CEP)`។
2. កំណត់ `Temp Directory` ទៅជា `/tmp/premiere-mcp-bridge`។
3. ចុច `Save Configuration`, `Start Bridge`, បន្ទាប់មក `Test Connection`។
4. បើការធ្វើតេស្តបរាជ័យ សូមចុច `Run Diagnostics` ហើយផ្ញើឯកសារ `/tmp/premiere-mcp-bridge/premiere-mcp-diagnostics-latest.json`។

## MCP Clients

- `npm run setup:mac` កំណត់ Claude Desktop លើ macOS ដោយស្វ័យប្រវត្តិ។
- សម្រាប់ Codex, Claude Code និង client ផ្សេងទៀត សូមប្រើ `dist/index.js` ដែលបាន build រួចជាមួយ `PREMIERE_TEMP_DIR=/tmp/premiere-mcp-bridge`។

## ឯកសារផ្លូវការ

ឯកសារពេញលេញ និងថ្មីបំផុតស្ថិតនៅក្នុង [README.md](README.md)។
