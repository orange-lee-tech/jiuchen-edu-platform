# Windows PowerShell → WSL 路径桥接故障复盘｜2026-11-20

**状态：故障已定位到跨系统路径参数边界；修复及复测尚未完成。**  
**影响级别：本机演练启动失败；未进入数据库恢复或生产操作阶段。**

## 1. 现场证据

- 仓库：`orange-lee-tech/jiuchen-edu-platform`
- 演练候选分支：`codex/ux-consolidation-20261116`
- 演练候选 HEAD：`d93ba079b75f6b48697497668035acf5f223c597`
- 迁移源文件 SHA-256 校验：PASS
- Windows Node：`v24.18.0`
- WSL 发行版参数：`Ubuntu-24.04`
- 失败位置：PowerShell 脚本第 146 行，Windows 临时文件路径传入 `wsl.exe → wslpath -u`

现场输出：

```text
wslpath: C:UsersyuliaAppDataLocalTempjiuchen-pw-b172c33d44.py
You cannot call a method on a null-valued expression.
```

原始 Windows 路径使用反斜杠；`wslpath` 实际收到的参数已丢失路径分隔符。随后脚本对失败命令的空返回值调用 `.Trim()`，产生第二个异常。

**根因边界：** 已证实 Windows → WSL 原生参数传递后的路径参数格式错误；当前证据尚未区分具体由 PowerShell 原生参数序列化还是 WSL interop 层造成，不把推测写成定论。

## 2. 本次执行到达位置

| 阶段 | 结果 | 证据 |
|---|---|---|
| 仓库路径检查 | PASS | 脚本继续执行 |
| 分支与 HEAD 固定检查 | PASS | 输出候选 SHA 与分支 |
| 迁移文件 SHA-256 | PASS | 输出 `MIGRATION_SOURCE_SHA256=PASS` |
| Windows Node 版本读取 | PASS | 输出 `v24.18.0` |
| Windows 临时 Python 文件写入 | PASS | 已进入 WSL 路径转换步骤 |
| Windows → WSL 路径转换 | FAIL | `wslpath` 收到缺少分隔符的路径 |
| Python 演练入口 | NOT REACHED | 未执行 Python 演练程序 |
| 备份回执、PIN、密文 SHA 校验 | NOT REACHED | Python 入口未启动 |
| 备份解密与 SQL 导入 | NOT REACHED | 未执行 |
| 临时 MySQL 容器/网络创建 | NOT REACHED | Python 入口未执行；PowerShell finally 中仅尝试按本次随机名称清理 |
| 迁移两次执行 | NOT REACHED | 未执行 |
| API typecheck / tests / build | NOT REACHED | 未执行 |
| 生产数据库、ECS、腾讯云控制台 | NOT TOUCHED | 本次失败发生在演练启动前 |

因此，本次应登记为**跨平台脚本启动故障**，不得记为备份损坏、数据库恢复失败、迁移失败或 ECS 故障。

## 3. 纠偏规则

1. **避免传递原始 Windows 反斜杠路径。** 优先在 WSL Linux 文件系统内创建临时脚本并使用 WSL 原生路径。必须从 Windows 临时目录传入时，先将路径规范化为正斜杠形式，再调用 `wslpath -u`。
2. **检查命令结果后再处理字符串。** 捕获 `wsl.exe` 的标准输出/错误输出；立即读取并检查 `$LASTEXITCODE`；确认输出非空后才执行 `.Trim()`。任何路径转换失败必须在数据库和 Docker 操作前终止。
3. **增加路径往返验收。** 在运行 Python 前，要求 WSL 对转换后的路径执行 `test -f`，并对 Windows 与 WSL 两侧文件计算 SHA-256，确保两侧指向同一文件。
4. **先跑启动预检，再进入恢复。** 预检至少覆盖 WSL 发行版可用性、Python 解释器、维护工具导入、临时文件可读、MySQL 8 镜像存在。全部 PASS 后才允许提示备份密码和解密。
5. **记录真实运行时版本。** 每次回执记录 `$PSVersionTable.PSVersion`、`wsl --version`、发行版状态、Python 版本及 Docker 版本。此次 PowerShell 精确版本未采集，后续不得猜测。
6. **跨平台路径必须做回归样例。** 至少覆盖 Windows 用户目录、含空格目录、含中文目录、临时目录和不同盘符；检查原始路径、规范化路径、WSL 路径、存在性和 SHA-256。
7. **保留失败阶段和副作用边界。** 每个阶段使用独立状态标记；失败时只清理本次随机命名资源，不扩大清理范围；不得将脚本静态检查或本地启动检查写成真实数据库演练通过。

## 4. 后续修复验收清单

- [ ] 修正 Windows → WSL 临时脚本路径桥接。
- [ ] 为 WSL 命令增加统一的退出码与空输出检查。
- [ ] 在数据库解密前完成文件路径存在性及 SHA-256 双侧核对。
- [ ] 使用现场实际 PowerShell 版本完成路径回归。
- [ ] 验证 WSL Python 能导入维护工具；此步骤不解密备份。
- [ ] 重新运行固定备份的隔离恢复和精确候选迁移演练。
- [ ] 单独记录迁移、API tests/build、ECS staging、生产 DDL、ECS 切流各阶段结果。

在上述修复验收完成前，真实备份恢复、迁移兼容性与 API 全量门禁均保持 **PENDING**。不得因本次路径故障重复下载备份、重建数据库、修改生产 SQL 或登录腾讯云控制台。

## 5. 工程教训

这是继 Batch 9 PowerShell/SSH/Bash 传输事故之后又一次跨平台边界缺陷。此前事故已要求验证 PowerShell、Bash、编码、BOM、stdout/stderr、退出码和权限；本次进一步明确：**Windows 路径到 WSL 路径的参数传递本身也是独立验收边界。**

今后交付跨平台执行脚本时，必须先验证路径桥接和最小命令往返，再运行任何数据库、部署或生产步骤。不能把“命令写得正确”当作“跨平台调用已验证”。
