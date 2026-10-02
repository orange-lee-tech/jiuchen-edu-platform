# 九辰保研案例数据资产

本目录只保存**规则、清单、目录约定与评测协议**。真实/历史案例正文不得提交到 Git。

## 为什么不把案例正文放进仓库

仓库 `.gitignore` 已将 `data-source/` 定义为本地真实业务数据目录；`AGENTS.md` 和 `CONSTITUTION.md` 也要求真实学生数据不得进入 Git。即使案例已经做过姓名脱敏，学校、专业、排名、科研和最终去向的组合仍可能形成再识别风险。

因此采用：

- Git 跟踪：`docs/data/cases/`
- 本地私有数据：`data-source/cases/`（已被 Git 忽略）

## 本地目录

```text
data-source/cases/
├── canonical/
│   └── v1.0.0/
│       ├── canonical_cases_labeled_v1.0.0.jsonl
│       └── canonical_source_records.jsonl
├── serving/
│   └── v1.0.0/
│       └── mini_program_cases_v1.0.0.json
├── ai/
│   ├── supervision/v1.0.0/
│   │   ├── rule_supervision_train.jsonl
│   │   └── rule_supervision_dev.jsonl
│   ├── rag/v1.0.0/
│   │   ├── rag_reference_eval_safe_train_dev.jsonl
│   │   └── rag_reference_production_all.jsonl
│   ├── evaluation/v1.0.0/
│   │   ├── eval_inputs.jsonl
│   │   ├── eval_expected_rule_labels.jsonl
│   │   ├── eval_outcomes_retrospective.jsonl
│   │   ├── eval_manifest.json
│   │   └── EVALUATION_PROTOCOL.md
│   └── review/v1.0.0/
│       └── local_special_review_queue_v1.0.0.jsonl
└── governance/v1.0.0/
    ├── jc_expert_label_rules_v1.0.0_frozen.json
    ├── DATA_USAGE_V1.md
    └── local_data_manifest_v1.0.0.json
```

## 三条硬规则

1. `canonical/` 是事实母库；下游文件不得反向覆盖母库。
2. 正式 Evaluation 时，评测案例不得进入训练集或 RAG 检索库。
3. 最终保研去向只能作为历史结果验证，不能进入评估输入。

## 发布影响

无。

真实案例文件都位于已忽略的 `data-source/`；当前 ECS API 的 Dockerfile 仅复制 `services/api` 下的 package、tsconfig、src 和编译产物，不会把该本地案例目录打入运行镜像。

详见：
- [DATA_USAGE_V1.md](./DATA_USAGE_V1.md)
- [数据清单](./manifests/jc-case-data-manifest-v1.0.0.json)
- [Evaluation 清单](./manifests/jc-evaluation-manifest-v1.0.0.json)
- [Expert Label V1 冻结规则](./schemas/jc-expert-label-rules-v1.0.0.json)
