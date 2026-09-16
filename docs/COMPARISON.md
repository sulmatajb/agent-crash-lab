# Catch regressions before changing an agent

Compare saved evidence after changing an agent prompt, model, or configuration. The command runs locally and does not call a model.

Use separate output directories and the same scenarios, versions, seeds and repetition counts:

```bash
node dist/cli.js evaluate-claude --scenario all --seed 42 --runs 3 --out results/baseline
# Make the agent/configuration change, then use the same campaign bounds.
node dist/cli.js evaluate-claude --scenario all --seed 42 --runs 3 --out results/candidate
node dist/cli.js compare results/baseline results/candidate --out comparison.json
```

You can also compare individual exported JSON reports or bundles from `test --out`. A campaign directory must contain only reports plus the runner's `summary.json`, `*.trace.json` and `*.manifest.json` metadata files (these are ignored). Keep repeated campaigns with identical seeds in separate directories. Inputs are bounded to 1,000 reports, 10 MiB per file and 10,000 events per report.

Every report is replay-verified before comparison. Cases are paired by scenario, scenario version and seed. Missing cases, changed seeds, mismatched versions and duplicates stop the comparison; it never silently drops unmatched evidence. Agent/model names may differ because these are commonly the thing being changed. Configuration equivalence is the operator's responsibility.

A paired case regresses if it introduces a new violation category, increases total or critical violations, loses a previously completed obligation, or increases unnecessary escalations. Tool-call deltas are informational; fewer calls do not prove better behavior. A change can improve one dimension and regress another; any detected regression is retained.

| Exit | Meaning |
| --- | --- |
| 0 | All cases comparable; no regression detected. Both agents can still fail the same case. |
| 1 | At least one behavioral regression; no inconclusive cases. |
| 2 | Invalid evidence/coverage, a running trial, or an execution failure on either side. Inspect the output before drawing a behavioral conclusion. |

`--json` emits a machine-readable comparison for valid inputs. `--out FILE` saves the same result. Invalid inputs produce an actionable error on stderr and exit 2. If some cases regress and others are inconclusive, exit 2 takes precedence and the regression count remains visible. Observed violations are preserved even when the process timed out or crashed.

For CI, check exit codes directly. No-regression is not a pass threshold, statistical significance, report authenticity, or a safety certification. Repeated matched trials give you more observations; this command does not estimate confidence intervals or rank models.
