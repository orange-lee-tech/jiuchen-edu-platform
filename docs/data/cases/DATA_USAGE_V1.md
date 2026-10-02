# 九辰案例数据怎样喂给 AI｜V1

## A. 规则监督

使用本地私有文件：

- `data-source/cases/ai/supervision/v1.0.0/rule_supervision_train.jsonl`
- `data-source/cases/ai/supervision/v1.0.0/rule_supervision_dev.jsonl`

用途：

- Prompt / Agent 回归测试；
- 输出 Schema 调试；
- 规则遵循训练；
- 以后若确有必要，可作为微调候选数据。

注意：这些标签是**九辰 V1 业务规则派生标签**，不是逐条由真人专家独立给出的 Ground Truth。

## B. 案例检索 / RAG

正式评测期间只能使用：

`data-source/cases/ai/rag/v1.0.0/rag_reference_eval_safe_train_dev.jsonl`

正式评测完成并冻结结果后，产品环境可考虑：

`data-source/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl`

RAG 案例可以包含其他历史案例的最终去向，因为其用途是相似案例参照；但**评测案例本身绝不能出现在评测时的 RAG 库里**。

## C. 正式 Evaluation

Evaluation Suite 共 92 条：

- Core Eval：80 条，按学科门类比例抽样；
- Language Extension：12 条，仅补充英语维度盲样本覆盖。

被测模型只能看到：

`data-source/cases/ai/evaluation/v1.0.0/eval_inputs.jsonl`

评分器才能读取：

`eval_expected_rule_labels.jsonl`

报告时 Core 与专项扩展必须分开，不把专项过采样混成一个总体准确率。

当前 V1 评测：

- 学科门类：Exact Match；
- 有参考标签的维度：Exact Match + Within-One-Band；
- 无可靠参考标签的维度：观察模型是否正确表达不确定性；
- 不评“官方总体竞争力总分”；
- 不评“精确录取概率”。

## D. 结果验证

仅使用：

`eval_outcomes_retrospective.jsonl`

用途是回答：

> AI 的判断与后来真实发生的结果，是否存在系统性高估或低估？

禁止：

- 作为模型输入；
- 作为 Few-shot；
- 混入评测时 RAG；
- 直接作为规则监督训练标签。

## 数据资产优先级

1. `canonical/`：事实母库；
2. `serving/`：小程序展示派生物；
3. `ai/supervision/`：规则监督；
4. `ai/rag/`：案例检索；
5. `ai/evaluation/`：冻结评测；
6. `ai/review/`：局部特殊案例人工处理。

任何下游文件都不能反向覆盖 canonical 母库。
