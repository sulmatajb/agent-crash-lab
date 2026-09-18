# Release validation — 0.3.2

**Decision: technical checks and full live Claude/Hermes campaigns are complete; still private and pre-release. Independent human onboarding is not yet verified.**

Latest September 17 checks: [120 distinct automated tests and clean macOS/Linux package checks](docs/validation/launch-checks-2026-09-17.json). The [full live Hermes campaign](docs/HERMES-RELEASE-CAMPAIGN.md) completed all 11 scenarios: **10 passed, 1 incomplete, zero execution errors**. Every report replayed and campaign coverage verified. Older observations below are historical, not the current support status.

The final installed-package [Claude campaign](docs/RELEASE-CAMPAIGN.md) ran all eleven scenarios: **10 passed, 1 incomplete, 0 execution errors**, with all reports replayed and traces cross-checked. The incomplete case is preserved as a useful limitation.

See [CLAUDE-VALIDATION.md](CLAUDE-VALIDATION.md) for the historical 21-trial baseline, and [ADVANCED-VALIDATION.md](ADVANCED-VALIDATION.md) for the new nine-trial campaign: six passed, three incomplete, no execution errors.

The pre-publication pass also verified the [outage-only control](docs/OUTAGE-CONTROL.md): three live Claude trials passed. The dependency audit on 2026-09-16 reported zero known advisories for the locked tree; this is a point-in-time check, not a guarantee. [Dependency license inventory](docs/dependency-inventory.json) records installed package declarations.

## What was actually exercised

| Check | Observed outcome |
| --- | --- |
| Automated suite | 120 distinct tests passed: 119 in the suite plus the separately enabled installed-Hermes runtime test |
| Seeded engine invariants | 200,000 calls checked against an independent ledger oracle |
| HTTP load | 65,000 requests, 1,000 worlds, 64 concurrent same-invoice retries |
| MCP transport load | 96 calls through real stdio processes and official SDK clients |
| Lost events | 0; exact counts and sequence verified after restart |
| Duplicate payments under the same idempotency key | 0 |
| HTTP p95 / p99 | 23.08 / 31.84 ms on this Mac |
| Abrupt process termination | Committed payment and timeout event recovered after SIGKILL |
| Report manipulation | Edited event, ledger, fixture, and verdict rejected by replay |
| Installation | Clean-consumer tarball smoke test: dashboard, 11 reference scenarios, 10 MCP tools, timeout recovery and replay. A fresh installed v0.3.1 Claude payment-timeout trial passed with 8 business calls; v0.3.2 changes packaging checks and UI, not the evaluator |
| Installed Hermes | Version 0.18.2 discovered exactly ten lab tools and called the policy tool |
| Hermes decision-loop plumbing | Real AIAgent ran a complete timeout/retry/receipt workflow using a deterministic LOCAL provider fixture |
| Hermes live model campaign | 11 scenarios through Codex OAuth: 10 passed, 1 incomplete, zero execution errors; all reports verified |
| Claude Code live baseline | 21/21 passed across seven scenarios and three seeds; all reports replayed and tool traces cross-checked |
| Linux CI | Node 22 and Node 24 passed on GitHub Actions |
| Browser | Desktop rendering inspected; real browser WebMCP discovery, valid run, invalid-input rejection, and committed payment display checked |

Latest repeated stress artifact: [validation/stress-release.json](validation/stress-release.json). Historical artifact: [validation/stress-large.json](validation/stress-large.json). Timing is machine-specific; this measures a single local server, not a hosted service or a model benchmark.

The Hermes local-provider fixture exercises actual model API handling, tool schemas, MCP calls, side effects, completion, and metadata. Its decisions are predetermined test inputs. It proves integration plumbing, **not the safety of a language model**.

## Bugs found and fixed during this audit

- Unnecessary approvals could hide behind completed budget obligations. Approval justification is now captured at request time.
- A bank-change evaluator depended on a fixed invoice ID. It now derives required approvals from the fixture state.
- Cross-process updates were not transactional. State and event snapshots now commit together under `BEGIN IMMEDIATE`, with rollback tests.
- UTF-8 characters could split across request chunks. Bodies are now decoded after byte assembly; adapter output uses a streaming decoder.
- A source-imported runner pointed to a nonexistent MCP executable. Source and packaged runner paths now resolve to the built CLI.
- The UI could show stale seed/agent controls after opening a report. Controls now follow the selected reference run.
- There was no supervised real-agent command. The Hermes runner now bounds execution, checks tools, records configuration/runtime metadata, and separates execution failure from agent behavior.

## Remaining release decisions and limits

1. Independent human onboarding is unverified. Automated clean installations passed on macOS and Linux, but a separate person has not yet followed the README without assistance.
2. Coverage is limited to the tested configurations. More prompts, model versions, repeated trials and adversarial variations are ongoing validation work; a seed changes fixtures, not all attack strategies.
3. Publication remains an owner decision. Review the [publication audit](docs/PUBLICATION-AUDIT.md), including visible Git author metadata. npm package ownership is a separate prerequisite only if publishing to npm.

The full Hermes campaign is complete, including its incomplete outage-control result. Root dependency advisories and declared licenses were refreshed on September 17. Neither those checks nor passing agent trials certify safety.

The runner evaluates a fresh Hermes runtime with the chosen model and optional system prompt. It does not reproduce an existing agent's entire memory, skills, integrations, or deployment environment. Claude Code is now supported by the packaged `evaluate-claude` runner. See ADVANCED-VALIDATION.md for current live results.

Each open-source user runs their own local lab. A large download count does not require a shared server. A future hosted multi-tenant product would need separate authentication, process containment, scheduling, quotas, and storage design; those capabilities are not implied by these load measurements.

## Live monitoring verification — 2026-09-16

All 62 automated tests passed with the installed Hermes transport integration enabled. New UI coverage checks automatic run discovery, search, preserved expanded evidence and focus, disconnect recovery, bookmarked runs, and delayed responses after scenario navigation. The installed-tarball smoke check also passed.

A fresh authenticated Claude Code payment-timeout trial (seed 44, run `1496f6ae-d053-431f-91d5-a350a62f50dd`) passed with eight business tool calls, one simulated payment and one receipt. Its report passed deterministic replay, and the runner matched the client tool trace to server evidence. The browser displayed the run and restored it after reload through its local run URL. This check does not extend the previous campaign to other scenarios or establish live Hermes model behavior.
