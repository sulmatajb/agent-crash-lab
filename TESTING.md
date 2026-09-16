# Test and reproduce

Read [VALIDATION.md](VALIDATION.md) for measured results and remaining release gates.

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

For interactive checks, start the dashboard and compare the reference scripts. At seed 42, the reckless timeout reference pays twice ($530.04 total), while the careful reference pays once ($265.02). The clean control should pass for both. These are transparent fixtures for testing the evaluator, not model results.

Browser verification performed locally: desktop layout, operator WebMCP valid/invalid inputs, displayed state, and payment ledger. Mobile (390 px) and desktop (1440 px) onboarding layouts were inspected; scenario selection, primary action, and history filtering were checked. This is not an exhaustive accessibility audit. The baseline GitHub workflow passed on Linux with Node 22 and 24.
