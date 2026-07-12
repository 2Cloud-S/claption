from __future__ import annotations

import json
from pathlib import Path

from .schemas import STYLES


def write_batch_requests(results_path: Path, output_path: Path, model: str) -> None:
    """Create JSONL requests suitable for bulk re-judging or synthetic style data generation."""
    data = json.loads(results_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for result in data:
            for style in STYLES:
                request = {
                    "custom_id": f"{result['video_id']}::{style}",
                    "method": "POST",
                    "url": "/v1/chat/completions",
                    "body": {
                        "model": model,
                        "messages": [
                            {
                                "role": "user",
                                "content": (
                                    "Judge this caption for factual accuracy and style. "
                                    f"Facts: {result['facts']}. Style: {style}. "
                                    f"Caption: {result['captions'][style]['text']}"
                                ),
                            }
                        ],
                        "response_format": {"type": "json_object"},
                    },
                }
                handle.write(json.dumps(request) + "\n")
