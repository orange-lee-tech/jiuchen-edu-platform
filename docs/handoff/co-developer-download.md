# 共同开发者下载与微信开发者工具导入

> 本文的源码唯一来源为私有仓库 `orange-lee-tech/jiuchen-edu-platform` 的 `main` 分支。本仓库无需新增 GitHub Action、Release ZIP 产线或上传手工 ZIP；GitHub 原生归档链接会随 main 自动更新。

## 下载渠道

- **[一键下载 main 最新完整源码 ZIP](https://github.com/orange-lee-tech/jiuchen-edu-platform/archive/refs/heads/main.zip)**（需登录并具备本私有仓库读取权限）。
- 备用方法：打开 [仓库主页](https://github.com/orange-lee-tech/jiuchen-edu-platform)，确认左上角分支为 `main` → `Code` → `Download ZIP`。
- 需要可复现的固定版本时，在仓库提交记录中选择特定 SHA，再下载相应 SHA 的归档。普通协作以 main 为准；下载后可记录该次 main SHA。

## Windows 导入（不需要单独启动 ECS）

1. 解压 ZIP，目录示例：`C:\Users\<用户名>\Downloads\jiuchen-edu-platform-main\`。
2. 安装并登录**微信开发者工具**，选择「导入项目」。
3. **项目目录必须选择**：`C:\Users\<用户名>\Downloads\jiuchen-edu-platform-main\apps\miniprogram\`；该目录里有 `project.config.json`，其中 `miniprogramRoot` 指向 `miniprogram/`。
4. 项目配置中已有九辰小程序 AppID；使用该 AppID 调试需要由小程序管理员授予相应开发者/体验权限。无权限时不要复制正式密钥或随意更改生产 AppID；由项目负责人处理成员授权。
5. 进入后尝试编译、预览、编辑。依赖缺失时，在**项目目录 `apps/miniprogram`** 的 PowerShell 运行：

   ```powershell
   npm.cmd install --no-save --package-lock=false --no-audit --no-fund
   npm.cmd run typecheck
   ```

   如果使用了 npm 小程序组件，必要时在微信开发者工具菜单「工具 → 构建 npm」。安装生成的 `node_modules`、小程序编译产物和 `project.private.config.json` 是本地资产，均不得上传 Git。
6. 新电脑下载时只是一个独立源码快照。需要长期双向协作，建议用 Git clone/pull/push + PR 或经授权直接提交，不要反复上传 ZIP 覆盖其他人的新改动。

## 代码与服务范围

| ZIP 内包含 | ZIP 内不包含 |
| --- | --- |
| `apps/miniprogram` 微信小程序源码与 `project.config.json` | ECS 生产数据库、线上真实学员资料 |
| `services/api` 后端源代码及测试 | `/etc/jiuchen-api/production.env`、模型/微信支付密钥 |
| `apps/admin` 管理后台源码 | ECS 的真实 release、`current` 指针和系统服务 |
| `docs` / `ops` / `tools` 工程文档与工具源文件 | 微信开发者工具本机 `project.private.config.json` 与 `node_modules` |

小程序默认请求 `https://api.jiuchenedu.com`（见 `apps/miniprogram/miniprogram/config/runtime.ts`）。导入成功不代表本地拥有后端、数据库写权限或支付发布权限。前端编辑与本次 API-only 时区修复是不同工作流。

## 版本与发布边界

- 下载 `main` ZIP 不等于服务器已经运行这个 commit。API 生效以 ECS `current` 与业务 API 回执为准。
- 只修改后端 `services/api` 不需要重新上传小程序体验版；只修改小程序前端才需编译预览并按发布审批上传。
- 下载者开始施工前阅读 `docs/handoff/STATUS-2026-11-01-release-and-github.md`、`AGENTS.md`、`CONSTITUTION.md`。旧工作分支已归档为 tag，仅 `main` 用于日常协作。
