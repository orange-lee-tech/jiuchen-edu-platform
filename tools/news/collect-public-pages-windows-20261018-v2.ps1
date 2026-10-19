# One-time read-only collection of the four supplied public WeChat pages.
# Uses Windows HTTP clients and never reads browser profiles or production secrets.
$ErrorActionPreference = 'Stop'

$pages = @(
    [pscustomobject]@{ name='01-2028-tui-mian'; url='https://mp.weixin.qq.com/s/ul2gk6Xo1TKi_PXvgRpqBA' },
    [pscustomobject]@{ name='02-timeline'; url='https://mp.weixin.qq.com/s/dG__zmMfO5UvVa7D4iMfgA' },
    [pscustomobject]@{ name='03-october-competitions'; url='https://mp.weixin.qq.com/s/nATlCGc9mXAl6WDYfs_H2Q' },
    [pscustomobject]@{ name='04-autumn-recruitment'; url='https://mp.weixin.qq.com/s/DJW3ka4lF8KZc4HPRG9VEQ' }
)

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $env:TEMP "jiuchen-public-http-$stamp"
$capture = Join-Path $work 'capture'
New-Item -Path $capture -ItemType Directory -Force | Out-Null
$results = @()
$curl = Join-Path $env:WINDIR 'System32\curl.exe'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

foreach ($page in $pages) {
    $html = Join-Path $capture "$($page.name).html"
    $method = 'curl.exe'
    $metadata = ''
    $curlError = ''
    if (Test-Path -LiteralPath $curl) {
        $curlArgs = @('-L','--compressed','--silent','--connect-timeout','10',
            '--max-time','45','--retry','1','--user-agent',$ua,
            '--header','Accept-Language: zh-CN,zh;q=0.9',
            '--output',$html,'--write-out','%{http_code}|%{size_download}|%{url_effective}',$page.url)
        $metadata = (& $curl @curlArgs | Out-String).Trim()
        $curlCode = $LASTEXITCODE
    } else {
        $curlCode = -1
        $metadata = 'curl.exe missing'
    }
    $bytes = if (Test-Path -LiteralPath $html) { (Get-Item -LiteralPath $html).Length } else { 0 }
    if ($curlCode -ne 0 -or $bytes -eq 0) {
        $curlError = "exit=$curlCode $metadata"
        $method = 'Invoke-WebRequest'
        try {
            Invoke-WebRequest -Uri $page.url -UserAgent $ua -Headers @{'Accept-Language'='zh-CN,zh;q=0.9'} `
                -MaximumRedirection 10 -TimeoutSec 45 -UseBasicParsing -OutFile $html | Out-Null
            $metadata = 'Invoke-WebRequest completed'
        } catch {
            $metadata = 'Invoke-WebRequest failed: ' + $_.Exception.GetType().Name
        }
    }
    $bytes = if (Test-Path -LiteralPath $html) { (Get-Item -LiteralPath $html).Length } else { 0 }
    $body = if ($bytes -gt 0) { [System.IO.File]::ReadAllText($html,[System.Text.Encoding]::UTF8) } else { '' }
    $row = [pscustomobject]@{
        name=$page.name
        suppliedUrl=$page.url
        method=$method
        htmlBytes=$bytes
        hasArticleContainer=[bool]($body -match 'id=["''](?:js_content|rich_media_content)["'']')
        expectedAccountMarkerPresent=$body.Contains('MzY5MTM2ODk5NA==')
        challengeLikely=[bool]($body -match '环境异常|访问过于频繁|验证码|请在微信客户端打开|verify.*robot')
        result=$metadata
        firstAttempt=$curlError
    }
    $results += $row
    Write-Host ("PAGE={0} BYTES={1} ARTICLE={2} ACCOUNT_MARKER={3} CHALLENGE={4} METHOD={5}" -f $row.name,$row.htmlBytes,$row.hasArticleContainer,$row.expectedAccountMarkerPresent,$row.challengeLikely,$row.method)
}

$summary = Join-Path $capture 'summary.json'
[pscustomobject]@{
    mode='PUBLIC_PAGES_READ_ONLY_CAPTURE_V2'
    expectedAccountBiz='MzY5MTM2ODk5NA=='
    capturedAt=(Get-Date).ToString('o')
    pages=$results
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $summary -Encoding UTF8
$zip = Join-Path (Join-Path $env:USERPROFILE 'Downloads') "jiuchen-public-pages-v2-$stamp.zip"
Compress-Archive -Path (Join-Path $capture '*') -DestinationPath $zip
Write-Host "PUBLIC_CAPTURE_ZIP=$zip"
if (@($results | Where-Object { $_.htmlBytes -gt 0 }).Count -eq 0) {
    throw 'EMPTY_CAPTURE：两个 Windows HTTP 客户端都没有取得页面；请仍上传诊断 ZIP。'
}
Write-Host 'PUBLIC_HTML_CAPTURED：请上传 ZIP。页面身份与正文完整性仍需核验。'
