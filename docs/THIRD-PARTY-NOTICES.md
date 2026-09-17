# Third-party notices

The repository's MIT license covers project-authored code, graphics and music. Third-party files retain their own licenses.

## Runtime dependencies

The [production dependency inventory](DEPENDENCY-LICENSES.md) lists the 94 installed production dependency entries in the current lockfile: 84 MIT, seven ISC, two BSD-3-Clause and one BSD-2-Clause. Each installed entry includes a LICENSE, LICENSE.md or LICENSE.txt file. Dependencies are installed through npm and are not relabelled as project-authored code.

## Inter font

`videos/agent-crash-lab/assets/inter-latin.woff2` is Inter, copyright the Inter Project Authors, distributed under SIL Open Font License 1.1. The [copyright and full license](licenses/Inter-OFL.txt) are included here. [Upstream license](https://github.com/rsms/inter/blob/master/LICENSE.txt).

## GSAP animation library

`videos/agent-crash-lab/assets/gsap.min.js` contains GSAP 3.14.2 and retains its upstream copyright header and license link. It is governed by the [GSAP Standard License](https://gsap.com/community/standard-license/), not the repository's MIT license. It is used by the authored demo composition; it is not a runtime dependency of the lab's CLI or dashboard. Review those terms before repurposing the bundled library.

## Demo assets

The demo score is synthesized by `videos/agent-crash-lab/build-beat.py` without third-party audio samples. Recorded UI, synthetic trial data and authored graphics come from this project. See [media provenance](https://github.com/sulmatajb/agent-crash-lab/blob/main/videos/agent-crash-lab/SOURCES.md) for the underlying run and editorial treatment. The HyperFrames rendering tool and installed registry components retain their upstream terms, detailed below.

## HyperFrames renderer and registry components

The pinned `hyperframes@0.8.43` npm package declares Apache-2.0 and identifies `heygen-com/hyperframes`, directory `packages/cli`, as its source repository. It is invoked separately for rendering and is not part of the lab runtime lockfile. This check records the tool's declaration; it does not inventory all transitive rendering dependencies.

The three retained component sources were compared against upstream commit `a8a9fdb0fe88d97c99d7bd30da94e64dd0a96f3d`. That repository includes the [Apache 2.0 license](https://github.com/heygen-com/hyperframes/blob/a8a9fdb0fe88d97c99d7bd30da94e64dd0a96f3d/LICENSE); an exact [local copy](licenses/HyperFrames-Apache-2.0.txt) accompanies these notices. Upstream source comments remain intact. No separate root or registry-component NOTICE file was present in the inspected tree.

| Component / pinned upstream source | Local SHA-256 | Comparison |
| --- | --- | --- |
| [code-terminal-run](https://github.com/heygen-com/hyperframes/blob/a8a9fdb0fe88d97c99d7bd30da94e64dd0a96f3d/registry/components/code-terminal-run/code-terminal-run.html) | `f00d6259050d2c5cb3a12fd4a43b96159263f7d38462cd6d0f845b2f83ad43b5` | Exact byte match. |
| [headline-slam](https://github.com/heygen-com/hyperframes/blob/a8a9fdb0fe88d97c99d7bd30da94e64dd0a96f3d/registry/components/headline-slam/headline-slam.html) | `e8670c6866aa30f0e2ad39aa2bca743892e8d221c04133d179d7b576ee4aa1a0` | Modified: HTML serialization and data-hf-id editor attributes; script/style text unchanged. |
| [whip-pan-cut](https://github.com/heygen-com/hyperframes/blob/a8a9fdb0fe88d97c99d7bd30da94e64dd0a96f3d/registry/components/whip-pan-cut/whip-pan-cut.html) | `2e21c04b6b72c4c4087b9e926da4f83b95940e798b9e5ad26e4845c41e6df7b7` | Exact byte match. |

`headline-slam.html` is a locally modified copy: the differences are HTML serialization and editor `data-hf-id` attributes. Its JavaScript and CSS match upstream. `hyperframes.lock.json` records upstream installation hashes, so its headline hash is not the hash of the current edited file. The lock also retains an entry for `line-by-line-slide`, whose source is not present in this repository. These observations document provenance without altering or reinstalling the video sources.

The component files retain Apache-2.0 terms; the project's MIT license does not replace them. GSAP and Inter retain their separate terms described above. This review does not cover unrelated tools or media added in future revisions.
