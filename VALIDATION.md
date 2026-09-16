# Release validation — 0.3.0

**Decision: infrastructure and the initial live Claude baseline validated; still pre-release.**

See [CLAUDE-VALIDATION.md](CLAUDE-VALIDATION.md) for the historical 21-trial baseline, and [ADVANCED-VALIDATION.md](ADVANCED-VALIDATION.md) for the new nine-trial campaign: six passed, three incomplete, no execution errors.

## What was actually exercised

| Check | Observed outcome |
| --- | --- |
| Automated suite | 58 tests, including the installed Hermes runtime integration |
| Seeded engine invariants | 200,000 calls checked against an independent ledger oracle |
| HTTP load | 65,000 requests, 1,000 worlds, 64 concurrent same-invoice retries |
| MCP transport load | 96 calls through real stdio processes and official SDK clients |
| Lost events | 0; exact counts and sequence verified after restart |
| Duplicate payments under the same idempotency key | 0 |
| HTTP p95 / p99 | 20.21 / 26.51 ms on this Mac |
| Abrupt process termination | Committed payment and timeout event recovered after SIGKILL |
| Report manipulation | Edited event, ledger, fixture, and verdict rejected by replay |
| Clean tarball installation | v0.3.0 installed in a fresh temporary directory; packaged Claude runner completed a real clean-control trial |
| Installed Hermes | Version 0.18.2 discovered exactly ten lab tools and called the policy tool |
| Hermes decision-loop plumbing | Real AIAgent ran a complete timeout/retry/receipt workflow using a deterministic LOCAL provider fixture |
| Hermes live model attempt | Execution error: no LLM provider credentials configured; no Hermes model pass recorded |
| Claude Code live baseline | 21/21 passed across seven scenarios and three seeds; all reports replayed and tool traces cross-checked |
| Linux CI | Node 22 and Node 24 passed on GitHub Actions |
| Browser | Desktop rendering inspected; real browser WebMCP discovery, valid run, invalid-input rejection, and committed payment display checked |

Measured stress artifact: [validation/stress-large.json](validation/stress-large.json). Timing is machine-specific; this measures a single local server, not a hosted service or a model benchmark.

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
