# 内置产品目录（Bundled Product Catalog）

> 更新时间：2026-09-22  
> 目的：让已经审计过的九辰产品手册在 Product Knowledge 数据库尚未升级/导入前即可进入小程序，同时保持后续后台治理能力。

## 1. 当前内置产品与品牌内容

### 九辰保研·大三冲顶计划
- document_id: `jiuchen-dasan-chongding-product-manual-2026-sample-v1`
- 来源：已审计黄金转换样例
- 小程序用途：服务方案列表与详情
- 本地视觉资产：`/assets/products/chongding/cover-mountain-main-visual.webp`

### 九辰保研导航卡
- document_id: `jiuchen-baoyan-navigation-card-product-manual-2026-v1`
- 来源：导航卡多模态结构化转换包
- 小程序用途：服务方案列表与详情
- 本地视觉资产：`/assets/products/navigation-card/cover-main-visual.webp`

导航卡保留：
- 九项服务结构；
- 时间线；
- 规划模块；
- 4 项专项能力培训；
- 44 项课程资源；
- 实习规划参考；
- 课程资源教师；
- 手册中的规划示例。

### 清北华五计划
- document_id: `jiuchen-qingbei-huawu-plan-2026-v1`
- 来源：清北华五计划多模态结构化转换包
- 小程序用途：服务方案列表与详情
- 源页数：12
- 产品价格原文：`239800元`
- 服务周期原文：`至获取保研offer`
- 专项课程口径：`200+N小时专项课程`

清北华五计划保留：
- 3 条适用人群；
- 4 项核心亮点；
- 18 段长期路径/项目跟进时间线；
- 12 个模块；
- 3 组服务体系及其嵌套 items / stages / workflow；
- 7 条师资来源记录；
- 4 条未核验营销声明（公开隐藏）。

### 九辰保研品牌手册（独立品牌内容层）
- document_id: `jiuchen-baoyan-brand-manual-2026-v1`
- document_type: `brand_manual`
- 来源：24 页品牌手册多模态结构化转换包
- 小程序用途：`关于九辰` 页面
- API：`GET /brand`

品牌手册不进入产品卡目录，也不伪装成产品。公开层使用品牌定位、服务范围、适用人群、服务亮点、本科成长路径、九类服务体系及师资记录数量。

默认不公开：
- 7 条未核验营销数字/声明；
- 3 条未核验办学成果声明；
- 联系方式与二维码；
- 64 条未核验个人师资履历明细；
- `case-evidence.json` 中的学生案例/OFFER证据。

## 2. 内置 ≠ 绕过治理

产品型转换包进入代码前统一规范化为 `handbook-v1`；品牌手册维持独立 `brand_manual` 类型，并生成受控 public view。

规范化只处理结构契约：
- 统一 document_type；
- 统一 conversion_version；
- 补 price/service_period 的 display 字段；
- 补营销声明的 display_allowed；
- 兼容 teacher education 字段；
- 增加本地 cover_asset。

不得在规范化过程中：
- 改写原业务事实；
- 猜测 `[待核对]` 内容；
- 把规划示例改成真实案例；
- 把课程资源教师改称九辰签约导师；
- 把未核验宣传数字改成事实。

## 3. 数据库接管规则

公开接口采用：

```text
bundled baseline
      +
product_knowledge_documents override
      ↓
GET /products
GET /products/:documentKey
```

同一 document_id：

- DB 无记录：显示内置版本；
- DB = active 且通过 handbook-v1：DB 版本覆盖内置版本；
- DB = draft / archived：隐藏该产品，包括内置版本；
- DB = active 但内容失效：拒绝公开，不回退旧内置版本。

因此内置产品只是首发基线，不会造成以后后台无法更新或下架。

## 4. 公开安全边界

- 未核验 marketing_claims 不进入公开返回；
- contact 默认隐藏；
- 产品知识始终 `assessmentEvidenceAllowed=false`；
- 产品手册不能作为 AI 录取判断证据；
- 手册中的 Offer、比例、师资履历按来源时点展示，并保留核验状态；
- 导航卡示例规划明确不是 real case dataset；
- `[待核对]` 原样保留且不生成可点击链接。

## 5. 视觉资产策略

转换包中的完整页面 WebP、source-map 和其它视觉证据继续留在原始转换包/受控资料库中。

Git 与小程序包只复制真正需要运行时使用的轻量资产。目前只把真正需要运行时使用的轻量视觉资产放入小程序包，不把完整 PDF 页面证据批量塞入主包。没有运行时封面的产品使用文本占位卡，不制造不存在的图片路径。

## 6. 小程序入口

首页原“精选课程”区域改为 **九辰服务方案**。

用户路径：

```text
首页
 -> 九辰服务方案
 -> 产品列表
 -> 产品详情
 -> 微信官方客服能力（open-type=contact）
```

产品详情由结构化数据渲染，而不是整页宣传册截图，因此可以适配手机屏幕、后台更新和后续多产品扩展。


## 7. 本次应用来源快照（2026-09-22）

首批小程序内置目录以用户提供的两个结构化转换包为来源：

| 产品 | document_id | ZIP SHA-256 | 原始页数 |
| --- | --- | --- | ---: |
| 九辰保研·大三冲顶计划 | `jiuchen-dasan-chongding-product-manual-2026-sample-v1` | `8fe014f38459e632d997d24118663f676dacc600178380ea13cbf0117c0c2339` | 10 |
| 九辰保研导航卡 | `jiuchen-baoyan-navigation-card-product-manual-2026-v1` | `9ddd8dade286b2ec6819a118d09cee10c2ece5c4445587be54fe3bbf44591542` | 14 |

运行时不会把整个 ZIP/PDF/Page WebP 塞入小程序主包。结构化内容进入 bundled catalog；真正需要展示的轻量封面从转换包资产中进入小程序 assets，其余整页视觉证据继续留在转换包用于审计。

### 当前内容完整性回归

大三冲顶计划：
- audience 4；
- highlights 8；
- timeline 6；
- modules 5；
- core_services 6；
- teachers 5；
- marketing_claims 3。

导航卡：
- highlights 6；
- timeline 9；
- modules 9；
- core_services 9；
- teachers 41；
- marketing_claims 4；
- training_items 4；
- course_resources 44；
- internship_plans 保留；
- example_plans 保留。

导航卡中的规划示例仍保持 `example_only=true` / `real_case_dataset=false`，不能进入真实案例训练/检索数据集。


## 8. 第二批应用来源快照（2026-09-22）

| 内容 | 类型 | ZIP SHA-256 | 原始页数 |
| --- | --- | --- | ---: |
| 九辰保研品牌手册 | brand_manual | `4d3065f646dd61a8ecdb73b9f48e19f6082f6082fcf558572a72c86e0aceed7d` | 24 |
| 清北华五计划 | product_handbook | `0530113ede906b5e072eaa8d2f38d6c6803ef3921c10064f38d0a8a939915963` | 12 |

品牌手册附带的 `case-evidence.json` 本轮**不导入 AI Retriever、不进入“真实案例”展示**。后续只有在完成来源、匿名化、真实性与使用授权复核后，才允许进入案例数据治理流程。


## 9. 第三批及最终内容批次（2026-09-22）

| 内容 | 类型 | ZIP SHA-256 | 原始页数 |
| --- | --- | --- | ---: |
| 国内外科研项目/论文辅导 | product_handbook | `40a9e3f122a8f1e31df862fd7a70a42734d32f70dc49a93be94f4fe85eef7e1d` | 18 |
| 稳录计划 | product_handbook | `88f7dfa1d52d2a303826950834e98036cb60fb64f891cac3fd6d0ec010fe9aed` | 12 |
| 跃升计划 | product_handbook | `1524454c56e2d20f75a861fb398cf6b72c6f93537e41d69790e9fe0b6550472e` | 12 |

### 国内外科研项目 / 论文辅导

运行时保留：
- 4 类受众；
- 10 个亮点；
- 6 段时间线；
- 15 个模块；
- 5 组核心服务；
- 36 条师资来源记录；
- 科研项目班型/套餐；
- 论文发表服务价格表；
- 原图中存在歧义的“68个月”等文本原样标记 `[待核对]`，不擅自纠正；
- 未核验营销声明默认不公开。

### 稳录计划

- 原价口径：`39800元`；
- 服务周期：`至获取保研offer`；
- 专项课程口径：`80+N小时专项课程`；
- 18 段长期路径、12 模块、3 组服务体系完整保留。

### 跃升计划

- 原价口径：`79800元`；
- 服务周期：`至获取保研offer`；
- 专项课程口径：`180+N小时专项课程`；
- 18 段长期路径、12 模块、3 组服务体系完整保留。

至此，运行时内容基线为 **6 个产品服务方案 + 1 个独立品牌内容层**。

## 10. 七份转换包仓库留档

统一来源索引：

`docs/data/source-packages/README.md`

品牌手册未核验案例原义留档：

`docs/data/source-packages/brand-case-evidence.unverified.json`

仓库不重复保存整页 PDF/WebP 大文件，避免 Git 历史永久膨胀；原 ZIP 的文件名、字节数、SHA-256、document_id、页数与运行快照路径均已固定，结构化正文进入版本控制。原包可通过 SHA-256 与本批次逐字节核验。
