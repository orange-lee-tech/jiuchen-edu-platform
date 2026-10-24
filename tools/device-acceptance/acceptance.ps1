param(
  [ValidateSet('start','stop','reset','logs','status','recharge')]
  [string]$Action = 'start',
  [ValidateSet('assessment-1','assessment-10','JC000','JC001','JC002','JC003')]
  [string]$Sku = 'assessment-1',
  [string]$HttpsUrl = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$runtime = Join-Path $repo 'runtime'
$localEnvFile = Join-Path $runtime 'acceptance.env'
$mysqlEnvFile = Join-Path $runtime 'mysql.env'
$statusFile = Join-Path $runtime 'status.json'
$schemaReadyFile = Join-Path $runtime 'schema-ready.marker'
$caseRoot = Join-Path $runtime 'cases'
$caseFile = Join-Path $caseRoot 'ai/rag/v1.0.0/rag_reference_eval_safe_train_dev.jsonl'
$logs = Join-Path $runtime 'logs'
$container = 'jiuchen-device-acceptance-db'
$volume = 'jiuchen-device-acceptance-db'
$api = Join-Path $repo 'services/api'
if ((Split-Path $repo -Leaf) -ne 'jiuchen-edu-device-acceptance') {
  throw 'Refusing unexpected worktree path'
}

function Private-File([string]$file) {
  & icacls.exe $file '/inheritance:r' '/grant:r' "$($env:USERNAME):(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cannot restrict local config ACL: $file" }
}
function Read-Config {
  if (!(Test-Path -LiteralPath $localEnvFile)) { throw 'Local acceptance config is missing; run start' }
  $settings = @{}
  foreach ($line in Get-Content -LiteralPath $localEnvFile) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
  }
  return $settings
}
function Use-Config($settings) {
  foreach ($name in $settings.Keys) {
    [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
  }
}
function Docker([string[]]$arguments) {
  $output = & wsl.exe --exec docker @arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($arguments[0])" }
  return $output
}
function Assert-TestContainer {
  $labels = (& wsl.exe --exec docker inspect --format '{{json .Config.Labels}}' $container) |
    ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or
      $labels.PSObject.Properties['com.jiuchen.scope'].Value -ne 'device-acceptance') {
    throw 'Refusing an existing container without the device-acceptance label'
  }
}
function Stop-Processes {
  if (!(Test-Path -LiteralPath $statusFile)) { return }
  $state = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
  foreach ($entry in @(
    @{id=$state.tunnelPid;name='cloudflared'},
    @{id=$state.proxyPid;name='node'},
    @{id=$state.apiPid;name='node'}
  )) {
    if (!$entry.id) { continue }
    $process = Get-Process -Id ([int]$entry.id) -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq $entry.name) {
      Stop-Process -Id $process.Id -Force
    }
  }
  Remove-Item -LiteralPath $statusFile -Force
}

if ($Action -eq 'stop') {
  Stop-Processes
  $names = & wsl.exe --exec docker ps --format '{{.Names}}'
  if ($names -contains $container) {
    Assert-TestContainer
    Docker @('stop',$container) | Out-Null
  }
  Write-Output '隔离 API、隧道和测试 MySQL 已停止；合成数据保留。'
  exit 0
}
if ($Action -eq 'reset') {
  Stop-Processes
  $names = & wsl.exe --exec docker ps -a --format '{{.Names}}'
  $ownedContainer = $names -contains $container
  if ($ownedContainer) {
    Assert-TestContainer
    Docker @('rm','-f',$container) | Out-Null
  }
  $volumes = & wsl.exe --exec docker volume ls --format '{{.Name}}'
  if ($volumes -contains $volume) {
    if (!$ownedContainer) { throw 'Refusing to remove an unverified volume' }
    Docker @('volume','rm',$volume) | Out-Null
  }
  foreach ($file in @($localEnvFile,$mysqlEnvFile,$statusFile,$schemaReadyFile)) {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
  }
  $generated = [IO.Path]::GetFullPath((Join-Path $runtime 'miniprogram'))
  if ((Split-Path $generated -Parent) -ne $runtime) { throw 'Unsafe generated project path' }
  if (Test-Path -LiteralPath $generated) { Remove-Item -LiteralPath $generated -Recurse -Force }
  if (Test-Path -LiteralPath $caseRoot) { Remove-Item -LiteralPath $caseRoot -Recurse -Force }
  Write-Output '仅隔离验收容器、数据卷、本地密钥与生成项目已重置。'
  exit 0
}
if ($Action -eq 'logs') {
  foreach ($file in @('api.err.log','api.out.log','proxy.err.log','proxy.out.log','tunnel.err.log')) {
    $path = Join-Path $logs $file
    if (Test-Path -LiteralPath $path) {
      Write-Output "[$file]"
      Get-Content -LiteralPath $path -Tail 35
    }
  }
  exit 0
}
if ($Action -eq 'status') {
  if (Test-Path -LiteralPath $statusFile) {
    Get-Content -LiteralPath $statusFile -Raw
  } else { Write-Output '隔离环境未启动。' }
  exit 0
}
if ($Action -eq 'recharge') {
  $settings = Read-Config
  Use-Config $settings
  Push-Location $repo
  try { & node tools/device-acceptance/recharge.mjs $Sku }
  finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw '隔离模拟充值失败' }
  exit 0
}

New-Item -ItemType Directory -Force -Path $runtime,$logs | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $caseFile -Parent) | Out-Null
if (!(Test-Path -LiteralPath $caseFile)) { Set-Content -LiteralPath $caseFile -Value '' -NoNewline }
if (!(Test-Path -LiteralPath $localEnvFile)) {
  $dbPassword = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
  $token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
  $masterKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  @(
    'NODE_ENV=test',
    'HOST=127.0.0.1',
    'PORT=3311',
    "DATABASE_URL=mysql://root:$dbPassword@127.0.0.1:33306/jiuchen_device_acceptance",
    "ACCEPTANCE_TOKEN=$token",
    'ACCEPTANCE_API_PORT=3311',
    'ACCEPTANCE_PROXY_PORT=3312',
    "ADMIN_AI_KEY_ENCRYPTION_KEY=$masterKey",
    "ASSESSMENT_CASE_DATA_ROOT=$caseRoot",
    'CREDIT_ENFORCEMENT_ENABLED=true',
    'CREDIT_FREE_GRANT_VERSION=device-acceptance-v1',
    'CREDIT_FREE_GRANT_AMOUNT=1',
    'WECHAT_VIRTUAL_PAY_ENABLED=false'
  ) | Set-Content -LiteralPath $localEnvFile -Encoding ascii
  @("MYSQL_ROOT_PASSWORD=$dbPassword",'MYSQL_DATABASE=jiuchen_device_acceptance') |
    Set-Content -LiteralPath $mysqlEnvFile -Encoding ascii
  Private-File $localEnvFile
  Private-File $mysqlEnvFile
}
$settings = Read-Config
if (!$settings.ContainsKey('ASSESSMENT_CASE_DATA_ROOT')) {
  Add-Content -LiteralPath $localEnvFile -Value "ASSESSMENT_CASE_DATA_ROOT=$caseRoot"
  Private-File $localEnvFile
  $settings.ASSESSMENT_CASE_DATA_ROOT = $caseRoot
}
Use-Config $settings
$dbUri = [Uri]$settings.DATABASE_URL
if ($dbUri.Host -ne '127.0.0.1' -or $dbUri.Port -ne 33306 -or
    $dbUri.AbsolutePath -ne '/jiuchen_device_acceptance' -or $settings.NODE_ENV -ne 'test') {
  throw 'Refusing non-acceptance database or runtime'
}

$names = & wsl.exe --exec docker ps -a --format '{{.Names}}'
if ($names -contains $container) {
  Assert-TestContainer
  $running = & wsl.exe --exec docker ps --format '{{.Names}}'
  if ($running -notcontains $container) { Docker @('start',$container) | Out-Null }
} else {
  $wslEnv = (& wsl.exe --exec wslpath -a -u $mysqlEnvFile).Trim()
  Docker @('run','-d','--name',$container,'--label','com.jiuchen.scope=device-acceptance',
    '--env-file',$wslEnv,'-p','127.0.0.1:33306:3306',
    '-v',"$($volume):/var/lib/mysql",'mysql:8.0') | Out-Null
}

$ready = $false
for ($attempt=0; $attempt -lt 45; $attempt++) {
  try {
    $count = & node (Join-Path $PSScriptRoot 'db-state.mjs') 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (!$ready) { throw '隔离 MySQL 未在 90 秒内就绪' }
Push-Location $api
try {
  if ([int]$count -eq 0) {
    $pushLog = Join-Path $logs 'schema-push.log'
    & npm run db:push -- --force *> $pushLog
    if ($LASTEXITCODE -ne 0 -or
        (Select-String -LiteralPath $pushLog -Pattern '^Error:|^  code: ' -Quiet)) {
      throw 'Drizzle test schema initialization failed; see runtime/logs/schema-push.log'
    }
  }
  if ([int]$count -eq 0 -or !(Test-Path -LiteralPath $schemaReadyFile)) {
  foreach ($step in @(
    'db:upgrade:auth','db:upgrade:enrollment-year','db:upgrade:identity-v2',
    'db:upgrade:native-auth','db:upgrade:assessment','db:upgrade:classroom-guidance',
    'db:upgrade:product-knowledge','db:upgrade:classroom-revisions',
    'db:upgrade:credit-payment','db:upgrade:virtual-delivery',
    'db:upgrade:admin-controls','db:upgrade:assessment-keys',
    'db:upgrade:credit-plans','db:upgrade:dual-identity',
    'db:upgrade:growth-profile','db:upgrade:news-experience','db:upgrade:news-v2'
  )) {
    & npm run $step
    if ($LASTEXITCODE -ne 0) { throw "Test database migration failed: $step" }
  }
  Set-Content -LiteralPath $schemaReadyFile -Value 'all-test-migrations-complete' -Encoding ascii
  }
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
} finally { Pop-Location }
& node (Join-Path $PSScriptRoot 'seed.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Synthetic identity seed failed' }

Stop-Processes
$node = (Get-Command node).Source
$apiOptions = @{
  FilePath=$node; ArgumentList=@('dist/server.js'); WorkingDirectory=$api
  WindowStyle='Hidden'; PassThru=$true; Environment=$settings
  RedirectStandardOutput=(Join-Path $logs 'api.out.log')
  RedirectStandardError=(Join-Path $logs 'api.err.log')
}
$apiProcess = Start-Process @apiOptions
$proxyOptions = @{
  FilePath=$node; ArgumentList=@('tools/device-acceptance/proxy.mjs')
  WorkingDirectory=$repo; WindowStyle='Hidden'; PassThru=$true; Environment=$settings
  RedirectStandardOutput=(Join-Path $logs 'proxy.out.log')
  RedirectStandardError=(Join-Path $logs 'proxy.err.log')
}
$proxyProcess = Start-Process @proxyOptions
@{
  apiPid=$apiProcess.Id
  proxyPid=$proxyProcess.Id
  tunnelPid=$null
} | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding utf8
$localHealth = $null
for ($attempt=0; $attempt -lt 120; $attempt++) {
  try {
    $localHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:3312/health' -Headers @{'X-Acceptance-Token'=$settings.ACCEPTANCE_TOKEN}
    if ($localHealth.ok -and $localHealth.dependencies.database -eq 'ok') { break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (!$localHealth -or !$localHealth.ok -or $localHealth.dependencies.database -ne 'ok') {
  throw 'Local acceptance API health or database is not ready'
}

$tunnelProcess = $null
if (!$HttpsUrl) {
  $binary = Join-Path $runtime 'cloudflared.exe'
  $expectedHash = '4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6'
  if (!(Test-Path -LiteralPath $binary)) {
    Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.1/cloudflared-windows-amd64.exe' -OutFile $binary
  }
  if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'cloudflared binary checksum mismatch'
  }
  $tunnelOptions = @{
    FilePath=$binary
    ArgumentList=@('tunnel','--no-autoupdate','--url','http://127.0.0.1:3312')
    WindowStyle='Hidden'; PassThru=$true
    RedirectStandardOutput=(Join-Path $logs 'tunnel.out.log')
    RedirectStandardError=(Join-Path $logs 'tunnel.err.log')
  }
  $tunnelProcess = Start-Process @tunnelOptions
  for ($attempt=0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    $content = Get-Content -LiteralPath (Join-Path $logs 'tunnel.err.log') -Raw -ErrorAction SilentlyContinue
    if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      $HttpsUrl = $Matches[0]
      break
    }
    if ($tunnelProcess.HasExited) { break }
  }
}
if ($HttpsUrl -notmatch '^https://[a-z0-9.-]+$') { throw 'HTTPS tunnel did not provide a valid URL' }
$settings.ACCEPTANCE_HTTPS_URL = $HttpsUrl
Use-Config $settings
& node (Join-Path $PSScriptRoot 'prepare-mini.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Acceptance mini-program generation failed' }
$externalLive = Invoke-RestMethod -Uri "$HttpsUrl/health/live"
$externalHealth = Invoke-RestMethod -Uri "$HttpsUrl/health" -Headers @{'X-Acceptance-Token'=$settings.ACCEPTANCE_TOKEN}
if (!$externalLive.ok -or !$externalHealth.ok -or $externalHealth.dependencies.database -ne 'ok') {
  throw 'External HTTPS acceptance API health failed'
}
@{
  branch='codex/device-acceptance'
  sourceSha=(& git -C $repo rev-parse HEAD).Trim()
  url=$HttpsUrl
  project=(Join-Path $runtime 'miniprogram')
  apiPid=$apiProcess.Id
  proxyPid=$proxyProcess.Id
  tunnelPid=if ($tunnelProcess) { $tunnelProcess.Id } else { $null }
  httpsServerReachable=$true
  wechatRealDeviceVerified=$false
  startedAt=(Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding utf8
Write-Output "隔离验收环境已启动：$HttpsUrl"
Write-Output "微信开发者工具项目：$(Join-Path $runtime 'miniprogram')"
Write-Output '真实手机连通性尚待真机调试回执；本机 HTTPS 和数据库健康检查已通过。'
