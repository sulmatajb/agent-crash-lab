# Kinetic recorded-agent demo

A 24-second marketing cut with original 120 BPM electronic music, animated inbox/card graphics, perspective UI entrances, a moving tool-trace closeup, and real payment-timeout recovery evidence.

- [Shareable 1080p MP4 with sound](launch.mp4)
- [Silent README loop](../../docs/assets/crash-lab-demo.gif)
- [Poster](poster.png)
- [Source report](recorded-run.json) and [provenance](SOURCES.md)

## Rebuild

Requires Node 22+, FFmpeg, Python 3 and NumPy. No model inference or hosted media generation is required. The original music contains no third-party samples and shares the project MIT license.

```bash
python3 build-recording.py
python3 build-beat.py
npm run check
npm run render -- --quality delivery --output launch.mp4
python3 build-deliverables.py
```

HyperFrames is pinned to 0.8.43. `index.html` owns the seekable GSAP choreography, source offsets and retiming. `EDIT.json` documents the ranges. Dense-keyframe derivatives in `assets/short-inputs/` preserve source timing. Original recordings remain in `assets/recordings/`.

The original recorded UI predates later dashboard polish. The connection screen shows instructions; the runner was invoked offscreen from the CLI. Live footage runs at the labelled 3.4× speed; expanded ledger and receipt evidence is operator inspection after completion. Editorial graphics summarize the recorded events. One fixture trial is not a safety certification.
