param(
 [Parameter(Mandatory=$true)][string]$ZipPath,
 [string]$Destination = "tools/school-media/source-2026-10-10"
)
$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Run this from a Git worktree' }
$resolvedZip = (Resolve-Path -LiteralPath $ZipPath).Path
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("jiuchen-school-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
 Expand-Archive -LiteralPath $resolvedZip -DestinationPath $tmp
 $readme = Get-ChildItem $tmp -Filter README.md -Recurse | Select-Object -First 1
 if (-not $readme) { throw 'ZIP missing README.md' }
 $source = $readme.Directory.FullName
 $manifest = Join-Path $source 'manifest.json'
 $csv = Join-Path $source 'data/schools_172.csv'
 if (!(Test-Path $manifest) -or !(Test-Path $csv)) { throw 'ZIP missing manifest or CSV' }
 $metadata = Get-Content $manifest -Raw | ConvertFrom-Json
 $rows = @(Import-Csv -Path $csv)
 if ($metadata.schoolRecordCount -ne 172 -or $rows.Count -ne 172) { throw 'Expected exactly 172 rows' }
 for ($i=0; $i -lt 172; $i++) {
   if ($rows[$i].schoolId -ne ('s{0:d3}' -f ($i+1))) { throw "Invalid ID at row $i" }
 }
 $dest = Join-Path $repo $Destination
 if (Test-Path $dest) { throw "Target already exists: $dest; refusing overwrite" }
 New-Item -ItemType Directory -Path $dest | Out-Null
 Copy-Item -LiteralPath (Join-Path $source 'README.md') -Destination $dest
 Copy-Item -LiteralPath (Join-Path $source 'manifest.json') -Destination $dest
 Copy-Item -LiteralPath (Join-Path $source 'SHA256SUMS.txt') -Destination $dest
 foreach ($sub in @('data','reports','scripts')) {
   Copy-Item -LiteralPath (Join-Path $source $sub) -Destination $dest -Recurse
 }
 Write-Host "IMPORTED_SOURCE_PASS 172/172"
 Write-Host "DATASET_PATH=$dest"
 Write-Host "NOTE: No WebP binaries shipped. Images not deployed; no ECS changes."
} finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
