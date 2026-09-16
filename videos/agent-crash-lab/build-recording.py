"""Prepare seek-safe derivatives of the original browser recordings (no time edits)."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent
output = root / 'assets/short-inputs'
output.mkdir(parents=True, exist_ok=True)
for source in sorted((root / 'assets/recordings').glob('*.mp4')):
    name = source.name
    subprocess.run([
        'ffmpeg', '-y', '-i', str(source),
        '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast',
        '-g', '15', '-keyint_min', '15', '-sc_threshold', '0',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output / name),
        '-loglevel', 'error'
    ], check=True)
print('Prepared original recorded frames with dense keyframes; HTML owns all cuts and timing.')
