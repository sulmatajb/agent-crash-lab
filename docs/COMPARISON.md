# Catch regressions before changing an agent

## Start offline with the reference scripts

From a source checkout after the normal dependency installation:

```sh
npm run build
node examples/offline-comparison.mjs
node examples/offline-comparison.mjs --json
```

The [standalone walkthrough](../examples/offline-comparison.mjs) invokes the real
`test` and `compare` CLI commands seven times, using disposable evidence. It
needs no model, provider credentials or running dashboard. It shows:

| Comparison | CLI exit | What to inspect |
| --- | --- | --- |
| Careful → reckless, seed 42 | 1 | Regression; passed → failed |
| Reckless → careful, seed 42 | 0 | No regression; failed → passed |
| Reckless → reckless, seed 42 | 0 | **Both still failed** |
| Careful seed 42 → careful seed 43 | 2 | Unmatched evidence rejected; no behavioral conclusion |

The “improvement” label describes the failed-to-passed observation; the actual
CLI status is `no-regression`. These are deterministic reference scripts, not
model results. The JSON retains actual exit codes, both verdicts and comparison
reasons while omitting generated run IDs and temporary paths. It includes the
exact CLI argument lists using temporary relative filenames. The unmatched-seed
diagnostic is a controlled summary of checked stderr.

Each CLI child has a ten-second deadline and a bounded output buffer. Temporary
bundles are removed before successful output and on ordinary errors/timeouts;
abrupt parent termination cleanup is not guaranteed. The walkthrough takes no
input/output path arguments and retains no raw reports. It is a learning example,
not an evidence export system or a model ranking.

## Compare your own saved campaigns

Compare saved evidence after changing an agent prompt, model, or configuration. The command runs locally and does not call a model.

Use separate output directories and the same scenarios, versions, seeds and repetition counts:

```bash
node dist/cli.js evaluate-claude --scenario all --seed 42 --runs 3 --out results/baseline
# Make the agent/configuration change, then use the same campaign bounds.
node dist/cli.js evaluate-claude --scenario all --seed 42 --runs 3 --out results/candidate
node dist/cli.js compare results/baseline results/candidate --out comparison.json
```

You can also compare individual exported JSON reports or bundles from `test --out`. A campaign directory must contain only reports plus the runner's `summary.json`, `*.trace.json` and `*.manifest.json` metadata files (these are ignored). Keep repeated campaigns with identical seeds in separate directories. Inputs are bounded to 1,100 reports across all files (11 scenarios × 100 seeds), 10 MiB per file, 64 MiB of JSON per campaign input, and 200 events per report. Bundles count toward the same total report limit; splitting a bundle into files does not raise that limit. Byte limits are enforced while reading the checked file descriptor, even if a file grows. Symlinked reports and non-regular JSON entries are rejected rather than silently omitted from coverage.

Saved reports and campaign manifests must be valid UTF-8 JSON. Malformed UTF-8 is rejected before replay or digest verification; invalid bytes are never silently replaced. A literal Unicode replacement character (U+FFFD) in valid UTF-8 remains valid text.

Every report is replay-verified before comparison. Cases are paired by scenario, scenario version and seed. Missing cases, changed seeds, mismatched versions and duplicates stop the comparison; it never silently drops unmatched evidence. Agent/model names may differ because these are commonly the thing being changed. Configuration equivalence is the operator's responsibility.

A paired case regresses if it introduces a new violation category, increases total or critical violations, loses a previously completed obligation, or increases unnecessary escalations. Tool-call deltas are informational; fewer calls do not prove better behavior. A change can improve one dimension and regress another; any detected regression is retained.

| Exit | Meaning |
| --- | --- |
| 0 | All cases comparable; no regression detected. Both agents can still fail the same case. |
| 1 | At least one behavioral regression; no inconclusive cases. |
| 2 | Invalid evidence/coverage, a running trial, or an execution failure on either side. Inspect the output before drawing a behavioral conclusion. |

`--json` emits a machine-readable comparison for valid inputs. `--out FILE` saves the same result. Invalid inputs produce an actionable error on stderr and exit 2. If some cases regress and others are inconclusive, exit 2 takes precedence and the regression count remains visible. Observed violations are preserved even when the process timed out or crashed.

For CI, check exit codes directly. No-regression is not a pass threshold, statistical significance, report authenticity, or a safety certification. Repeated matched trials give you more observations; this command does not estimate confidence intervals or rank models.
