# Security model

Agent Crash Lab is a behavioral simulator, not a hostile-code sandbox.

## Boundaries

- All tool effects are synthetic. There are no payment processors, SMTP transports, live card credentials, or real inbox connectors.
- The server binds to loopback. Host and Origin validation resist DNS rebinding and browser cross-origin requests. Operator routes require a separate, per-server-start token embedded in the operator page.
- Run capabilities are random 256-bit tokens, stored hashed in SQLite. They authorize only one run’s task, tool calls, and completion. They cannot access reports or admin endpoints.
- The operator page and database are trusted. Any process that can read the operator page over loopback, the source, or the database may inspect grading. Do not give those capabilities to an agent under test and claim evaluator isolation.
- Never expose the port through a tunnel or reverse proxy. This alpha has no multi-user authentication, TLS termination, or hostile-client resource isolation.
- Finish a run to disable subsequent tool actions. Tokens persist across restarts and are not time-expiring; keep configurations private.
- HTTP error responses omit parser excerpts, rejected field names, and internal exception details. Invalid requests return `INVALID_REQUEST` (400); unexpected failures return `INTERNAL_ERROR` (500). Inspect the run before retrying a write after a server failure.
- The local database and JSON reports can contain everything an external agent submits. Do not feed real secrets to the lab. `.crashlab/` is ignored by Git and excluded from the npm package.
- MCP stdio uses the official SDK; the HTTP bridge refuses remote URLs and redirects. The lab does not inspect, restrict, or contain other agent tools or model-provider traffic.

## Evaluator limits

Rule-based checks measure named fixture conditions. They do not establish general resistance to prompt injection, fraud, data disclosure, or evaluation tampering. Synthetic private-data checks detect marked values, not arbitrary semantic equivalents. The suite intentionally allows unsafe simulated effects rather than relying on a guardrail to make every agent look safe.

## Reporting

Before public distribution, the repository owner should enable GitHub private vulnerability reporting. Report sensitive issues through that mechanism once available. Do not include real credentials, customer documents, or private model transcripts in public issues.

## Supervised Hermes runner

The adapter creates a temporary profile and enables only the exact ten lab tool schemas. It refuses a missing or expanded tool surface. It imports a supported model configuration and inference credentials from the selected profile without modifying that profile. It does not import OAuth stores, memory, skills, other MCP servers, or terminal/browser integrations. An optional user-provided system prompt is allowed. This is configuration isolation, not process-level sandboxing.

The child process is supervised with wall-clock/output bounds and cancellation. POSIX process groups are terminated on timeout; Windows subtree termination has not been verified. Provider calls may incur costs; iteration and output limits are not an exact monetary budget. Arbitrary provider stderr is drained without persistence. Known inference credentials and run tokens are redacted from structured adapter output. Reports may still contain user-provided prompts or model-generated text: inspect before sharing.

Replay verifies evidence consistency against the versioned engine. It does not cryptographically prove the origin of evidence and cannot defend against an attacker who controls the local process, source code, or database.

## Supervised Claude Code runner

The runner uses a fresh temporary working directory, disables built-in tools, requires strict MCP configuration, and skips user/project setting sources except the empty local directory. It validates the init event's exact tool/server list, refuses unexpected plugins, limits turns, output and wall time, and terminates the POSIX process group on timeout/cancellation. It checks final exit state, task completion protocol and trace/event consistency. The run-scoped connection file is removed after the trial.

This does not revoke the CLI process's filesystem or network permissions, replace OS containment, or erase all provider-side account context. Tool-surface checks depend on the client's emitted metadata. Supported behavior is verified against Claude Code 2.1.261; future CLI changes may require updates. Only tool-call traces and simulation reports are persisted; raw provider logs, narration and cost telemetry are omitted. Known environment credentials and run tokens are redacted from diagnostic text. Never give a tested agent real secrets.
