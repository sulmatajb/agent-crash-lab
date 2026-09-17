# Third-party notices

The repository's MIT license covers project-authored code, graphics and music. Third-party files retain their own licenses.

## Runtime dependencies

The [production dependency inventory](DEPENDENCY-LICENSES.md) lists the 94 installed production dependency entries in the current lockfile: 84 MIT, seven ISC, two BSD-3-Clause and one BSD-2-Clause. Each installed entry includes a LICENSE, LICENSE.md or LICENSE.txt file. Dependencies are installed through npm and are not relabelled as project-authored code.

## Inter font

`videos/agent-crash-lab/assets/inter-latin.woff2` is Inter, copyright the Inter Project Authors, distributed under SIL Open Font License 1.1. The [copyright and full license](licenses/Inter-OFL.txt) are included here. [Upstream license](https://github.com/rsms/inter/blob/master/LICENSE.txt).

## GSAP animation library

`videos/agent-crash-lab/assets/gsap.min.js` contains GSAP 3.14.2 and retains its upstream copyright header and license link. It is governed by the [GSAP Standard License](https://gsap.com/community/standard-license/), not the repository's MIT license. It is used by the authored demo composition; it is not a runtime dependency of the lab's CLI or dashboard. Review those terms before repurposing the bundled library.

## Demo assets

The demo score is synthesized by `videos/agent-crash-lab/build-beat.py` without third-party audio samples. Recorded UI, synthetic trial data and authored graphics come from this project. See [media provenance](https://github.com/sulmatajb/agent-crash-lab/blob/main/videos/agent-crash-lab/SOURCES.md) for the underlying run and editorial treatment. The HyperFrames rendering tool and any installed registry components retain their upstream terms; this inventory is not a blanket MIT relicensing of external tools or assets.
