from __future__ import annotations

from .schemas import Facts, Style


GROUNDING_PROMPT = """You are Claption's grounding agent.
Analyze the timestamped silent frames as one chronological video.
Describe only details supported by the frames, favoring actions or entities visible in multiple frames.
Do not guess identities, relationships, locations, brands, emotions, motives, causes, outcomes, speech, or off-screen events.
Treat a detail seen in only one ambiguous frame as uncertain. Do not turn uncertainty into a caption claim.
Use concrete nouns and precise visible verbs. Never hide the action behind generic phrases such as "does something," "main action," "activity," or "demonstration."
Transcribe on-screen text only when clearly legible; otherwise place it in uncertainty_notes.
The frames contain no audio: audio_notes must be an empty array.
Write a neutral one-sentence summary of the main visible action, then return strict JSON with exactly:
summary, visible_entities, actions, scene_changes, on_screen_text, audio_notes, uncertainty_notes.
"""


CAPTION_PROMPT = """You are Claption's caption agent.
Generate exactly four English captions from the same fact sheet.
Return strict JSON keyed by formal, sarcastic, humorous-tech, humorous-non-tech.
Each value must include text, rationale, and risk_flags.
Accuracy is the first priority. Every caption must preserve the same concrete visual anchor: the main subject and main visible action from the summary.
Never add names, identities, relationships, locations, dialogue, intentions, emotions, causes, outcomes, objects, failures, or events absent from the fact sheet.
Use humor only as commentary or comparison, never as a new factual claim. Ignore uncertain details.
Use the fact sheet's concrete nouns and verbs; never replace them with generic phrases such as "main action," "activity," "demonstration," "something," or "some object."
Each text must be one complete sentence of 8-28 words. Keep captions distinct, immediately recognizable by tone, and free of hashtags, emoji, quotation marks, or meta-commentary.
The rationale must briefly name the grounded action used. risk_flags must be [] when the caption contains no unsupported claim.
Tone rules:
- formal: objective description only; no jokes, irony, exaggeration, or opinion.
- sarcastic: unmistakable dry irony about the situation; no insults, ridicule, or invented mishaps.
- humorous-tech: one clear software/AI analogy using debugging, latency, APIs, GPUs, logs, prompts, or deployments; do not imply that technology is literally present.
- humorous-non-tech: one clear everyday-life comparison understandable without technical knowledge; avoid all computing jargon.
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
        "formal": "One objective sentence with no jokes, irony, exaggeration, or opinion.",
        "sarcastic": "One unmistakably dry, ironic sentence that keeps the visual facts literal and adds no mishap.",
        "humorous-tech": "One grounded sentence with a clear software or AI analogy, without claiming technology is visible.",
        "humorous-non-tech": "One grounded sentence with an everyday-life comparison and no computing jargon.",
    }
    return rules[style]
