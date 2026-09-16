# Public release checklist

The repository remains private until the owner chooses to publish. This checklist distinguishes implemented features from evidence still needed; it is not a safety certification.

## Verified foundation

- [x] Local web app, CLI, stdio MCP, SQLite persistence and replay.
- [x] Supervised Claude Code adapter; installed-package live trial.
- [x] Explicit separation of reference scripts, model behavior and execution errors.
- [x] Live baseline and harder-scenario evidence, including non-passing outcomes.
- [x] Tests for concurrency, process termination, evaluator defects, and runner errors.
- [x] Linux CI on Node 22 and 24; local macOS validation.
- [x] MIT license, contribution guide, issue templates and synthetic-data boundaries.

## Before announcing broad support

- [ ] Run an authenticated Hermes model campaign. Transport-only evidence is insufficient.
- [ ] Have another person install from scratch on another machine.
- [ ] Independently review scenario assumptions and evaluator rules, especially incomplete results.
- [ ] Check model/client compatibility against the versions advertised at release time.
- [ ] Review dependency advisories and licenses again at publication time.

## Publication operations

- [ ] Owner confirms repository visibility change and release scope.
- [ ] Enable GitHub private vulnerability reporting when available for the repository.
- [ ] Review tracked files and Git history for private information; keep tokens, SQLite databases and session logs excluded.
- [ ] If publishing to npm, verify package-name ownership and contents first. The README must not advertise an unverified `npx` install.
- [ ] Remove the temporary restricted-access note from the README after public publication.
- [ ] Tag the reviewed commit and attach release notes with tested versions and known limitations.

## Video evidence rules

Use actual recorded results with scenario, seed and agent identity visible. Label diagrams/animations as explanatory visuals. Do not present reference scripts as a live model. Show incomplete outcomes and evaluator limitations where relevant. No invented adoption statistics, ratings, safety claims or model rankings. Hide run capabilities, private paths and account identifiers from footage. Record from a dedicated presentation database, preserving source evidence separately.
