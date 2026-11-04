# Codex CLI adapter

Run the lab's synthetic payment task through a locally installed Codex CLI and retain the actual lab effects as replayable evidence. The adapter was checked against **codex-cli 0.158.0** using deterministic local fixtures. No live model result is claimed by that check.

## Run one trial

Build the lab and sign in to Codex using its own login flow. Check the selected installation without inference:

```bash
codex --version
codex login status
```

Then replace `YOUR_MODEL` with the exact model identifier you intend to evaluate:

```bash
node dist/cli.js evaluate-codex --model YOUR_MODEL --scenario payment-timeout --seed 42 --runs 1 --timeout 180 --max-tool-calls 30 --out results/codex
```

Inference uses the existing Codex authentication and can consume your account's allowance or incur provider charges. The runner does not read or copy credentials itself. It does not choose or substitute a model. `--codex-command PATH` selects another installed executable. `--system-prompt FILE` supplies the same validated UTF-8 instruction file accepted by the other runners; Codex receives it as developer instructions.

Use `all`, `advanced`, or an individual scenario ID. Trials run one at a time. `--runs` increments the seed in fresh sessions. The campaign stops after an execution error, and Ctrl+C preserves completed reports and the active trial's effects. Exit codes are 0 for all passed, 1 for failed/incomplete, 2 for execution errors, and 130 for cancellation.

## Configuration and evidence

Each trial uses a fresh temporary working directory, read-only sandbox, no approval prompts, ephemeral session, `--ignore-user-config` and `--ignore-rules`. The existing `CODEX_HOME` remains available for authentication. The adapter disables shell, patch, web, app, plugin, memory, multi-agent, code-mode and related native tools, suppresses skill and project instructions, and configures the lab's ten stdio MCP tools with explicit preapproval (`default_tools_approval_mode="approve"`). This preapproval applies only to the synthetic lab server. Codex 0.158.0 also advertises its three native MCP resource helpers (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`); the lab does not expose resources in supervised runs. The adapter does not claim these helpers are absent. The run capability is passed through the subprocess environment, not in command-line arguments.

The supervisor consumes Codex JSONL events, rejects observed non-lab tool calls, requires `policy_get` first and `lab_finish` last, and compares completed tool calls with the simulation's recorded events in order. Injected failures such as a payment response timeout remain ordinary scenario evidence. A process/transport failure, missing completion, inconsistent trace or exceeded bound records an execution error rather than a successful trial. Observed policy violations remain visible even if execution later fails.

The campaign directory contains individual reports, a manifest, a summary and tool-call traces. Raw provider output, stderr, reasoning, responses and token-usage telemetry are not saved. The manifest records the requested model, task and instruction hashes, wall-clock timeout, and tool-call limit. `max_turns` is null for Codex; it does not pretend this is a model-iteration limit. Verify a completed campaign with:

```bash
node dist/cli.js verify-campaign results/codex/<campaign-id>.manifest.json
```

Replace `<campaign-id>` with the manifest filename printed by the runner. [Read verdicts and compare runs](COMPARISON.md).

## Limits

- Codex's JSONL stream does not attest the complete tool catalog or the resolved model. Reports leave the observed model absent; the requested label is recorded separately. Trace files explicitly set `verified_tool_surface` to false. Managed configuration or another CLI version may change behavior; this is not process-level containment or proof that every possible tool is absent.
- `--timeout` bounds wall-clock time per trial. `--max-tool-calls` bounds observed calls (1–100, including `lab_finish`), stopping the process when the stream exceeds the limit. A call may already have begun before its event is received. Neither bound is a dollar cap or a guaranteed bound on model-internal work.
- Offline fixtures validate transport and evidence handling, not model behavior. The [four-cell pilot checkpoint](PILOT.md) records real model trials separately from the fixtures and the future scored study. Do not compare fixture outcomes with the [recorded model campaigns](RESULTS.md).

The implementation follows the [Codex 0.158.0 configuration schema](https://github.com/openai/codex/blob/rust-v0.158.0/codex-rs/core/config.schema.json) and [JSONL item types](https://github.com/openai/codex/blob/rust-v0.158.0/sdk/typescript/src/items.ts). Older installations missing the required exec flags fail before a campaign starts.
