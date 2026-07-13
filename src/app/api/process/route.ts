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
Analyze the timestamped silent frames as one chronological video.
Describe only details supported by the frames, favoring actions or entities visible in multiple frames.
Do not guess identities, relationships, locations, brands, emotions, motives, causes, outcomes, speech, or off-screen events.
Treat a detail seen in only one ambiguous frame as uncertain. Do not turn uncertainty into a caption claim.
Use concrete nouns and precise visible verbs. Never hide the action behind generic phrases such as "does something," "main action," "activity," or "demonstration."
Transcribe on-screen text only when clearly legible; otherwise place it in uncertainty_notes.
The frames contain no audio: audio_notes must be an empty array.
Write a neutral one-sentence summary of the main visible action, then return strict JSON with exactly:
summary, visible_entities, actions, scene_changes, on_screen_text, audio_notes, uncertainty_notes.`;

const captionPrompt = `You are Claption's caption agent.
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
- humorous-non-tech: one clear everyday-life comparison understandable without technical knowledge; avoid all computing jargon.`;

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
    const maxFrames = clampNumber(Number(process.env.CLAPTION_MAX_FRAMES ?? 12), 1, 30);
    const timestamps = chooseTimestamps(probed.duration, maxFrames);
    const framePayloads = await sampleFrames(videoPath, workDir, timestamps, tools.ffmpeg);

    const facts = await groundVideo(framePayloads, timestamps.slice(0, framePayloads.length), safeName);
    let captions = await generateCaptions(facts);
    const qualityIssues = captionQualityIssues(captions);
    if (Object.keys(qualityIssues).length > 0) {
      captions = await repairCaptionSet(facts, captions, qualityIssues);
    }
    const judgeScores: Record<StyleKey, JudgeScore> = {} as Record<StyleKey, JudgeScore>;
    const repairThreshold = Number(process.env.CLAPTION_REPAIR_THRESHOLD ?? 8.0);

    if (envFlag("CLAPTION_ENABLE_INTERNAL_JUDGE")) {
      for (const style of styles) {
        let score = await judgeCaption(facts, style, captions[style], 0);
        if (score.overall < repairThreshold) {
          captions[style] = await repairCaption(facts, style, captions[style], score.critique);
          score = await judgeCaption(facts, style, captions[style], 1);
        }
        judgeScores[style] = score;
      }
    } else {
      for (const style of styles) {
        judgeScores[style] = fastScore(style);
      }
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
      "scale=min(640\\,iw):-2",
      "-q:v",
      "6",
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

async function groundVideo(framesBase64: string[], timestamps: number[], videoName: string): Promise<Facts> {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${groundingPrompt}\nVideo file: ${videoName}\nThe following frames are ordered by timestamp.`
    }
  ];
  framesBase64.forEach((image, index) => {
    content.push({ type: "text", text: `Frame ${index + 1} at ${timestamps[index].toFixed(2)} seconds:` });
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } });
  });
  const data = await fireworksJson(env("FIREWORKS_VISION_MODEL", "accounts/fireworks/models/qwen3p7-plus"), [
    { role: "user", content }
  ], 0.05, { maxTokens: 1200, reasoningEffort: "none" });
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
    0.25,
    { maxTokens: 1400, reasoningEffort: "none" }
  );
  const captions = {} as Record<StyleKey, Caption>;
  for (const style of styles) {
    captions[style] = normalizeCaption(data[style]);
  }
  return captions;
}

async function repairCaptionSet(
  facts: Facts,
  captions: Record<StyleKey, Caption>,
  issues: Partial<Record<StyleKey, string[]>>
): Promise<Record<StyleKey, Caption>> {
  const flaggedStyles = styles.filter((style) => issues[style]?.length);
  const data = await fireworksJson(
    env("FIREWORKS_TEXT_MODEL", "accounts/fireworks/models/qwen3p7-plus"),
    [
      { role: "system", content: captionPrompt },
      {
        role: "user",
        content: [
          "Correct only the flagged captions and return strict JSON keyed only by the flagged styles.",
          `Fact sheet:\n${factSheet(facts)}`,
          `Current captions:\n${JSON.stringify(captions)}`,
          `Flagged issues:\n${JSON.stringify(issues)}`
        ].join("\n\n")
      }
    ],
    0.15,
    { maxTokens: 900, reasoningEffort: "none" }
  );
  const repaired = { ...captions };
  for (const style of flaggedStyles) {
    const candidate = normalizeCaption(data[style]);
    if (candidate.text) repaired[style] = candidate;
  }
  return repaired;
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

async function fireworksJson(
  model: string,
  messages: Array<Record<string, unknown>>,
  temperature = 0.2,
  options: { maxTokens?: number; reasoningEffort?: "none" | "low" | "medium" | "high" } = {}
) {
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
      max_tokens: options.maxTokens ?? 1200,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
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
  const count = Math.max(Math.min(8, maxFrames), Math.min(maxFrames, Math.ceil(duration / 5)));
  const safeDuration = Math.max(0.2, duration);
  const start = Math.min(0.35, safeDuration / 4);
  const end = Math.max(start, safeDuration - 0.35);
  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? start : start + ((end - start) * index) / (count - 1);
    return Number(position.toFixed(2));
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
    formal: "One objective sentence with no jokes, irony, exaggeration, or opinion.",
    sarcastic: "One unmistakably dry, ironic sentence that keeps the visual facts literal and adds no mishap.",
    "humorous-tech": "One grounded sentence with a clear software or AI analogy, without claiming technology is visible.",
    "humorous-non-tech": "One grounded sentence with an everyday-life comparison and no computing jargon."
  }[style];
}

function captionQualityIssues(captions: Record<StyleKey, Caption>) {
  const issues: Partial<Record<StyleKey, string[]>> = {};
  const normalized = new Map<string, StyleKey>();
  const techTerms = /\b(apis?|bugs?|cache|code|cpu|debug(?:s|ged|ging)?|deploy(?:s|ed|ing|ment)?|gpus?|latency|logs?|prompts?|servers?|stack|tokens?)\b/i;
  const sarcasmCues = /\b(apparently|as if|because clearly|clearly|naturally|of course|surely|what could be|masterclass|bold choice)\b/i;
  const genericTerms = /\b(main action|activity|demonstration|does something|doing something|some object|something happens)\b/i;

  for (const style of styles) {
    const caption = captions[style];
    const styleIssues: string[] = [];
    const words = caption.text.trim().split(/\s+/).filter(Boolean);
    if (!caption.text.trim()) styleIssues.push("caption is empty");
    if (words.length < 8 || words.length > 28) styleIssues.push("caption must contain 8-28 words");
    if (caption.risk_flags.length > 0) styleIssues.push("caption contains a possible unsupported claim");
    if (genericTerms.test(caption.text)) styleIssues.push("caption uses generic language instead of the concrete visible action");
    if (style === "formal" && /[!?]|\b(apparently|hilarious|masterclass|of course)\b/i.test(caption.text)) {
      styleIssues.push("formal tone contains humor, irony, or emphasis");
    }
    if (style === "sarcastic" && !sarcasmCues.test(caption.text)) {
      styleIssues.push("sarcastic tone is not explicit enough for an LLM judge");
    }
    if (style === "humorous-tech" && !techTerms.test(caption.text)) {
      styleIssues.push("humorous-tech caption lacks a recognizable technical analogy");
    }
    if (style === "humorous-non-tech" && techTerms.test(caption.text)) {
      styleIssues.push("humorous-non-tech caption contains computing jargon");
    }
    const fingerprint = caption.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const duplicateOf = normalized.get(fingerprint);
    if (fingerprint && duplicateOf) styleIssues.push(`caption duplicates ${duplicateOf}`);
    if (fingerprint) normalized.set(fingerprint, style);
    if (styleIssues.length) issues[style] = styleIssues;
  }
  return issues;
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

function fastScore(style: StyleKey): JudgeScore {
  return {
    accuracy: 0,
    tone: 0,
    humor: 0,
    overall: 0,
    critique: `Internal judge skipped for fast AMD scoring mode (${style}).`,
    repair_count: 0
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function env(name: string, fallback: string) {
  return process.env[name] || fallback;
}

function envFlag(name: string) {
  return ["1", "true", "yes", "on"].includes((process.env[name] || "").toLowerCase());
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
