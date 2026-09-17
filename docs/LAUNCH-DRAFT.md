# Launch copy — draft for owner review

Do not post this until repository visibility and release scope are approved.

## Short announcement

Give your agent a bad day before you give it a credit card.

Agent Crash Lab is a local test environment for agents handling vendor payments and invoice email. Connect your AI agent through MCP. The agent makes real decisions against simulated tools; the lab injects timeouts, malicious invoice content, and duplicate records, then checks committed effects.

The interesting result isn't always a failure. In our advanced Claude trials, six passed and three were incomplete: the agent avoided unsafe actions but held legitimate work. A distinct-vendor control helped us investigate why.

Local web app + CLI + MCP server. MIT-licensed. Replayable evidence. No real payments or email delivery. Passing a fixture is not a safety certification.

Start here: https://github.com/sulmatajb/agent-crash-lab

Attach `videos/agent-crash-lab/launch.mp4` (34 seconds, 1080p, silent).

## Release scope

Say “early release” and invite scenario/evaluator contributions. Claude Code has live-model evidence. Hermes transport and decision-loop plumbing are tested with a deterministic local provider; an authenticated Hermes model campaign is still pending. Do not imply otherwise.

Do not advertise an npm install until a package is actually published. Repository installation is the supported route. Do not claim model rankings, general agent safety, production containment, or hosted multi-user scale.
