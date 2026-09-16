# Real-agent motion demo and interactive replay

A 24-second HyperFrames marketing cut with original 120 BPM music, 3D graphics, a typed real invocation, and animated evidence from a fresh Claude Code trial.

- [1080p video with sound](launch.mp4)
- [Silent README loop](../../docs/assets/crash-lab-demo.gif)
- [Interactive replay](replay/index.html): play, pause, scrub and inspect each exact call/response.
- [Verified report](live-run.json) and [provenance](SOURCES.md)

## Open the interactive replay locally

From this directory:

```bash
python3 -m http.server 4313 --bind 127.0.0.1
```

Open http://127.0.0.1:4313/replay/. It replays saved evidence and sends no agent calls. GitHub displays the HTML source; use the local server to interact with it.

## Rebuild

Requires the root repo's npm dependencies, Node 22+, FFmpeg, Python 3 and NumPy.

```bash
node build-live-demo.mjs
node test-replay.mjs
python3 build-beat.py
npm run check
npm run render -- --quality delivery --output launch.mp4
python3 build-deliverables.py
```

HyperFrames is pinned to 0.8.43. The generator combines `marketing-shell.html.txt` with the fresh exported `live-run.json`; `index.html` is its seekable composition. The report is a real model trial; the presentation is explicitly an edited trace replay, not a continuous screen recording. Original timestamps and full responses remain inspectable. Passing one case is not a safety certification.
