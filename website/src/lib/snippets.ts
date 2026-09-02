export const NPM_INSTALL = `npm install -g adobe-premiere-pro-mcp
premiere-pro-mcp --install-cep
premiere-pro-mcp --doctor`

export const CLIENT_CONFIG = `{
  "mcpServers": {
    "premiere-pro": {
      "command": "premiere-pro-mcp"
    }
  }
}`

export const VERIFY_PROMPT =
  "Run verify_premiere_connection. Make no changes."

export const AGENT_PROMPT = `Install Premiere Pro MCP on this computer and connect it to this chat.

Package: adobe-premiere-pro-mcp on npm. CLI: premiere-pro-mcp.
Repo: https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP
Do not install similarly named packages.

1. Need Node 20+ and Adobe Premiere Pro on this same machine.
2. Run:
   npm install -g adobe-premiere-pro-mcp
   premiere-pro-mcp --install-cep
   premiere-pro-mcp --doctor
3. Register an MCP server named premiere-pro with command premiere-pro-mcp in this client. Restart the client if it only reads config at launch.
4. Tell me the exact Premiere steps: restart Premiere, open Window → Extensions → MCP Bridge (CEP), set the temp directory the installer printed, Start Bridge. Wait until I confirm the panel is green.
5. Then run verify_premiere_connection. Make no changes.
6. After that, use search_tools and invoke_tool. Do not invent tool names.`

export const CODEX_PLUGIN = `codex plugin marketplace add .
codex plugin add premiere-pro-mcp@adobe-premiere-pro-mcp`

export const CLAUDE_CODE_PLUGIN = `/plugin marketplace add .
/plugin install premiere-pro-mcp@adobe-premiere-pro-mcp`

export const RELEASES =
  "https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP/releases"
export const REPO = "https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP"
export const ISSUES = `${REPO}/issues`
export const NPM = "https://www.npmjs.com/package/adobe-premiere-pro-mcp"
export const MCPB =
  "https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP/releases/latest"
