# GitHub 分支剪除清单（2026-10-19）

基准：`main` 已包含前端 `9da7f9178b737b8ebbc7b17ece1ef3260824f893` 与生产 API `dbd7d9a818523cc3b007afe47a03519510415652`；PR #1/#4 已合并，PR #2/#3/#5 已关闭。此清单只删除远端分支引用，不碰 ECS release/回退目录、生产数据库、微信体验版或本机未提交文件。

## 第一组：可剪除的八个旧引用

以下八个精确 HEAD 均经 GitHub compare 验证为 `main` 的祖先：`ahead_by=0`。它们的提交历史在 `main` 中可达；正式执行时仍重新核对 HEAD 和祖先关系。

| 分支 | 核对 SHA |
| --- | --- |
| `codex/p1-device-contact-favorites-2026-10-19` | `8bbbe7db4f5fbdda10eb0dec90de1f73961f1d5f` |
| `codex/p1-favorites-contact-api-2026-10-19` | `72a91c6a727660067bdc4e737fd2e54230020816` |
| `codex/p1-isolated-api-2026-10-14` | `eda525c1a2276af90668849b669e9bce19a4fd7d` |
| `codex/p1-isolated-api-2026-10-16` | `e5908185b3b460a04a8102b7e2a30b663623ac30` |
| `codex/p1-isolated-api-2026-10-17` | `1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7` |
| `codex/p1-news-content-isolated-2026-10-18` | `858aa6a5bebbdb88346c6282f691b4976886b935` |
| `codex/release-a-2026-10-12` | `8cc4bb85ffdf3e86e7a13a89d119f1b110491e48` |
| `p1/release-a-2026-10-12` | `2b1c165d0428e2d22cbed7620fd3cc936e568a1b` |

在 Windows PowerShell **进入该仓库的 Git 克隆根目录**后，整块执行。检查失败即停，不会继续删除。先阅读输出的分支清单；脚本随后删除已核对的八个远端引用。

```powershell
$ErrorActionPreference = 'Stop'
if ((git rev-parse --is-inside-work-tree 2>$null) -ne 'true') { throw '请先进入九辰仓库的 Git 克隆根目录' }
$remote = (git remote get-url origin).Trim()
if ($remote -notmatch '^((https://github\.com/)|(git@github\.com:))orange-lee-tech/jiuchen-edu-platform(\.git)?$') {
    throw "origin 不是预期仓库：$remote"
}
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'fetch 失败，停止' }
git merge-base --is-ancestor 13a1c25762bbe09cd7860af8c2822162c950639b refs/remotes/origin/main
if ($LASTEXITCODE -ne 0) { throw 'main 尚未包含本次整合提交，停止' }

$expected = [ordered]@{
    'codex/p1-device-contact-favorites-2026-10-19' = '8bbbe7db4f5fbdda10eb0dec90de1f73961f1d5f'
    'codex/p1-favorites-contact-api-2026-10-19' = '72a91c6a727660067bdc4e737fd2e54230020816'
    'codex/p1-isolated-api-2026-10-14' = 'eda525c1a2276af90668849b669e9bce19a4fd7d'
    'codex/p1-isolated-api-2026-10-16' = 'e5908185b3b460a04a8102b7e2a30b663623ac30'
    'codex/p1-isolated-api-2026-10-17' = '1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7'
    'codex/p1-news-content-isolated-2026-10-18' = '858aa6a5bebbdb88346c6282f691b4976886b935'
    'codex/release-a-2026-10-12' = '8cc4bb85ffdf3e86e7a13a89d119f1b110491e48'
    'p1/release-a-2026-10-12' = '2b1c165d0428e2d22cbed7620fd3cc936e568a1b'
}
foreach ($branch in $expected.Keys) {
    $actual = (git rev-parse "refs/remotes/origin/$branch" 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $actual -ne $expected[$branch]) { throw "分支头变化或缺失：$branch；停止" }
    git merge-base --is-ancestor $actual refs/remotes/origin/main
    if ($LASTEXITCODE -ne 0) { throw "不是 main 祖先：$branch；停止" }
    Write-Host "VERIFIED $branch $actual"
}
foreach ($branch in $expected.Keys) {
    git push origin --delete $branch
    if ($LASTEXITCODE -ne 0) { throw "删除失败：$branch；停止" }
    Write-Host "DELETED_REMOTE $branch"
}
```

## 第二组：`p1/foundation`

该分支为旧集成入口。仓库 `AGENTS.md` 已改为 `main` 是唯一整合源码权威；先完成第一组，再确认两个远端头完全相同，才删除此分支。若相异，停止，不做强推或强删。

```powershell
git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw 'fetch 失败，停止' }
$main = (git rev-parse refs/remotes/origin/main).Trim()
$foundation = (git rev-parse refs/remotes/origin/p1/foundation).Trim()
if ($main -ne $foundation) { throw "main=$main；foundation=$foundation；不相同，停止" }
git push origin --delete p1/foundation
if ($LASTEXITCODE -ne 0) { throw '删除 p1/foundation 失败，停止' }
'FOUNDATION_REMOTE_DELETED'
```

## 保留：还有独有提交的九个分支

以下分支相对 `main` 为 diverged，`ahead_by>0`；本轮不列入剪除脚本，避免丢失未审查的独有历史。P2 旧五 Tab PR #2 虽已关闭，其两个 P2 分支仍有独有提交。

| 分支 | 独有提交数 |
| --- | ---: |
| `hotfix/read-only-schedule-2026-10-10` | 4 |
| `p1/assessment-background-client-gate-20261006` | 3 |
| `p1/rc-api-ea8c-readonly-date-2026-10-10` | 12 |
| `p1/release-api-core-closeout-20261007` | 3 |
| `p1/release-identity-bootstrap-20261008` | 7 |
| `p1/release-identity-bootstrap-v2-20261008` | 7 |
| `p1/release-readonly-schedule-2026-10-10` | 4 |
| `p2/prototype-shell` | 22 |
| `p2/v1-shell` | 2 |

分支引用的删除主要清理工程视图；GitHub 的存储回收并不等同于删除一个引用。用户 Windows 的旧体验目录另行按固定 SHA 与未提交文件检查后清理。
