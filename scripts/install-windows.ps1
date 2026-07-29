<#
.SYNOPSIS
    Installs the Premiere Pro MCP server and CEP bridge panel on Windows.

.DESCRIPTION
    Builds the MCP server, installs the CEP bridge into the per-user Adobe CEP
    extensions folder, enables CEP debug mode, creates the bridge temp directory,
    and writes MCP client config for GitHub Copilot in VS Code and Claude Desktop.

.PARAMETER TempDir
    Bridge temp directory shared by the MCP server and CEP panel.

.PARAMETER VsCodeConfigPath
    VS Code MCP config used by GitHub Copilot.

.PARAMETER ClaudeConfigPath
    Claude Desktop MCP config path.

.PARAMETER SkipBuild
    Skip npm install and npm run build. Useful for CI after build has already run.

.PARAMETER SkipCopilotConfig
    Do not write the VS Code GitHub Copilot MCP config.

.PARAMETER SkipClaudeDesktopConfig
    Do not write Claude Desktop MCP config.

.PARAMETER SkipAdobeDebugMode
    Do not write Adobe CEP PlayerDebugMode registry values.
#>

[CmdletBinding()]
param(
    [string] $TempDir = (Join-Path $env:TEMP 'premiere-mcp-bridge'),
    [string] $VsCodeConfigPath = (Join-Path $env:APPDATA 'Code\User\mcp.json'),
    [string] $ClaudeConfigPath = (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'),
    [switch] $SkipBuild,
    [switch] $SkipCopilotConfig,
    [switch] $SkipClaudeDesktopConfig,
    [switch] $SkipAdobeDebugMode
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
    throw 'This installer supports Windows only. Use npm run setup:mac on macOS.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$cepExtensionsDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$cepTargetDir = Join-Path $cepExtensionsDir 'MCPBridgeCEP'
$distEntry = Join-Path $repoRoot 'dist\index.js'

function Resolve-CommandPath([string] $Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { return $null }
    return $command.Source
}

function Update-JsonWithNode([string] $ConfigPath, [string] $Mode) {
    $configDir = Split-Path -Parent $ConfigPath
    if (-not (Test-Path -LiteralPath $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    $helper = @'
const fs = require("fs");

const configPath = process.env.CONFIG_PATH;
const mode = process.env.CONFIG_MODE;
const nodePath = process.env.NODE_PATH_VALUE;
const distPath = process.env.DIST_PATH;
const tempPath = process.env.TEMP_PATH;

let data = {};
if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, "utf8").trim();
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      console.error(`${configPath} is not valid JSON: ${error.message}`);
      process.exit(1);
    }
  }
}

if (!data || typeof data !== "object" || Array.isArray(data)) {
  data = {};
}

if (mode === "copilot") {
  if (!data.servers || typeof data.servers !== "object" || Array.isArray(data.servers)) {
    data.servers = {};
  }
  data.servers["premiere-pro"] = {
    type: "stdio",
    command: nodePath,
    args: [distPath],
    env: {
      PREMIERE_TEMP_DIR: tempPath
    }
  };
} else if (mode === "claude") {
  if (!data.mcpServers || typeof data.mcpServers !== "object" || Array.isArray(data.mcpServers)) {
    data.mcpServers = {};
  }
  data.mcpServers["premiere-pro"] = {
    command: nodePath,
    args: [distPath],
    env: {
      PREMIERE_TEMP_DIR: tempPath
    }
  };
} else {
  console.error(`Unknown config mode: ${mode}`);
  process.exit(1);
}

fs.writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`);
'@

    $helperPath = Join-Path $env:TEMP 'premiere-mcp-config-update.cjs'
    Set-Content -LiteralPath $helperPath -Value $helper -Encoding UTF8

    $oldConfigPath = $env:CONFIG_PATH
    $oldConfigMode = $env:CONFIG_MODE
    $oldNodePathValue = $env:NODE_PATH_VALUE
    $oldDistPath = $env:DIST_PATH
    $oldTempPath = $env:TEMP_PATH
    try {
        $env:CONFIG_PATH = $ConfigPath
        $env:CONFIG_MODE = $Mode
        $env:NODE_PATH_VALUE = $script:nodePath
        $env:DIST_PATH = $distEntry
        $env:TEMP_PATH = $TempDir
        & $script:nodePath $helperPath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to update MCP config: $ConfigPath"
        }
    } finally {
        $env:CONFIG_PATH = $oldConfigPath
        $env:CONFIG_MODE = $oldConfigMode
        $env:NODE_PATH_VALUE = $oldNodePathValue
        $env:DIST_PATH = $oldDistPath
        $env:TEMP_PATH = $oldTempPath
        Remove-Item -LiteralPath $helperPath -Force -ErrorAction SilentlyContinue
    }
}

$script:nodePath = Resolve-CommandPath 'node'
if (-not $script:nodePath) {
    throw "Node.js 18+ is required but 'node' was not found on PATH."
}

$nodeMajor = [int](& $script:nodePath -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
    throw "Node.js 18+ is required. Found: $(& $script:nodePath -v)"
}

$npmPath = Resolve-CommandPath 'npm.cmd'
if (-not $npmPath) { $npmPath = Resolve-CommandPath 'npm' }
if (-not $npmPath) {
    throw "npm was not found on PATH."
}

if ($SkipBuild) {
    Write-Host 'Skipping npm install/build (-SkipBuild).'
} else {
    Write-Host 'Installing npm dependencies...'
    & $npmPath install --prefix $repoRoot
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }

    Write-Host 'Building MCP server...'
    & $npmPath run build --prefix $repoRoot
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }
}

if (-not (Test-Path -LiteralPath $distEntry -PathType Leaf)) {
    throw "Built entrypoint not found: $distEntry"
}

if ($SkipAdobeDebugMode) {
    Write-Host 'Skipping Adobe CEP debug mode (-SkipAdobeDebugMode).'
} else {
    Write-Host 'Enabling Adobe CEP debug mode...'
    foreach ($version in 9..15) {
        $key = "HKCU:\Software\Adobe\CSXS.$version"
        if (-not (Test-Path -LiteralPath $key)) {
            New-Item -Path $key -Force | Out-Null
        }
        New-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -PropertyType String -Force | Out-Null
    }
}

Write-Host 'Installing Premiere CEP extension...'
if (-not (Test-Path -LiteralPath $cepExtensionsDir)) {
    New-Item -ItemType Directory -Path $cepExtensionsDir -Force | Out-Null
}
if (Test-Path -LiteralPath $cepTargetDir) {
    Remove-Item -LiteralPath $cepTargetDir -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'cep-plugin') -Destination $cepTargetDir -Recurse -Force

Write-Host "Preparing bridge temp directory: $TempDir"
if (-not (Test-Path -LiteralPath $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

if ($SkipCopilotConfig) {
    Write-Host 'Skipping GitHub Copilot VS Code MCP config (-SkipCopilotConfig).'
} else {
    Write-Host "Updating GitHub Copilot VS Code MCP config: $VsCodeConfigPath"
    Update-JsonWithNode -ConfigPath $VsCodeConfigPath -Mode 'copilot'
}

if ($SkipClaudeDesktopConfig) {
    Write-Host 'Skipping Claude Desktop MCP config (-SkipClaudeDesktopConfig).'
} else {
    Write-Host "Updating Claude Desktop MCP config: $ClaudeConfigPath"
    Update-JsonWithNode -ConfigPath $ClaudeConfigPath -Mode 'claude'
}

Write-Host ''
Write-Host 'Install complete.'
Write-Host 'Next:'
Write-Host '1. Restart VS Code and/or Claude Desktop so MCP config is reloaded.'
Write-Host '2. Restart Premiere Pro.'
Write-Host '3. Open Window > Extensions > MCP Bridge (CEP).'
Write-Host "4. Set Temp Directory to $TempDir."
Write-Host '5. Click Save Configuration, Start Bridge, then Test Connection.'
Write-Host ''
Write-Host 'Manual MCP entry:'
Write-Host "  command: $script:nodePath"
Write-Host "  args:    $distEntry"
Write-Host "  env:     PREMIERE_TEMP_DIR=$TempDir"
