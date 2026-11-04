# Test and reproduce

Read [VALIDATION.md](VALIDATION.md) for historical measured results and [the integrated build evidence](docs/RELEASE.md#integrated-build-evidence) for the merged release candidate. For a fresh-machine trial with your own agent, use the [alpha pilot guide](docs/ALPHA-PILOT.md).

```bash
npm ci
npm test
npm run stress -- --worlds 1000 --concurrency 64 --out stress-report.json
```

Stress `--out` creates a new report file with owner-only permissions on POSIX systems (Windows permission behavior is unverified). An existing output (including a symbolic link) is preserved and the CLI exits with code 2; choose a new filename for each run. Without `--out`, the report is printed to stdout. The stress workload still runs before an output-write error is reported.

Scripted `test --out` also requires a new output filename and creates it with owner-only permissions on POSIX. Existing files, directories, hard links and symbolic links are preserved; an occupied destination or a blank `--out` exits with code 2. The reference runs execute before an output-write error is reported. A successfully saved report retains the normal verdict exit code: 0 for all passed, 1 for failed/incomplete. Without `--out`, results still go to stdout. This runs deterministic reference scripts, not a model. An I/O failure after exclusive creation can leave a partial new file; it is reported as an error.

`npm test` includes engine/evaluator tests, adversarial input, HTTP authorization, persistence, concurrent updates, abrupt process crash recovery, CLI exits, official MCP integration, timeout/cancellation, report replay, and dashboard DOM interactions.

History navigation commits only when its page loads successfully. A failed Next, Previous, or Newest request keeps the displayed rows and navigation available for retry. DOM tests use the local HTTP server with synthetic failures and delayed responses to cover retries and superseding search/filter changes; no live model is involved.

Finish responses update the dashboard only while their navigation intent is current. `test/finish-navigation.test.ts` gates real local HTTP responses to cover newer run navigation, same-run reopening, scenario selection, reference runs, stale polls, and a lost finish acknowledgment followed by retry. The server still completes the original run when its response becomes obsolete. Run this focused coverage with `node --import tsx --test test/finish-navigation.test.ts`; `CRASHLAB_TEST_ROOT=/path/to/unchanged/checkout` exercises the same tests against an alternate checkout with its dependencies available.

Comparison download DOM tests use the local HTTP server and capture the generated Blob to check exact CLI-compatible summary content for regression, failed no-regression and inconclusive outcomes. They also cover replacement and pending invalidation, late file reads and responses, preparation failure with retry, and URL/anchor cleanup. Browser download initiation is not evidence of a completed save to disk. Run the focused coverage with `node --import tsx --test test/report-compare-ui.test.ts`.

The installed-Hermes integration test is optional in environments without Hermes:

```bash
HERMES_TEST_PYTHON=/path/to/hermes/venv/bin/python npm test
```

This uses the real Hermes runtime with a deterministic local provider fixture, never a paid model. It tests runtime/transport compatibility, not model judgment. The source Hermes profile is not touched.

To test an actual model, run on the machine containing its authenticated Hermes profile:

```bash
node dist/cli.js doctor
node dist/cli.js probe
node dist/cli.js evaluate --scenario payment-timeout --runs 3 --out results/hermes
node dist/cli.js evaluate --scenario all --runs 3 --out results/hermes-suite
node dist/cli.js verify results/hermes/<run-id>.json
```

`doctor` reads configuration without revealing keys. `probe` calls an actual lab tool through Hermes but performs no inference. `evaluate` runs the real model. Check `execution_errors` separately from behavioral failures. A provider error is not an agent safety result.

Claude runtime protocol tests use a deterministic subprocess fixture. They cover expired authentication, missing executable, invalid JSON, output limit, timeout, cancellation, unexpected tool surfaces, missing `lab_finish`, and a failed exit after completing the simulated task. These are runner tests, not model safety results.

To run a live Claude campaign:

```bash
node dist/cli.js evaluate-claude --scenario advanced --runs 3 --out results/claude
```

For interactive checks, start the dashboard and compare the reference scripts. At seed 42, the reckless timeout reference pays twice, while the careful reference pays once. The clean control should pass for both. These are transparent fixtures for testing the evaluator, not model results.

Browser verification performed locally: desktop layout, operator WebMCP valid/invalid inputs, displayed state, and payment ledger. Mobile (390 px) and desktop (1440 px) onboarding layouts were inspected; scenario selection, primary action, and history filtering were checked. This is not an exhaustive accessibility audit. The baseline GitHub workflow passed on Linux with Node 22 and 24.

## Test the installed package

```bash
npm run smoke:package
```

This packs the repository, installs the tarball in a new temporary consumer, and checks the packaged dashboard, all eleven careful reference scenarios, ten-tool MCP discovery, post-commit timeout recovery, a single committed payment, receipt delivery, and deterministic replay. It uses no model inference. The temporary consumer is removed afterward. Use `npm run smoke:package -- --offline` only when npm already has the dependency artifacts cached. CI runs this check on fresh Ubuntu and macOS runners with Node 22 and 24.

The installed CLI is also invoked for help, scenario discovery, passing and failing reference runs, and exported-report verification. The check requires exit 0 for valid evidence, exit 1 for observed reference-agent failures, and exit 2 for unknown commands, missing reports and edited payment evidence. Packaged JavaScript and CSS must be served successfully with matching content types; the license and core documentation must be included. Local Markdown links are also checked against the installed package, so a link that works only in a source checkout fails this gate. Demo videos remain outside the tarball and use repository URLs.

## First live trial acceptance check

Start with `evaluate-claude --scenario payment-timeout --out results/first-trial` (or Hermes `evaluate` with your configured profile). Inspect both the execution status and behavioral verdict. A finished trial must have real tool events, an agent identity, a scenario and seed, and a replayable JSON report. An authentication error or a script comparison does not establish model behavior.

Verify the exported run with `node dist/cli.js verify results/first-trial/<run-id>.json`. For the careful recovery pattern, inspect the timeout event, the ledger or idempotency reconciliation, exactly one committed payment, and the receipt. A different agent response can legitimately produce a different verdict; do not edit the evidence to force a pass.

A recorded synthetic-data sample is included for a quick replay check:

```bash
node dist/cli.js verify validation/examples/claude-payment-timeout.json
```

This is an actual completed Claude trial, not the careful reference script. Its execution metadata identifies the app-reported model configuration; replay establishes internal consistency only.

`verify` accepts exactly one regular JSON file, at most 10 MiB. It rejects directories and named pipes rather than waiting for stream input. The reader checks the opened file descriptor and enforces the byte limit during reading, including if the file grows. Invalid JSON produces a generic error without echoing report contents. Usage, read and verification failures exit with code 2.

MCP connection failures use structured `LAB_*` error codes, distinct from simulated business faults such as `TIMEOUT`. The bridge does not automatically retry writes: if a request loses its response, a payment may already have committed. Inspect the run, reconcile with `payments_list`, and preserve the original idempotency key when retrying. An authorization error requires a fresh dashboard connection. Transport errors have `retryable: false` to prevent blind retry loops; this does not mean the payment is known to have failed. Responses are bounded to 15 seconds and 1 MiB; redirects are refused and raw HTTP error bodies are omitted.

## Automated platform coverage

The [CI workflow](https://github.com/sulmatajb/agent-crash-lab/blob/main/.github/workflows/ci.yml) uses four jobs: Ubuntu and macOS, each on Node 22 and 24. Every job installs the lockfile from scratch, runs the integration suite, exercises all eleven reference scenarios across twenty seeds, and installs and tests the packed tarball. A failure on one platform does not cancel the other jobs. The workflow requires no agent credentials and performs no model inference.

| Environment | Coverage | Limit |
| --- | --- | --- |
| Ubuntu / Node 22 and 24 | Fresh CI installation, integrations, reference scenarios, packaged CLI/MCP/dashboard | No authenticated agent campaign or visual browser review |
| macOS / Node 22 and 24 | Same fresh CI checks as Ubuntu | Hosted runner architecture; not every Mac or macOS version |
| Windows | Unverified | No support claim until equivalent checks pass |
| Claude Code and Hermes | Runner fixtures in CI; separately documented live or installed-runtime evidence | CI does not establish provider authentication or model behavior |

Hosted runners are disposable machines, but this is automated infrastructure coverage. It does not replace the independent human onboarding trial in the [alpha pilot guide](docs/ALPHA-PILOT.md). Node patch versions and hosted OS images change over time; inspect the setup steps in a particular CI run for its exact environment.
