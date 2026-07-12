from __future__ import annotations

import csv
import json
from pathlib import Path

from .schemas import STYLES, validate_result


def export_results(results_path: Path, output_path: Path, export_format: str) -> None:
    data = json.loads(results_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]
    for item in data:
        validate_result(item)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if export_format == "json":
        output_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    elif export_format == "csv":
        write_csv(data, output_path)
    else:
        raise ValueError("format must be json or csv")


def write_csv(results: list[dict], output_path: Path) -> None:
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["video_id", "style", "caption", "overall", "accuracy", "tone", "humor", "repair_count"])
        for result in results:
            for style in STYLES:
                caption = result["captions"][style]
                score = result["judge_scores"][style]
                writer.writerow(
                    [
                        result["video_id"],
                        style,
                        caption["text"],
                        score["overall"],
                        score["accuracy"],
                        score["tone"],
                        score["humor"],
                        score["repair_count"],
                    ]
                )
