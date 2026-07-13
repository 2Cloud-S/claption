from __future__ import annotations

import json
import re
from pathlib import Path

from .config import Settings
from .fireworks import FireworksClient
from .json_utils import extract_json_object
from .prompts import CAPTION_PROMPT, GROUNDING_PROMPT, REPAIR_PROMPT, fact_sheet, style_instruction
from .schemas import STYLES, Caption, Facts, Style


def ground_video(settings: Settings, frames_base64: list[str], timestamps: list[float], video_name: str) -> Facts:
    if not frames_base64:
        raise ValueError("No sampled frames were available for grounding.")
    if not settings.fireworks_api_key:
        if not settings.allow_fallback:
            raise RuntimeError("FIREWORKS_API_KEY is required. Set CLAPTION_ALLOW_FALLBACK=1 only for offline demos.")
        return fallback_facts(video_name)

    client = FireworksClient(settings.fireworks_api_key, settings.fireworks_base_url)
    content = [
        {
            "type": "text",
            "text": f"{GROUNDING_PROMPT}\nVideo file: {video_name}\nThe following frames are ordered by timestamp.",
        }
    ]
    for index, image in enumerate(frames_base64):
        content.append({"type": "text", "text": f"Frame {index + 1} at {timestamps[index]:.2f} seconds:"})
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image}"}})
    response = client.chat(
        settings.fireworks_vision_model,
        [{"role": "user", "content": content}],
        temperature=0.05,
        max_tokens=1200,
        reasoning_effort="none",
    )
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
        temperature=0.25,
        max_tokens=1400,
        reasoning_effort="none",
    )
    data = extract_json_object(response)
    captions = {style: _caption_from_value(data.get(style)) for style in STYLES}
    issues = caption_quality_issues(captions)
    if not issues:
        return captions

    flagged_styles = [style for style in STYLES if style in issues]
    repair_response = client.chat(
        settings.fireworks_text_model,
        [
            {"role": "system", "content": CAPTION_PROMPT},
            {
                "role": "user",
                "content": (
                    "Correct only the flagged captions and return strict JSON keyed only by the flagged styles.\n\n"
                    f"Fact sheet:\n{fact_sheet(facts)}\n\n"
                    f"Current captions:\n{json.dumps({style: captions[style].__dict__ for style in STYLES})}\n\n"
                    f"Flagged issues:\n{json.dumps(issues)}"
                ),
            },
        ],
        temperature=0.15,
        max_tokens=900,
        reasoning_effort="none",
    )
    repaired_data = extract_json_object(repair_response)
    for style in flagged_styles:
        candidate = _caption_from_value(repaired_data.get(style))
        if candidate.text:
            captions[style] = candidate
    return captions


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


def _caption_from_value(value: object) -> Caption:
    item = value if isinstance(value, dict) else {}
    text = item.get("text", "")
    rationale = item.get("rationale", "")
    flags = item.get("risk_flags", [])
    return Caption(
        text=text if isinstance(text, str) else "",
        rationale=rationale if isinstance(rationale, str) else "",
        risk_flags=[flag for flag in flags if isinstance(flag, str)] if isinstance(flags, list) else [],
    )


def caption_quality_issues(captions: dict[Style, Caption]) -> dict[Style, list[str]]:
    issues: dict[Style, list[str]] = {}
    fingerprints: dict[str, Style] = {}
    tech_terms = re.compile(
        r"\b(apis?|bugs?|cache|code|cpu|debug(?:s|ged|ging)?|deploy(?:s|ed|ing|ment)?|gpus?|latency|logs?|prompts?|servers?|stack|tokens?)\b",
        re.I,
    )
    sarcasm_cues = re.compile(
        r"\b(apparently|as if|because clearly|clearly|naturally|of course|surely|what could be|masterclass|bold choice)\b",
        re.I,
    )
    generic_terms = re.compile(
        r"\b(main action|activity|demonstration|does something|doing something|some object|something happens)\b",
        re.I,
    )

    for style in STYLES:
        caption = captions[style]
        style_issues: list[str] = []
        words = caption.text.split()
        if not caption.text.strip():
            style_issues.append("caption is empty")
        if len(words) < 8 or len(words) > 28:
            style_issues.append("caption must contain 8-28 words")
        if caption.risk_flags:
            style_issues.append("caption contains a possible unsupported claim")
        if generic_terms.search(caption.text):
            style_issues.append("caption uses generic language instead of the concrete visible action")
        if style == "formal" and re.search(r"[!?]|\b(apparently|hilarious|masterclass|of course)\b", caption.text, re.I):
            style_issues.append("formal tone contains humor, irony, or emphasis")
        if style == "sarcastic" and not sarcasm_cues.search(caption.text):
            style_issues.append("sarcastic tone is not explicit enough for an LLM judge")
        if style == "humorous-tech" and not tech_terms.search(caption.text):
            style_issues.append("humorous-tech caption lacks a recognizable technical analogy")
        if style == "humorous-non-tech" and tech_terms.search(caption.text):
            style_issues.append("humorous-non-tech caption contains computing jargon")
        fingerprint = re.sub(r"[^a-z0-9]+", " ", caption.text.lower()).strip()
        if fingerprint in fingerprints:
            style_issues.append(f"caption duplicates {fingerprints[fingerprint]}")
        if fingerprint:
            fingerprints[fingerprint] = style
        if style_issues:
            issues[style] = style_issues
    return issues


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
