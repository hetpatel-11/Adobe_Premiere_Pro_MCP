<#
.SYNOPSIS
    Installs the Premiere Pro MCP server and CEP bridge panel on Windows.

.DESCRIPTION
    Windows counterpart to scripts/install-macos.sh. It installs dependencies, builds
    dist/index.js, installs the "MCP Bridge (CEP)" extension into the per-user CEP
    extensions folder, enables Adobe CEP debug mode, creates the bridge temp directory,
    and registers the premiere-pro MCP entry with Claude Desktop.

    Adobe refuses to load unsigned CEP extensions unless debug mode is on, so this script
    sets PlayerDebugMode=1 under HKCU:\Software\Adobe\CSXS.10 / .11 / .12. That is a
    per-user Adobe setting, but it applies to every Adobe app on this account and lets any
    unsigned CEP extension load — not just this one. Use -SkipDebugMode to opt out and set
    it yourself.

.PARAMETER TempDir
    Bridge temp directory shared by the MCP server and the CEP panel.
    Defaults to $env:TEMP\premiere-mcp-bridge.

.PARAMETER SkipClaudeDesktop
    Do not touch claude_desktop_config.json. Use this when you register the MCP server
    manually (Claude Code, Codex, or another client).

.PARAMETER SkipDebugMode
    Do not write the CEP PlayerDebugMode registry values.

.PARAMETER ZXPSignCmd
    Path to Adobe's ZXPSignCmd.exe. When supplied, the extension is signed with a
    self-signed certificate and the signed build is installed. Required on Premiere Pro
    26.x, which refuses unsigned extensions no matter what PlayerDebugMode is set to.
    See scripts/sign-windows.ps1 and README.md.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -ZXPSignCmd C:\tools\ZXPSignCmd.exe

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1 -SkipClaudeDesktop
#>

[CmdletBinding()]
param(
    [string] $TempDir = (Join-Path $env:TEMP 'premiere-mcp-bridge'),
    [switch] $SkipClaudeDesktop,
    [switch] $SkipDebugMode,
    [string] $ZXPSignCmd
)

$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    Write-Error 'This installer supports Windows only. Use scripts/install-macos.sh on macOS.'
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$cepExtensionsDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$cepTargetDir = Join-Path $cepExtensionsDir 'MCPBridgeCEP'
$claudeConfigPath = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
$distEntry = Join-Path $repoRoot 'dist\index.js'

# --- Node.js -----------------------------------------------------------------

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "Node.js 18+ is required but 'node' was not found on PATH."
    exit 1
}

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
    Write-Error "Node.js 18+ is required. Found: $(& node -v)"
    exit 1
}

# npm ships as npm.cmd on Windows; resolve it explicitly so & works under any shell.
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) {
    Write-Error "npm was not found on PATH."
    exit 1
}

# --- Build -------------------------------------------------------------------

Write-Host 'Installing npm dependencies...'
& $npm.Source install --prefix $repoRoot
if ($LASTEXITCODE -ne 0) { Write-Error 'npm install failed.'; exit 1 }

Write-Host 'Building MCP server...'
& $npm.Source run build --prefix $repoRoot
if ($LASTEXITCODE -ne 0) { Write-Error 'npm run build failed.'; exit 1 }

if (-not (Test-Path $distEntry)) {
    Write-Error "Build completed but dist\index.js was not created."
    exit 1
}

# --- CEP debug mode ----------------------------------------------------------

if ($SkipDebugMode) {
    Write-Host 'Skipping CEP debug mode (-SkipDebugMode).'
    Write-Host '  Set PlayerDebugMode=1 under HKCU:\Software\Adobe\CSXS.<version> yourself,'
    Write-Host '  or Premiere will refuse to load the unsigned bridge panel.'
} else {
    Write-Host 'Enabling Adobe CEP debug mode (HKCU:\Software\Adobe\CSXS.10/.11/.12)...'
    foreach ($csxs in @('CSXS.10', 'CSXS.11', 'CSXS.12')) {
        $key = "HKCU:\Software\Adobe\$csxs"
        if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
        # PlayerDebugMode is read as a string by CEP, not a DWORD.
        New-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -PropertyType String -Force | Out-Null
    }
}

# --- CEP extension -----------------------------------------------------------

Write-Host 'Installing Premiere CEP extension...'
if (-not (Test-Path $cepExtensionsDir)) {
    New-Item -ItemType Directory -Path $cepExtensionsDir -Force | Out-Null
}

if ($ZXPSignCmd) {
    # Signed install. Premiere 26.x verifies CEP signatures regardless of PlayerDebugMode,
    # so this is the only path that works there.
    & (Join-Path $scriptDir 'sign-windows.ps1') -ZXPSignCmd $ZXPSignCmd
    if ($LASTEXITCODE -ne 0) { Write-Error 'Signing failed; extension not installed.'; exit 1 }
} else {
    if (Test-Path $cepTargetDir) {
        Remove-Item -Path $cepTargetDir -Recurse -Force
    }
    Copy-Item -Path (Join-Path $repoRoot 'cep-plugin') -Destination $cepTargetDir -Recurse -Force

    Write-Host ''
    Write-Host 'NOTE: this extension is unsigned.'
    Write-Host '  On Premiere Pro 26.x the panel will NOT appear under Window > Extensions, even'
    Write-Host '  with PlayerDebugMode set. Verified on 26.0.2 (CEP 12): the host logs'
    Write-Host '  "Signature verification failed" and skips the extension. Debug mode is not a'
    Write-Host '  workaround on that release; the extension has to be signed.'
    Write-Host '  Fix: download ZXPSignCmd from Adobe, then run'
    Write-Host '    .\scripts\sign-windows.ps1 -ZXPSignCmd <path to ZXPSignCmd.exe>'
    Write-Host '  https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD'
    Write-Host ''
}

# --- Bridge temp directory ---------------------------------------------------

Write-Host "Preparing bridge temp directory: $TempDir"
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

# --- Claude Desktop config ---------------------------------------------------

if ($SkipClaudeDesktop) {
    Write-Host 'Skipping Claude Desktop config (-SkipClaudeDesktop).'
} else {
    Write-Host 'Updating Claude Desktop config...'
    $claudeConfigDir = Split-Path -Parent $claudeConfigPath
    if (-not (Test-Path $claudeConfigDir)) {
        New-Item -ItemType Directory -Path $claudeConfigDir -Force | Out-Null
    }

    # Edit the config with Node rather than ConvertTo-Json: Windows PowerShell 5.1 mangles
    # nested objects past its default depth and reorders keys, which would corrupt any other
    # MCP servers the user already has registered.
    $helperScript = @'
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
'@

    $helperPath = Join-Path $env:TEMP 'premiere-mcp-config-update.cjs'
    Set-Content -Path $helperPath -Value $helperScript -Encoding utf8

    $env:CONFIG_PATH = $claudeConfigPath
    $env:DIST_PATH = $distEntry
    $env:TEMP_PATH = $TempDir
    try {
        & node $helperPath
        if ($LASTEXITCODE -ne 0) { Write-Error 'Failed to update Claude Desktop config.'; exit 1 }
    } finally {
        Remove-Item -Path $helperPath -Force -ErrorAction SilentlyContinue
    }
}

# --- Done --------------------------------------------------------------------

Write-Host ''
Write-Host 'Install complete.'
Write-Host 'Next:'
Write-Host '1. Restart Claude Desktop (or your MCP client).'
Write-Host '2. Restart Premiere Pro.'
Write-Host '3. Open Window > Extensions > MCP Bridge (CEP).'
Write-Host "4. Set Temp Directory to $TempDir"
Write-Host '5. Click Save Configuration, then Start Bridge, then Test Connection.'
Write-Host ''
Write-Host 'For a client you register by hand, use:'
Write-Host "  command: node $distEntry"
Write-Host "  env:     PREMIERE_TEMP_DIR=$TempDir"
