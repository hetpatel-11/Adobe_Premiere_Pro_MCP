<#
.SYNOPSIS
    Signs the CEP bridge extension and installs it, for hosts that refuse unsigned extensions.

.DESCRIPTION
    Premiere Pro 26.x on Windows enforces CEP signature verification even when
    PlayerDebugMode is set correctly. Verified on Premiere Pro 26.0.2 (CEP 12):

      unsigned extension + PlayerDebugMode=1 (REG_SZ, CSXS.9-14, set before launch)
        -> "ERROR Signature verification failed for extension
            com.mcp.premiere.cepbridge.panel", panel never appears in Window > Extensions

      self-signed extension + PlayerDebugMode absent entirely
        -> loads clean, no errors, bridge works end to end

    So on 26.x the debug-mode bypass is not a workaround; the extension has to be signed.
    CEP accepts a self-signed certificate, it only requires that the signature be intact.

    This script generates a self-signed certificate (or reuses one you pass in), signs
    cep-plugin/ into a .zxp, and extracts it over the installed extension folder so the
    required META-INF/signatures.xml is present.

    Signing needs Adobe's ZXPSignCmd, which is not redistributed here. Download it from
    Adobe's official CEP resources repository and pass the path in:

      https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD

.PARAMETER ZXPSignCmd
    Path to ZXPSignCmd.exe. Required.

.PARAMETER CertPath
    Path to an existing .p12 certificate. If omitted, a self-signed one is generated next
    to the .zxp and reused on later runs.

.PARAMETER CertPassword
    Password for the certificate. If omitted, a random one is generated and written to
    a .txt file beside the certificate.

.PARAMETER OutputDir
    Where to write the certificate and .zxp. Defaults to the repo's build-windows folder.

.PARAMETER NoInstall
    Produce the signed .zxp but do not touch the installed extension folder.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\sign-windows.ps1 -ZXPSignCmd C:\tools\ZXPSignCmd.exe

.NOTES
    Do not pass -tsa to ZXPSignCmd 4.1.103 on Windows. Timestamping crashes the signer with
    an access violation (0xC0000005). Signing without a timestamp works; the tradeoff is that
    the signature stops validating once the certificate expires, so re-sign after that.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ZXPSignCmd,
    [string] $CertPath,
    [string] $CertPassword,
    [string] $OutputDir,
    [switch] $NoInstall
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$sourceDir = Join-Path $repoRoot 'cep-plugin'
$cepTargetDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions\MCPBridgeCEP'

if (-not $OutputDir) { $OutputDir = Join-Path $repoRoot 'build-windows' }

if (-not (Test-Path $ZXPSignCmd)) {
    Write-Error "ZXPSignCmd not found at: $ZXPSignCmd`nDownload it from https://github.com/Adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD"
    exit 1
}

if (-not (Test-Path (Join-Path $sourceDir 'CSXS\manifest.xml'))) {
    Write-Error "No CEP extension at $sourceDir (expected CSXS\manifest.xml)."
    exit 1
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# --- Certificate --------------------------------------------------------------

if (-not $CertPath) { $CertPath = Join-Path $OutputDir 'mcp-bridge-selfsigned.p12' }
$passwordFile = [System.IO.Path]::ChangeExtension($CertPath, '.password.txt')

if (-not $CertPassword) {
    if (Test-Path $passwordFile) {
        $CertPassword = (Get-Content $passwordFile -Raw).Trim()
    } else {
        $CertPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
        Set-Content -Path $passwordFile -Value $CertPassword -Encoding utf8
    }
}

if (Test-Path $CertPath) {
    Write-Host "Reusing certificate: $CertPath"
} else {
    Write-Host "Generating self-signed certificate: $CertPath"
    & $ZXPSignCmd -selfSignedCert US CA 'MCP Premiere Bridge (self-signed)' 'MCP Premiere Bridge' $CertPassword $CertPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $CertPath)) {
        Write-Error 'Certificate generation failed.'
        exit 1
    }
    Write-Host "Certificate password written to: $passwordFile"
}

# --- Sign ---------------------------------------------------------------------

$zxpPath = Join-Path $OutputDir 'MCPBridgeCEP.zxp'
if (Test-Path $zxpPath) { Remove-Item $zxpPath -Force }

Write-Host "Signing $sourceDir ..."
# No -tsa: timestamping crashes ZXPSignCmd 4.1.103 on Windows with an access violation.
& $ZXPSignCmd -sign $sourceDir $zxpPath $CertPath $CertPassword
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zxpPath)) {
    Write-Error 'Signing failed.'
    exit 1
}
Write-Host "Signed package: $zxpPath ($((Get-Item $zxpPath).Length) bytes)"

# --- Install ------------------------------------------------------------------

if ($NoInstall) {
    Write-Host 'Skipping install (-NoInstall).'
    exit 0
}

# Extract the .zxp directly rather than installing through UPIA. Adobe's own known-issue
# note records that UPIA installs can break signature verification by turning symlinks into
# text files, and a plain extraction gives CEP exactly what it checks: the signed file set
# plus META-INF/signatures.xml.
$stagingZip = Join-Path $OutputDir 'MCPBridgeCEP.zip'
Copy-Item $zxpPath $stagingZip -Force

Write-Host "Installing to $cepTargetDir ..."
if (Test-Path $cepTargetDir) { Remove-Item $cepTargetDir -Recurse -Force }
New-Item -ItemType Directory -Path $cepTargetDir -Force | Out-Null
Expand-Archive -Path $stagingZip -DestinationPath $cepTargetDir -Force
Remove-Item $stagingZip -Force

if (-not (Test-Path (Join-Path $cepTargetDir 'META-INF\signatures.xml'))) {
    Write-Error 'Install completed but META-INF\signatures.xml is missing; CEP will reject the extension.'
    exit 1
}

Write-Host ''
Write-Host 'Signed extension installed.'
Write-Host 'Next:'
Write-Host '1. Quit Premiere Pro completely, then reopen it.'
Write-Host '2. Open Window > Extensions > MCP Bridge (CEP).'
Write-Host ''
Write-Host 'A signed extension does not need CEP debug mode. If you enabled PlayerDebugMode'
Write-Host 'earlier, you can remove it and stop allowing any unsigned CEP extension to load:'
Write-Host '  foreach ($n in 9..14) { Remove-ItemProperty "HKCU:\Software\Adobe\CSXS.$n" PlayerDebugMode -ErrorAction SilentlyContinue }'
