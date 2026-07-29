<#
.SYNOPSIS
    Verifies the Windows Premiere Pro MCP install.
#>

[CmdletBinding()]
param(
    [string] $TempDir = (Join-Path $env:TEMP 'premiere-mcp-bridge'),
    [string] $VsCodeConfigPath = (Join-Path $env:APPDATA 'Code\User\mcp.json'),
    [string] $ClaudeConfigPath = (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($env:OS -ne 'Windows_NT') {
    throw 'This doctor supports Windows only. Use npm run setup:doctor on macOS.'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$cepTargetDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions\MCPBridgeCEP'
$distEntry = Join-Path $repoRoot 'dist\index.js'
$failures = 0

function Pass([string] $Message) {
    Write-Host "  OK    $Message"
}

function Warn([string] $Message) {
    Write-Host "  WARN  $Message"
}

function Fail([string] $Message) {
    Write-Host "  FAIL  $Message"
    $script:failures++
}

function Test-JsonServer([string] $Path, [string] $RootKey) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Warn "$Path not found"
        return
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Fail "$Path is empty"
        return
    }

    try {
        $json = $raw | ConvertFrom-Json
    } catch {
        Fail "$Path is not valid JSON"
        return
    }

    $root = $json.PSObject.Properties[$RootKey]
    if (-not $root) {
        Fail "$Path missing $RootKey"
        return
    }

    $server = $root.Value.PSObject.Properties['premiere-pro']
    if (-not $server) {
        Fail "$Path missing premiere-pro"
        return
    }

    Pass "$Path contains premiere-pro"
}

Write-Host 'Premiere Pro MCP doctor (Windows)'
Write-Host ''

Write-Host 'Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Fail 'node not found on PATH'
} else {
    $nodeMajor = [int](& $node.Source -p "process.versions.node.split('.')[0]")
    if ($nodeMajor -lt 18) {
        Fail "Node.js 18+ required, found $(& $node.Source -v)"
    } else {
        Pass "$(& $node.Source -v)"
    }
}

Write-Host 'MCP server build'
if (Test-Path -LiteralPath $distEntry -PathType Leaf) {
    Pass $distEntry
} else {
    Fail "$distEntry missing - run npm run build"
}

Write-Host 'CEP extension'
if (Test-Path -LiteralPath (Join-Path $cepTargetDir 'CSXS\manifest.xml') -PathType Leaf) {
    Pass $cepTargetDir
} else {
    Fail "$cepTargetDir missing or incomplete - run npm run setup:win"
}

Write-Host 'Bridge temp directory'
if (Test-Path -LiteralPath $TempDir -PathType Container) {
    Pass $TempDir
} else {
    Fail "$TempDir missing"
}

Write-Host 'Adobe CEP debug mode'
$debugModeFound = $false
foreach ($version in 9..15) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    if (Test-Path -LiteralPath $key) {
        $value = (Get-ItemProperty -Path $key -Name 'PlayerDebugMode' -ErrorAction SilentlyContinue).PlayerDebugMode
        if ("$value" -eq '1') {
            $debugModeFound = $true
            Pass "CSXS.$version PlayerDebugMode=1"
        }
    }
}
if (-not $debugModeFound) {
    Warn 'PlayerDebugMode=1 not found under CSXS.9 through CSXS.15'
}

Write-Host 'GitHub Copilot VS Code MCP config'
Test-JsonServer -Path $VsCodeConfigPath -RootKey 'servers'

Write-Host 'Claude Desktop MCP config'
Test-JsonServer -Path $ClaudeConfigPath -RootKey 'mcpServers'

Write-Host ''
if ($failures -gt 0) {
    Write-Host "$failures check(s) failed."
    exit 1
}

Write-Host 'All required Windows install checks passed.'
