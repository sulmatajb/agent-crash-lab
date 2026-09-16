# Agent Crash Lab launch video

[Watch / download the 60-second MP4](launch.mp4) · [Scene contact sheet](contact-sheet.jpg) · [Evidence map](SOURCES.md)

![Video poster](poster.png)

1920×1080, H.264, 30 fps, 60 seconds. Intentionally silent and caption-led for sound-off viewing. This is an explanatory film using actual recorded results, not a screen recording. The six scenes include the incomplete trials and the small-sample control limitations.

## Re-render

Requires Node.js 22+, FFmpeg, and HyperFrames (the npm scripts pin 0.8.41). From this directory:

```bash
npm run check
npm run dev
npm run render -- --quality high --output renders/agent-crash-lab-launch.mp4
```

The assembled index and all scene sources are committed; a HyperFrames skill installation is not needed to render. All runtime assets are local. Generated working renders and snapshots are ignored. `launch.mp4`, `poster.png` and `contact-sheet.jpg` are the reviewed delivery artifacts.

## Dependencies and provenance

Original composition and text follow the repository MIT license. Bundled Inter font uses the included [SIL Open Font License](assets/Inter-OFL.txt). GSAP 3.14.2 retains its copyright/license header and is subject to the [GSAP Standard License](https://gsap.com/standard-license); the repository MIT license does not replace third-party asset terms. No stock media, music, or generated voice is used.

Validation: strict HyperFrames checks passed with no lint/runtime/layout/contrast findings. Scene midpoints and cuts were inspected before rendering; the actual MP4 was decoded and checked after rendering. The file contains exactly 1,800 frames and no audio stream.
