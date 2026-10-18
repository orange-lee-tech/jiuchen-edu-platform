# Captures four supplied public WeChat pages with an isolated, unsigned-in
# Chrome profile. No production API, database, secret, or browser profile use.
$ErrorActionPreference = 'Stop'

$chromeCandidates = @()
foreach ($location in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
    if ($location) { $chromeCandidates += Join-Path $location 'Google\Chrome\Application\chrome.exe' }
}
$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $chrome) { throw '未找到 Google Chrome。请确认 Chrome 已安装。' }

$pages = @(
    [pscustomobject]@{ name='01-2028-tui-mian'; url='https://mp.weixin.qq.com/s/ul2gk6Xo1TKi_PXvgRpqBA' },
    [pscustomobject]@{ name='02-timeline'; url='https://mp.weixin.qq.com/s/dG__zmMfO5UvVa7D4iMfgA' },
    [pscustomobject]@{ name='03-october-competitions'; url='https://mp.weixin.qq.com/s/nATlCGc9mXAl6WDYfs_H2Q' },
    [pscustomobject]@{ name='04-autumn-recruitment'; url='https://mp.weixin.qq.com/s/DJW3ka4lF8KZc4HPRG9VEQ' }
)

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $env:TEMP "jiuchen-public-pages-$stamp"
$capture = Join-Path $work 'capture'
New-Item -ItemType Directory -Path $capture -Force | Out-Null
$results = @()

foreach ($page in $pages) {
    $profile = Join-Path $work "profile-$($page.name)"
    $html = Join-Path $capture "$($page.name).html"
    $err = Join-Path $work "$($page.name).stderr.txt"
    $args = @(
        '--headless=new', '--disable-gpu', '--no-first-run',
        '--no-default-browser-check', '--disable-extensions',
        "--user-data-dir=`"$profile`"", '--virtual-time-budget=12000',
        '--dump-dom', $page.url
    )
    $process = Start-Process -FilePath $chrome -ArgumentList $args -Wait -PassThru `
        -RedirectStandardOutput $html -RedirectStandardError $err
    $source = if (Test-Path -LiteralPath $html) {
        [System.IO.File]::ReadAllText($html, [System.Text.Encoding]::UTF8)
    } else { '' }
    $hasArticle = $source -match 'id=["''](?:js_content|rich_media_content)["'']'
    $accountMarker = $source.Contains('MzY5MTM2ODk5NA==')
    $challenge = $source -match '环境异常|访问过于频繁|验证码|请在微信客户端打开|verify.*robot'
    $row = [pscustomobject]@{
        name = $page.name
        suppliedUrl = $page.url
        chromeExitCode = $process.ExitCode
        htmlBytes = if (Test-Path -LiteralPath $html) { (Get-Item -LiteralPath $html).Length } else { 0 }
        hasArticleContainer = [bool]$hasArticle
        expectedAccountMarkerPresent = [bool]$accountMarker
        challengeLikely = [bool]$challenge
    }
    $results += $row
    Write-Host ("PAGE={0} EXIT={1} BYTES={2} ARTICLE={3} ACCOUNT_MARKER={4} CHALLENGE={5}" -f $row.name,$row.chromeExitCode,$row.htmlBytes,$row.hasArticleContainer,$row.expectedAccountMarkerPresent,$row.challengeLikely)
    # The profile was created only for this anonymous read. Do not package it.
    if (Test-Path -LiteralPath $profile) {
        try { Remove-Item -LiteralPath $profile -Recurse -Force }
        catch { Write-Host "ANONYMOUS_PROFILE_CLEANUP_PENDING=$profile" }
    }
}

$summary = Join-Path $capture 'summary.json'
[pscustomobject]@{
    mode = 'PUBLIC_PAGES_READ_ONLY_CAPTURE'
    expectedAccountBiz = 'MzY5MTM2ODk5NA=='
    capturedAt = (Get-Date).ToString('o')
    pages = $results
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $summary -Encoding UTF8

$downloads = Join-Path $env:USERPROFILE 'Downloads'
$zip = Join-Path $downloads "jiuchen-public-pages-$stamp.zip"
Compress-Archive -Path (Join-Path $capture '*') -DestinationPath $zip
Write-Host "PUBLIC_CAPTURE_ZIP=$zip"
Write-Host '此 ZIP 仅含匿名公开页面及摘要；未包含 Chrome 用户资料。请上传 ZIP 供内容核验，不要直接导入生产库。'
