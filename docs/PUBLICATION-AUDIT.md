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

## Reproducible dependency inventory follow-up

The root lockfile inventory now includes 73 development entries alongside the 94 production entries. All 167 entries declare a license; optional platform packages are counted even when not installed locally. CI checks that the generated inventory matches the lockfile and rejects missing declarations. This extends metadata coverage, not license compatibility approval. External rendering tools and registry components remain outside the root lockfile and still require their separate provenance/terms review.

## Video source provenance follow-up

The [third-party notices](THIRD-PARTY-NOTICES.md#hyperframes-renderer-and-registry-components) now pin upstream sources and record exact hashes for all three retained HyperFrames registry components. Terminal and whip-pan sources match byte-for-byte; headline has editor/serialization changes with unchanged JavaScript and CSS. The upstream Apache 2.0 text is included locally, and the renderer package's license declaration is recorded. This closes the unidentified-source gap for those three files. Transitive rendering dependencies, tracked-media privacy review and Git metadata review remain separate publication work.

## Refresh on September 17, 2026

The reviewed source was main commit `03f1624` (including the Hermes OAuth fix). Gitleaks 8.30.1 scanned all local Git refs again with redaction. Its 19 findings were exclusively synthetic `idempotency_key` values in payment fixtures and their replay excerpts, matching the previous review. No new credential-pattern findings were reported. No broad allowlist was introduced.

The root `npm audit --json` reported zero known advisories, and the checked license inventory matched all 167 root lockfile entries. This is a point-in-time dependency check. External video rendering dependencies are outside that lockfile.

The three tracked PNG screenshots/poster and sampled frames from all tracked MP4s showed the lab UI, synthetic records, and authored marketing graphics. The connect-screen sample showed a CLI invocation, not a generated capability token. Sampling does not inspect every frame or prove the absence of private information. Git history uses the owner’s name and personal email address as author metadata; making the repository public makes that metadata public too. No history was rewritten.
