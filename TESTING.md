# Test and reproduce

Read [VALIDATION.md](VALIDATION.md) for historical measured results and [the integrated build evidence](docs/RELEASE.md#integrated-build-evidence) for the merged release candidate. For a fresh-machine trial with your own agent, use the [alpha pilot guide](docs/ALPHA-PILOT.md).

```bash
npm ci
npm test
npm run stress -- --worlds 1000 --concurrency 64 --out stress-report.json
```

`npm test` includes engine/evaluator tests, adversarial input, HTTP authorization, persistence, concurrent updates, abrupt process crash recovery, CLI exits, official MCP integration, timeout/cancellation, report replay, and dashboard DOM interactions.

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

This packs the repository, installs the tarball in a new temporary consumer, and checks the packaged dashboard, all eleven careful reference scenarios, ten-tool MCP discovery, post-commit timeout recovery, a single committed payment, receipt delivery, and deterministic replay. It uses no model inference. The temporary consumer is removed afterward. Use `npm run smoke:package -- --offline` only when npm already has the dependency artifacts cached. CI runs this check on Node 22 and 24.

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
