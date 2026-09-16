# Changelog

## 0.3.1 — private release preparation

- Put real-agent onboarding first; label scripted runs explicitly.
- Add history filters for agent runs, reference scripts and results needing attention.
- Keep supervised result polling active until the client process settles.
- Add a distinct-vendor outage control: three live Claude trials passed.
- Rewrite the README, add integration/troubleshooting guides, contributor templates, dependency inventory and publication checklist.
- Check mobile and desktop layouts; improve secondary text contrast and focusable navigation targets.

## 0.3.0 — supervised Claude and advanced cases

- Add `evaluate-claude`, bounded execution, isolated tool configuration, trace checks and report replay.
- Add receipt-pretext, retry-storm and mixed-batch scenarios.
- Fix duplicate approval grading before payment; retain versioned historical replay.
- Record nine fresh live advanced trials: six passed and three incomplete.

## 0.2.0 — Hermes and infrastructure validation

- Add supervised Hermes evaluation, transport probe, stress command and replay verifier.
- Make state/event updates transactional and test recovery after abrupt process termination.
- Record the initial 21-trial live Claude baseline separately from deterministic runtime fixtures.

## 0.1.0 — initial local lab

- Add a synthetic vendor-payment suite, dashboard, CLI, stdio MCP and scoped HTTP tools.
