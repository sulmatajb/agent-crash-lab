# Publication audit — September 16, 2026

Scope: main commit `592114eda3643cefc8a66cb3552e45f9da8833bd`, before adding these audit documents. The repository remains private.

## Git history credential scan

Gitleaks 8.30.1, downloaded from its official GitHub release and verified against the published archive checksum, scanned all local refs with `git --redact --log-opts=--all`. It scanned 48 commits and approximately 1.05 MB of changed text.

The scanner reported 19 generic-key matches. All were reviewed: they are `idempotency_key` fields in synthetic payment trial reports or their HTML replay excerpts. They identify simulated payment requests and do not authorize access. No other matches were reported. No broad allowlist was added, and no history was rewritten.

The redacted scanner report stays local rather than adding historical author metadata to the public repository. To repeat with a separately installed Gitleaks binary, run from the repository root:

```bash
gitleaks git --redact --log-opts=--all --report-format json --report-path /tmp/crashlab-history-scan.json .
```

The command returns a findings exit code for these synthetic keys. Review each result; do not treat the nonzero exit as evidence of an actual credential leak or suppress all keys by name.

## License inventory

The 94 production lockfile entries declare MIT, ISC or BSD licenses and include installed license files. See [dependency inventory](DEPENDENCY-LICENSES.md) and [third-party notices](THIRD-PARTY-NOTICES.md). This change adds the missing standalone Inter font license and clarifies that the bundled GSAP file is not MIT-licensed by this project.

## Remaining publication checks

This is a text-pattern scan, not proof that the repository contains no private information. Images, recordings, audio, Git author metadata, previously unreachable objects and content without recognizable credential patterns require separate review. The scanner's byte count does not imply every binary was inspected. Continue the tracked-media and personal-information review before changing visibility.

Review development/rendering-tool licenses and the registry-component provenance before redistributing those sources. The npm runtime dependency inventory alone does not close that check. Refresh the dependency advisory scan at publication time. Authenticated Hermes behavior and independent fresh-machine installation remain separate pilot gates.
