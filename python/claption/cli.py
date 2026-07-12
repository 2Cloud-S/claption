from __future__ import annotations

import argparse
import json
from pathlib import Path

from .batch import write_batch_requests
from .config import load_settings
from .exporters import export_results
from .pipeline import process_path
from .schemas import STYLES, validate_result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="claption")
    subparsers = parser.add_subparsers(dest="command", required=True)

    process_parser = subparsers.add_parser("process")
    process_parser.add_argument("--input", required=True, type=Path)
    process_parser.add_argument("--output", required=True, type=Path)

    eval_parser = subparsers.add_parser("eval")
    eval_parser.add_argument("--results", required=True, type=Path)
    eval_parser.add_argument("--output", required=True, type=Path)

    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("--results", required=True, type=Path)
    export_parser.add_argument("--output", type=Path)
    export_parser.add_argument("--format", choices=["json", "csv"], required=True)

    batch_parser = subparsers.add_parser("batch")
    batch_parser.add_argument("--results", required=True, type=Path)
    batch_parser.add_argument("--output", required=True, type=Path)

    args = parser.parse_args(argv)
    settings = load_settings()

    if args.command == "process":
        process_path(args.input, args.output, settings)
    elif args.command == "eval":
        evaluate_results(args.results, args.output)
    elif args.command == "export":
        output = args.output or args.results.with_suffix(f".{args.format}")
        export_results(args.results, output, args.format)
    elif args.command == "batch":
        write_batch_requests(args.results, args.output, settings.fireworks_judge_model)
    return 0


def evaluate_results(results_path: Path, output_path: Path) -> None:
    data = json.loads(results_path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]
    summary = []
    for result in data:
        validate_result(result)
        scores = [result["judge_scores"][style]["overall"] for style in STYLES]
        summary.append(
            {
                "video_id": result["video_id"],
                "overall_average": round(sum(scores) / len(scores), 2),
                "lowest_style": min(STYLES, key=lambda style: result["judge_scores"][style]["overall"]),
                "repair_count": sum(result["judge_scores"][style]["repair_count"] for style in STYLES),
            }
        )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
