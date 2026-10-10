# 2026-10-10 READ-ONLY + DATE-ONLY 最小生产候选 Gate

**状态：候选源代码，未 ECS 部署，尚未拿到本人真机 PASS。**

- 起点：此前确认的生产 commit `b751287ce64b18c869aed59434654464b13e21ff`，但本次尚未读取 ECS 真实 current 链接，必须先核对。
- 当前 GitHub 候选：`p1/release-readonly-schedule-2026-10-10`。
- 仅修改 API：`routes/classroom-workspace.ts`（仅独立日期路由与导出已有只读加载函数）；`routes/read-only-workspace.ts`；`routes/students.ts`（修复旧任意 ID GET 越权访问）；`routes/app.ts` 的 read-only 路由注册（实际文件 `services/api/src/app.ts`）；`domain/read-only-access.ts` 与对应单测。
- 未加入新 DB 字段/表；此 hotfix 故意不读 `user_profiles.enrollment_year`，因为此前生产基线尚无该列。小程序上该值可能显示“未填写”。
- GET-only 授权：老师只看 active 教师主体真实关联学生，管理员看老师及学生，普通用户/学员不能越权；不改变 token。日期保存只 PUT termStartDate 一项，通过登录用户+importId 归属校验，JSON_SET 只修改时间字段，强制日期是真实星期一并进行 readback，禁止整份解析课表回填。
- 权限安全负例必须在 staging 执行，CI/静态测试只是前置门槛。

## 禁止直接 promote 当前集成 HEAD

`p1/foundation` 含收费、学籍/AI 以及其他未单独放行的内容。候选必须使用此独立分支的 SHA，仅当真正 ECS 当前版本等于此前记录的 b751 时才走它的最小发布流程；如果不相等，先暂停并重切候选，严禁盲目覆盖。

## 受控检查（安全只读，可由用户 SSH 执行）

```bash
printf 'CURRENT='; readlink -f /opt/jiuchen-api/current
printf 'APPROVED='; sudo -n cat /etc/jiuchen-api/approved-release 2>/dev/null || true
curl --silent --show-error --max-time 5 https://api.jiuchenedu.com/health/live
curl --silent --show-error --max-time 7 https://api.jiuchenedu.com/health
```

不要在聊天或截图粘贴环境变量值、数据库密码或 SSH 私钥。

## 必须单独完成的部署和验收

1. GitHub Actions CI 确认候选分支 TypeScript、API 单测、build 均 PASS。
2. ECS 确认真实 active release 与候选基线契合、生产数据库相关表和列只读 readiness。
3. 在隔离 staging 检查 API 角色权限负例、日期非法请求拒绝、只读学生/老师 GET，以及切换时间后课表课程数与内容均不变。
4. 由有权限的操作人独立创建 root-owned immutable release、先放行权限测试再 root-approved `jiuchen-promote`；健康检查通过并保留 rollback SHA。不能让 AI 自行动生产系统。
5. 微信真机：admin 查看任意师生、teacher 只看自己师生、无关系 403、撤销关系后 403；选真正周一后第一周保存成功且重新加载可回读，学生课表课程不变。
6. 图片还使用 Wikimedia 缩略图外部 HTTPS，合法域名/国内加载未真机通过；不属于本后端候选范围。

**本候选未触碰 NPM、80/443、Harbor、Portainer、官网、付费或 AI 配置。**
