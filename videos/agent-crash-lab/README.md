# Agent Crash Lab — recorded UI demo

[Watch the 34-second MP4](launch.mp4) · [Contact sheet](contact-sheet.jpg) · [Recording provenance](SOURCES.md)

![Video poster](poster.png)

Actual UI recording of a fresh Claude Code run: tool calls arrive, a payment response times out, the agent checks the ledger, and the operator inspects one payment and one receipt. Minimal editorial text; no narration or music. 1920×1080 H.264 at 30 fps, from approximately 10 fps browser capture. The live waiting segment is visibly marked 2×.

## Re-render

Requires Node.js 22+, Python 3 and FFmpeg. HyperFrames is pinned to 0.8.41.

```sh
python3 build-recording.py
npm run check
npm run dev
npm run render -- --quality delivery --output renders/agent-crash-lab-recorded.mp4
```

`EDIT.json` defines the cuts. `assets/recordings/` holds the actual source recordings, and `assets/recorded-session.mp4` is the assembled footage. The HyperFrames composition applies camera moves and the minimal labels. All assets are local. Raw frame working directories and render caches are ignored.

## Evidence

From the repository root:

```sh
node dist/cli.js verify videos/agent-crash-lab/recorded-run.json
```

The displayed seed-43 report replayed successfully and its eight business calls matched the client trace. Passing this fixture is not a general safety certification. See [SOURCES.md](SOURCES.md).

## Dependencies

Original recording and composition use the repository MIT license. Bundled Inter uses [SIL OFL](assets/Inter-OFL.txt). GSAP 3.14.2 retains its license header and uses the [GSAP Standard License](https://gsap.com/standard-license). The repository license does not replace third-party terms.

The 0.8.42 upgrade check exposed an integrity mismatch in the prior composition. This revision corrects the local GSAP digest and retains the previously pinned 0.8.41 renderer. No external stock media, music, voice or reconstructed UI is used.
