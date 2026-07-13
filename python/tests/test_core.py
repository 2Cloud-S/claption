import json
import tempfile
import unittest
from pathlib import Path

from claption.agents import caption_quality_issues
from claption.cli import evaluate_results
from claption.json_utils import extract_json_object
from claption.judge import heuristic_score
from claption.schemas import Caption
from claption.schemas import STYLES, validate_result
from claption.video import choose_timestamps


class CoreTests(unittest.TestCase):
    def test_choose_timestamps_respects_limit(self):
        timestamps = choose_timestamps(120, 12)
        self.assertEqual(len(timestamps), 12)
        self.assertGreater(timestamps[0], 0)
        self.assertLess(timestamps[-1], 120)
        self.assertLess(timestamps[0], 1)
        self.assertGreater(timestamps[-1], 119)

    def test_caption_quality_checks_style_and_length(self):
        captions = {
            "formal": Caption("A person carefully places an object on the table.", "Grounded action.", []),
            "sarcastic": Caption("Apparently, placing the object required a truly historic level of ceremony.", "Dry comparison.", []),
            "humorous-tech": Caption("The careful placement deploys successfully, with no rollback required.", "Deployment analogy.", []),
            "humorous-non-tech": Caption("The object lands like the final snack claiming its favorite spot.", "Everyday comparison.", []),
        }
        self.assertEqual(caption_quality_issues(captions), {})

        captions["humorous-tech"] = Caption("A person carefully places an object on the table.", "No analogy.", [])
        self.assertIn("humorous-tech", caption_quality_issues(captions))

    def test_extract_json_object_from_fenced_text(self):
        self.assertEqual(extract_json_object('```json\n{"ok": true}\n```'), {"ok": True})

    def test_validate_requires_all_styles(self):
        data = {
            "video_id": "x",
            "metadata": {},
            "facts": {},
            "captions": {style: {} for style in STYLES},
            "judge_scores": {style: {} for style in STYLES},
        }
        validate_result(data)

    def test_evaluate_results_writes_summary(self):
        result = {
            "video_id": "clip",
            "metadata": {},
            "facts": {},
            "captions": {style: {"text": "", "rationale": "", "risk_flags": []} for style in STYLES},
            "judge_scores": {
                style: {
                    "accuracy": 8,
                    "tone": 8,
                    "humor": 8,
                    "overall": 8,
                    "critique": "",
                    "repair_count": 0,
                }
                for style in STYLES
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            results_path = Path(directory) / "results.json"
            output_path = Path(directory) / "eval.json"
            results_path.write_text(json.dumps([result]), encoding="utf-8")
            evaluate_results(results_path, output_path)
            self.assertEqual(json.loads(output_path.read_text(encoding="utf-8"))[0]["overall_average"], 8)

    def test_judge_simulation_penalizes_hallucination_flags(self):
        caption = Caption("A dragon lands in the room.", "Invents visual content.", ["hallucination"])
        score = heuristic_score("formal", caption)
        self.assertLess(score.accuracy, 6)

    def test_judge_simulation_penalizes_wrong_tech_tone(self):
        caption = Caption("A person calmly demonstrates the main action.", "No technical humor.", [])
        score = heuristic_score("humorous-tech", caption)
        self.assertLess(score.tone, 7)

    def test_judge_simulation_rewards_repaired_tone(self):
        weak = heuristic_score("humorous-tech", Caption("A person calmly demonstrates the main action.", "", []))
        repaired = heuristic_score(
            "humorous-tech",
            Caption("The clip runs its tiny demo pipeline without a visible stack trace.", "", []),
            repair_count=1,
        )
        self.assertGreaterEqual(repaired.overall, weak.overall)


if __name__ == "__main__":
    unittest.main()
