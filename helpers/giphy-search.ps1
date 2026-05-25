# giphy-search.ps1 — 스티커 검색 + 다운로드 (Tenor API)
# 사용법: powershell -File giphy-search.ps1 -Query "cute emoji" [-Limit 5] [-Download] [-Index 0]

param(
    [Parameter(Mandatory=$true)][string]$Query,
    [int]$Limit = 5,
    [switch]$Download,
    [int]$Index = 0,
    [string]$OutDir = "C:\Users\skafu\Desktop\ClaudeCode\stickers"
)

$ApiKey = "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ"
$ClientKey = "premiere_mcp"
$BaseUrl = "https://tenor.googleapis.com/v2/search"

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

try {
    $encodedQuery = [System.Uri]::EscapeDataString($Query)
    $url = "${BaseUrl}?q=${encodedQuery}&key=${ApiKey}&client_key=${ClientKey}&limit=${Limit}&media_filter=mp4,gif,tinygif"

    $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 15

    if (-not $response.results -or $response.results.Count -eq 0) {
        $json = @{ success = $false; error = "No results: '$Query'" } | ConvertTo-Json -Compress
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Write-Output $json
        exit 0
    }

    $results = @()
    $i = 0
    foreach ($item in $response.results) {
        $mp4Url = ""
        $gifUrl = ""
        $previewUrl = ""

        if ($item.media_formats.mp4) { $mp4Url = $item.media_formats.mp4.url }
        if ($item.media_formats.gif) { $gifUrl = $item.media_formats.gif.url }
        if ($item.media_formats.tinygif) { $previewUrl = $item.media_formats.tinygif.url }

        $results += @{
            index = $i
            id = $item.id
            title = $item.content_description
            mp4 = $mp4Url
            gif = $gifUrl
            preview = $previewUrl
        }
        $i++
    }

    if ($Download) {
        $idx = [math]::Min($Index, $results.Count - 1)
        $selected = $results[$idx]
        $downloadUrl = if ($selected.mp4) { $selected.mp4 } else { $selected.gif }
        $ext = if ($selected.mp4) { "mp4" } else { "gif" }

        if ($downloadUrl) {
            $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $fileName = "sticker-${ts}.${ext}"
            $filePath = Join-Path $OutDir $fileName
            Invoke-WebRequest -Uri $downloadUrl -OutFile $filePath -TimeoutSec 30
            $size = (Get-Item $filePath).Length

            $json = @{
                success = $true
                action = "download"
                file = $filePath
                size = $size
                title = $selected.title
                id = $selected.id
                format = $ext
            } | ConvertTo-Json -Compress
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            Write-Output $json
        } else {
            $json = @{ success = $false; error = "No download URL" } | ConvertTo-Json -Compress
            Write-Output $json
        }
    } else {
        $json = @{
            success = $true
            action = "search"
            query = $Query
            count = $results.Count
            results = $results
        } | ConvertTo-Json -Depth 5 -Compress
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Write-Output $json
    }
} catch {
    $json = @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    Write-Output $json
}
