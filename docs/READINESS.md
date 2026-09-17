# Check setup before starting a trial

```bash
node dist/cli.js doctor --client claude
node dist/cli.js doctor --client hermes
node dist/cli.js doctor --client all
```

Select only the client you plan to use. `all` checks both; an absent optional client will make that combined check blocked. Use `--claude-command PATH`, `--hermes-python PATH` and `--hermes-profile DIR` for non-default installations.

The command returns structured JSON with individual checks and a suggested next step. It checks the Node version and packaged assets. Claude checks invoke only `--version` and `auth status --json`. Hermes checks load the selected runtime and inspect configuration using the existing read-only adapter. Neither path performs inference or modifies the source profile.

An unsupported Node version stops the check before client subprocesses or Hermes/SQLite imports, with an upgrade step and exit 2. Claude-only diagnostics do not load the Hermes runtime or SQLite. Other lab commands still require the supported Node version.

| Exit | Meaning |
| --- | --- |
| 0 | Selected-client checks passed; ready to attempt one bounded trial. |
| 1 | Something remains unverified, such as credential validity or an unsupported auth-status format. |
| 2 | A prerequisite is missing, a diagnostic failed, or the requested client is invalid. |

An authenticated client is not proof that a model is available. Hermes always leaves provider access unverified: a configured key may be expired, belong to another provider, or be unnecessary for a local model. OAuth-only profiles remain unsupported by the Hermes adapter. Run `probe` for actual Hermes MCP transport, then a bounded `evaluate` trial for model access.

Diagnostics omit account identifiers, emails, credential values, configuration contents and arbitrary client stdout/stderr. Version checks are bounded to 15 seconds and 64 KiB of output per subprocess. An unavailable authentication-status interface produces a warning, not a claim that authentication works.

For compatibility, `doctor` with no `--client` keeps its original Hermes-only JSON format and behavior. Select a client explicitly to use the new readiness schema and exit codes.
