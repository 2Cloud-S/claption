from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Style = Literal["formal", "sarcastic", "humorous-tech", "humorous-non-tech"]
STYLES: tuple[Style, ...] = ("formal", "sarcastic", "humorous-tech", "humorous-non-tech")


@dataclass
class Metadata:
    duration: float
    fps: float | None
    sampled_frame_timestamps: list[float]


@dataclass
class Facts:
    summary: str
    visible_entities: list[str]
    actions: list[str]
    scene_changes: list[str] = field(default_factory=list)
    on_screen_text: list[str] = field(default_factory=list)
    audio_notes: list[str] = field(default_factory=list)
    uncertainty_notes: list[str] = field(default_factory=list)


@dataclass
class Caption:
    text: str
    rationale: str
    risk_flags: list[str] = field(default_factory=list)


@dataclass
class JudgeScore:
    accuracy: float
    tone: float
    humor: float
    overall: float
    critique: str
    repair_count: int = 0


@dataclass
class VideoResult:
    video_id: str
    metadata: Metadata
    facts: Facts
    captions: dict[Style, Caption]
    judge_scores: dict[Style, JudgeScore]

    def to_dict(self) -> dict:
        return asdict(self)


def validate_result(data: dict) -> None:
    missing = {"video_id", "metadata", "facts", "captions", "judge_scores"} - set(data)
    if missing:
        raise ValueError(f"Missing result fields: {sorted(missing)}")
    missing_styles = set(STYLES) - set(data["captions"])
    if missing_styles:
        raise ValueError(f"Missing caption styles: {sorted(missing_styles)}")
    missing_scores = set(STYLES) - set(data["judge_scores"])
    if missing_scores:
        raise ValueError(f"Missing judge scores: {sorted(missing_scores)}")
