"""Derive a small README loop and poster from the verified final MP4."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
video = root / 'launch.mp4'
gif = root.parent.parent / 'docs/assets/crash-lab-demo.gif'
subprocess.run(['ffmpeg', '-y', '-i', str(video), '-filter_complex',
    '[0:v]fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop', '0', str(gif), '-loglevel', 'error'], check=True)
subprocess.run(['ffmpeg', '-y', '-ss', '1', '-i', str(video), '-frames:v', '1',
    str(root / 'poster.png'), '-loglevel', 'error'], check=True)
print(f'Readme loop: {gif.stat().st_size / 1024 / 1024:.2f} MiB')
