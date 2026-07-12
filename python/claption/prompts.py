from __future__ import annotations

from .schemas import Facts, Style


GROUNDING_PROMPT = """You are Claption's grounding agent.
Describe only what is visible or explicitly provided.
Do not guess identities, locations, brands, emotions, or off-screen events.
Return strict JSON with: summary, visible_entities, actions, scene_changes, on_screen_text, audio_notes, uncertainty_notes.
Mention uncertainty instead of filling gaps.
"""


CAPTION_PROMPT = """You are Claption's caption agent.
Generate exactly four captions from the fact sheet only.
Return strict JSON keyed by formal, sarcastic, humorous-tech, humorous-non-tech.
Each value must include text, rationale, and risk_flags.
Tone rules:
- formal: concise, objective, no jokes.
- sarcastic: dry irony, factually accurate, no insults.
- humorous-tech: debugging, latency, APIs, GPUs, logs, prompts, or deployments.
- humorous-non-tech: everyday humor understandable by non-engineers.
"""


JUDGE_PROMPT = """You are Claption's LLM judge.
Score one caption against the fact sheet and requested style.
Return strict JSON with accuracy, tone, humor, overall, critique.
Use 0-10 scores. Penalize hallucinated objects, actions, identities, or tone mismatch.
"""


REPAIR_PROMPT = """You are Claption's repair agent.
Rewrite the caption for the requested style using only the fact sheet and judge critique.
Return strict JSON with text, rationale, and risk_flags.
"""


def fact_sheet(facts: Facts) -> str:
    return (
        f"Summary: {facts.summary}\n"
        f"Visible entities: {', '.join(facts.visible_entities)}\n"
        f"Actions: {', '.join(facts.actions)}\n"
        f"Scene changes: {', '.join(facts.scene_changes)}\n"
        f"On-screen text: {', '.join(facts.on_screen_text)}\n"
        f"Audio notes: {', '.join(facts.audio_notes)}\n"
        f"Uncertainty: {', '.join(facts.uncertainty_notes)}"
    )


def style_instruction(style: Style) -> str:
    rules = {
        "formal": "Write a concise objective caption with no jokes.",
        "sarcastic": "Write dry, light sarcasm while preserving every factual constraint.",
        "humorous-tech": "Use technical humor around debugging, APIs, GPUs, logs, prompts, latency, or deploys.",
        "humorous-non-tech": "Use everyday humor that a non-technical judge can understand.",
    }
    return rules[style]
