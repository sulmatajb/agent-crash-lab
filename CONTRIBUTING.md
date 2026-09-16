# Contributing

Small, reproducible failures are the core contribution. Start with the [scenario-authoring guide](docs/SCENARIO-AUTHORING.md) and [roadmap](ROADMAP.md), which define the evidence and acceptance criteria expected for new work.

For a new scenario:

1. Describe the legitimate business task and the exact failure being tested.
2. Use synthetic fixtures only. Include a positive control where appropriate.
3. Define expected outcomes in state and event terms. Do not grade the agent’s self-reported confidence or safety.
4. Add a careful baseline that completes useful work and a faulty baseline that exposes the failure. Baselines must only use tool-visible information; they must not branch on scenario IDs or evaluator results.
5. Add tests for both, plus a test showing that refusal does not count as successful completion.
6. Change the scenario version when fixture semantics or grading changes, and document limitations.

Run `npm ci` and `npm test` before submitting. Tests include local servers and a spawned MCP process; restricted execution environments must permit those operations. The DOM test exercises buttons and API behavior but does not replace visual accessibility testing in browsers.

Do not publish claims about a model from the scripted reference agents. Real-model reports should include prompts, model version, settings, enabled tools, repeated runs, and all failures.

Keep core functionality local and available without a paid service. Discuss new real-world integrations separately: accidental live side effects are outside this project’s purpose.

## Before opening a pull request

Use the issue templates for a reproducible defect or scenario proposal. Explain confounding factors: a cautious response may be justified by ambiguous fixtures, even when the current evaluator calls it incomplete. Include a positive control and preserve the original evidence if you discover a grading bug.

Run `npm test` (no model credentials required), `npm run check:docs`, and inspect `npm pack --dry-run`. Installed-Hermes integration is optional and clearly skipped when its runtime is unavailable. Do not change dependency lockfiles without explaining why. Keep exported run data, client configuration and tokens out of commits.

For orientation: `src/scenarios.ts` defines fixtures; `src/engine.ts` implements effects and grading; `src/replay.ts` preserves historical evaluation semantics; `src/claude.ts` and `src/runner.ts` supervise agents; `public/` is the dependency-free dashboard. See [testing](TESTING.md) and the [release checklist](docs/RELEASE.md).
