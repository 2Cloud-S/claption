from __future__ import annotations

import base64
import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SampledFrames:
    duration: float
    fps: float | None
    timestamps: list[float]
    images_base64: list[str]


def probe_video(path: Path) -> tuple[float, float | None]:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate:format=duration",
        "-of",
        "json",
        str(path),
    ]
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    payload = json.loads(completed.stdout)
    duration = float(payload.get("format", {}).get("duration") or 0)
    fps_text = payload.get("streams", [{}])[0].get("r_frame_rate")
    fps = _parse_rate(fps_text) if fps_text else None
    return duration, fps


def sample_frames(path: Path, output_dir: Path, max_frames: int) -> SampledFrames:
    output_dir.mkdir(parents=True, exist_ok=True)
    duration, fps = probe_video(path)
    timestamps = choose_timestamps(duration, max_frames)
    images: list[str] = []
    for index, timestamp in enumerate(timestamps):
        frame_path = output_dir / f"{path.stem}-{index:03d}.jpg"
        command = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-vf",
            "scale='min(960,iw)':-2",
            "-q:v",
            "4",
            str(frame_path),
        ]
        subprocess.run(command, check=True, capture_output=True, text=True)
        images.append(base64.b64encode(frame_path.read_bytes()).decode("utf-8"))
    return SampledFrames(duration=duration, fps=fps, timestamps=timestamps, images_base64=images)


def choose_timestamps(duration: float, max_frames: int) -> list[float]:
    if duration <= 0:
        return [0.0]
    count = max(4, min(max_frames, math.ceil(duration / 5)))
    safe_duration = max(0.2, duration)
    return [
        round(min(max(0.1, (safe_duration * (index + 0.5)) / count), max(0.1, safe_duration - 0.25)), 2)
        for index in range(count)
    ]


def _parse_rate(rate: str) -> float | None:
    if "/" not in rate:
        return float(rate)
    numerator, denominator = rate.split("/", 1)
    denominator_value = float(denominator)
    if denominator_value == 0:
        return None
    return float(numerator) / denominator_value
