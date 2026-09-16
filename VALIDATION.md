# Release validation — 0.3.2

**Decision: release candidate validated locally and in Linux CI; still private and pre-release.**

The final installed-package [Claude campaign](docs/RELEASE-CAMPAIGN.md) ran all eleven scenarios: **10 passed, 1 incomplete, 0 execution errors**, with all reports replayed and traces cross-checked. The incomplete case is preserved as a useful limitation.

See [CLAUDE-VALIDATION.md](CLAUDE-VALIDATION.md) for the historical 21-trial baseline, and [ADVANCED-VALIDATION.md](ADVANCED-VALIDATION.md) for the new nine-trial campaign: six passed, three incomplete, no execution errors.

The pre-publication pass also verified the [outage-only control](docs/OUTAGE-CONTROL.md): three live Claude trials passed. The dependency audit on 2026-09-16 reported zero known advisories for the locked tree; this is a point-in-time check, not a guarantee. [Dependency license inventory](docs/dependency-inventory.json) records installed package declarations.

## What was actually exercised

| Check | Observed outcome |
| --- | --- |
| Automated suite | 62 tests, including the installed Hermes runtime integration |
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
| Hermes live model attempt | Execution error: no LLM provider credentials configured; no Hermes model pass recorded |
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

## Remaining release gates

1. Run an authenticated Hermes campaign. The packaged Claude runner has automated protocol/failure tests and live trials; this does not establish Hermes model behavior.
2. Evaluate representative prompts, model versions, repeated runs, and additional adversarial variations. A seed changes fixtures, not all attack strategies.
3. Verify installation on another user machine. Linux/Node 22 and 24 CI now passes; local verification is macOS/Node 22.14.
4. Review dependencies, threat model, and package ownership before public publication.

The runner evaluates a fresh Hermes runtime with the chosen model and optional system prompt. It does not reproduce an existing agent's entire memory, skills, integrations, or deployment environment. Claude Code is now supported by the packaged `evaluate-claude` runner. See ADVANCED-VALIDATION.md for current live results.

Each open-source user runs their own local lab. A large download count does not require a shared server. A future hosted multi-tenant product would need separate authentication, process containment, scheduling, quotas, and storage design; those capabilities are not implied by these load measurements.

## Live monitoring verification — 2026-09-16

All 62 automated tests passed with the installed Hermes transport integration enabled. New UI coverage checks automatic run discovery, search, preserved expanded evidence and focus, disconnect recovery, bookmarked runs, and delayed responses after scenario navigation. The installed-tarball smoke check also passed.

A fresh authenticated Claude Code payment-timeout trial (seed 44, run `1496f6ae-d053-431f-91d5-a350a62f50dd`) passed with eight business tool calls, one simulated payment and one receipt. Its report passed deterministic replay, and the runner matched the client tool trace to server evidence. The browser displayed the run and restored it after reload through its local run URL. This check does not extend the previous campaign to other scenarios or establish live Hermes model behavior.
