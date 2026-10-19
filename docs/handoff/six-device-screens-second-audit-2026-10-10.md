# 六张真机截图二次核对 — 2026-10-10

范围：Fudan 校园影像/各校地图、南开院校咨询、学生首页、课表日期、身份只读镜像、我的规划目录。与 2026-10-10 下午用户再次发出的 **6 张截图**逐一对应。严格区分 SOURCE / CI / DEVICE / ECS 四个门槛。

| 截图 | 实现及复核证据 | 源码状态 | 真机/生产关闭条件 |
|---|---|---|---|
| 1 复旦校景、地图校区 | heroPhoto 来自 Wikimedia Commons `201704_Gate_of_Fudan_University_Jiangwan_Campus.jpg` (MNXANL/CC BY-SA 4.0)，用图片覆盖页头，加载失败退回院校身份图形而非假照片；地图邯郸、枫林、江湾、张江四校区，默认传统主校区邯郸。复旦官方 2025 校区导航及 2026 校园地图：`https://www.fudan.edu.cn/453/list.htm`、`https://jijian.fudan.edu.cn/43607/list.htm`。张江校区高德 https://www.amap.com/place/B00154DQPM。支持选择校区、实时切换 map marker、打开微信地图。 | SOURCE & CI PASS | 体验版测试实景加载、定位与点击切换、地图原生组件。图片 CDN 实际可用性尚未通过真机。 |
| 2 南开咨询重复操作 | 移除院校咨询两选项 action sheet 及单独的确认函数。通过共用客服助手 `/auth/me` 服务器重新核验角色/内部编号，再带目标学校、已知年级/专业；一层确认、复制、打开微信客服，用户主动粘贴发送。游客只能标记“未登录游客”。南开地图按其 2026 招生章程调整为八里台、津南、滨海，默认八里台，不把旧紫金山路校区冒充当前正式校区。来源：https://zsb.nankai.edu.cn/2026-05-27/1813.html | SOURCE & CI PASS | 微信客服端收到用户主动发送的内容后，核对老师、学员、管理员三个登录身份及未登录游客的展示。 |
| 3 首页视觉太素 | 四色功能卡（绿、黄、蓝、青），明显放大四张卡片功能图标、字号、视觉对比；保留“进入我的规划”主 CTA，支持完成资料。清理空白不虚构课程或评价。 | SOURCE & CI PASS | 微信开发工具+安卓真机复查图标实际渲染、不同宽高、卡片挤压、滚动。 |
| 4 第一周日期 HTTP 400 | 前端不再把整份课表在日期修改时 fallback 到旧整表 PUT，防止 `invalid_schedule_edit_payload`。独立热修复候选日期-only PUT 路由仅 `JSON_SET(...termStartDate)`，校验星期一、登录用户及 import id，读回一致才提示保存。 | SOURCE & CI PASS | ECS 受控部署独立补丁后，由学员账号选择第一周星期一→成功→重新进入回读→13 门已录课程保持原样；未上线之前仍未修好！ |
| 5 跨身份 UI 镜像被旧 API 阻断 | GET-only 已有角色权限校验（admin 可读老师/学生，teacher 仅已绑定学生，不能编辑审批评估扣费）；后端最小补丁建立于此前生产基线。前端是独立**只读数据镜像**（学业、计划、课表、成长、评估历史），尚**不是所有原始 Tab 页完全复刻**，不得冒充完成真实“完整 UI 切换”。 | 部分 SOURCE & CI PASS | ECS 先核对当前真实 commit 再受控发布。真机 admin/teacher allow、unassigned forbidden、账号切换不串号，且用户检查这种只读镜像是否达到完整 UI 预期。 |
| 6 学期菜单横向拥挤 | 学期列表改为左侧 138rpx 纵向独立 scroll-view，右侧计划完整内容；本周课表同菜单入口，永不横向裁切末尾大四学期。 | SOURCE & CI PASS | 真机检验小屏、列表上下滚动、大四末尾可达、主内容阅读宽度。 |

## 全量大学地图盘点
`packages/schools/campus-points.ts` 有 **172/172** 条院校 key，全部有至少一个参考坐标，复旦4校区/南开3校区；测试在 `tools/testing/school-catalog.test.cjs` 校验学校 key、坐标及命名，`miniprogram-navigation.test.cjs` 模拟切换标记与微信导航。坐标分类为 verified/third-party/approximate。来源陈旧的 POI 不等于官网校区认证；需逐条提升证据。

## 校园照片盘点
当前明确提供了 Wikimedia Commons 可追溯真实实景的学校：**北京大学、复旦大学、南开大学、南京大学、吉林大学**，附作者、CC BY-SA 4.0、文件来源；其他院校没有可授权实景图时显示信息化图形背景，**不是 172 校实景照片均已覆盖**。外部图片源 `thumb.wikimedia.org` 需微信体验版检查加载/域名；若国内网络不稳定，先由运营在获授权前提下转存至现有 CloudBase Storage，再更新数据。不能把“网页能打开”当作“微信小程序已验证”。

## 生产安全 Gate
只读+日期最小 API 补丁候选分支：
`p1/release-readonly-schedule-2026-10-10`，提交 `2919aeb62b430d19569e726d2109aa7c3aa40021`，CI: https://github.com/orange-lee-tech/jiuchen-edu-platform/actions/runs/38034752604 (PASS)。

**尚未 ECS 发布／尚未真实设备 PASS，不允许用源代码 CI SUCCESS 宣告六张截图全部关闭**。
候选从此前生产记录 `b751287ce64b18c869aed59434654464b13e21ff` 开出，不保证与服务器实时 active 一致。
禁止将带有支付和 AI 改动的完整 `p1/foundation` 直接 promote。禁止修改 NPM/官网/Portainer/Harbor/端口。

只读 ECS 检查建议：
```bash
readlink -f /opt/jiuchen-api/current
curl -fsS --max-time 5 https://api.jiuchenedu.com/health/live
curl -fsS --max-time 7 https://api.jiuchenedu.com/health
```

本地 Windows PowerShell（需先确认没有未提交修改）：
```powershell
Set-Location (Join-Path $HOME 'Desktop\jiuchen-edu-platform')
git status --short
git fetch origin --prune
git switch p1/foundation
git pull --ff-only origin p1/foundation
git rev-parse HEAD
```
