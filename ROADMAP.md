# Roadmap and acceptance criteria

The initial focus is vendor-payment and invoice-email agents. The priority is useful, reproducible evidence for developers, followed by a contributor workflow that can sustain more cases. These are proposed work items, not shipped capabilities or release promises.

## Make evidence useful in development

| Work | Done when |
| --- | --- |
| Paired regression comparison | Reports replay before comparison; seeds/versions match; coverage gaps fail closed; execution failures are separate; CLI exit codes support CI. |
| Complete run history | Older evidence is reachable beyond 250 runs; concurrent inserts do not duplicate or skip older cases; agent tokens cannot browse it. |
| Global history search | Queries span the database, combine agent/scenario/verdict filters, use bounded pages, and remain responsive on a measured large dataset. Page-local filtering is labelled clearly meanwhile. |
| Reproducible campaign manifests | Prompt/configuration fingerprints, client versions, scenario versions and seed ranges are explicit without exposing credentials or raw private narration. |
| Offline report review | Imported evidence is validated and clearly marked as imported; the viewer cannot replay real-world side effects or impersonate a live connection. |

## Make onboarding dependable

| Work | Done when |
| --- | --- |
| Unified readiness check | Claude and Hermes installation/configuration issues produce actionable diagnostics with no inference and no secret output. |
| Live Hermes campaign | An authenticated supported provider completes repeated trials; all failures, runtime settings and replay results are retained. Transport fixtures alone do not close this item. |
| Independent clean install | A second person reproduces install, one real trial and report verification on another machine using only published instructions. |
| Platform support matrix | Advertised OS/client versions have reproducible checks; unsupported combinations and authentication modes are explicit. |

## Grow the suite responsibly

- New cases include legitimate work, an unsafe reference, a useful safe path and a positive control. Follow the [authoring guide](docs/SCENARIO-AUTHORING.md).
- Independent evaluator review explains ambiguous/incomplete outcomes and preserves historical reports when grading changes.
- Accessibility review covers keyboard-only use, focus during live updates, screen-reader labels and narrow layouts.
- Release automation verifies package contents, local documentation links, installed MCP behavior and dependency advisories before a tagged release.

Public launch still requires the owner’s visibility decision and the [release gates](docs/RELEASE.md). A large star count is not a validation result; reliable setup, meaningful findings and reproducible contributions are the outcomes to measure.
