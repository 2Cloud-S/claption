# Claption

Claption is a submission-ready video captioning workbench for AMD Developer Hackathon ACT II Track 2. It converts each fixed short clip into four judged outputs: `formal`, `sarcastic`, `humorous-tech`, and `humorous-non-tech`.

The pipeline separates visual grounding from style writing:

1. FFmpeg samples representative frames from each video.
2. A Fireworks vision model writes a neutral fact sheet.
3. A Fireworks text model generates the four style captions from that fact sheet only.
4. A separate judge model scores accuracy, tone, and humor, then triggers one repair pass for weak captions.

## Judge Quickstart

```bash
docker build -t claption .
docker run --rm -p 3000:3000 -e FIREWORKS_API_KEY="$FIREWORKS_API_KEY" claption
```

Open `http://localhost:3000`, upload a video clip, and click `Analyze clip`.

## If Local Docker Desktop Fails

The repository includes a GitHub Actions workflow at `.github/workflows/docker-build.yml`. Push the repo to GitHub and open the **Actions** tab. The workflow builds the Docker image on GitHub-hosted Linux runners and, on pushes to `main` or `master`, publishes:

```bash
ghcr.io/<your-github-username>/claption:latest
```

Judges can then run the prebuilt image without building locally:

```bash
docker pull ghcr.io/<your-github-username>/claption:latest
docker run --rm -p 3000:3000 \
  -e FIREWORKS_API_KEY="$FIREWORKS_API_KEY" \
  ghcr.io/<your-github-username>/claption:latest
```

For local non-container development, use `npm.cmd run dev -- --port 3000`. The hackathon submission should still include and reference the Docker image or Dockerfile because containerization is required.

## Batch CLI

Put videos in `./videos`, then run:

```bash
docker run --rm \
  -e FIREWORKS_API_KEY="$FIREWORKS_API_KEY" \
  -v "$PWD/videos:/videos:ro" \
  -v "$PWD/runs:/runs" \
  claption \
  python -m claption.cli process --input /videos --output /runs/results.json

docker run --rm \
  -v "$PWD/runs:/runs" \
  claption \
  python -m claption.cli eval --results /runs/results.json --output /runs/eval.json
```

## Local Development

```bash
npm.cmd install
npm.cmd run dev -- --port 3000
```

For CLI use on Windows:

```bat
set FIREWORKS_API_KEY=your_key
set FIREWORKS_BASE_URL=https://api.fireworks.ai/inference/v1
set FIREWORKS_VISION_MODEL=accounts/fireworks/models/qwen3p7-plus
set FIREWORKS_TEXT_MODEL=accounts/fireworks/models/qwen3p7-plus
set FIREWORKS_JUDGE_MODEL=accounts/fireworks/models/kimi-k2p7-code
set CLAPTION_MAX_FRAMES=24
set CLAPTION_REPAIR_THRESHOLD=8.0
set PYTHONPATH=python

python -m claption.cli process --input ./videos --output ./runs/latest/results.json
python -m claption.cli eval --results ./runs/latest/results.json --output ./runs/latest/eval.json
python -m claption.cli export --results ./runs/latest/results.json --format csv
python -m claption.cli batch --results ./runs/latest/results.json --output ./runs/latest/fireworks-batch.jsonl
```

FFmpeg and ffprobe must be on `PATH` for local video processing. The app and CLI fail closed when `FIREWORKS_API_KEY` is missing. For offline UI demos only, set `CLAPTION_ALLOW_FALLBACK=1` before running the Python CLI.

## Environment

Copy `.env.example` and fill in only server-side values. Do not use `NEXT_PUBLIC_*` for Fireworks credentials.

Default serverless Fireworks models:

- `FIREWORKS_VISION_MODEL=accounts/fireworks/models/qwen3p7-plus`
- `FIREWORKS_TEXT_MODEL=accounts/fireworks/models/qwen3p7-plus`
- `FIREWORKS_JUDGE_MODEL=accounts/fireworks/models/kimi-k2p7-code`

## Submission Artifacts

The `submission/` folder contains a judge runbook plus sample `results.json` and `eval.json` outputs that match the production schema.
