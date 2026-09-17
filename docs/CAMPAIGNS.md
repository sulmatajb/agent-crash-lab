# Reproduce and audit a campaign

Every supervised Claude or Hermes invocation writes a unique `<campaign-id>.manifest.json` next to its reports. The manifest is created before trials start, updated atomically after each saved report, and finalized when the runner exits normally or handles cancellation. Individual reports and the summary include the campaign ID. Reusing a directory does not overwrite older manifests, although `summary.json` still describes the most recent invocation. Prefer separate directories for baseline and candidate campaigns.

The writer serializes record/finalize requests and snapshots report data when submitted. In-memory state advances only after the manifest replacement succeeds; a failed write can be retried without a false duplicate or premature finalization. Repeated finalization preserves the first terminal status. Temporary files from failed writes are removed when the filesystem permits. Atomic replacement is not a guarantee of survival after power loss; manifests are not explicitly fsynced.

A manifest records:

- The planned scenario versions and seeds, including cases not reached after an early failure.
- Requested adapter, model/provider overrides, time limit and maximum turns.
- Lab version, exposed tool names, hashes of the task and additional system prompt, and a configuration fingerprint.
- Each report filename, exact file digest, observed verdict/execution state and app-reported model/runtime labels.

Raw prompts, executable paths, credentials and source profile contents are not copied into the manifest. Keep your own approved prompt/configuration source if you need to reproduce it. A fingerprint alone cannot reconstruct a prompt. Inherited agent app defaults and remote provider behavior are not fully captured, and app-reported model labels are not independently attested.

## Verify the saved campaign

```bash
node dist/cli.js verify-campaign results/claude/<campaign-id>.manifest.json
```

Verification checks the configuration fingerprint, report file digests, run/campaign identity, scenario coverage and deterministic replay of each report. A completed campaign must contain every planned case with completed execution. Edited/missing report files or invalid coverage produce exit 2. Report files must be regular files within the manifest directory; filenames cannot traverse directories, and symbolic links are rejected. File inputs are limited to 10 MiB and reports to 10,000 events.

Configuration fields must also have valid types and bounds; a matching hash cannot make an invalid configuration valid. Planned scenario/version pairs are checked even when no trial reached them. The writer rejects empty or duplicate scenario plans, reports from another campaign, unplanned cases, duplicate cases, and reports submitted after finalization.

The JSON result reports the recorded and missing case counts. A valid interrupted campaign can verify successfully while remaining **stopped** or **cancelled**; verification is a consistency check, not a passing evaluation or proof of authorship. Use report verdicts and execution states when deciding whether a campaign is acceptable.

| Status | Meaning |
| --- | --- |
| running | In progress, or left unfinished by an abrupt process/machine interruption. |
| completed | All planned trials reached completed execution; behavioral failures may still exist. |
| stopped | Execution failure or another early stop left the campaign unfinished. |
| cancelled | Operator cancellation was observed; partial evidence is retained. |

Prompt/configuration hashes are unsalted and are not encryption. They identify exact values for comparison; keep sensitive material out of prompts intended for distribution. A report and its manifest can both be forged, so file hashes do not establish authenticity.

Verification accepts regular files only, with a 10 MiB limit per manifest/report and a 64 MiB total across the manifest and its referenced reports. Reads stay bounded even if a file grows during verification, and report symlinks are rejected. Malformed JSON produces a generic error without printing an excerpt of the file. A rejected campaign is an input error, not an agent failure.

## Compare complete campaigns

`compare BASELINE_DIRECTORY CANDIDATE_DIRECTORY` verifies every campaign manifest and its report hashes before comparing cases. Both directories must contain completed campaigns with matching scenario versions and seeds. Running, stopped or cancelled campaigns produce exit 2 even if both directories contain the same partial subset. Reports bearing a campaign ID require their manifest alongside them; deleting a manifest cannot turn an interrupted campaign into a complete comparison.

For a deliberate comparison of selected cases from interrupted campaigns, pass the two individual report files instead. This checks those cases only, not the original campaign plan. Directories of standalone reports without campaign IDs remain supported. Keep unrelated campaigns in separate directories; duplicate cases or manifests are rejected.

Comparison `--out` creates a new file with owner-only permissions. An existing file, directory or symlink produces exit 2 without replacing it, including when the output aliases an input report. Choose a new output filename for each comparison; omitting `--out` prints the result without writing a file.
