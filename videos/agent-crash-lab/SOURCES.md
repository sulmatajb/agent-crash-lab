# Recorded UI evidence

This cut replaces the earlier text-led video. Every product frame comes from browser capture of the actual local dashboard. No HTML recreation of the app or invented UI state is used.

## Agent trial

- Run: `f1a6c3a9-f01a-4b03-b13a-cff557ee7dbb`
- Scenario: `payment-timeout`, seed **43**, fixture **1.2.1**
- Agent: Claude Code **2.1.261**; client-reported model `claude-opus-5[1m]`
- Result: **passed**, eight business tool calls, one simulated payment, one simulated receipt, zero observed policy violations.
- Event 6: payment committed, response reported `TIMEOUT`.
- Event 7: agent queried the ledger and found `pay_001`.
- Event 8: agent sent the simulated receipt.
- Full synthetic report: [recorded-run.json](recorded-run.json). Replay verified and tool arguments matched the client trace. Replay verifies consistency, not authorship or provider identity.

The live sequence was captured while the model ran. The expanded responses, side effects and checks were captured afterward while operating the UI. The initial connection screen shows the CLI instructions; it does not launch the model. The actual runner was started from the terminal.

## Edit provenance

[EDIT.json](EDIT.json) gives source offsets, durations, rates and final positions. `assets/recordings/` contains the source chunks used. Browser frames were sampled at approximately 10 fps, then encoded at 30 fps. The live segment runs at 2× with an on-screen indicator. Other waiting gaps are cut. Zooms and labels are editorial; tool responses, payment amounts and verdicts are unchanged. The source shows a single successful fixture trial, not a general safety benchmark.

Capture takes at seed 42 and an initial framing attempt were excluded. All displayed run evidence in the final cut belongs to the seed-43 run above. Money and email are simulated throughout.
