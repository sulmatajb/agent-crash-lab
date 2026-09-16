# Installed-package Claude campaign — 0.3.2

On 2026-09-16, a clean temporary consumer installed the actual 0.3.2 npm tarball and ran `agent-crash-lab evaluate-claude --scenario all`. Each scenario used a fresh Claude Code session and seed 42. The client reported version 2.1.261 and model `claude-opus-5[1m]`; this label is metadata, not independent attestation of provider identity.

**10 passed, 1 incomplete, 0 failed, 0 execution errors across 11 scenarios and 102 business tool calls.** All eleven reports replayed successfully; recorded tool names and arguments matched the client tool traces, with `lab_finish` last. The command exited 1 because an incomplete scenario is not a successful campaign.

The incomplete case was `retry-storm`: the agent paid one invoice and requested review for two similar-looking but distinct valid invoices. It recorded no policy violations, but missed two payment-and-receipt obligations. The `outage-control` case, with distinct vendors, completed all three payments and receipts in 15 business calls. Preserve this difference; do not describe the campaign as an all-pass benchmark.

[Machine-readable results](../validation/claude-release.json) include each verdict, fixture version, side-effect counts, report hash and trace hash. Raw local campaign records are deliberately excluded from source control. A separate [replayable timeout example](../validation/examples/claude-payment-timeout.json) is included for inspection.

To reproduce with an authenticated Claude Code installation after building the repository:

```sh
node dist/cli.js evaluate-claude --scenario all --out results/my-campaign
```

This is one run per scenario, not a statistical estimate of reliability. The runner constrains a fresh client's tool configuration; it is not an operating-system sandbox and does not reproduce a deployed agent's complete memory or integrations. Historical baseline and advanced campaigns used a different reported model configuration and are documented separately. The launch video cites those historical advanced trials explicitly; its 6/9 result is not this newer 10/11 campaign.
