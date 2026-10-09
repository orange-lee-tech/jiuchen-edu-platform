# Phase 1a-R UI Closeout

起始 HEAD：`f49c26608a236705aa0e6bbfa52d82b41ee3182d`。人类 1a-R 指令批准移动管理员列表重构，替代旧文件“留待 Phase 4”的局部排除；不改身份合同、后端、数据库、AI、支付或 ECS。

## 写界面前的注意力与操作契约

| 使用者/页面 | 首屏焦点 → 操作 → 成功/失败恢复 |
| --- | --- |
| 管理员/工作台 | 身份与高频编号查找入口，不造待办数字 → 去用户槽；业务入口只给清楚的槽位快捷导航，不重复三张管理卡 |
| 管理员/用户 | 用户及内部编号 → 搜索/筛选编号，复制完整编号，按状态暂停/恢复；更多菜单隔离撤销/删除 → 现有 API 确认后刷新；失败保持筛选并重试 |
| 管理员/业务 | 服务关系为主、资讯运营为次 → 既有分配/标签页；不造组、统计或权限 |
| 管理员/我的 | 本人资料、官网与会话 → 编辑/退出；不再放三个管理入口；注销保留两次确认 |
| 学员/规划 | 时间轴完整阶段标签与当前内容 → 本周课表在右侧切换，不改 Tab；导入/编辑独立页面 → 区分未导入、日期未设、本周无课、读失败；重试不丢选中项 |
| 普通用户/首页 | 品牌与建档主动作 → 评估、规划、文章；认识九辰含官网复制入口，诚实说明网页开放 Gate |
| 普通用户/机会与文章 | 分类/来源→标题→日期作者→摘要→正文；不重复封面占位 → 失败重试/原文降级；保留正常图片、安全过滤 |
| teacher/staff/四槽 | 保留已批准角色与现有获授权学员入口，不提权；图标按学员/辅导语义；我的以本人账号为主 |
| guest/user/student/我的 | 本人资产与历史 → 真实既有页面；统一图标与蓝黄节奏，失效可重新登录、不重跑评估 |

蓝色表达结构与主动作，深蓝头部聚焦角色/标题，浅黄说明需确认事项。列表采用纵向编号行、独立操作行；不靠缩小编号字体解决空间问题。时间轴允许明确两行（大一/寒假），禁止逐字碎裂。实际手机布局、五秒识别、字体/键盘需平台验收，源码评审不作真机 PASS。

## 证据与 Gate

开发者工具/真机/截图：NOT RUN。2026-10-09 再试 computer-use，Node 内核退出，未生成假截图。
官网：HTTPS 公开页可读取，V1 文档记录企业主体；主体当前能力和业务域名后台配置尚未核验。OPERATOR ACTION REQUIRED：微信公众平台小程序 → 开发管理 → 开发设置 → 业务域名，确认 `jiuchenedu.com` 及实际跳转域名，完成校验文件与真机测试。官方文档尝试读取失败，参考位置：[web-view](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html)。本轮只提供明确的复制官网地址降级，不宣称已可直接打开或发布。

独立业务待办：Group Foundation（组长老师/多学员，多组规则未决，兼容旧授权）、News Group Visibility（真实组主键、多组选择、服务端授权）、Assessment→客服（本人历史、受控内容、用户同意与官方卡片能力验证）。均未建表、未改权限或模拟分享成功。

## 批次与逐页整改对照

Batch 1 代码完成：管理员去重、编号结构/搜索/筛选/菜单；本周课表同页状态与共享筛选；原生阅读安全节点。Batch 2 代码完成：原生角色图标、功能图标、深浅蓝与暖黄层级、官网明确复制降级。Batch 3 本地检查通过；CI 提交后查询；平台与真人视觉验收 NOT RUN。

| 页面/组件 | 原缺陷 → 本轮整改 | 实际验收 |
| --- | --- | --- |
| role-shell/index（管理员） | 重复三张管理卡 → 工作台只有高频编号查找；深蓝聚焦标题，暖黄主动作，图标表示任务 | 入口/去重回归 PASS；无聚合 API 不造待办；手机 NOT RUN |
| classroom（管理员） | 用户入口只有泛化说明 → 用户与编号明确职责，仍进入现有权威管理页 | 四槽逻辑 PASS；本轮未将管理 API 改为一级聚合 API |
| news（管理员/老师） | 业务/辅导易被学生文章淹没 → 真实主任务优先，文章作为独立参考；蓝黄分类头层级 | 原入口回归 PASS；读/写业务真机 NOT RUN |
| profile | 管理操作三入口重复 → 本人身份、支持、官网和退出/注销；资料资产配语义图标，身份深蓝区与列表分层 | admin 去重 PASS；真机注销/长名称 NOT RUN |
| admin | 编号夹在横向大按钮之间、英文状态、长期生成表单 → 全宽单行编号+复制，中文筛选与搜索，独立操作行/原生菜单，生成/绑定按需开并可取消；账号选择用显示名+短编号区分 | 状态/过滤/取消/写失败/防重复回归 PASS；暂停/恢复/撤销真实 API 真机 NOT RUN |
| classroom（学员） | 本周多余跳转/侧栏碎裂 → 右侧同页课程；日期、空周、未导入、错误区分；年份与寒暑假明确两行，合并样式而非叠加覆盖 | 无导航、周界/单双周/星期节次排序回归 PASS；窄屏/字体/课表返回与规划审核真机 NOT RUN |
| schedule-import | 周次算法在本页私有 → 共享纯函数；原导入编辑保存流程不变 | 共享筛选回归/TS PASS；真实导入写操作 NOT RUN |
| news-detail | 固定尺寸与重复封面、隐藏段 → allowlist 原生 nodes，合并重复 style 检查、移除固定布局/空占位，正文不再前置重复封面；无正文封面加载失败会隐藏 | 合成异常图文、安全回归 PASS；公开文章只读确认根因；真实 rich-text 渲染 NOT RUN |
| index（普通用户） | 寡淡的同色入口 → 深蓝建档焦点、暖黄主动作、浅蓝图标与真实任务行；官网按降级动作命名 | 原页面 handler/导航 PASS；五秒识别及真人感受 NOT RUN |
| app.json/navigation | 无图标 → 8 个导航形状 normal/active，另 5 个功能形状 active；只改原生文本/icon，不改 pagePath | PNG 大小/路径与角色回归 PASS；微信原生显示 NOT RUN |

阅读根因证据：2026-10-09 只读公共 `/news` 与首条公共 `/news/32b59c67-e543-4f59-9fde-788496155018`，正文 4515 字符、1 张图片；图片含 `style="width:530px;height:707px"` 及第二个自适应 style；存在 `display:none` 段，且客户端额外放封面。不是用负 margin 修补；未保存完整文章作 fixture，测试仅用原创合成最小结构。实际截图对应文章未提供，不能断言所有空白都来自这一条。

状态来源：disabled 且仍绑定为已暂停；disabled 无绑定但 claimedAt 存在为已撤销；未曾认领的 disabled 为已暂停。只做状态解释，不模拟生命周期。后台异常/历史记录缺失仍以服务端响应和最终操作校验为准。

验证：`npm.cmd --prefix apps/miniprogram run typecheck` PASS；`node --test tools/testing/miniprogram-navigation.test.cjs` 23 PASS / 0 FAIL，原 16 项保留，新增 7 项；`git diff --check` PASS。测试 wx double / 合成账号不等于真实账号及布局验收。

图标：21 个原创轻量 PNG，源码生成器随仓库交付，未引入第三方 UI/字体。色彩配对：白色/深蓝标题、深蓝/浅黄 CTA、蓝色/浅蓝链接；对比度数值不替代真机低亮度、灰度与字体检查。

回滚：整体 revert 本轮 UI 代码提交（包含 app.json/icon 资源、navigation、同页课表与共享筛选、阅读适配及管理员 UI），不可只移除 PNG 或孤立回退课表函数；后续 CI 文档提交可单独 revert。没有迁移，无数据库回滚或数据删除。原有本地配置和所有私有/部署未跟踪文件保留。

## 实际文件清单（52 个）

```text
apps/miniprogram/miniprogram/app.json
apps/miniprogram/miniprogram/assets/icons/README.md
apps/miniprogram/miniprogram/assets/icons/assessment-active.png
apps/miniprogram/miniprogram/assets/icons/assignments-active.png
apps/miniprogram/miniprogram/assets/icons/business-active.png
apps/miniprogram/miniprogram/assets/icons/business-normal.png
apps/miniprogram/miniprogram/assets/icons/calendar-active.png
apps/miniprogram/miniprogram/assets/icons/calendar-normal.png
apps/miniprogram/miniprogram/assets/icons/coaching-active.png
apps/miniprogram/miniprogram/assets/icons/coaching-normal.png
apps/miniprogram/miniprogram/assets/icons/growth-active.png
apps/miniprogram/miniprogram/assets/icons/home-active.png
apps/miniprogram/miniprogram/assets/icons/home-normal.png
apps/miniprogram/miniprogram/assets/icons/mine-active.png
apps/miniprogram/miniprogram/assets/icons/mine-normal.png
apps/miniprogram/miniprogram/assets/icons/opportunity-active.png
apps/miniprogram/miniprogram/assets/icons/opportunity-normal.png
apps/miniprogram/miniprogram/assets/icons/service-active.png
apps/miniprogram/miniprogram/assets/icons/users-active.png
apps/miniprogram/miniprogram/assets/icons/users-normal.png
apps/miniprogram/miniprogram/assets/icons/website-active.png
apps/miniprogram/miniprogram/assets/icons/workbench-active.png
apps/miniprogram/miniprogram/assets/icons/workbench-normal.png
apps/miniprogram/miniprogram/components/role-shell/role-shell.ts
apps/miniprogram/miniprogram/components/role-shell/role-shell.wxml
apps/miniprogram/miniprogram/components/role-shell/role-shell.wxss
apps/miniprogram/miniprogram/pages/admin/admin.ts
apps/miniprogram/miniprogram/pages/admin/admin.wxml
apps/miniprogram/miniprogram/pages/admin/admin.wxss
apps/miniprogram/miniprogram/pages/classroom/classroom.ts
apps/miniprogram/miniprogram/pages/classroom/classroom.wxml
apps/miniprogram/miniprogram/pages/classroom/classroom.wxss
apps/miniprogram/miniprogram/pages/index/index.ts
apps/miniprogram/miniprogram/pages/index/index.wxml
apps/miniprogram/miniprogram/pages/index/index.wxss
apps/miniprogram/miniprogram/pages/news-detail/news-detail.ts
apps/miniprogram/miniprogram/pages/news-detail/news-detail.wxml
apps/miniprogram/miniprogram/pages/news-detail/news-detail.wxss
apps/miniprogram/miniprogram/pages/news/news.wxss
apps/miniprogram/miniprogram/pages/profile/profile.ts
apps/miniprogram/miniprogram/pages/profile/profile.wxml
apps/miniprogram/miniprogram/pages/profile/profile.wxss
apps/miniprogram/miniprogram/pages/schedule-import/schedule-import.ts
apps/miniprogram/miniprogram/utils/admin-id-view.ts
apps/miniprogram/miniprogram/utils/article-reader.ts
apps/miniprogram/miniprogram/utils/navigation.ts
apps/miniprogram/miniprogram/utils/schedule-view.ts
apps/miniprogram/miniprogram/utils/website.ts
docs/handoff/CURRENT.md
docs/handoff/phase1a-r-closeout.md
tools/design/generate-miniprogram-icons.cjs
tools/testing/miniprogram-navigation.test.cjs
```
