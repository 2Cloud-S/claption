from __future__ import annotations

from .config import Settings
from .fireworks import FireworksClient
from .json_utils import extract_json_object
from .prompts import JUDGE_PROMPT, fact_sheet, style_instruction
from .schemas import Caption, Facts, JudgeScore, Style


def judge_caption(settings: Settings, facts: Facts, style: Style, caption: Caption, repair_count: int = 0) -> JudgeScore:
    if not settings.fireworks_api_key:
        if not settings.allow_fallback:
            raise RuntimeError("FIREWORKS_API_KEY is required. Set CLAPTION_ALLOW_FALLBACK=1 only for offline demos.")
        return heuristic_score(style, caption, repair_count)

    client = FireworksClient(settings.fireworks_api_key, settings.fireworks_base_url)
    response = client.chat(
        settings.fireworks_judge_model,
        [
            {"role": "system", "content": JUDGE_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Requested style: {style}\n"
                    f"Style rule: {style_instruction(style)}\n"
                    f"Fact sheet:\n{fact_sheet(facts)}\n"
                    f"Caption: {caption.text}"
                ),
            },
        ],
        temperature=0.0,
    )
    data = extract_json_object(response)
    return JudgeScore(
        accuracy=float(data["accuracy"]),
        tone=float(data["tone"]),
        humor=float(data["humor"]),
        overall=float(data["overall"]),
        critique=data.get("critique", ""),
        repair_count=repair_count,
    )


def heuristic_score(style: Style, caption: Caption, repair_count: int = 0) -> JudgeScore:
    text = caption.text.lower()
    tech_terms = ("debug", "api", "gpu", "log", "prompt", "deploy", "latency", "stack")
    accuracy = 8.4
    if any(flag.lower() in {"hallucination", "unsupported", "invented"} for flag in caption.risk_flags):
        accuracy = 5.5
    tone = 8.0
    humor = 7.5
    if style == "formal":
        humor = 10.0
        tone = 9.0 if not any(term in text for term in ("because apparently", "costume", "stack")) else 6.8
    elif style == "humorous-tech":
        tone = 9.0 if any(term in text for term in tech_terms) else 6.5
    elif style == "sarcastic":
        tone = 8.8 if any(term in text for term in ("apparently", "suspiciously", "bravely")) else 6.8
    elif style == "humorous-non-tech":
        tone = 8.8 if not any(term in text for term in tech_terms) else 6.8
    overall = round((accuracy + tone + humor) / 3, 2)
    return JudgeScore(
        accuracy=accuracy,
        tone=tone,
        humor=humor,
        overall=overall,
        critique="Heuristic local score; Fireworks judge is used when FIREWORKS_API_KEY is set.",
        repair_count=repair_count,
    )
