import { execFile } from "node:child_process";
import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegStatic || "ffmpeg";
const ffprobePath = ffprobeStatic.path || "ffprobe";
const styles = ["formal", "sarcastic", "humorous-tech", "humorous-non-tech"] as const;
type StyleKey = (typeof styles)[number];

type Facts = {
  summary: string;
  visible_entities: string[];
  actions: string[];
  scene_changes: string[];
  on_screen_text: string[];
  audio_notes: string[];
  uncertainty_notes: string[];
};

type Caption = {
  text: string;
  rationale: string;
  risk_flags: string[];
};

type JudgeScore = {
  accuracy: number;
  tone: number;
  humor: number;
  overall: number;
  critique: string;
  repair_count: number;
};

const groundingPrompt = `You are Claption's grounding agent.
Describe only what is visible or explicitly provided.
Do not guess identities, locations, brands, emotions, or off-screen events.
Return strict JSON with: summary, visible_entities, actions, scene_changes, on_screen_text, audio_notes, uncertainty_notes.
Mention uncertainty instead of filling gaps.`;

const captionPrompt = `You are Claption's caption agent.
Generate exactly four captions from the fact sheet only.
Return strict JSON keyed by formal, sarcastic, humorous-tech, humorous-non-tech.
Each value must include text, rationale, and risk_flags.
Tone rules:
- formal: concise, objective, no jokes.
- sarcastic: dry irony, factually accurate, no insults.
- humorous-tech: debugging, latency, APIs, GPUs, logs, prompts, or deployments.
- humorous-non-tech: everyday humor understandable by non-engineers.`;

const judgePrompt = `You are Claption's LLM judge.
Score one caption against the fact sheet and requested style.
Return strict JSON with accuracy, tone, humor, overall, critique.
Use 0-10 scores. Penalize hallucinated objects, actions, identities, or tone mismatch.`;

const repairPrompt = `You are Claption's repair agent.
Rewrite the caption for the requested style using only the fact sheet and judge critique.
Return strict JSON with text, rationale, and risk_flags.`;

export async function POST(request: NextRequest) {
  if (!process.env.FIREWORKS_API_KEY) {
    return NextResponse.json(
      { error: "FIREWORKS_API_KEY is required for caption generation. Configure it server-side and retry." },
      { status: 500 }
    );
  }

  const workDir = await mkdtemp(path.join(/*turbopackIgnore: true*/ tmpdir(), "claption-"));
  try {
    const tools = await prepareMediaTools(workDir);
    const form = await request.formData();
    const file = form.get("video");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a video file in the 'video' form field." }, { status: 400 });
    }
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name)) {
      return NextResponse.json({ error: "The uploaded file must be a supported video." }, { status: 400 });
    }

    const safeName = sanitizeFileName(file.name || "uploaded-clip.mp4");
    const videoPath = path.join(/*turbopackIgnore: true*/ workDir, safeName);
    await writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

    const probed = await probeVideo(videoPath, tools.ffprobe);
    const maxFrames = clampNumber(Number(process.env.CLAPTION_MAX_FRAMES ?? 24), 1, 30);
    const timestamps = chooseTimestamps(probed.duration, maxFrames);
    const framePayloads = await sampleFrames(videoPath, workDir, timestamps, tools.ffmpeg);

    const facts = await groundVideo(framePayloads, safeName);
    const captions = await generateCaptions(facts);
    const judgeScores: Record<StyleKey, JudgeScore> = {} as Record<StyleKey, JudgeScore>;
    const repairThreshold = Number(process.env.CLAPTION_REPAIR_THRESHOLD ?? 8.0);

    for (const style of styles) {
      let score = await judgeCaption(facts, style, captions[style], 0);
      if (score.overall < repairThreshold) {
        captions[style] = await repairCaption(facts, style, captions[style], score.critique);
        score = await judgeCaption(facts, style, captions[style], 1);
      }
      judgeScores[style] = score;
    }

    return NextResponse.json({
      video_id: path.parse(safeName).name,
      metadata: {
        duration: probed.duration,
        fps: probed.fps,
        sampled_frame_timestamps: timestamps.slice(0, framePayloads.length)
      },
      facts,
      captions,
      judge_scores: judgeScores
    });
  } catch (error) {
    console.error("[claption] process failed:", errorDetails(error));
    return NextResponse.json({ error: publicError(error) }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function probeVideo(videoPath: string, ffprobeExecutable: string) {
  const { stdout } = await execFileAsync(ffprobeExecutable, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=r_frame_rate:format=duration",
    "-of",
    "json",
    videoPath
  ]);
  const payload = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ r_frame_rate?: string }> };
  const duration = Number(payload.format?.duration ?? 0);
  const fps = parseRate(payload.streams?.[0]?.r_frame_rate);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read a positive video duration with ffprobe.");
  }
  return { duration, fps };
}

async function sampleFrames(videoPath: string, workDir: string, timestamps: number[], ffmpegExecutable: string) {
  const images: string[] = [];
  let totalBytes = 0;
  for (let index = 0; index < timestamps.length; index += 1) {
    const framePath = path.join(/*turbopackIgnore: true*/ workDir, `frame-${String(index).padStart(3, "0")}.jpg`);
    await execFileAsync(ffmpegExecutable, [
      "-y",
      "-ss",
      timestamps[index].toFixed(3),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=min(768\\,iw):-2",
      "-q:v",
      "5",
      framePath
    ]);
    const frameBytes = await readFile(framePath);
    totalBytes += frameBytes.byteLength;
    if (totalBytes > 9_500_000) break;
    images.push(frameBytes.toString("base64"));
  }
  if (images.length === 0) {
    throw new Error("FFmpeg did not produce any frames from the uploaded video.");
  }
  return images;
}

async function groundVideo(framesBase64: string[], videoName: string): Promise<Facts> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${groundingPrompt}\nVideo file: ${videoName}\nFrame order matches video timeline.`
    },
    ...framesBase64.map((image) => ({
      type: "image_url",
      image_url: { url: `data:image/jpeg;base64,${image}` }
    }))
  ];
  const data = await fireworksJson(env("FIREWORKS_VISION_MODEL", "accounts/fireworks/models/qwen3p7-plus"), [
    { role: "user", content }
  ]);
  return {
    summary: stringField(data.summary),
    visible_entities: stringList(data.visible_entities),
    actions: stringList(data.actions),
    scene_changes: stringList(data.scene_changes),
    on_screen_text: stringList(data.on_screen_text),
    audio_notes: stringList(data.audio_notes),
    uncertainty_notes: stringList(data.uncertainty_notes)
  };
}

async function generateCaptions(facts: Facts): Promise<Record<StyleKey, Caption>> {
  const data = await fireworksJson(
    env("FIREWORKS_TEXT_MODEL", "accounts/fireworks/models/qwen3p7-plus"),
    [
      { role: "system", content: captionPrompt },
      { role: "user", content: factSheet(facts) }
    ],
    0.45
  );
  const captions = {} as Record<StyleKey, Caption>;
  for (const style of styles) {
    captions[style] = normalizeCaption(data[style]);
  }
  return captions;
}

async function judgeCaption(facts: Facts, style: StyleKey, caption: Caption, repairCount: number): Promise<JudgeScore> {
  const data = await fireworksJson(
    env("FIREWORKS_JUDGE_MODEL", "accounts/fireworks/models/kimi-k2p7-code"),
    [
      { role: "system", content: judgePrompt },
      {
        role: "user",
        content: `Requested style: ${style}\nStyle rule: ${styleInstruction(style)}\nFact sheet:\n${factSheet(facts)}\nCaption: ${caption.text}`
      }
    ],
    0
  );
  return {
    accuracy: scoreField(data.accuracy),
    tone: scoreField(data.tone),
    humor: scoreField(data.humor),
    overall: scoreField(data.overall),
    critique: stringField(data.critique),
    repair_count: repairCount
  };
}

async function repairCaption(facts: Facts, style: StyleKey, caption: Caption, critique: string): Promise<Caption> {
  const data = await fireworksJson(
    env("FIREWORKS_TEXT_MODEL", "accounts/fireworks/models/qwen3p7-plus"),
    [
      { role: "system", content: repairPrompt },
      {
        role: "user",
        content: `Style: ${style}\nRule: ${styleInstruction(style)}\nFact sheet:\n${factSheet(facts)}\nOriginal caption: ${caption.text}\nJudge critique: ${critique}`
      }
    ],
    0.35
  );
  return normalizeCaption(data);
}

async function fireworksJson(model: string, messages: Array<Record<string, unknown>>, temperature = 0.2) {
  const response = await fetch(`${env("FIREWORKS_BASE_URL", "https://api.fireworks.ai/inference/v1")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) {
    throw new Error(`Fireworks request failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error("Fireworks returned an empty response.");
  return extractJson(text);
}

async function prepareMediaTools(workDir: string) {
  return {
    ffmpeg: await stageExecutable(ffmpegPath, workDir, "ffmpeg"),
    ffprobe: await stageExecutable(ffprobePath, workDir, "ffprobe")
  };
}

async function stageExecutable(source: string, workDir: string, name: string) {
  if (!path.isAbsolute(source)) return source;
  const extension = path.extname(source);
  const stagedPath = path.join(/*turbopackIgnore: true*/ workDir, `${name}${extension}`);
  await copyFile(source, stagedPath);
  if (process.platform !== "win32") {
    await chmod(stagedPath, 0o755);
  }
  return stagedPath;
}

function chooseTimestamps(duration: number, maxFrames: number) {
  const count = Math.max(4, Math.min(maxFrames, Math.ceil(duration / 5)));
  const safeDuration = Math.max(0.2, duration);
  return Array.from({ length: count }, (_, index) => {
    const midpoint = (safeDuration * (index + 0.5)) / count;
    return Number(Math.min(Math.max(0.1, midpoint), Math.max(0.1, safeDuration - 0.25)).toFixed(2));
  });
}

function parseRate(rate?: string) {
  if (!rate) return null;
  if (!rate.includes("/")) return Number(rate);
  const [numerator, denominator] = rate.split("/").map(Number);
  if (!denominator) return null;
  return numerator / denominator;
}

function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("Model response was not valid JSON.");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeCaption(value: unknown): Caption {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    text: stringField(item.text),
    rationale: stringField(item.rationale),
    risk_flags: stringList(item.risk_flags)
  };
}

function factSheet(facts: Facts) {
  return [
    `Summary: ${facts.summary}`,
    `Visible entities: ${facts.visible_entities.join(", ")}`,
    `Actions: ${facts.actions.join(", ")}`,
    `Scene changes: ${facts.scene_changes.join(", ")}`,
    `On-screen text: ${facts.on_screen_text.join(", ")}`,
    `Audio notes: ${facts.audio_notes.join(", ")}`,
    `Uncertainty: ${facts.uncertainty_notes.join(", ")}`
  ].join("\n");
}

function styleInstruction(style: StyleKey) {
  return {
    formal: "Write a concise objective caption with no jokes.",
    sarcastic: "Write dry, light sarcasm while preserving every factual constraint.",
    "humorous-tech": "Use technical humor around debugging, APIs, GPUs, logs, prompts, latency, or deploys.",
    "humorous-non-tech": "Use everyday humor that a non-technical judge can understand."
  }[style];
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scoreField(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function env(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "uploaded-clip.mp4";
}

function publicError(error: unknown) {
  const detail = errorDetails(error);
  if (/ENOENT/i.test(detail) && /ffmpeg|ffprobe/i.test(detail)) {
    return "FFmpeg/ffprobe is required to process uploaded videos. Install FFmpeg or use the Docker image.";
  }
  if (/ffmpeg|ffprobe/i.test(detail)) {
    return "Video processing failed. Check the terminal for the FFmpeg/ffprobe error details.";
  }
  return detail;
}

function errorDetails(error: unknown) {
  const candidate = error as { message?: unknown; stderr?: unknown; stdout?: unknown; code?: unknown };
  const parts = [
    typeof candidate.message === "string" ? candidate.message : "",
    typeof candidate.stderr === "string" ? candidate.stderr : "",
    typeof candidate.stdout === "string" ? candidate.stdout : "",
    candidate.code ? `code=${candidate.code}` : ""
  ].filter(Boolean);
  return (parts.join("\n") || "Unexpected processing failure.")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/fw_[A-Za-z0-9._-]+/g, "fw_[redacted]");
}
