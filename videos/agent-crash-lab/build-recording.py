"""Rebuild the edited source video from the recorded chunks and EDIT.json."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parent
work = root / 'recording'
work.mkdir(exist_ok=True)
edits = json.loads((root / 'EDIT.json').read_text())
parts = []
for i, cut in enumerate(edits['segments']):
    output = work / f'cut-{i}.mp4'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-ss', str(cut['source_start']),
        '-t', str(cut['source_duration']), '-i',
        str(root / 'assets' / 'recordings' / cut['source']),
        '-vf', f"setpts=(PTS-STARTPTS)/{cut['playback_rate']},fps=30",
        '-an', '-c:v', 'libx264', '-crf', '15', '-preset', 'fast',
        '-pix_fmt', 'yuv420p', str(output)
    ], check=True)
    parts.append(output)
manifest = work / 'cuts.txt'
manifest.write_text('\n'.join("file '" + str(path).replace("'", "'\\''") + "'" for path in parts))
subprocess.run([
    'ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0',
    '-i', str(manifest), '-c', 'copy', '-movflags', '+faststart',
    str(root / 'assets' / 'recorded-session.mp4')
], check=True)
print(f"Assembled {edits['duration']} seconds from actual source recordings.")
