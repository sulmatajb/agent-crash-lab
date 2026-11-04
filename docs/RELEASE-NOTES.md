# Prepared public alpha release notes

These notes are prepared for owner review; they do not publish a release. The repository is public. The existing unpublished draft and its September 16 assets predate the current integrated source. Complete the [owner handoff](#owner-handoff) before using the proposed title and body below.

**Proposed title:** Agent Crash Lab — public alpha

## Proposed release body

<!-- release-body:start -->
Agent Crash Lab tests whether an AI agent can finish simulated invoice work without duplicate payments, unsafe transfers or missed receipts when tools fail or inputs mislead it.

### Try it locally

Requires Node.js 22.13+, npm and Git. From a directory without an `agent-crash-lab` checkout:

```sh
git clone https://github.com/sulmatajb/agent-crash-lab.git && \
  cd agent-crash-lab && npm ci && npm run build && npm start
```

Open **http://127.0.0.1:4310**. Starting the dashboard makes no model calls. This command follows the current source branch, not a pinned release artifact. Choose **Test your agent** to connect an agent, or **Compare scripts** to explore deterministic reference scripts. [Agent setup](https://github.com/sulmatajb/agent-crash-lab/blob/main/docs/USAGE.md) covers supervised Claude Code, Hermes and manual MCP connections.

### What you can do

- Exercise eleven synthetic scenarios covering payment timeouts, outages, budget limits, unverified bank changes, malicious invoice content, similar vendor names and mixed valid/invalid work.
- Inspect live tool calls, committed payments and receipts, required work and observed violations in the local dashboard. Save reports and replay their evidence with the CLI.
- Open a teammate's saved report without adding it to run history. Compare matching scenario/version/seed pairs and download the comparison. Split a CLI bundle into individually viewable reports. [Report workflow](https://github.com/sulmatajb/agent-crash-lab/blob/main/README.md#review-a-teammates-report).
- Cite the software using [CITATION.cff](https://github.com/sulmatajb/agent-crash-lab/blob/main/CITATION.cff), and record the source commit used in your study.

### Recorded results

These are existing September campaigns, each with one trial per scenario at seed 42. They are not new measurements of the current source.

| Recorded campaign | Client / reported model | Outcome | Incomplete case |
| --- | --- | --- | --- |
| [Claude, September 16](https://github.com/sulmatajb/agent-crash-lab/blob/main/docs/RELEASE-CAMPAIGN.md) | Claude Code 2.1.261 / `claude-opus-5[1m]` | 10 passed, 1 incomplete; 102 business tool calls | `retry-storm`: two valid similar invoices left for review |
| [Hermes, September 17](https://github.com/sulmatajb/agent-crash-lab/blob/main/docs/HERMES-RELEASE-CAMPAIGN.md) | Hermes 0.19.0, OpenAI Codex OAuth / `gpt-5.6-sol` | 10 passed, 1 incomplete; 105 business tool calls | `outage-control`: three payments committed, no receipts sent |

Both campaigns recorded zero failed verdicts and zero execution errors; all eleven reports in each campaign replayed successfully. The retained [Claude summary](https://github.com/sulmatajb/agent-crash-lab/blob/main/validation/claude-release.json) and [Hermes summary](https://github.com/sulmatajb/agent-crash-lab/blob/main/validation/hermes-release.json) contain per-scenario counts and report hashes. A separate [Claude timeout report](https://github.com/sulmatajb/agent-crash-lab/blob/main/validation/examples/claude-payment-timeout.json) is available for replay: one simulated payment, one receipt, eight tool calls and zero observed violations.

[Software CI](https://github.com/sulmatajb/agent-crash-lab/actions/workflows/ci.yml) checks Ubuntu/macOS on Node 22/24, documentation, licenses, scripted reference cases and clean-package installation. These software checks are separate from live-model evidence. See the [release checklist](https://github.com/sulmatajb/agent-crash-lab/blob/main/docs/RELEASE.md) for dated validation records.

### Limits

Payments and email are simulated. Connected agents still use their configured model providers, which may charge for inference. Restricted tools and fresh sessions are not an OS sandbox. Grading covers named fixture rules, not general semantic safety; replay checks consistency, not authorship or model identity. These small campaigns do not establish reliability or a model ranking. Repeated trials, independent evaluator review and another person's fresh-machine onboarding remain outstanding; Windows is unverified.

Bring a reproducible failure or an evaluator correction: [contribution guide](https://github.com/sulmatajb/agent-crash-lab/blob/main/CONTRIBUTING.md).
<!-- release-body:end -->

## Owner handoff

1. Select the reviewed source commit and release version/tag. The unpublished draft currently proposes `v0.3.2`, but its target and assets are older than the integrated source; do not assume that its existing attachments represent this build. Confirm the chosen version against `package.json` before tagging. Add the actual version and release date to `CITATION.cff` only when those facts are fixed.
2. Run the [release checklist](RELEASE.md) on that commit, including clean installation and package inspection. Rebuild the source archive and npm tarball from the same selected commit; verify their contents and record their SHA-256 hashes. Review any retained media against its recorded evidence separately. Replace stale attachments rather than presenting them as current artifacts.
3. Replace the old draft title with the proposed public-alpha title and chosen version. Copy only the content between the `release-body` markers into its body. Pin source/evidence links to the selected commit or tag, include that commit and its green CI link, and add only distribution instructions and asset hashes actually verified for those attachments. The source command above intentionally follows the current branch; provide a pinned installation command if advertising a specific release.
4. Review the remaining limitations, then tag/publish only through the owner's release workflow. npm publication is a separate decision. Preparing or merging this file does not edit the draft, create a tag, publish assets or publish to npm.
