#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This uninstaller currently supports macOS only."
  exit 1
fi

CEP_TARGET_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/MCPBridgeCEP"
CLAUDE_CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
TEMP_DIR="/tmp/premiere-mcp-bridge"

echo "Removing Premiere CEP extension..."
rm -rf "$CEP_TARGET_DIR"

echo "Removing bridge temp directory..."
rm -rf "$TEMP_DIR"

if [[ -f "$CLAUDE_CONFIG_PATH" ]]; then
  echo "Removing Claude Desktop config entry..."
  CONFIG_PATH="$CLAUDE_CONFIG_PATH" node -e '
const fs = require("fs");

const configPath = process.env.CONFIG_PATH;
let data = {};

const raw = fs.readFileSync(configPath, "utf8").trim();
if (raw) {
  try {
    data = JSON.parse(raw);
  } catch (error) {
    console.error(`Claude Desktop config is not valid JSON: ${configPath}`);
    process.exit(1);
  }
}

if (data && typeof data === "object" && !Array.isArray(data) && data.mcpServers && typeof data.mcpServers === "object" && !Array.isArray(data.mcpServers)) {
  delete data.mcpServers["premiere-pro"];
}

fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
'
fi

echo
echo "Uninstall complete."
echo "Note: Adobe CEP debug mode remains enabled so other CEP plugins keep working."
