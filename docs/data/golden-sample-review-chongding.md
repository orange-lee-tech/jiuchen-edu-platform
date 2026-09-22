# 大三冲顶计划黄金样例审计

- 审计日期：2026-09-22
- 样例：`jiuchen-dasan-chongding-sample`
- 结论：**PASS WITH MINOR CONTRACT REFINEMENTS**
- 作用：允许作为后续产品手册批量转换的黄金样例，但批量前需统一以下字段规范。

## 1. 已通过项目

- 10/10 页均保留完整 WebP 视觉证据；
- 页面宽度 1489 px，符合 1200–1600 px 建议；
- SHA256SUMS 全部校验通过；
- `content.md` 保留完整章节、时间线、模块、服务、师资与联系方式；
- `content.json` 顶层结构完整；
- `source-map.json` 共 59 条映射；
- 所有 source_page 均在 1–10 页范围内；
- 所有 bbox_normalized 均在 0–1 范围且坐标顺序正确；
- 4 条适用人群完成结构化；
- 8 个亮点完成结构化；
- 6 个陪跑时间阶段完成结构化；
- 5 个一对一模块完成结构化；
- 6 项核心服务完成结构化；
- 5 位师资完成结构化；
- 3 条宣传成果数字被隔离到 marketing_claims；
- 二维码未被错误抽取为产品正文资产；
- 联系方式明确标记为 source-only；
- 产品知识与案例数据明确分离；
- PDF 文本层乱码时明确采用 page_visual 作为权威来源。

## 2. 批量前必须统一的四点

### 2.1 文档类型统一

后续产品手册统一：

```yaml
document_type: product_handbook
```

不要在不同文件中混用 product_manual / product_handbook。

### 2.2 数值必须同时保留原展示文本

机器字段不能替代源文案。

例如：

```json
{
  "price": {
    "amount": 13800,
    "currency": "CNY",
    "display": "13800元"
  },
  "service_period": {
    "duration_months": 14,
    "from": "大三9月",
    "to": "大四10月",
    "display": "14个月（大三9月大四10月）"
  }
}
```

原因：
- 防止结构化时擅自规范化丢失原文；
- 后续 UI 可以选择使用标准字段或原文；
- 审计时可快速核对。

### 2.3 marketing_claims 必须带展示控制

统一至少包含：

```json
{
  "claim_id": "...",
  "claim_type": "marketing_performance",
  "source_text": "...",
  "verification_status": "unverified",
  "display_allowed": false,
  "source_page": 2
}
```

在业务方完成统计口径/证据审核前：
- 不进入 AI 事实证据；
- 不默认在小程序公开展示；
- 不参与任何评估计算。

### 2.4 师资学历保留 raw + 可选结构化

类似：

```text
中南大学本科浙江大学硕士工科类
```

在视觉排版中可能依靠换行/空格表达层次。

后续统一：

```json
{
  "education_raw": "中南大学本科浙江大学硕士工科类",
  "education_items": [
    {
      "institution": "中南大学",
      "degree": "本科",
      "discipline": "工科类"
    },
    {
      "institution": "浙江大学",
      "degree": "硕士",
      "discipline": "工科类"
    }
  ]
}
```

若视觉不足以可靠拆分：
- 只保留 education_raw；
- education_items = []；
- 不猜。

## 3. 允许保留的样例差异

以下不要求返工：
- `Source page: X` 与 HTML comment 两种页码标记均可读；
- source_date 使用 PDF metadata ModDate，只要同时保留 source_date_basis；
- assets 数量可按每份手册实际情况不同；
- visual_blocks 可以引用整页 visual evidence，不要求每个视觉都切图。

## 4. 批量转换门槛

其余 PDF 可以开始批量转换，但必须满足：
- 使用 handbook-v1 Schema；
- 上述四条字段规范；
- 先做自动 Schema 检查；
- 若单份 PDF 出现无法映射的新结构，不擅自扩展公共 Schema，先记录到 document.extensions 或审计说明，再由主线决定。

## 5. 主线下一步

黄金样例本身暂不直接导入 Production 数据库。

主线将在产品内容数据模型施工时：
1. 以本样例作为 fixture；
2. 建立 ProductKnowledge / ProductOffering 数据模型；
3. 建立导入校验；
4. 后台支持编辑/下架时点型信息；
5. 小程序产品页消费结构化字段；
6. AI Retriever 只读取已允许进入知识库的字段。
