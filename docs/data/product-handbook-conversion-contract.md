# 产品手册 → 小程序内容转换契约（V1）

> 更新时间：2026-09-22  
> 适用对象：九辰教育导航卡、科研论文、冲顶、清北华五、稳录、跃升、品牌手册等视觉型 PDF。  
> 目标：把“宣传册/产品手册”转换成可入库、可检索、可被小程序组件消费，同时保留足够视觉与来源信息供复核。

## 1. 为什么不能只交纯 Markdown

九辰现有 PDF 大量采用：
- 卡片分组；
- 时间线；
- 双列表格；
- 图标对应语义；
- 重点数字与强调色；
- 师资卡片；
- 产品参数表；
- 背景照片与品牌版式。

部分 PDF 的文本层还可能存在编码异常，因此“复制 PDF 文本 → Markdown”不是可靠主流程。

Markdown 只作为**人类可读语义备份**，不能作为唯一交付物。

## 2. 每份 PDF 的标准交付包

推荐目录：

```text
<document-slug>/
  manifest.yaml
  content.md
  content.json
  source-map.json
  pages/
    page-01.webp
    page-02.webp
    ...
  assets/
    <必要的独立视觉素材>
```

### 必需
- `manifest.yaml`
- `content.md`
- `content.json`
- `source-map.json`
- `pages/*.webp`

### 可选
- `assets/` 中的独立插图、头像、图标或裁剪块

原始大 PDF 不需要提交 Git；保留在受控文件库中即可。

## 3. manifest.yaml

必须包含：

```yaml
document_id: product-chongding-junior-v1
title: 九辰保研·大三冲顶计划产品手册
document_type: product_handbook
brand: 九辰教育
product_name: 九辰保研·大三冲顶计划
source_file: 九辰-大三冲顶计划产品手册.pdf
source_page_count: 10
source_date: 2026-09
conversion_version: handbook-v1
language: zh-CN
status: draft
```

可选：
- edition
- owner
- notes
- checksum

## 4. content.md：语义完整稿

Markdown 不是简单 OCR。

要求：

1. 按**阅读语义**重建层级，而不是按坐标逐行抄；
2. 保留所有标题、列表、表格、时间节点、价格、周期、师资；
3. 图标本身不需要描述颜色，但图标承载的类别语义必须写出来；
4. 不压缩、不改写、不总结原文；
5. OCR 明显错误可以纠正，但必须在 `source-map.json` 保留来源页；
6. 不确定文字写 `[待核对]`，禁止猜测；
7. 每个二级以上业务块尾部标注来源页，例如：
   `<!-- source: page 5 -->`

Markdown 中：
- 时间线用表格；
- 参数用表格；
- 师资用表格；
- 六项服务等重复卡片用分节 + 列表；
- 宣传数字/成果单独放在“营销声明”部分，不混入产品客观参数。

## 5. content.json：小程序/数据库的主结构

这是最重要的交付物。

顶层建议：

```json
{
  "document": {},
  "brand": {},
  "product": {},
  "audience": [],
  "highlights": [],
  "timeline": [],
  "modules": [],
  "core_services": [],
  "teachers": [],
  "marketing_claims": [],
  "contact": {},
  "visual_blocks": []
}
```

### 5.1 product

建议字段：

```json
{
  "name": "九辰保研·大三冲顶计划",
  "short_name": "大三冲顶计划",
  "price_cny": 13800,
  "service_period": {
    "months": 14,
    "display": "大三9月至大四10月"
  },
  "one_to_one_hours": 12,
  "positioning": "...",
  "source_pages": [1, 4, 9]
}
```

价格、周期等字段必须保留**原始展示文本**，不要只存数值。

### 5.2 audience

每条一条记录：

```json
{
  "id": "audience-1",
  "text": "...",
  "source_page": 4
}
```

### 5.3 highlights

用于小程序产品页“产品亮点”卡片，例如：
- 重信息
- 重落地
- 优师资
- 全周期

字段：
- title
- description
- icon_semantic
- source_page

### 5.4 timeline

时间线必须结构化，不要变成一大段文字：

```json
{
  "stage": "大三下",
  "time_range": "3-5月",
  "order": 3,
  "tasks": [
    "...",
    "..."
  ],
  "source_page": 5
}
```

### 5.5 modules

用于“一对一辅导”：

- 定位规划
- 网申指导
- 文书指导
- 联系导师指导
- 面试辅导

字段：
- name
- summary
- details[]
- teacher_requirement
- source_page

### 5.6 core_services

用于六项核心服务。

字段：
- order
- name
- summary
- bullets[]
- source_page

### 5.7 teachers

师资信息作为**时点快照**，不是永久事实。

字段：
- display_name
- education
- offers[]
- specialties[]
- source_page
- source_date
- verification_status

上线前必须允许后台修改/下架。

### 5.8 marketing_claims

类似：
- 整体录取率
- C9 录取比例
- 双非上岸 985 比例
- “985硕博”等师资数量声明

全部单独存：

```json
{
  "claim": "学员保研整体录取率达96%",
  "claim_type": "marketing_performance",
  "source_page": 2,
  "verification_status": "unverified",
  "display_allowed": false
}
```

在九辰提供数据依据并审核前：
- 不进入 AI 证据；
- 不自动展示为事实；
- 不用于计算评估结果。

## 6. source-map.json：来源追踪

每个重要字段/块至少要能回到原 PDF 页面。

推荐：

```json
{
  "product.price_cny": {
    "page": 9,
    "source_text": "13800元"
  },
  "timeline[0]": {
    "page": 5,
    "bbox_normalized": [0.06, 0.31, 0.94, 0.42]
  }
}
```

要求：
- `page` 必填；
- `source_text` 对文本字段强烈建议；
- 表格/卡片/图示建议记录 `bbox_normalized`；
- 坐标统一使用 0-1 的左上原点：
  `[x0, y0, x1, y1]`。

## 7. pages/*.webp：视觉证据

每页必须保留一个轻量视觉版本，用于：
- 复核层级；
- 复核表格；
- 复核图标语义；
- 处理 OCR/文本层乱码；
- 后续设计参考。

建议：
- WebP
- 宽度 1200-1600px
- quality 75-85
- 保持整页比例
- 文件名固定两位页码

这些页面图是**转换证据**，不是直接在小程序中整页展示。

## 8. assets/：只抽真正需要复用的视觉素材

可以抽：
- 产品封面主视觉；
- 有业务含义的插图；
- 经确认可展示的导师头像；
- 品牌 Logo。

通常不需要抽：
- 纯装饰渐变；
- 每个小图标；
- 页脚波浪；
- 纯背景建筑图。

小程序应复用自己的组件/图标体系，而不是把宣传册切成很多图片拼页面。

二维码、电话、地址等联系素材默认不作为产品正文资产；是否展示由小程序业务规则决定。

## 9. 视觉语义必须保留，但视觉版式不照搬

转换时需保留：
- 信息分组；
- 顺序；
- 主次关系；
- 时间关系；
- 对比关系；
- 参数/表格关系；
- 图标所代表的业务类别。

不要求保留：
- 原 PDF 的具体字体；
- 蓝金配色；
- 阴影半径；
- 波浪背景；
- 页面上的绝对像素位置。

原因：小程序有自己的响应式组件体系，宣传册固定版式不能直接当 UI。

## 10. 对当前“大三冲顶计划”PDF的具体映射

### 页面 1
类型：封面
提取：
- product_name
- short_name
- slogan
- cover_visual（可选）

### 页面 2
类型：品牌/机构介绍
拆成：
- brand.positioning
- brand.service_scope
- marketing_claims[]
- brand_activity_gallery（可选，不进产品核心 Schema）

### 页面 3
类型：目录
用途：
- 校验章节完整性
- 不需要作为小程序正文重复展示

### 页面 4
类型：项目定位
拆成：
- audience[]
- positioning
- highlights[]

### 页面 5
类型：14个月陪跑时间线
拆成：
- timeline[]（6 个阶段）
- service_reminder_note

### 页面 6
类型：一对一辅导
拆成：
- one_to_one_hours
- modules[]（5 个模块）
- teacher_configuration[]

### 页面 7-8
类型：六项核心服务
拆成：
- core_services[]（1-6）

### 页面 9
类型：产品参数 + 师资
拆成：
- price_cny
- service_period
- core_service_summary
- teachers[]

### 页面 10
类型：联系信息
拆成：
- contact（仅作为来源数据）
- QR/社媒信息单独分类
- 默认不自动进入产品详情正文

## 11. 图片/PDF文字层异常处理

如果 PDF 文本提取出现乱码：

1. 以**页面渲染图**为权威；
2. 优先使用视觉模型读取，不要反复依赖坏掉的 ToUnicode 文本层；
3. 需要人工确认的字标 `[待核对]`；
4. 不因 OCR 方便而放弃原页面视觉证据；
5. 表格必须按视觉行列重新恢复。

## 12. 批量转换的验收条件

一份手册只有同时满足以下条件才算转换完成：

- [ ] 页面数与原 PDF 一致；
- [ ] 每页有 WebP 视觉证据；
- [ ] content.md 无明显缺段；
- [ ] content.json 能独立表达产品关键业务信息；
- [ ] 时间线/表格/卡片已结构化；
- [ ] 所有价格、周期、课时、数量保留原文；
- [ ] 师资信息有来源页和时点；
- [ ] 营销声明被单独分类；
- [ ] 关键结构化字段能追溯到 source-map；
- [ ] 不把二维码/联系方式/营销数字误当 AI 评估事实；
- [ ] 不把原宣传册版式直接切图当成小程序 UI。

## 13. 主线如何消费转换结果

转换包回来后，主线会继续做：

1. Schema 校验；
2. 字段去重/跨产品统一；
3. 产品内容数据库建模；
4. 管理后台内容维护；
5. 小程序产品详情组件；
6. 产品知识 Retriever；
7. AI 建议与九辰产品服务之间的适配层。

因此批量转换时最重要的是“语义结构 + 来源 + 视觉证据”，而不是追求复刻宣传册设计。
