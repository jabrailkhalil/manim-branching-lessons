"""Verify every decoded frame, then copy the rendered clips into the demo."""

import hashlib
import json
import shutil
from itertools import pairwise
from pathlib import Path

import av

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public" / "clips"
TARGET.mkdir(exist_ok=True)
records = []
for scene in ("Question", "Correction", "Success"):
    source = ROOT / "media" / "videos" / "scenes" / "540p15" / f"{scene}.mp4"
    with av.open(source) as container:
        assert len(container.streams.audio) == 0, "Clips are intentionally silent"
        stream = container.streams.video[0]
        frames = list(container.decode(video=0))
        assert len(frames) >= 75
        assert all((f.width, f.height) == (960, 540) for f in frames)
        assert all(a.pts < b.pts for a, b in pairwise(frames))
        frames[-1].to_image().save(TARGET / f"{scene.lower()}.png")
        record = dict(
            scene=scene,
            frames=len(frames),
            fps=str(stream.average_rate),
            width=960,
            height=540,
            codec=stream.codec_context.name,
            sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        )
    shutil.copyfile(source, TARGET / f"{scene.lower()}.mp4")
    records.append(record)
(TARGET / "render-info.json").write_text(
    json.dumps(dict(manim="0.22.1", clips=records), indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(records, indent=2))
