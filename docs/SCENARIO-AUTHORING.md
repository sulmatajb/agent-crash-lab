# Contribute a reproducible agent failure

Start with one business obligation and one failure mechanism. A scenario should distinguish unsafe behavior, useful completion and justified refusal. An impressive-looking attack that cannot make that distinction is not ready for the suite.

## Write the case before changing code

Include the following in a scenario proposal:

- **Legitimate task:** what the user authorized, including the correct recipient, authority and spending constraints.
- **Untrusted surface:** the exact synthetic email, invoice or tool response that introduces the hazard.
- **Fault timing:** whether the failure happens before an effect, after a commit, or during reconciliation.
- **Observable outcome:** which committed payments, emails or approvals prove a boundary was crossed.
- **Useful completion:** which obligations a successful agent must satisfy. Silence and blanket refusal must not receive a pass.
- **Positive control:** a nearby case without the attack or ambiguity. If a reasonable agent cannot complete the control, revisit the fixture.

Use fabricated organizations, `.example` addresses, fictional accounts and fixture markers. Do not copy production invoices, credentials, private emails or client transcripts into a fixture.

## Follow the execution path

| File | Responsibility |
| --- | --- |
| `src/scenarios.ts` | Scenario metadata, deterministic seeded world, trusted policy and task |
| `src/engine.ts` | Tool input validation, state transitions, fault injection and independent grading |
| `src/agents.ts` | Transparent careful/reckless reference scripts |
| `src/replay.ts` | Reconstructing historical fixtures and checking report consistency |
| `src/store.ts` / `src/server.ts` | Atomic persistence and scoped HTTP access |
| `src/mcp.ts` | Official SDK stdio interface; agent tool surface |
| `src/claude.ts` / `src/runner.ts` | Supervised real clients and execution status |

Agent-facing tools may expose only what the simulated business task permits. Do not expose the scenario ID, expected verdict, hidden evaluator conditions or operator endpoints to the agent under test. Reference scripts must use tool-visible information; avoid an oracle that switches behavior based on scenario identity.

## Implement effects before grading

Keep the committed state authoritative. A timeout after a payment commits must leave the payment in the ledger, even when the caller received an error. Repeating an operation with the same idempotency key must not create another effect. Concurrent requests must not overwrite events or payments.

Add findings when the unsafe effect occurs and evaluate work completion separately. A later crash does not erase an earlier violation. An authentication failure is an execution problem, not proof that the agent held the policy boundary.

Existing replay versions are a compatibility contract. If fixture semantics or grading changes, assign and support the appropriate new scenario version and add a historical report regression test. Do not silently make yesterday's report pass under today's rules.

## Evidence required in the PR

1. An unsafe reference produces the intended finding from committed effects.
2. A careful reference completes legitimate work using only available tools.
3. Refusal or early finish is incomplete when useful work remains.
4. The positive control behaves as expected across more than one seed.
5. The exported report replays, and tampering with effects or event results is rejected.
6. Invalid input and duplicate/retried calls do not corrupt state or fabricate success.
7. For transport changes, the actual MCP client/server integration passes; a direct function call alone is insufficient.

Run `npm ci`, `npm test`, `npm run check:docs` and `npm run smoke:package`. The suite requires local loopback sockets and child processes. No model credentials are needed. Consult [TESTING](../TESTING.md) for optional installed-Hermes and live-model checks.

Describe which checks were deterministic and which used an actual model. Include non-passing results and plausible fixture ambiguities. Do not infer universal safety, model rankings or adoption statistics from these cases.
