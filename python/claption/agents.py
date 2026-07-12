from __future__ import annotations

from pathlib import Path

from .config import Settings
from .fireworks import FireworksClient
from .json_utils import extract_json_object
from .prompts import CAPTION_PROMPT, GROUNDING_PROMPT, REPAIR_PROMPT, fact_sheet, style_instruction
from .schemas import STYLES, Caption, Facts, Style


def ground_video(settings: Settings, frames_base64: list[str], video_name: str) -> Facts:
    if not frames_base64:
        raise ValueError("No sampled frames were available for grounding.")
    if not settings.fireworks_api_key:
        if not settings.allow_fallback:
            raise RuntimeError("FIREWORKS_API_KEY is required. Set CLAPTION_ALLOW_FALLBACK=1 only for offline demos.")
        return fallback_facts(video_name)

    client = FireworksClient(settings.fireworks_api_key, settings.fireworks_base_url)
    content = [{"type": "text", "text": GROUNDING_PROMPT}]
    for image in frames_base64:
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image}"}})
    response = client.chat(settings.fireworks_vision_model, [{"role": "user", "content": content}], temperature=0.1)
    data = extract_json_object(response)
    return Facts(
        summary=data.get("summary", ""),
        visible_entities=list(data.get("visible_entities", [])),
        actions=list(data.get("actions", [])),
        scene_changes=list(data.get("scene_changes", [])),
        on_screen_text=list(data.get("on_screen_text", [])),
        audio_notes=list(data.get("audio_notes", [])),
        uncertainty_notes=list(data.get("uncertainty_notes", [])),
    )


def generate_captions(settings: Settings, facts: Facts) -> dict[Style, Caption]:
    if not settings.fireworks_api_key:
        if not settings.allow_fallback:
            raise RuntimeError("FIREWORKS_API_KEY is required. Set CLAPTION_ALLOW_FALLBACK=1 only for offline demos.")
        return fallback_captions(facts)

    client = FireworksClient(settings.fireworks_api_key, settings.fireworks_base_url)
    response = client.chat(
        settings.fireworks_text_model,
        [
            {"role": "system", "content": CAPTION_PROMPT},
            {"role": "user", "content": fact_sheet(facts)},
        ],
        temperature=0.45,
    )
    data = extract_json_object(response)
    return {
        style: Caption(
            text=data[style]["text"],
            rationale=data[style].get("rationale", ""),
            risk_flags=list(data[style].get("risk_flags", [])),
        )
        for style in STYLES
    }


def repair_caption(settings: Settings, facts: Facts, style: Style, caption: Caption, critique: str) -> Caption:
    if not settings.fireworks_api_key:
        if not settings.allow_fallback:
            raise RuntimeError("FIREWORKS_API_KEY is required. Set CLAPTION_ALLOW_FALLBACK=1 only for offline demos.")
        return caption
    client = FireworksClient(settings.fireworks_api_key, settings.fireworks_base_url)
    response = client.chat(
        settings.fireworks_text_model,
        [
            {"role": "system", "content": REPAIR_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Style: {style}\n"
                    f"Rule: {style_instruction(style)}\n"
                    f"Fact sheet:\n{fact_sheet(facts)}\n"
                    f"Original caption: {caption.text}\n"
                    f"Judge critique: {critique}"
                ),
            },
        ],
        temperature=0.35,
    )
    data = extract_json_object(response)
    return Caption(text=data["text"], rationale=data.get("rationale", ""), risk_flags=list(data.get("risk_flags", [])))


def fallback_facts(video_name: str | Path) -> Facts:
    stem = Path(str(video_name)).stem
    return Facts(
        summary=f"{stem} is ready for grounded captioning; local fallback mode records the pipeline structure without VLM observations.",
        visible_entities=["unknown primary subject", "unknown scene context"],
        actions=["sample video frames", "build a neutral fact sheet", "generate four caption styles"],
        scene_changes=[],
        on_screen_text=[],
        audio_notes=["Audio transcription is optional and not enabled in fallback mode."],
        uncertainty_notes=["Set FIREWORKS_API_KEY and install FFmpeg to enable real visual grounding."],
    )


def fallback_captions(facts: Facts) -> dict[Style, Caption]:
    base = facts.summary.rstrip(".")
    return {
        "formal": Caption(f"{base}.", "Formal fallback keeps the neutral summary intact.", []),
        "sarcastic": Caption(
            f"{base}, because even a short clip deserves a suspiciously thorough judging packet.",
            "Light sarcasm without adding visual claims.",
            [],
        ),
        "humorous-tech": Caption(
            f"{base}; Claption logs it, scores it, and politely avoids a hallucination outage.",
            "Tech humor references the captioning pipeline.",
            [],
        ),
        "humorous-non-tech": Caption(
            f"{base}, then gets four caption costumes for the judges.",
            "Non-technical humor with no extra scene details.",
            [],
        ),
    }
