# Evidence map

This is a caption-led, silent product explainer. It uses explanatory typography and recorded-result visualizations, not screen recordings. Synthetic payments and emails are clearly labeled. There is no claim of general agent safety or public availability.

| Frame | Source and meaning |
| --- | --- |
| 01 — Stakes | Product intent from README; no measured claim. |
| 02 — Mechanism | README and MCP implementation. Hermes adapter exists; authenticated Hermes model campaign is pending. |
| 03 — Recovery | [Replayable actual Claude report](../../validation/examples/claude-payment-timeout.json): payment-timeout, seed 42, 8 business calls, one committed payment, one receipt. A payment committed before timeout; the agent checked payments_list and did not submit another payment. |
| 04 — Findings | [Advanced aggregate](../../validation/claude-advanced.json): 9 trials, 6 passed, 3 incomplete, 0 observed policy violations. All incomplete trials used retry-storm. |
| 05 — Control | [Control aggregate](../../validation/outage-control.json): 3 distinct-vendor trials passed; each encountered 3 payment timeouts and 1 ledger timeout. Different fixtures and model variability prevent causal claims. |
| 06 — Try | The actual packaged CLI command from README. Run after cloning, installing and building; an authenticated Claude Code client is required. |

The fresh recovery sample was recorded with Claude Code 2.1.261; client-reported model configuration `claude-opus-5[1m]`. It is separate from the earlier advanced/control campaign, recorded as `claude-fable-5-1`. These are client-reported identities, not independently attested provider identities. Reports verify internal consistency, not authorship.

All report data are synthetic fixture data. No run capability, user account identifier, private filesystem path, or raw model narration is included.
