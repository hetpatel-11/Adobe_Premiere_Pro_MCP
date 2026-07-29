[CmdletBinding()]
param(
    [string]$VsCodeConfigPath = (Join-Path $env:APPDATA "Code\User\mcp.json")
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$cepExtensionsDir = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$cepTargetDir = Join-Path $cepExtensionsDir "MCPBridgeCEP"
$tempDir = Join-Path $env:TEMP "premiere-mcp-bridge"
$distEntry = Join-Path $repoRoot "dist\index.js"

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw "Node.js 18+ is required but 'node' was not found in PATH."
}

$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) {
    throw "Node.js 18+ is required. Found: $(& node -v)"
}

Write-Host "Installing npm dependencies..."
& npm.cmd install --prefix $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed with exit code $LASTEXITCODE."
}

Write-Host "Building MCP server..."
& npm.cmd run build --prefix $repoRoot
if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $distEntry -PathType Leaf)) {
    throw "Build completed but dist/index.js was not created."
}

Write-Host "Enabling Adobe CEP debug mode..."
10..15 | ForEach-Object {
    $registryPath = "HKCU:\Software\Adobe\CSXS.$_"
    New-Item -Path $registryPath -Force | Out-Null
    New-ItemProperty -Path $registryPath -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}

Write-Host "Installing Premiere CEP extension..."
New-Item -ItemType Directory -Path $cepExtensionsDir -Force | Out-Null
if (Test-Path -LiteralPath $cepTargetDir) {
    Remove-Item -LiteralPath $cepTargetDir -Recurse -Force
}
Copy-Item -LiteralPath (Join-Path $repoRoot "cep-plugin") -Destination $cepTargetDir -Recurse

Write-Host "Preparing bridge temp directory..."
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Write-Host "Updating VS Code MCP config for GitHub Copilot..."
$configDir = Split-Path -Parent $VsCodeConfigPath
New-Item -ItemType Directory -Path $configDir -Force | Out-Null

$config = [ordered]@{}
if (Test-Path -LiteralPath $VsCodeConfigPath -PathType Leaf) {
    $rawConfig = Get-Content -LiteralPath $VsCodeConfigPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($rawConfig)) {
        try {
            $existingConfig = $rawConfig | ConvertFrom-Json
        }
        catch {
            throw "VS Code MCP config is not valid JSON: $VsCodeConfigPath"
        }

        foreach ($property in $existingConfig.PSObject.Properties) {
            $config[$property.Name] = $property.Value
        }
    }
}

$servers = [ordered]@{}
if ($config.Contains("servers") -and $null -ne $config["servers"]) {
    foreach ($property in $config["servers"].PSObject.Properties) {
        $servers[$property.Name] = $property.Value
    }
}

$nodePath = $nodeCommand.Source
$servers["premiere-pro"] = [ordered]@{
    type = "stdio"
    command = $nodePath
    args = @($distEntry)
    env = [ordered]@{
        PREMIERE_TEMP_DIR = $tempDir
    }
}
$config["servers"] = $servers

$config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $VsCodeConfigPath -Encoding UTF8

Write-Host ""
Write-Host "Install complete."
Write-Host "Next:"
Write-Host "1. Restart VS Code so GitHub Copilot reloads the MCP configuration."
Write-Host "2. Restart Premiere Pro."
Write-Host "3. Open Window > Extensions > MCP Bridge (CEP)."
Write-Host "4. Set Temp Directory to $tempDir."
Write-Host "5. Click Save Configuration, then Start Bridge, then Test Connection."
Write-Host "6. In VS Code, run MCP: List Servers and confirm premiere-pro is running."
Write-Host ""
Write-Host "VS Code MCP config: $VsCodeConfigPath"
