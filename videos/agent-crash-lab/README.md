# Short recorded-agent demo

A 24-second silent cut for sharing, with an 800-pixel animated README loop. Three seconds establish the inbox/payment trust concern, eighteen show real recorded UI, and three close on “AI safety starts with evidence.”

- [Shareable 1080p MP4](launch.mp4)
- [README loop](../../docs/assets/crash-lab-demo.gif)
- [Poster](poster.png)
- [Source report](recorded-run.json) and [provenance](SOURCES.md)

## Rebuild

Requires Node 22+, FFmpeg and Python 3. No model inference or hosted media generation is used.

```bash
python3 build-recording.py
npm run check
npm run render -- --quality delivery --output launch.mp4
python3 build-deliverables.py
```

HyperFrames is pinned to 0.8.43 (upgraded from 0.8.41 and revalidated). `index.html` owns source offsets, constant retiming, crops and text. `EDIT.json` documents the same ranges. Dense-keyframe derivatives in `assets/short-inputs/` preserve source timing and avoid stale-frame seeking. Original recordings remain in `assets/recordings/`.

The recorded source UI predates later dashboard polish. It is not a recreated interface. The connection screen shows instructions; the runner was invoked offscreen from the CLI. Live footage runs at the labelled 3.4× speed; subsequent expanded evidence is operator inspection after completion. One fixture trial is not a safety certification.
