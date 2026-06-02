# bridge-helper.ps1
# Reusable helper for sending commands to MCP Premiere Pro Bridge
# Usage: . .\bridge-helper.ps1  (dot-source to import functions)

$Global:BridgePath = "C:\tmp\premiere-mcp-bridge"

function Send-PProCmd {
    param(
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$Action,
        [hashtable]$Params = @{},
        [int]$TimeoutSeconds = 30
    )

    $cmd = @{ id = $Id; action = $Action; params = $Params } | ConvertTo-Json -Depth 10 -Compress
    $cmdPath = Join-Path $Global:BridgePath "command-$Id.json"
    [System.IO.File]::WriteAllText($cmdPath, $cmd, [System.Text.UTF8Encoding]::new($false))

    $maxAttempts = $TimeoutSeconds * 2
    for ($i = 0; $i -lt $maxAttempts; $i++) {
        Start-Sleep -Milliseconds 500
        $rPath = Join-Path $Global:BridgePath "response-$Id.json"
        if (Test-Path $rPath) {
            $r = [System.IO.File]::ReadAllText($rPath, [System.Text.Encoding]::UTF8)
            Remove-Item $rPath -Force
            return ($r | ConvertFrom-Json)
        }
    }
    return @{ success = $false; error = "TIMEOUT after ${TimeoutSeconds}s" }
}

function Test-Bridge {
    $result = Send-PProCmd -Id "test_$(Get-Random)" -Action "test_connection"
    if ($result.success) {
        Write-Host "Bridge connected: $($result.project)" -ForegroundColor Green
    } else {
        Write-Host "Bridge not connected: $($result.error)" -ForegroundColor Red
    }
    return $result
}

function Get-ActiveSequence {
    Send-PProCmd -Id "seq_$(Get-Random)" -Action "get_active_sequence"
}

function Save-Project {
    Send-PProCmd -Id "save_$(Get-Random)" -Action "save_project"
}

function Analyze-Look {
    param([int]$LookIndex = 1)
    Send-PProCmd -Id "analyze_$(Get-Random)" -Action "analyze_look" -Params @{ lookIndex = $LookIndex } -TimeoutSeconds 60
}

function Apply-Template {
    param(
        [int]$TemplateLook = 1,
        [int]$TargetLook = 2,
        [string[]]$VideoItems = @(),
        [string]$TitleItem = "",
        [string]$PhotoTop = "",
        [string]$PhotoBottom = ""
    )
    $p = @{
        templateLookIndex = $TemplateLook
        targetLookIndex = $TargetLook
    }
    if ($VideoItems.Count -gt 0) { $p.videoItems = $VideoItems }
    if ($TitleItem) { $p.titleItem = $TitleItem }
    if ($PhotoTop) { $p.photoTop = $PhotoTop }
    if ($PhotoBottom) { $p.photoBottom = $PhotoBottom }
    Send-PProCmd -Id "apply_$(Get-Random)" -Action "apply_template" -Params $p -TimeoutSeconds 120
}

function Import-FilesToProject {
    param([string[]]$FilePaths)
    Send-PProCmd -Id "imp_$(Get-Random)" -Action "import_files" -Params @{ filePaths = $FilePaths }
}

function Add-BatchTransitions {
    param(
        [int]$TrackIndex = 0,
        [double]$Duration = 0.3
    )
    Send-PProCmd -Id "trans_$(Get-Random)" -Action "batch_add_transitions" -Params @{
        trackIndex = $TrackIndex
        duration = $Duration
        skipFirst = $true
    }
}

function Send-ChatResponse {
    param([Parameter(Mandatory)][string]$Message)
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $resp = @{ type = "chat_response"; message = $Message; timestamp = (Get-Date).ToString("o") }
    $json = $resp | ConvertTo-Json -Compress
    $path = Join-Path $Global:BridgePath "chat-response-$ts.json"
    [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Chat response sent: $Message" -ForegroundColor Cyan
}

function Get-ChatRequests {
    $files = Get-ChildItem -Path $Global:BridgePath -Filter "chat-request-*.json" -ErrorAction SilentlyContinue
    $requests = @()
    foreach ($f in $files) {
        try {
            $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
            $req = $content | ConvertFrom-Json
            $requests += @{ file = $f.FullName; message = $req.message; options = $req.options; timestamp = $req.timestamp }
            Remove-Item $f.FullName -Force
        } catch {}
    }
    return $requests
}

function Generate-TTS {
    param(
        [Parameter(Mandatory)][string]$Text,
        [string]$OutFile = "",
        [double]$Rate = 1.0,
        [string]$Voice = "ko-KR-InJoonNeural"
    )
    if (-not $OutFile) {
        $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $OutFile = "C:\Users\skafu\Desktop\ClaudeCode\sfx\tts-$ts.mp3"
    }

    # edge-tts 사용 (남자 한국어 목소리)
    $ratePercent = [math]::Round(($Rate - 1.0) * 100)
    $rateStr = if ($ratePercent -ge 0) { "+$ratePercent%" } else { "$ratePercent%" }
    $escapedText = $Text.Replace('"', '\"')

    try {
        $cmd = "edge-tts --voice `"$Voice`" --rate=`"$rateStr`" --text `"$escapedText`" --write-media `"$OutFile`""
        Invoke-Expression $cmd 2>&1 | Out-Null

        if (Test-Path $OutFile) {
            $size = (Get-Item $OutFile).Length
            Write-Host "TTS 생성: $OutFile ($([math]::Round($size/1024))KB) [${Voice}]" -ForegroundColor Green
            return $OutFile
        }
    } catch {
        Write-Host "edge-tts 실패, System.Speech 폴백..." -ForegroundColor Yellow
    }

    # 폴백: System.Speech (여자 목소리)
    $wavFile = $OutFile -replace '\.mp3$', '.wav'
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.SelectVoice("Microsoft Heami Desktop")
    $synth.Rate = [math]::Round(($Rate - 1.0) * 10)
    $synth.SetOutputToWaveFile($wavFile)
    $synth.Speak($Text)
    $synth.Dispose()
    $size = (Get-Item $wavFile).Length
    Write-Host "TTS 생성 (폴백): $wavFile ($([math]::Round($size/1024))KB)" -ForegroundColor Green
    return $wavFile
}

function TTS-And-Import {
    param(
        [Parameter(Mandatory)][string]$Text,
        [double]$Rate = 1.0,
        [string]$Voice = "ko-KR-InJoonNeural"
    )
    $file = Generate-TTS -Text $Text -Rate $Rate -Voice $Voice
    Write-Host "프리미어에 임포트 중..." -ForegroundColor Yellow
    $result = Import-FilesToProject -FilePaths @($file)
    Send-ChatResponse "🎙️ TTS 완료: '$Text' → 프로젝트에 임포트됨"
    return @{ file = $file; import = $result }
}

Write-Host "MCP Bridge Helper loaded. Commands:" -ForegroundColor Cyan
Write-Host "  Test-Bridge, Get-ActiveSequence, Save-Project" -ForegroundColor Gray
Write-Host "  Analyze-Look, Apply-Template, Add-BatchTransitions" -ForegroundColor Gray
Write-Host "  Send-ChatResponse, Get-ChatRequests" -ForegroundColor Gray
Write-Host "  Generate-TTS [-Text '...'] [-Rate 1.0]  (음성 생성)" -ForegroundColor Gray
Write-Host "  TTS-And-Import [-Text '...']  (생성+프리미어 임포트)" -ForegroundColor Gray
