"""Prepare seek-safe derivatives of the original browser recordings (no time edits)."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parent
edits = json.loads((root / 'EDIT.json').read_text())
output = root / edits['derived_source_directory']
output.mkdir(parents=True, exist_ok=True)
for name in sorted({cut['source'] for cut in edits['segments']}):
    subprocess.run([
        'ffmpeg', '-y', '-i', str(root / edits['source_directory'] / name),
        '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast',
        '-g', '15', '-keyint_min', '15', '-sc_threshold', '0',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output / name),
        '-loglevel', 'error'
    ], check=True)
print('Prepared original recorded frames with dense keyframes; HTML owns all cuts and timing.')
