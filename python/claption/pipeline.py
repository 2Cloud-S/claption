from __future__ import annotations

import json
from pathlib import Path

from .agents import generate_captions, ground_video, repair_caption
from .config import Settings
from .judge import judge_caption
from .schemas import STYLES, JudgeScore, Metadata, VideoResult
from .video import sample_frames

VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}


def process_path(input_path: Path, output_path: Path, settings: Settings) -> list[VideoResult]:
    videos = list_videos(input_path)
    results = [process_video(video, output_path.parent / "frames" / video.stem, settings) for video in videos]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps([result.to_dict() for result in results], indent=2), encoding="utf-8")
    return results


def process_video(video_path: Path, frame_dir: Path, settings: Settings) -> VideoResult:
    sampled = sample_frames(video_path, frame_dir, settings.max_frames)
    facts = ground_video(settings, sampled.images_base64, video_path.name)
    captions = generate_captions(settings, facts)
    scores = {}
    if settings.enable_internal_judge:
        for style in STYLES:
            score = judge_caption(settings, facts, style, captions[style])
            if score.overall < settings.repair_threshold:
                captions[style] = repair_caption(settings, facts, style, captions[style], score.critique)
                score = judge_caption(settings, facts, style, captions[style], repair_count=1)
            scores[style] = score
    else:
        for style in STYLES:
            scores[style] = JudgeScore(
                accuracy=0,
                tone=0,
                humor=0,
                overall=0,
                critique=f"Internal judge skipped for fast AMD scoring mode ({style}).",
                repair_count=0,
            )
    return VideoResult(
        video_id=video_path.stem,
        metadata=Metadata(
            duration=sampled.duration,
            fps=sampled.fps,
            sampled_frame_timestamps=sampled.timestamps,
        ),
        facts=facts,
        captions=captions,
        judge_scores=scores,
    )


def list_videos(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    videos = sorted(path for path in input_path.iterdir() if path.suffix.lower() in VIDEO_EXTENSIONS)
    if not videos:
        raise FileNotFoundError(f"No videos found in {input_path}")
    return videos
