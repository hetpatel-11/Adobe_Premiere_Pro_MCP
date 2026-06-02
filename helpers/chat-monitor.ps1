# chat-monitor.ps1 — 채팅 요청 백그라운드 모니터
# Premiere Pro 플러그인 채팅에서 보낸 요청을 자동 처리
# 사용법: powershell -File chat-monitor.ps1
#
# 처리 가능한 요청:
#   - TTS/나레이션/음성: edge-tts로 음성 생성 + Premiere 임포트
#   - 파일 첨부 요청: Claude Code에 전달
#   - 기타: Claude Code에 전달

$BridgePath = "C:\tmp\premiere-mcp-bridge"
$SfxPath = "C:\Users\skafu\Desktop\ClaudeCode\sfx"
$StickerDir = "C:\Users\skafu\Desktop\ClaudeCode\stickers"
$NodeScript = "C:\Users\skafu\Adobe_Premiere_Pro_MCP\helpers\tts-generate.cjs"
$StickerScript = "C:\Users\skafu\Adobe_Premiere_Pro_MCP\helpers\giphy-search.ps1"
$EdgeTTS = "C:\Users\skafu\AppData\Local\Programs\Python\Python312\Scripts\edge-tts.exe"
$Python = "C:\Users\skafu\AppData\Local\Programs\Python\Python312\python.exe"
$TTSScript = "C:\Users\skafu\Adobe_Premiere_Pro_MCP\helpers\tts-natural.py"

# PATH 갱신 (Python/edge-tts 포함)
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User") + ";C:\Users\skafu\AppData\Local\Programs\Python\Python312\Scripts"

# TLS 1.2 강제 (Tenor API 등 HTTPS 호출용)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

function Send-ChatResponse {
    param([string]$Message)
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $resp = @{ type = "chat_response"; message = $Message; timestamp = (Get-Date).ToString("o") }
    $json = $resp | ConvertTo-Json -Compress
    $path = Join-Path $BridgePath "chat-response-$ts.json"
    [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Send-PProCmd {
    param([string]$Id, [string]$Action, [hashtable]$Params = @{}, [int]$TimeoutSeconds = 30)
    $cmd = @{ id = $Id; action = $Action; params = $Params } | ConvertTo-Json -Depth 10 -Compress
    $cmdPath = Join-Path $BridgePath "command-$Id.json"
    [System.IO.File]::WriteAllText($cmdPath, $cmd, [System.Text.UTF8Encoding]::new($false))
    $maxAttempts = $TimeoutSeconds * 2
    for ($i = 0; $i -lt $maxAttempts; $i++) {
        Start-Sleep -Milliseconds 500
        $rPath = Join-Path $BridgePath "response-$Id.json"
        if (Test-Path $rPath) {
            $r = [System.IO.File]::ReadAllText($rPath, [System.Text.Encoding]::UTF8)
            Remove-Item $rPath -Force
            return ($r | ConvertFrom-Json)
        }
    }
    return @{ success = $false; error = "TIMEOUT after ${TimeoutSeconds}s" }
}

function Create-SubtitlePNG {
    param(
        [string]$Text,
        [string]$OutputPath,
        [int]$Width = 1920,
        [int]$Height = 220,
        [int]$FontSize = 44,
        [string]$FontName = "Malgun Gothic",
        [int]$MaxCharsPerLine = 20
    )
    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue

        # 두 줄 처리: \n 구분자 또는 자동 줄바꿈
        $lines = @()
        if ($Text -match '\\n') {
            # 명시적 줄바꿈 (\n)
            $lines = $Text -split '\\n' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
        } elseif ($Text.Length -gt $MaxCharsPerLine) {
            # 자동 줄바꿈: 중간 공백 기준으로 분할
            $mid = [math]::Floor($Text.Length / 2)
            $bestSplit = -1
            # 중간 부근에서 가장 가까운 공백 찾기
            for ($i = 0; $i -lt $Text.Length; $i++) {
                if ($Text[$i] -eq ' ') {
                    if ($bestSplit -eq -1 -or [math]::Abs($i - $mid) -lt [math]::Abs($bestSplit - $mid)) {
                        $bestSplit = $i
                    }
                }
            }
            if ($bestSplit -gt 0) {
                $lines = @($Text.Substring(0, $bestSplit).Trim(), $Text.Substring($bestSplit + 1).Trim())
            } else {
                # 공백 없으면 글자수로 강제 분할
                $lines = @($Text.Substring(0, $mid), $Text.Substring($mid))
            }
        } else {
            $lines = @($Text)
        }
        # 최대 2줄 제한
        if ($lines.Count -gt 2) { $lines = $lines[0..1] }

        $lineCount = $lines.Count
        $actualHeight = if ($lineCount -gt 1) { $Height } else { 180 }

        $bmp = New-Object System.Drawing.Bitmap $Width, $actualHeight
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
        $g.Clear([System.Drawing.Color]::Transparent)

        $font = New-Object System.Drawing.Font($FontName, $FontSize, [System.Drawing.FontStyle]::Bold)
        $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 0, 0, 0))

        # 줄 간격
        $lineSpacing = 8
        # 전체 텍스트 블록 높이 계산
        $totalTextH = 0
        $lineSizes = @()
        foreach ($line in $lines) {
            $sz = $g.MeasureString($line, $font)
            $lineSizes += $sz
            $totalTextH += $sz.Height
        }
        if ($lineCount -gt 1) { $totalTextH += $lineSpacing }

        $startY = ($actualHeight - $totalTextH) / 2
        $curY = $startY

        for ($li = 0; $li -lt $lines.Count; $li++) {
            $line = $lines[$li]
            $sz = $lineSizes[$li]
            $x = ($Width - $sz.Width) / 2

            # 외곽선 (그림자)
            for ($dx = -2; $dx -le 2; $dx++) {
                for ($dy = -2; $dy -le 2; $dy++) {
                    if ($dx -ne 0 -or $dy -ne 0) {
                        $g.DrawString($line, $font, $shadowBrush, ($x + $dx), ($curY + $dy))
                    }
                }
            }
            # 흰색 텍스트
            $g.DrawString($line, $font, $whiteBrush, $x, $curY)

            $curY += $sz.Height + $lineSpacing
        }

        $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose(); $font.Dispose(); $whiteBrush.Dispose(); $shadowBrush.Dispose()

        Write-Host "   → 자막 PNG ($lineCount줄): $OutputPath" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "   ❌ 자막 생성 실패: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Process-TTS {
    param(
        [string]$Text,
        [string]$Voice = "남자",
        [double]$Rate = 1.0,
        [int]$Pitch = 0,
        [int]$Volume = 0,
        [string]$Emotion = "기본",
        [string]$EmotionLabel = "",
        [int]$Intensity = 50,
        [int]$BatchIndex = -1,
        [int]$BatchTotal = 0,
        [bool]$AutoSubtitle = $true,
        [int]$SubtitleTrack = 5,
        [int]$AudioTrack = 0,
        [bool]$AutoPlace = $true
    )

    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $outFile = Join-Path $SfxPath "tts-$ts.mp3"
    $subFile = Join-Path $SfxPath "sub-$ts.png"

    $batchInfo = ""
    if ($BatchIndex -ge 0) {
        $batchInfo = " [$($BatchIndex+1)/$BatchTotal]"
    }
    $emotionInfo = if ($EmotionLabel) { " ($EmotionLabel)" } else { "" }
    Send-ChatResponse "🎙️ TTS 생성 중$batchInfo$emotionInfo : '$Text'"

    try {
        # 텍스트를 임시 파일로 저장 (한국어 인코딩 보장)
        $tmpTextFile = Join-Path $SfxPath "tts-input-$ts.txt"
        [System.IO.File]::WriteAllText($tmpTextFile, $Text, [System.Text.UTF8Encoding]::new($false))

        # 추가 속도 보정 (Rate 1.0 = 0%, 1.2 = +20%)
        $rateExtra = [math]::Round(($Rate - 1.0) * 100)

        Write-Host "   → tts-natural.py: voice=$Voice emotion=$Emotion intensity=$Intensity pitch=$Pitch rate=$rateExtra" -ForegroundColor DarkCyan

        # Python tts-natural.py 호출 (자연스러운 TTS)
        $result = & $Python $TTSScript --text-file "$tmpTextFile" --text "fallback" --voice "$Voice" --emotion "$Emotion" --intensity $Intensity --pitch $Pitch --rate $rateExtra --volume $Volume --output "$outFile" 2>&1

        # 임시 파일 삭제
        if (Test-Path $tmpTextFile) { Remove-Item $tmpTextFile -Force -ErrorAction SilentlyContinue }

        if (Test-Path $outFile) {
            $size = (Get-Item $outFile).Length
            if ($size -gt 0) {
                # === 1) 자막 PNG 생성 ===
                $subCreated = $false
                if ($AutoSubtitle) {
                    $subCreated = Create-SubtitlePNG -Text $Text -OutputPath $subFile
                }

                # === 2) 프리미어에 임포트 (TTS + 자막) ===
                $filesToImport = @($outFile)
                if ($subCreated -and (Test-Path $subFile)) {
                    $filesToImport += $subFile
                }
                $importResult = Send-PProCmd -Id "imp_tts_$ts" -Action "import_files" -Params @{ filePaths = $filesToImport }

                # === 3) 플레이헤드 위치에 자동 배치 ===
                if ($AutoPlace -and $importResult.success) {
                    # 플레이헤드 위치 가져오기
                    $phResult = Send-PProCmd -Id "ph_$ts" -Action "get_playhead"
                    $playheadSec = 0
                    if ($phResult.success -and $phResult.position) {
                        # ticks → seconds (TICKS_PER_SEC = 254016000000)
                        $playheadSec = [double]$phResult.position / 254016000000.0
                    }

                    $ttsFileName = [System.IO.Path]::GetFileName($outFile)
                    $subFileName = if ($subCreated) { [System.IO.Path]::GetFileName($subFile) } else { "" }

                    Write-Host "   → 타임라인 배치: playhead=${playheadSec}s, audio=A$($AudioTrack+1), sub=V$($SubtitleTrack+1)" -ForegroundColor Cyan

                    # TTS 오디오를 오디오 트랙에 배치
                    $placeAudio = Send-PProCmd -Id "place_tts_$ts" -Action "add_to_timeline" -Params @{
                        itemName = $ttsFileName
                        videoTrackIndex = 0
                        audioTrackIndex = $AudioTrack
                        timeSeconds = $playheadSec
                        mode = "overwrite"
                    }

                    # 자막 PNG를 비디오 트랙에 배치
                    if ($subCreated -and $subFileName) {
                        Start-Sleep -Milliseconds 300
                        $placeSub = Send-PProCmd -Id "place_sub_$ts" -Action "add_to_timeline" -Params @{
                            itemName = $subFileName
                            videoTrackIndex = $SubtitleTrack
                            audioTrackIndex = 0
                            timeSeconds = $playheadSec
                            mode = "overwrite"
                        }
                    }

                    $placeInfo = ""
                    if ($placeAudio.success) { $placeInfo += " 🎵A$($AudioTrack+1)" }
                    if ($placeSub.success) { $placeInfo += " 📝V$($SubtitleTrack+1)" }
                    Send-ChatResponse "✅ TTS 완료$batchInfo! '$Text' → 임포트+배치$placeInfo ($([math]::Round($size/1024))KB)$emotionInfo"
                } else {
                    if ($importResult.success) {
                        Send-ChatResponse "✅ TTS 완료$batchInfo! '$Text' → 임포트됨 ($([math]::Round($size/1024))KB)$emotionInfo"
                    } else {
                        Send-ChatResponse "⚠️ TTS 생성됨 ($([math]::Round($size/1024))KB), 임포트 실패: $($importResult.error)"
                    }
                }
                return $true
            }
        }

        # 실패 시 에러 출력
        Write-Host "   ❌ TTS 결과: $result" -ForegroundColor Red
        Send-ChatResponse "❌ TTS 생성 실패$batchInfo"
        return $false
    } catch {
        Send-ChatResponse "❌ TTS 오류$batchInfo : $($_.Exception.Message)"
        return $false
    }
}

function Is-TTSRequest {
    param([string]$Msg)
    $keywords = @("음성", "tts", "나레이션", "말해", "읽어", "보이스", "voice", "narration")
    foreach ($kw in $keywords) {
        if ($Msg -match $kw) { return $true }
    }
    return $false
}

function Extract-TTSText {
    param([string]$Msg)
    # "음성 생성 안녕하세요" → "안녕하세요"
    # "tts 오늘의 룩북" → "오늘의 룩북"
    # "말해줘 안녕" → "안녕"
    $cleaned = $Msg
    $removePatterns = @(
        "음성\s*(생성|만들어|변환)?\s*",
        "tts\s*",
        "나레이션\s*(생성|만들어|추가)?\s*",
        "말해\s*(줘|봐)?\s*",
        "읽어\s*(줘|봐)?\s*",
        "보이스\s*(생성|만들어)?\s*",
        "voice\s*",
        "narration\s*"
    )
    foreach ($p in $removePatterns) {
        $cleaned = $cleaned -replace $p, ""
    }
    $cleaned = $cleaned.Trim()

    # 속도 추출
    $rate = 1.0
    if ($cleaned -match "(?:속도|rate)\s*([\d.]+)") {
        $rate = [double]$Matches[1]
        $cleaned = $cleaned -replace "(?:속도|rate)\s*[\d.]+\s*", ""
    }

    # 여자 목소리 요청 체크
    $voice = "ko-KR-InJoonNeural"
    if ($cleaned -match "여자|여성|female") {
        $voice = "ko-KR-SunHiNeural"
        $cleaned = $cleaned -replace "여자|여성|female\s*", ""
    }

    $cleaned = $cleaned.Trim()

    return @{ text = $cleaned; rate = $rate; voice = $voice }
}

function Is-StickerRequest {
    param([string]$Msg)
    $keywords = @("스티커", "이모지", "이모티콘", "sticker", "emoji", "gif", "짤")
    foreach ($kw in $keywords) {
        if ($Msg -match $kw) { return $true }
    }
    return $false
}

function Process-Sticker {
    param([string]$Query)

    # 검색어 추출: "스티커 귀여운 하트" → "귀여운 하트"
    $searchQuery = $Query
    $searchQuery = $searchQuery -replace "스티커\s*", ""
    $searchQuery = $searchQuery -replace "이모지\s*", ""
    $searchQuery = $searchQuery -replace "이모티콘\s*", ""
    $searchQuery = $searchQuery -replace "sticker\s*", ""
    $searchQuery = $searchQuery -replace "emoji\s*", ""
    $searchQuery = $searchQuery -replace "gif\s*", ""
    $searchQuery = $searchQuery -replace "짤\s*", ""
    $searchQuery = $searchQuery -replace "넣어\s*(줘|봐)?\s*", ""
    $searchQuery = $searchQuery -replace "추가\s*(해줘)?\s*", ""
    $searchQuery = $searchQuery -replace "찾아\s*(줘)?\s*", ""
    $searchQuery = $searchQuery.Trim()

    if (-not $searchQuery) { $searchQuery = "cute emoji" }

    # 한국어 키워드 → 영어 변환 (Tenor API 검색 최적화)
    $koToEn = @{
        "귀여운" = "cute"; "귀엽" = "cute"; "하트" = "heart"; "사랑" = "love"
        "웃기" = "funny"; "웃긴" = "funny"; "슬픈" = "sad"; "슬퍼" = "sad"
        "화남" = "angry"; "화난" = "angry"; "놀란" = "surprised"; "놀라" = "surprised"
        "축하" = "congratulations"; "생일" = "birthday"; "파티" = "party"
        "별" = "star"; "꽃" = "flower"; "불꽃" = "fire"; "무지개" = "rainbow"
        "춤" = "dance"; "고양이" = "cat"; "강아지" = "dog"; "곰" = "bear"
        "토끼" = "bunny"; "팬더" = "panda"; "유니콘" = "unicorn"
        "박수" = "clap"; "눈물" = "cry"; "따봉" = "thumbs up"; "오케이" = "ok"
        "안녕" = "hello"; "잘가" = "bye"; "감사" = "thank you"
        "반짝" = "sparkle"; "윙크" = "wink"; "뽀뽀" = "kiss"
        "폭죽" = "fireworks"; "선물" = "gift"; "크리스마스" = "christmas"
    }
    foreach ($ko in $koToEn.Keys) {
        if ($searchQuery -match $ko) {
            $searchQuery = $searchQuery -replace $ko, $koToEn[$ko]
        }
    }
    $searchQuery = $searchQuery.Trim()
    if (-not $searchQuery) { $searchQuery = "cute emoji" }

    Send-ChatResponse "🔍 스티커 검색 중: '$searchQuery'"
    Write-Host "   → 스티커 검색: '$searchQuery'" -ForegroundColor Magenta

    try {
        # Tenor API 직접 호출 (자식 프로세스 인코딩 문제 방지)
        $apiKey = "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ"
        $encodedQ = [System.Uri]::EscapeDataString($searchQuery)
        $apiUrl = "https://tenor.googleapis.com/v2/search?q=${encodedQ}&key=${apiKey}&client_key=premiere_mcp&limit=1&media_filter=mp4,gif"

        $resp = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 15

        if ($resp.results -and $resp.results.Count -gt 0) {
            $item = $resp.results[0]
            $mp4Url = $null
            if ($item.media_formats.mp4) { $mp4Url = $item.media_formats.mp4.url }
            elseif ($item.media_formats.gif) { $mp4Url = $item.media_formats.gif.url }

            if ($mp4Url) {
                $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                $ext = if ($mp4Url -match "\.gif") { "gif" } else { "mp4" }
                $filePath = Join-Path $StickerDir "sticker-${ts}.${ext}"
                Invoke-WebRequest -Uri $mp4Url -OutFile $filePath -TimeoutSec 30
                $size = [math]::Round((Get-Item $filePath).Length / 1024)

                Write-Host "   → 다운로드: $filePath (${size}KB)" -ForegroundColor Green

                # Premiere에 임포트
                $importResult = Send-PProCmd -Id "imp_stk_$ts" -Action "import_files" -Params @{ filePaths = @($filePath) }

                if ($importResult.success) {
                    Send-ChatResponse "😀 스티커 임포트 완료! '${searchQuery}' (${size}KB)"
                } else {
                    Send-ChatResponse "😀 스티커 다운로드 완료 (${size}KB) — 프로젝트 패널에서 타임라인으로 드래그하세요"
                }
                return $true
            }
        }

        Send-ChatResponse "❌ 스티커를 찾을 수 없어요: '$searchQuery'"
        return $false
    } catch {
        $errMsg = $_.Exception.Message
        if ($_.Exception.InnerException) { $errMsg += " | Inner: $($_.Exception.InnerException.Message)" }
        Write-Host "   ❌ 스티커 오류: $errMsg" -ForegroundColor Red
        Send-ChatResponse "❌ 스티커 오류: $errMsg"
        return $false
    }
}

# === 메인 루프 ===
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MCP Chat Monitor 시작" -ForegroundColor Cyan
Write-Host "  감시 폴더: $BridgePath" -ForegroundColor Gray
Write-Host "  TTS 출력: $SfxPath" -ForegroundColor Gray
Write-Host "  Ctrl+C로 종료" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan

# 폴더 확인
if (-not (Test-Path $BridgePath)) {
    New-Item -ItemType Directory -Path $BridgePath -Force | Out-Null
}
if (-not (Test-Path $SfxPath)) {
    New-Item -ItemType Directory -Path $SfxPath -Force | Out-Null
}

# edge-tts 확인
if (Test-Path $EdgeTTS) {
    Write-Host "edge-tts: $EdgeTTS" -ForegroundColor Green
} else {
    Write-Host "edge-tts 없음 — System.Speech 폴백" -ForegroundColor Yellow
}

# 스티커 폴더 확인
if (-not (Test-Path $StickerDir)) {
    New-Item -ItemType Directory -Path $StickerDir -Force | Out-Null
}
Write-Host "스티커 검색: Tenor API (Google)" -ForegroundColor Green

$pollCount = 0
while ($true) {
    try {
        $files = Get-ChildItem -Path $BridgePath -Filter "chat-request-*.json" -ErrorAction SilentlyContinue

        foreach ($f in $files) {
            try {
                $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
                $req = $content | ConvertFrom-Json
                $msg = $req.message
                $hasFiles = ($req.files -and $req.files.Count -gt 0)

                # 파일 읽은 후 삭제
                Remove-Item $f.FullName -Force

                Write-Host "`n📩 채팅 요청: $msg" -ForegroundColor Yellow
                if ($hasFiles) {
                    Write-Host "   📎 첨부파일: $($req.files.Count)개" -ForegroundColor Gray
                }

                # 나레이션 탭에서 직접 요청 (voice/rate/pitch/volume/emotion 파라미터 포함)
                if ($req.type -eq "narration" -or $req.type -eq "tts_preview") {
                    $ttsText = $msg -replace "^음성\s*", ""
                    # voiceName은 한국어 캐릭터명 (남자/여자/남자아이/여자아이 등)
                    # voice는 voice ID (ko-KR-HyunsuMultilingualNeural 등)
                    $ttsVoiceName = if ($req.voiceName) { $req.voiceName } else { "" }
                    $ttsVoice = if ($req.voice) { $req.voice } else { "남자" }
                    # voiceName이 없으면 voice ID를 그대로 전달 (tts-natural.py가 매핑)
                    $voiceArg = if ($ttsVoiceName) { $ttsVoiceName } else { $ttsVoice }
                    $ttsRate = if ($req.rate) { [double]$req.rate } else { 1.0 }
                    $ttsPitch = if ($null -ne $req.pitch) { [int]$req.pitch } else { 0 }
                    $ttsVolume = if ($null -ne $req.volume) { [int]$req.volume } else { 0 }
                    $ttsEmotion = if ($req.emotion) { $req.emotion } else { "기본" }
                    $ttsEmotionLabel = if ($req.emotionLabel) { $req.emotionLabel } else { "" }
                    $ttsIntensity = if ($null -ne $req.intensity) { [int]$req.intensity } else { 50 }
                    $batchIdx = if ($null -ne $req.batchIndex) { [int]$req.batchIndex } else { -1 }
                    $batchTotal = if ($null -ne $req.batchTotal) { [int]$req.batchTotal } else { 0 }
                    # 자막+자동배치 옵션
                    $doSub = if ($null -ne $req.autoSubtitle) { [bool]$req.autoSubtitle } else { ($req.type -eq "narration") }
                    $doPlace = if ($null -ne $req.autoPlace) { [bool]$req.autoPlace } else { ($req.type -eq "narration") }
                    $subTrack = if ($null -ne $req.subtitleTrack) { [int]$req.subtitleTrack } else { 5 }
                    $audTrack = if ($null -ne $req.audioTrack) { [int]$req.audioTrack } else { 0 }
                    if ($ttsText) {
                        Write-Host "   → 나레이션: '$ttsText' (voice: $voiceArg, emotion: $ttsEmotion, sub: $doSub, place: $doPlace)" -ForegroundColor Cyan
                        Process-TTS -Text $ttsText -Voice $voiceArg -Rate $ttsRate -Pitch $ttsPitch -Volume $ttsVolume -Emotion $ttsEmotion -EmotionLabel $ttsEmotionLabel -Intensity $ttsIntensity -BatchIndex $batchIdx -BatchTotal $batchTotal -AutoSubtitle $doSub -AutoPlace $doPlace -SubtitleTrack $subTrack -AudioTrack $audTrack
                    } else {
                        Send-ChatResponse "❓ 나레이션 텍스트를 입력해주세요"
                    }
                }
                # TTS 요청 처리 (채팅에서)
                elseif (Is-TTSRequest -Msg $msg) {
                    $ttsInfo = Extract-TTSText -Msg $msg
                    if ($ttsInfo.text) {
                        Write-Host "   → TTS 처리: '$($ttsInfo.text)' (voice: $($ttsInfo.voice), rate: $($ttsInfo.rate))" -ForegroundColor Cyan
                        Process-TTS -Text $ttsInfo.text -Voice $ttsInfo.voice -Rate $ttsInfo.rate
                    } else {
                        Send-ChatResponse "❓ TTS 텍스트를 입력해주세요. 예: '음성 안녕하세요 오늘의 룩북입니다'"
                    }
                }
                # 스티커 요청
                elseif (Is-StickerRequest -Msg $msg) {
                    Process-Sticker -Query $msg
                }
                # 저장 요청
                elseif ($msg -match "저장") {
                    $r = Send-PProCmd -Id "save_$(Get-Random)" -Action "save_project"
                    if ($r.success) {
                        Send-ChatResponse "💾 프로젝트 저장 완료!"
                    } else {
                        Send-ChatResponse "❌ 저장 실패: $($r.error)"
                    }
                }
                # 트랜지션 요청
                elseif ($msg -match "트랜지션") {
                    $trackIdx = 0
                    $dur = 0.3
                    if ($msg -match "(\d+\.?\d*)초") { $dur = [double]$Matches[1] }
                    if ($msg -match "[vV](\d+)") { $trackIdx = [int]$Matches[1] - 1 }

                    Send-ChatResponse "✨ 트랜지션 추가 중... (V$($trackIdx+1), ${dur}초)"
                    $r = Send-PProCmd -Id "trans_$(Get-Random)" -Action "batch_add_transitions" -Params @{
                        trackIndex = $trackIdx; duration = $dur; skipFirst = $true
                    }
                    if ($r.success) {
                        Send-ChatResponse "✅ 트랜지션 추가 완료! ($($r.count)개)"
                    } else {
                        Send-ChatResponse "❌ 트랜지션 실패: $($r.error)"
                    }
                }
                # 분석 요청
                elseif ($msg -match "분석|패턴|analyze") {
                    $lookIdx = 1
                    if ($msg -match "(\d+)") { $lookIdx = [int]$Matches[1] }
                    Send-ChatResponse "🔍 Look $lookIdx 분석 중..."
                    $r = Send-PProCmd -Id "analyze_$(Get-Random)" -Action "analyze_look" -Params @{ lookIndex = $lookIdx } -TimeoutSeconds 60
                    if ($r.success) {
                        Send-ChatResponse "✅ Look $lookIdx 분석 완료! 패턴 저장됨"
                    } else {
                        Send-ChatResponse "❌ 분석 실패: $($r.error)"
                    }
                }
                # 자동 적용
                elseif ($msg -match "자동\s*적용|apply.*template") {
                    Send-ChatResponse "🎬 템플릿 자동 적용 중..."
                    $r = Send-PProCmd -Id "apply_$(Get-Random)" -Action "apply_template" -Params @{
                        templateLookIndex = 1; targetLookIndex = 2
                    } -TimeoutSeconds 120
                    if ($r.success) {
                        Send-ChatResponse "✅ 템플릿 적용 완료!"
                    } else {
                        Send-ChatResponse "❌ 적용 실패: $($r.error)"
                    }
                }
                # 기타 — Claude Code에 전달 (chat-request는 이미 삭제됨, 새 파일로 저장)
                else {
                    # Claude Code가 읽을 수 있도록 다시 저장 (접두사 변경)
                    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                    $fwd = @{
                        type = "claude_request"
                        message = $msg
                        timestamp = (Get-Date).ToString("o")
                    }
                    if ($hasFiles) { $fwd.files = $req.files }
                    $fwdJson = $fwd | ConvertTo-Json -Depth 5 -Compress
                    $fwdPath = Join-Path $BridgePath "claude-request-$ts.json"
                    [System.IO.File]::WriteAllText($fwdPath, $fwdJson, [System.Text.UTF8Encoding]::new($false))

                    Send-ChatResponse "📨 Claude에 전달됨: '$msg'"
                    Write-Host "   → Claude Code에 전달" -ForegroundColor Gray
                }

            } catch {
                Write-Host "   ❌ 처리 오류: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } catch {
        # 폴링 오류 무시
    }

    # 상태 표시 (30초마다)
    $pollCount++
    if ($pollCount % 60 -eq 0) {
        Write-Host "$(Get-Date -Format 'HH:mm:ss') - 모니터 실행 중 ($([math]::Floor($pollCount/2))초)" -ForegroundColor DarkGray
    }

    Start-Sleep -Milliseconds 500
}
