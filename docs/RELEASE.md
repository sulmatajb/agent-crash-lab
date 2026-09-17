# Public release checklist

The repository remains private until the owner chooses to publish. This checklist distinguishes implemented features from evidence still needed; it is not a safety certification.

## Verified foundation

- [x] Local web app, CLI, stdio MCP, SQLite persistence and replay.
- [x] Supervised Claude Code adapter; installed-package live trial.
- [x] Explicit separation of reference scripts, model behavior and execution errors.
- [x] Live baseline and harder-scenario evidence, including non-passing outcomes.
- [x] Tests for concurrency, process termination, evaluator defects, and runner errors.
- [x] Linux CI on Node 22 and 24; local macOS validation.
- [x] Installed-tarball integration check added to CI: dashboard, 11 reference scenarios, real MCP timeout recovery and replay.
- [x] MIT license, contribution guide, issue templates and synthetic-data boundaries.

## Integrated build evidence

Commit `997bcbf48afe1bd7f18e261ba2567be441346eb3` includes all 18 initial PRs. On September 16, 2026 (America/Los_Angeles):

- 114 local automated tests passed, with no skips, including the installed Hermes runtime against a deterministic local provider.
- Clean-package CLI, MCP, dashboard assets and report-replay checks passed.
- A local stress run completed 265,096 calls across 1,000 simulated worlds at concurrency 64, with zero lost events and zero duplicate payments under the same idempotency key; restart checks passed.
- [Linux CI on Node 22 and 24](https://github.com/sulmatajb/agent-crash-lab/actions/runs/35164895662) passed for that commit.
- The production-dependency audit reported zero known vulnerabilities at that time. This does not replace the license and publication-time reviews below.

These are infrastructure checks, not additional live-model trials. Follow the [alpha pilot guide](ALPHA-PILOT.md) for the remaining independent installation and agent-behavior evidence. Existing live-model results remain linked from the README.

## Before announcing broad support

- [ ] Run an authenticated Hermes model campaign. Transport-only evidence is insufficient.
- [ ] Have another person install from scratch on another machine.
- [ ] Independently review scenario assumptions and evaluator rules, especially incomplete results.
- [ ] Check model and agent app compatibility against the versions advertised at release time.
- [ ] Review dependency advisories and licenses again at publication time.

## Publication audit progress

The [publication audit](PUBLICATION-AUDIT.md) records the Git-history credential scan and runtime license inventory, plus the binary/media and tool-license review still needed.

## Publication operations

- [ ] Owner confirms repository visibility change and release scope.
- [ ] Enable GitHub private vulnerability reporting when available for the repository.
- [ ] Review tracked files and Git history for private information; keep tokens, SQLite databases and session logs excluded.
- [ ] If publishing to npm, verify package-name ownership and contents first. The README must not advertise an unverified `npx` install.
- [ ] Remove the temporary restricted-access note from the README after public publication.
- [ ] Tag the reviewed commit and attach release notes with tested versions and known limitations.

## Prepared media

- [x] [24-second 1080p MP4](../videos/agent-crash-lab/launch.mp4) rendered and decoded for inspection.
- [x] Reproducible video source, local assets, contact sheet, and [evidence map](../videos/agent-crash-lab/SOURCES.md).
- [x] [Actual Claude recovery sample](../validation/examples/claude-payment-timeout.json) replay verified.
- [ ] Owner reviews final video and chooses the public posting destination.

## Video evidence rules

Use actual recorded results with scenario, seed and agent identity visible. Label diagrams/animations as explanatory visuals. Do not present reference scripts as a live model. Show incomplete outcomes and evaluator limitations where relevant. No invented adoption statistics, ratings, safety claims or model rankings. Hide run capabilities, private paths and account identifiers from footage. Record from a dedicated presentation database, preserving source evidence separately.
