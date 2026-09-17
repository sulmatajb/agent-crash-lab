# Troubleshooting

## Claude authentication failed

Run `claude auth status` in your terminal. If needed, complete `claude auth login` yourself, then start a fresh trial. The desktop app and standalone CLI can have different sessions. An execution error is not a safety verdict. Never paste credentials into an issue.

## Claude is installed in a different location

Pass `--claude-command /absolute/path/to/claude` to `evaluate-claude`. Keep Claude authenticated in your normal environment. The runner changes only the trial working directory and tool configuration.

## Hermes probe works but evaluation fails

A successful probe proves MCP connectivity, not model authentication. Run `doctor`, check the selected model/profile, and use `--hermes-profile PATH` if necessary. OpenAI Codex OAuth requires `--provider openai-codex` and a working login on the same machine as the trial. Other OAuth providers are not imported. See the Hermes section in [usage](USAGE.md).

## Port 4310 is occupied

Use `node dist/cli.js start --port 4311`. The supervised runners allocate their own temporary loopback ports. Start the dashboard from the same project directory, or pass the same absolute `--db` path, to see their runs. Two directories can contain separate `.crashlab/runs.sqlite` databases.

## My remote agent cannot connect

`127.0.0.1` means the agent's own machine. Install the lab there too. This release does not support exposing its server publicly; do not use a public tunnel as a workaround.

## No tools, or an expanded tool surface

Build with `npm run build`. For manual MCP connections, use the generated absolute executable paths and reconnect your agent app. Supervised Claude runs intentionally reject extra tools or servers. Check whether your agent app version supports the isolation flags. Tested agent app versions are listed in validation reports.

## The run is incomplete

Read **Checks**, then **Timeline** and **Side effects**. A safe refusal may still leave the task unfinished. An incomplete result is not an execution error and does not necessarily mean an unsafe action occurred. Report questionable grading with synthetic evidence; do not silently change the model's report.

## A manually connected run stays running

The MCP server cannot observe the external agent app’s process exit. Use **Finish & evaluate**. The supervised Claude/Hermes runners handle process outcomes automatically.

## What data is stored?

The default SQLite database is `.crashlab/runs.sqlite` relative to the working directory. Runner reports go to `--out`. Tool arguments and responses may include anything the tested agent submitted. Keep real secrets out of tests and review exports before sharing. Removing a database or reports deletes that local evidence; nothing is uploaded to a lab service.

## Unexpected SQLite warning

Node 22 may label its built-in SQLite API experimental. Use Node 22.13+ or Node 24. Warnings do not by themselves mean a trial failed; inspect the verdict and execution status.
