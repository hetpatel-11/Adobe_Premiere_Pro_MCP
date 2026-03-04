#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer currently supports macOS only."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CEP_EXTENSIONS_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
CEP_TARGET_DIR="$CEP_EXTENSIONS_DIR/MCPBridgeCEP"
CLAUDE_CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
TEMP_DIR="/tmp/premiere-mcp-bridge"
DIST_ENTRY="$REPO_ROOT/dist/index.js"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required but 'node' was not found."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Node.js 18+ is required. Found: $(node -v)"
  exit 1
fi

echo "Installing npm dependencies..."
npm install --prefix "$REPO_ROOT"

echo "Building MCP server..."
npm run build --prefix "$REPO_ROOT"

if [[ ! -f "$DIST_ENTRY" ]]; then
  echo "Build completed but dist/index.js was not created."
  exit 1
fi

echo "Enabling Adobe CEP debug mode..."
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1

echo "Installing Premiere CEP extension..."
mkdir -p "$CEP_EXTENSIONS_DIR"
rm -rf "$CEP_TARGET_DIR"
cp -R "$REPO_ROOT/cep-plugin" "$CEP_TARGET_DIR"

echo "Preparing bridge temp directory..."
mkdir -p "$TEMP_DIR"

echo "Updating Claude Desktop config..."
mkdir -p "$(dirname "$CLAUDE_CONFIG_PATH")"
CONFIG_PATH="$CLAUDE_CONFIG_PATH" DIST_PATH="$DIST_ENTRY" TEMP_PATH="$TEMP_DIR" node -e '
const fs = require("fs");

const configPath = process.env.CONFIG_PATH;
const distPath = process.env.DIST_PATH;
const tempPath = process.env.TEMP_PATH;

let data = {};

if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, "utf8").trim();
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      console.error(`Claude Desktop config is not valid JSON: ${configPath}`);
      process.exit(1);
    }
  }
}

if (!data || typeof data !== "object" || Array.isArray(data)) {
  data = {};
}

if (!data.mcpServers || typeof data.mcpServers !== "object" || Array.isArray(data.mcpServers)) {
  data.mcpServers = {};
}

data.mcpServers["premiere-pro"] = {
  command: "node",
  args: [distPath],
  env: {
    PREMIERE_TEMP_DIR: tempPath
  }
};

fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
'

echo
echo "Install complete."
echo "Next:"
echo "1. Restart Claude Desktop."
echo "2. Restart Premiere Pro."
echo "3. Open Window > Extensions > MCP Bridge (CEP)."
echo "4. Set Temp Directory to $TEMP_DIR."
echo "5. Click Save Configuration, then Start Bridge, then Test Connection."
