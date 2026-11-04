# Check setup before starting a trial

```bash
node dist/cli.js doctor --client claude
node dist/cli.js doctor --client hermes
node dist/cli.js doctor --client all
```

Select only the agent app you plan to use. `all` checks both; an absent optional agent app will make that combined check blocked. Use `--claude-command PATH`, `--hermes-python PATH` and `--hermes-profile DIR` for non-default installations.

The command returns structured JSON with individual checks and a suggested next step. It checks the Node version and packaged assets. Claude checks invoke only `--version` and `auth status --json`. Hermes checks load the selected runtime and inspect configuration using the existing read-only adapter. Neither path performs inference or modifies the source profile.

An unsupported Node version stops the check before agent app processes or Hermes/SQLite imports, with an upgrade step and exit 2. Claude-only diagnostics do not load the Hermes runtime or SQLite. Other lab commands still require the supported Node version.

| Exit | Meaning |
| --- | --- |
| 0 | Selected app checks passed; ready to attempt one bounded trial. |
| 1 | Something remains unverified, such as credential validity or an unsupported auth-status format. |
| 2 | A prerequisite is missing, a diagnostic failed, or the requested agent app is invalid. |

Being signed in to an agent app is not proof that a model is available. Hermes readiness always leaves provider access unverified: a configured key may be expired, belong to another provider, or be unnecessary for a local model. A missing API-key credential does not rule out OpenAI Codex OAuth.

The Hermes adapter supports **OpenAI Codex OAuth** with `evaluate --provider openai-codex --model YOUR_MODEL`, using an authenticated Hermes profile on the machine running the trial. `YOUR_MODEL` is a model available to that account; use `--hermes-profile DIR` to select a non-default profile. During evaluation, a separate resolver obtains the access token in memory and accepts only the standard ChatGPT Codex endpoint. It does not copy the auth store into the temporary test profile, but resolving OAuth may refresh credentials in the selected source profile. Other OAuth providers are not supported by this adapter.

Neither `doctor` nor `probe` resolves or refreshes OAuth credentials. `doctor --client hermes` can therefore return exit 1 even with a usable OAuth sign-in. Run `probe` to check Hermes MCP transport without inference, then one bounded `evaluate` trial to check model access. The [recorded Hermes campaign](HERMES-RELEASE-CAMPAIGN.md) used this OAuth route with Hermes 0.19.0; its one-trial-per-scenario results are not a guarantee that a current sign-in or model works.

Diagnostics omit account identifiers, emails, credential values, configuration contents and raw output from your agent app. Version checks are bounded to 15 seconds and 64 KiB of output per subprocess. An unavailable authentication-status interface produces a warning, not a claim that authentication works.

For compatibility, `doctor` with no `--client` keeps its original Hermes-only JSON format and behavior. Select an agent app explicitly with `--client` to use the new readiness schema and exit codes.
