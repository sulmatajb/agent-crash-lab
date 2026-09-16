# Contributing

Small, reproducible failures are the core contribution.

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
