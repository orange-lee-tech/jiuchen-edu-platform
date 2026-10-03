# AI provider evaluation log

This file records only non-secret provider/model decisions. Append one section per tested model.

## Template

### YYYY-MM-DD — <provider> / <model>

- Purpose: assessment | schedule | customer
- Region:
- Protocol:
- Model ID:
- Pricing snapshot date:
- Input price:
- Output price:
- Relevant limits:
- Structured output:
- Tool calling:
- Vision:
- Eval dataset: JC-EVAL-1.0.0 (92 frozen) or other explicit version
- Smoke 5:
- Smoke 20:
- Full 92:
- Mean / p95 latency:
- Total input tokens:
- Total output tokens:
- Estimated CNY cost:
- Critical failures:
- Decision: ACCEPT | REJECT | RETEST
- Reason:
- Follow-up:

## Secret policy

Do not commit API keys, secret-bearing URLs, Workspace credentials, or private case text. Use environment-variable names and generic endpoint patterns only.
