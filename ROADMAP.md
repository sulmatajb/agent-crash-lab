# Roadmap and acceptance criteria

The initial focus is vendor-payment and invoice-email agents. The priority is useful, reproducible evidence for developers, followed by a contributor workflow that can sustain more cases. Status below reflects the integrated main build; remaining acceptance work is listed separately. A merged implementation does not establish compatibility with every agent app.

## Make evidence useful in development

| Work | Status | Acceptance criteria |
| --- | --- | --- |
| Paired regression comparison | Implemented | Reports replay before comparison; seeds/versions match; coverage gaps fail closed; execution failures are separate; CLI exit codes support CI. |
| Complete run history | Implemented | Older evidence is reachable beyond 250 runs; concurrent inserts do not duplicate or skip older cases; agent tokens cannot browse it. |
| Global history search | Implemented | Queries span the database, combine agent/scenario/verdict filters, use bounded pages, and remain responsive on a measured large dataset.  |
| Reproducible campaign manifests | Implemented | Prompt/configuration fingerprints, client versions, scenario versions and seed ranges are explicit without exposing credentials or raw private narration. |
| Offline report review | Implemented for single reports and matched pairs | Open one UTF-8 JSON report up to 10 MiB in the running local dashboard; verify simulation consistency and recompute checks; mark imported identity as unverified and the view as read-only. No persistence, live-run actions, polling or real-world effects. The dashboard can compare a baseline/candidate pair using the CLI rules with a combined 10 MiB limit, then inspect either snapshot. Campaign/batch imports and a standalone static viewer remain outside this milestone. |

## Make onboarding dependable

| Work | Status | Acceptance criteria |
| --- | --- | --- |
| Unified readiness check | Implemented | Claude and Hermes installation/configuration issues produce actionable diagnostics with no inference and no secret output. |
| Live Hermes campaign | Remaining | An authenticated supported provider completes repeated trials; all failures, runtime settings and replay results are retained. Transport fixtures alone do not close this item. |
| Independent clean install | Remaining | A second person reproduces install, one real trial and report verification on another machine using only published instructions. |
| Platform support matrix | Partial | Fresh Ubuntu/macOS CI covers Node 22/24 and installed packages. Windows is unverified; live agent-app/provider combinations still need separately recorded trials. |

## Grow the suite responsibly

- New cases include legitimate work, an unsafe reference, a useful safe path and a positive control. Follow the [authoring guide](docs/SCENARIO-AUTHORING.md).
- Independent evaluator review explains ambiguous/incomplete outcomes and preserves historical reports when grading changes.
- Accessibility review covers keyboard-only use, focus during live updates, screen-reader labels and narrow layouts.
- Release automation verifies package contents, local documentation links, installed MCP behavior and dependency advisories before a tagged release.

Public launch still requires the owner’s visibility decision and the [release gates](docs/RELEASE.md). A large star count is not a validation result; reliable setup, meaningful findings and reproducible contributions are the outcomes to measure.

## Current launch focus

Use the [alpha pilot guide](docs/ALPHA-PILOT.md) to test installation, one real agent workflow, and a repeatable prompt comparison. Prioritize observed setup failures and misleading evaluations before expanding the feature set. The [integrated build evidence](docs/RELEASE.md#integrated-build-evidence) records which checks actually ran.
