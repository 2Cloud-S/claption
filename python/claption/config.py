from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    fireworks_api_key: str | None
    fireworks_base_url: str
    fireworks_vision_model: str
    fireworks_text_model: str
    fireworks_judge_model: str
    max_frames: int
    repair_threshold: float
    allow_fallback: bool
    enable_internal_judge: bool


def load_settings() -> Settings:
    return Settings(
        fireworks_api_key=os.getenv("FIREWORKS_API_KEY"),
        fireworks_base_url=os.getenv("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1"),
        fireworks_vision_model=os.getenv("FIREWORKS_VISION_MODEL", "accounts/fireworks/models/qwen3p7-plus"),
        fireworks_text_model=os.getenv("FIREWORKS_TEXT_MODEL", "accounts/fireworks/models/qwen3p7-plus"),
        fireworks_judge_model=os.getenv("FIREWORKS_JUDGE_MODEL", "accounts/fireworks/models/kimi-k2p7-code"),
        max_frames=max(1, min(30, int(os.getenv("CLAPTION_MAX_FRAMES", "8")))),
        repair_threshold=float(os.getenv("CLAPTION_REPAIR_THRESHOLD", "8.0")),
        allow_fallback=os.getenv("CLAPTION_ALLOW_FALLBACK", "").lower() in {"1", "true", "yes"},
        enable_internal_judge=os.getenv("CLAPTION_ENABLE_INTERNAL_JUDGE", "").lower() in {"1", "true", "yes", "on"},
    )
