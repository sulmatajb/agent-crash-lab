# Try the alpha with your own AI agent

The useful question is whether someone can install the lab, run their agent, understand the result, and repeat the test after a change. A passing model verdict is not required for a successful pilot: a reproducible failure with understandable evidence is valuable.

## 1. Install on a fresh machine or checkout

Use a machine with Node.js 22.13+ and access to this currently private repository. Follow the [README quick start](../README.md#quick-start), without copying an existing `node_modules` directory or database. Record:

```bash
node --version
npm --version
git rev-parse HEAD
```

Open the local dashboard. Confirm that an empty history is understandable and that **Test your agent** leads to connection instructions. Do not count a reference-script comparison as a live-agent test.

## 2. Run one real trial

Choose one route. The lab uses simulated payments and email; use a dedicated agent profile with only the lab tools. Your agent's normal inference provider is still used.

For a supported supervised runner:

```bash
# Claude Code: installed and authenticated on this machine
node dist/cli.js doctor --client claude
node dist/cli.js evaluate-claude --scenario payment-timeout --seed 42 --runs 1 --timeout 180 --max-turns 30 --out results/pilot-baseline
```

Or:

```bash
# Hermes: installed with a supported authenticated provider or local model
node dist/cli.js doctor --client hermes
node dist/cli.js probe
node dist/cli.js evaluate --scenario payment-timeout --seed 42 --runs 1 --timeout 180 --max-turns 30 --out results/pilot-baseline
```

For another AI agent, use the dashboard's generated local stdio MCP configuration and displayed task. Follow [manual connection instructions](USAGE.md#connect-your-own-agent). Record the agent app and model versions and export the finished run's report. Manual connections do not provide the same process supervision or campaign manifest as the built-in runners; do not claim equivalent isolation.

A successful transport probe does not test the model. Stop and record authentication or connection errors before attempting a larger campaign.

## 3. Inspect the actual outcome

Open the run in history. Check the agent identity, scenario, seed and execution status before interpreting its verdict. Follow the payment timeout and the next tool calls: did the agent inspect the ledger, retry with the same key, duplicate the payment, or leave work unfinished? Check the committed ledger and receipt, not just the agent's final message.

For a supervised run, use the filenames printed in its summary:

```bash
node dist/cli.js verify results/pilot-baseline/REPLACE_WITH_RUN_ID.json
node dist/cli.js verify-campaign results/pilot-baseline/REPLACE_WITH_CAMPAIGN_ID.manifest.json
```

The uppercase filename segments are placeholders. Manual runs use the downloaded report path with `verify`. Verification checks consistency, not authorship or general reliability.

## 4. Test whether a change helps

Keep the same scenario and seed. If you change a prompt, save it in a local UTF-8 file and pass `--system-prompt /path/to/prompt.txt` to the same supervised command, using `--out results/pilot-candidate`. Keep the original reports. Then:

```bash
node dist/cli.js compare results/pilot-baseline results/pilot-candidate
```

For manual trials, compare the two exported report files. Change one variable at a time. One paired run is an initial check; repeat across seeds and relevant scenarios before interpreting a trend. A refusal that avoids violations but leaves required work unfinished is not a pass.

## 5. Send useful feedback

Copy this into a private issue or message after removing credentials and private content:

```text
Commit / OS / Node version:
Agent app version / model / provider (no keys):
Supervised runner or manual MCP:
Scenario / seed:
Setup step that failed or needed explanation:
Execution status / behavioral verdict:
Expected behavior / observed tool actions:
Could I explain the result from the evidence?
Could I rerun the same case after a change?
Report verification result:
```

Do not attach the SQLite database, MCP capability configuration, provider logs, or raw agent prompts. Inspect any report before sharing: tool arguments and model output can contain submitted data. Preserve the original privately; a redacted copy may no longer pass replay verification and should be labelled accordingly.

## Pilot completion

Record at least one independent clean installation and one authenticated live Hermes campaign before announcing those support claims. For additional agent apps with MCP support, document the exact tested agent app version and connection method. Fix observed setup blockers or misleading evidence first; retain non-passing agent outcomes rather than hiding them.
