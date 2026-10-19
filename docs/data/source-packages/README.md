# 九辰多模态转换包仓库留档索引

> 归档批次：2026-09-22  
> 数量：7  
> 状态：已完成内容消化与来源锚定

## 1. 归档策略

本目录用于回答两个问题：

1. 当前小程序中的产品/品牌内容来自哪一份转换包？
2. 将来拿到原 ZIP 时，能否确认它就是当时使用的那一份？

仓库采用“**结构化正文进运行快照 + 原包整体 SHA-256 + 视觉证据不重复膨胀 Git 历史**”策略。

- 每份转换包的结构化正文已经进入仓库运行时快照；
- 原 ZIP 文件名、字节数、SHA-256、document_id、源页数均在本索引固定；
- PDF 整页图、WebP 等大体积视觉证据不重复写入 Git 历史；小程序只保留运行时确实需要的轻量视觉资产；
- 原 ZIP 仍可用本索引 SHA-256 做逐字节验真；
- 品牌手册的 `case-evidence.json` 单独原义留档，但状态为 unverified，不进入 AI Retriever。

这不是“只记一个文件名”：小程序实际消费的 canonical content 已经固化在 `services/api/src/data/`，本索引负责把它与原始转换包绑定。

## 2. 七份来源包

| # | 内容 | document_id | 页数 | ZIP 字节数 | ZIP SHA-256 | 仓库运行快照 |
|---|---|---|---:|---:|---|---|
| 1 | 大三冲顶计划 | `jiuchen-dasan-chongding-product-manual-2026-sample-v1` | 10 | 2,075,652 | `8fe014f38459e632d997d24118663f676dacc600178380ea13cbf0117c0c2339` | `bundled-products.part*.ts` |
| 2 | 保研导航卡 | `jiuchen-baoyan-navigation-card-product-manual-2026-v1` | 14 | 3,050,119 | `9ddd8dade286b2ec6819a118d09cee10c2ece5c4445587be54fe3bbf44591542` | `bundled-products.part*.ts` |
| 3 | 保研品牌手册 | `jiuchen-baoyan-brand-manual-2026-v1` | 24 | 5,324,495 | `4d3065f646dd61a8ecdb73b9f48e19f6082f6082fcf558572a72c86e0aceed7d` | `bundled-brand-public.ts` + 本目录案例证据 |
| 4 | 清北华五计划 | `jiuchen-qingbei-huawu-plan-2026-v1` | 12 | 2,635,573 | `0530113ede906b5e072eaa8d2f38d6c6803ef3921c10064f38d0a8a939915963` | `bundled-product-qingbei.ts` |
| 5 | 国内外科研项目/论文辅导 | `jiuchen-domestic-international-research-project-product-manual-2026-v1` | 18 | 3,984,169 | `40a9e3f122a8f1e31df862fd7a70a42734d32f70dc49a93be94f4fe85eef7e1d` | `bundled-product-research.ts` |
| 6 | 稳录计划 | `jiuchen-wenlu-plan-2026-v1` | 12 | 2,520,248 | `88f7dfa1d52d2a303826950834e98036cb60fb64f891cac3fd6d0ec010fe9aed` | `bundled-product-wenlu.ts` |
| 7 | 跃升计划 | `jiuchen-yuesheng-plan-2026-v1` | 12 | 2,450,861 | `1524454c56e2d20f75a861fb398cf6b72c6f93537e41d69790e9fe0b6550472e` | `bundled-product-yuesheng.ts` |

## 3. 原转换包的标准组成

转换包至少包含以下结构化/审计材料中的相应项：

- `manifest.yaml`
- `content.md`
- `content.json`
- `source-map.json`
- `AUDIT-NOTES.md`
- `SHA256SUMS.txt`
- `assets/` 与页面证据图
- 品牌手册额外含 `case-evidence.json`

运行时并不直接读取 ZIP，而读取已校验、已规范化的 bundled snapshot。这样即使测试数据库尚未升级，产品内容也能稳定显示；以后数据库 active 版本可按既定规则接管。

## 4. 数据集隔离

- 产品手册 → `jiuchen_product_knowledge`
- 品牌公开资料 → 独立 `/brand` public view
- 品牌手册案例证据 → `jiuchen_case_evidence`，当前 `unverified`
- 产品宣传数据默认 `assessmentEvidenceAllowed=false`
- 未核验 marketing claim 默认不可公开、不可用于录取判断
- 示例规划不得进入真实案例数据集

品牌案例原义留档见：

`docs/data/source-packages/brand-case-evidence.unverified.json`

## 5. 原 ZIP 验真

PowerShell：

```powershell
Get-FileHash .\某个转换包.zip -Algorithm SHA256
```

将输出的 Hash 与本表对应 SHA-256 比较即可。

> 注意：Git 仓库不重复保存全部整页 WebP/PDF 图像，避免长期 Git 历史无意义膨胀。原 ZIP 的整体 SHA-256 是原包身份锚点；真正被程序消费的结构化正文则已经完整落入版本控制。
