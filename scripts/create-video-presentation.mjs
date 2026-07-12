import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outPath = join(root, "submission", "Claption-Video-Presentation.mp4");
const buildDir = join(root, "submission", "video-build");
const listPath = join(buildDir, "segments.txt");
const fontRegular = "C\\:/Windows/Fonts/arial.ttf";
const fontBold = "C\\:/Windows/Fonts/arialbd.ttf";
const width = 1280;
const height = 720;
const fps = 30;

const slides = [
  {
    duration: 7,
    title: "Claption",
    subtitle: "Four-tone video captioning for AMD Developer Hackathon ACT II",
    bullets: [
      "Grounded video facts first, jokes second.",
      "One clip becomes formal, sarcastic, humorous-tech, and humorous-non-tech captions.",
      "Built for Fireworks AI, FFmpeg, Docker, and judge-friendly exports."
    ],
    accent: "0x1F8E5A",
    footer: "Submission video: product, pipeline, scoring strategy, and demo path"
  },
  {
    duration: 7,
    title: "Hackathon Goal",
    bullets: [
      "Track: Video Captioning.",
      "Input: fixed short clips between 30 seconds and 2 minutes.",
      "Output: four caption styles per video.",
      "Judging focuses on factual accuracy and tone match."
    ],
    accent: "0xD96B3A",
    footer: "Claption is optimized around the same signals the LLM judge will inspect."
  },
  {
    duration: 8,
    title: "Core Idea",
    bullets: [
      "Do not ask the model to be funny before it knows what happened.",
      "First extract a neutral fact sheet from sampled frames.",
      "Then generate each style from those same grounded facts.",
      "Finally score and repair weak captions before export."
    ],
    accent: "0x315C9C",
    footer: "This reduces hallucinations while still leaving room for humor."
  },
  {
    duration: 8,
    title: "Agent Pipeline",
    bullets: [
      "Grounding agent: FFmpeg samples frames and Fireworks VLM returns timestamped observations.",
      "Caption agent: converts the fact sheet into the four required styles.",
      "Judge agent: scores accuracy, tone, humor, clarity, and hallucination risk.",
      "Repair pass: regenerates only captions below the threshold."
    ],
    accent: "0x1F8E5A",
    footer: "The same schema powers both the web app and CLI batch runs."
  },
  {
    duration: 7,
    title: "Demo Experience",
    bullets: [
      "Upload a clip in the Next.js app.",
      "Preview the video beside four caption cards.",
      "Inspect score badges, risk flags, and grounded facts.",
      "Export JSON or CSV for evaluation and submission evidence."
    ],
    accent: "0xD96B3A",
    footer: "The first screen is the real tool, not a landing page."
  },
  {
    duration: 7,
    title: "Judge Path",
    bullets: [
      "Public GitHub repo contains setup and usage instructions.",
      "Docker image includes Node, Python, FFmpeg, and the app.",
      "Judges can run the UI or process a folder through the CLI.",
      "No Fireworks key is exposed to the browser or output files."
    ],
    accent: "0x315C9C",
    footer: "Runtime secrets stay server-side through FIREWORKS_API_KEY."
  },
  {
    duration: 7,
    title: "Tech Stack",
    bullets: [
      "Next.js for the demo app and processing API.",
      "Python CLI for batch processing, evaluation, and exports.",
      "Fireworks AI models for vision, caption generation, and judging.",
      "AMD GPU cloud path for scaling, benchmarking, and future fine-tuning."
    ],
    accent: "0x1F8E5A",
    footer: "The architecture matches the hackathon compute and technology requirements."
  },
  {
    duration: 7,
    title: "Why Claption Can Score",
    bullets: [
      "Accuracy: captions are constrained to the fact sheet.",
      "Tone: every style has explicit rules and independent scoring.",
      "Humor: jokes are allowed, invented actions are not.",
      "Reliability: self-repair catches weak or off-tone outputs."
    ],
    accent: "0xD96B3A",
    footer: "The project rehearses the judging loop before the judges run it."
  },
  {
    duration: 6,
    title: "Claption",
    subtitle: "Accurate captions. Four tones. One judge-ready pipeline.",
    bullets: [
      "Live app for demos.",
      "Containerized CLI for judge runs.",
      "Scalable path for batch inference and fine-tuned style adapters."
    ],
    accent: "0x315C9C",
    footer: "Ready for lablab.ai submission."
  }
];

function wrap(text, limit) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function filterText(text) {
  return String(text)
    .replaceAll("\\", "/")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll(",", "\\,");
}

function drawText({ text, x, y, size, color = "0x151C2B", bold = false }) {
  const params = [
    `fontfile='${bold ? fontBold : fontRegular}'`,
    `text='${filterText(text)}'`,
    `x=${x}`,
    `y=${y}`,
    `fontsize=${size}`,
    `fontcolor=${color}`,
    "line_spacing=8",
    "borderw=0"
  ];
  return `drawtext=${params.join(":")}`;
}

function slideFilter(slide, index) {
  const filters = [
    "format=yuv420p",
    "drawbox=x=0:y=0:w=1280:h=720:color=0xFAF8F0:t=fill",
    `drawbox=x=0:y=0:w=34:h=720:color=${slide.accent}:t=fill`,
    `drawbox=x=50:y=530:w=1180:h=2:color=${slide.accent}:t=fill`,
    drawText({ text: slide.title, x: 78, y: 72, size: index === 0 ? 68 : 52, color: "0x151C2B", bold: true })
  ];

  let y = slide.subtitle ? 178 : 178;
  if (slide.subtitle) {
    filters.push(drawText({ text: slide.subtitle, x: 82, y, size: 28, color: "0x374151" }));
    y += 74;
  }

  for (const bullet of slide.bullets) {
    const lines = wrap(bullet, 76);
    filters.push(drawText({ text: "•", x: 88, y, size: 30, color: slide.accent, bold: true }));
    lines.forEach((line, lineIndex) => {
      filters.push(drawText({ text: line, x: 126, y: y + lineIndex * 38, size: 27, color: "0x151C2B" }));
    });
    y += lines.length * 38 + 22;
  }

  filters.push(drawText({ text: slide.footer, x: 78, y: 570, size: 22, color: "0x374151" }));
  filters.push(drawText({ text: `${index + 1}/${slides.length}`, x: 1168, y: 642, size: 20, color: "0x374151", bold: true }));
  return filters.join(",");
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

mkdirSync(buildDir, { recursive: true });

slides.forEach((slide, index) => {
  const segmentPath = join(buildDir, `segment-${String(index + 1).padStart(2, "0")}.mp4`);
  run("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0xFAF8F0:s=${width}x${height}:r=${fps}:d=${slide.duration}`,
    "-vf", slideFilter(slide, index),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    segmentPath
  ]);
});

writeFileSync(
  listPath,
  slides
    .map((_, index) => `file '${join(buildDir, `segment-${String(index + 1).padStart(2, "0")}.mp4`).replaceAll("\\", "/")}'`)
    .join("\n")
);

run("ffmpeg", [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", listPath,
  "-c", "copy",
  outPath
]);

rmSync(buildDir, { recursive: true, force: true });
console.log(outPath);
