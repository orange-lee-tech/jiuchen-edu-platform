# 2026-11-08 远端分支精确整理清单

> 本清单是待执行任务，不是已剪除回执。必须保留本地未提交 `apps/miniprogram/project.config.json` 与四个 stash。**不使用 reset、clean、强推 main、删除本地工作分支或重写历史。**

## 核验基线

- `main`：`cfb0f85c39b44b8a8a2726c26108e465da6f9a45`（后续 docs-only commit 可使其前进）。
- `codex/ux-batch-a-20261106`：`217934e00898c002f741b49511e46a41c209e4bc`，已为 main 祖先，**可删**。
- `codex/ux-batch-a-checkpoint-20261106`：`81d9de7827d5d96c6508acf1103ed8e7f720adaa`，对 main 存在 **1 个独有提交**。这是一份早期首页/规划 UI 快照，先归档标签再删；不得反向合并覆盖新版。
- 开放 PR：0；历史已合并或已关闭 PR 不必重开。

## Windows PowerShell（可在既有仓库工作树执行）

```powershell
Set-Location 'C:\Users\yulia\Desktop\jiuchen-edu-platform-main'
git fetch --prune origin
if ($LASTEXITCODE -ne 0) { throw 'STOP: fetch failed' }

$feature = 'codex/ux-batch-a-20261106'
$featureSha = '217934e00898c002f741b49511e46a41c209e4bc'
$checkpoint = 'codex/ux-batch-a-checkpoint-20261106'
$checkpointSha = '81d9de7827d5d96c6508acf1103ed8e7f720adaa'
$tag = 'archive/2026-11-08/codex/ux-batch-a-checkpoint-20261106'

# 更新后的 main 可比 2026-11-08 合并 SHA 更靠前，但必须仍包含功能分支。
git merge-base --is-ancestor $featureSha origin/main
if ($LASTEXITCODE -ne 0) { throw 'STOP: feature not contained in main' }
foreach ($pair in @(@($feature,$featureSha),@($checkpoint,$checkpointSha))) {
  $line = @(git ls-remote --heads origin "refs/heads/$($pair[0])")
  if ($LASTEXITCODE -ne 0 -or $line.Count -ne 1 -or
    $line[0] -notmatch "^$($pair[1])\s+refs/heads/") {
    throw "STOP: remote changed: $($pair[0])"
  }
}

# 先存保留 checkpoint 独有提交的远端归档标签。
$existing = @(git ls-remote --tags origin "refs/tags/$tag")
if ($LASTEXITCODE -ne 0) { throw 'STOP: cannot inspect tag' }
if ($existing.Count -eq 0) {
  git tag -a $tag $checkpointSha -m 'Archive pre-merge UX Batch A checkpoint 2026-11-08'
  if ($LASTEXITCODE -ne 0) { throw 'STOP: cannot create tag' }
  git push origin "refs/tags/$tag"
  if ($LASTEXITCODE -ne 0) { throw 'STOP: tag push failed' }
}
$peeled = @(git ls-remote --tags origin "refs/tags/$tag^{}")
if ($LASTEXITCODE -ne 0 -or !($peeled | Where-Object { $_ -match "^$checkpointSha\s+refs/tags/" })) {
  throw 'STOP: archive tag not verified'
}

# 固定 SHA lease：远端更新则拒绝删除，保留原历史。
foreach ($pair in @(@($feature,$featureSha),@($checkpoint,$checkpointSha))) {
  $name=$pair[0]; $sha=$pair[1]
  git push "--force-with-lease=refs/heads/${name}:${sha}" origin ":refs/heads/${name}"
  if ($LASTEXITCODE -ne 0) { throw "STOP: failed to prune $name" }
}
git ls-remote --heads origin
git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}"
git status --short
git stash list
```

**最终 PASS**：远端仅 `main`、归档标签解引用为 `81d9de...`、本地配置与四个 stash 原样保留。若验证失败，立即停止；不得删除 checkpoint 后再补标签。
