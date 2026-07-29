<#
.SYNOPSIS
    Verifies the Premiere Pro MCP install on Windows.

.DESCRIPTION
    Windows counterpart to scripts/doctor-macos.sh. Checks Node.js, the built server, the
    CEP extension install, the bridge temp directory, CEP debug mode, the Claude Desktop
    entry, and the most recent CEP panel diagnostics report. Exits non-zero if any required
    check fails.

.PARAMETER TempDir
    Bridge temp directory to check. Defaults to $env:TEMP\premiere-mcp-bridge.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\doctor-windows.ps1
#>

[CmdletBinding()]
param(
    [string] $TempDir = (Join-Path $env:TEMP 'premiere-mcp-bridge')
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$cepTargetDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions\MCPBridgeCEP'
$claudeConfigPath = Join-Path $env:APPDATA 'Claude\claude_desktop_config.json'
$distEntry = Join-Path $repoRoot 'dist\index.js'

$failures = 0

function Report-Pass([string] $message) {
    Write-Host "  OK    $message"
}

function Report-Warn([string] $message) {
    Write-Host "  WARN  $message"
}

function Report-Fail([string] $message) {
    Write-Host "  FAIL  $message"
    $script:failures++
}

Write-Host 'Premiere Pro MCP doctor (Windows)'
Write-Host ''

# --- Node.js -----------------------------------------------------------------

Write-Host 'Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Report-Fail "node not found on PATH (Node.js 18+ required)"
} else {
    $nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
    if ($nodeMajor -lt 18) {
        Report-Fail "Node.js 18+ required, found $(& node -v)"
    } else {
        Report-Pass "$(& node -v)"
    }
}

# --- Built server ------------------------------------------------------------

Write-Host 'MCP server build'
if (Test-Path $distEntry) {
    Report-Pass $distEntry
} else {
    Report-Fail "$distEntry missing - run npm run build"
}

# --- CEP extension -----------------------------------------------------------

Write-Host 'CEP extension'
$extensionInstalled = Test-Path (Join-Path $cepTargetDir 'CSXS\manifest.xml')
if ($extensionInstalled) {
    Report-Pass $cepTargetDir
} else {
    Report-Fail "$cepTargetDir missing or incomplete - run scripts\install-windows.ps1"
}

# --- Signature ---------------------------------------------------------------
#
# Premiere 26.x verifies CEP signatures regardless of PlayerDebugMode (verified on 26.0.2 /
# CEP 12), so an unsigned extension simply never appears in Window > Extensions. Signed is
# the state we want; unsigned plus debug mode is only viable on older hosts.

Write-Host 'CEP extension signature'
$isSigned = Test-Path (Join-Path $cepTargetDir 'META-INF\signatures.xml')
if ($isSigned) {
    Report-Pass 'signed (META-INF\signatures.xml present)'
} elseif ($extensionInstalled) {
    Report-Warn 'unsigned - Premiere 26.x will refuse to load it. Run scripts\sign-windows.ps1 -ZXPSignCmd <path>'
}

Write-Host 'CEP debug mode'
$debugModeFound = $false
foreach ($n in 9..14) {
    $key = "HKCU:\Software\Adobe\CSXS.$n"
    if (Test-Path $key) {
        $value = (Get-ItemProperty -Path $key -Name 'PlayerDebugMode' -ErrorAction SilentlyContinue).PlayerDebugMode
        if ("$value" -eq '1') {
            $debugModeFound = $true
            Report-Warn "CSXS.$n PlayerDebugMode=1 - allows ANY unsigned CEP extension to load in every Adobe app"
        }
    }
}
if ($isSigned -and -not $debugModeFound) {
    Report-Pass 'off, and not needed for a signed extension'
} elseif (-not $isSigned -and -not $debugModeFound) {
    Report-Fail 'extension is unsigned and debug mode is off - the panel cannot load'
}

# --- Host-reported signature failures ----------------------------------------

Write-Host 'CEP host log'
$cepLog = Join-Path $env:TEMP 'CEP12-PPRO.log'
if (-not (Test-Path $cepLog)) {
    Report-Warn "$cepLog not found (Premiere may not have run yet)"
} else {
    $sigFailures = Select-String -Path $cepLog -Pattern 'Signature verification failed.*cepbridge' -ErrorAction SilentlyContinue
    if ($sigFailures) {
        $last = $sigFailures[-1].Line
        Report-Warn "host previously rejected the extension: $last"
        Report-Warn '  if that timestamp predates your last sign+restart, it is stale and can be ignored'
    } else {
        Report-Pass 'no signature rejections logged for the bridge extension'
    }
}

# --- Bridge temp directory ---------------------------------------------------

Write-Host 'Bridge temp directory'
if (Test-Path $TempDir) {
    Report-Pass $TempDir
} else {
    Report-Fail "$TempDir missing - create it, or run scripts\install-windows.ps1"
}

# --- Claude Desktop entry ----------------------------------------------------

Write-Host 'Claude Desktop entry'
if (-not (Test-Path $claudeConfigPath)) {
    Report-Warn "$claudeConfigPath not found (fine if you register the MCP server elsewhere)"
} else {
    try {
        $config = Get-Content -Path $claudeConfigPath -Raw | ConvertFrom-Json
        $entry = $config.mcpServers.'premiere-pro'
        if (-not $entry) {
            Report-Warn "no premiere-pro entry in $claudeConfigPath"
        } else {
            $configuredTemp = $entry.env.PREMIERE_TEMP_DIR
            Report-Pass "premiere-pro registered (PREMIERE_TEMP_DIR=$configuredTemp)"
            if ($configuredTemp -and $configuredTemp -ne $TempDir) {
                Report-Warn "config temp dir differs from the one checked here ($TempDir); the CEP panel must use the same path"
            }
        }
    } catch {
        Report-Fail "$claudeConfigPath is not valid JSON"
    }
}

# --- Panel diagnostics -------------------------------------------------------

Write-Host 'CEP panel diagnostics'
$diagnosticsPath = Join-Path $TempDir 'premiere-mcp-diagnostics-latest.json'
if (Test-Path $diagnosticsPath) {
    $age = (Get-Date) - (Get-Item $diagnosticsPath).LastWriteTime
    Report-Pass "$diagnosticsPath (written $([int]$age.TotalMinutes) min ago)"
} else {
    Report-Warn "no diagnostics report yet - click Run Diagnostics in the bridge panel"
}

# --- Summary -----------------------------------------------------------------

Write-Host ''
if ($failures -eq 0) {
    Write-Host 'All required checks passed.'
    exit 0
}

Write-Host "$failures required check(s) failed."
exit 1
