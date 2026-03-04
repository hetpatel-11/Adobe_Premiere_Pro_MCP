#!/usr/bin/env bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This doctor command currently supports macOS only."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_ENTRY="$REPO_ROOT/dist/index.js"
CEP_TARGET_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/MCPBridgeCEP"
CLAUDE_CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
TEMP_DIR="/tmp/premiere-mcp-bridge"
FAILURES=0

pass() {
  echo "[ok] $1"
}

fail() {
  echo "[missing] $1"
  FAILURES=$((FAILURES + 1))
}

info() {
  echo "[info] $1"
}

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v)"
  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    pass "Node.js available ($NODE_VERSION)"
  else
    fail "Node.js 18+ required (found $NODE_VERSION)"
  fi
else
  fail "Node.js not found in PATH"
fi

if [[ -f "$DIST_ENTRY" ]]; then
  pass "Built MCP server found at $DIST_ENTRY"
else
  fail "Build output missing at $DIST_ENTRY (run npm run build)"
fi

if [[ -d "$CEP_TARGET_DIR" ]]; then
  if [[ -f "$CEP_TARGET_DIR/CSXS/manifest.xml" && -f "$CEP_TARGET_DIR/index.html" ]]; then
    pass "Premiere CEP extension installed at $CEP_TARGET_DIR"
  else
    fail "CEP extension folder exists but is incomplete at $CEP_TARGET_DIR"
  fi
else
  fail "Premiere CEP extension not installed at $CEP_TARGET_DIR"
fi

if [[ -d "$TEMP_DIR" ]]; then
  pass "Bridge temp directory exists at $TEMP_DIR"
else
  fail "Bridge temp directory missing at $TEMP_DIR"
fi

for csxs_version in 12 11 10; do
  VALUE="$(defaults read "com.adobe.CSXS.$csxs_version" PlayerDebugMode 2>/dev/null || true)"
  if [[ "$VALUE" == "1" ]]; then
    pass "Adobe CEP debug mode enabled for CSXS.$csxs_version"
  else
    fail "Adobe CEP debug mode not enabled for CSXS.$csxs_version"
  fi
done

if [[ -f "$CLAUDE_CONFIG_PATH" ]]; then
  CONFIG_CHECK="$(
    CONFIG_PATH="$CLAUDE_CONFIG_PATH" DIST_PATH="$DIST_ENTRY" TEMP_PATH="$TEMP_DIR" node -e '
const fs = require("fs");

const configPath = process.env.CONFIG_PATH;
const distPath = process.env.DIST_PATH;
const tempPath = process.env.TEMP_PATH;

try {
  const raw = fs.readFileSync(configPath, "utf8");
  const data = JSON.parse(raw);
  const server = data && data.mcpServers && data.mcpServers["premiere-pro"];

  if (!server) {
    console.log("missing-server");
    process.exit(0);
  }

  const arg0 = Array.isArray(server.args) ? server.args[0] : "";
  const temp = server.env && server.env.PREMIERE_TEMP_DIR;

  if (server.command !== "node") {
    console.log(`bad-command:${server.command || ""}`);
  } else if (arg0 !== distPath) {
    console.log(`bad-path:${arg0}`);
  } else if (temp !== tempPath) {
    console.log(`bad-temp:${temp || ""}`);
  } else {
    console.log("ok");
  }
} catch (error) {
  console.log(`invalid-json:${error.message}`);
}
'
  )"

  case "$CONFIG_CHECK" in
    ok)
      pass "Claude Desktop config contains a valid premiere-pro entry"
      ;;
    missing-server)
      fail "Claude Desktop config is present but missing the premiere-pro entry"
      ;;
    bad-command:*)
      fail "Claude Desktop config has a premiere-pro entry with the wrong command (${CONFIG_CHECK#bad-command:})"
      ;;
    bad-path:*)
      fail "Claude Desktop config points to the wrong dist path (${CONFIG_CHECK#bad-path:})"
      ;;
    bad-temp:*)
      fail "Claude Desktop config points to the wrong temp dir (${CONFIG_CHECK#bad-temp:})"
      ;;
    invalid-json:*)
      fail "Claude Desktop config is not valid JSON"
      ;;
    *)
      fail "Claude Desktop config check returned an unexpected result: $CONFIG_CHECK"
      ;;
  esac
else
  fail "Claude Desktop config not found at $CLAUDE_CONFIG_PATH"
fi

info "Premiere panel check must still be done manually inside Premiere Pro."
info "Open Window > Extensions > MCP Bridge (CEP), then click Test Connection."

if [[ "$FAILURES" -gt 0 ]]; then
  echo
  echo "Doctor found $FAILURES issue(s)."
  exit 1
fi

echo
echo "Doctor check passed."
