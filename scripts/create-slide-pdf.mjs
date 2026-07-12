import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const outPath = join(process.cwd(), "submission", "Claption-Hackathon-Deck.pdf");
const pageW = 960;
const pageH = 540;

const slides = [
  {
    title: "Claption",
    subtitle: "Four-tone video captioning for AMD Developer Hackathon ACT II",
    bullets: [
      "Grounded video understanding",
      "Formal, sarcastic, humorous-tech, humorous-non-tech",
      "Fireworks AI + FFmpeg + internal LLM judge"
    ],
    cover: true
  },
  {
    title: "The Challenge",
    bullets: [
      "Generate accurate captions for short fixed video clips.",
      "Return four distinct tones for every clip.",
      "Win with factual accuracy, style consistency, and low hallucination risk.",
      "Submission must be public, containerized, runnable, and judge-friendly."
    ]
  },
  {
    title: "Product Idea",
    bullets: [
      "Claption is a caption lab for turning one video into four polished captions.",
      "The app exposes a simple upload-to-results workflow for demos.",
      "The CLI supports batch processing for judge-provided video folders.",
      "Exports are JSON and CSV, matching the expected evaluation surface."
    ]
  },
  {
    title: "Pipeline",
    columns: [
      ["1. Ground", "Sample frames with FFmpeg and generate a neutral fact sheet from visible evidence."],
      ["2. Style", "Rewrite facts into formal, sarcastic, humorous-tech, and humorous-non-tech captions."],
      ["3. Judge", "Score each caption for accuracy, tone, humor, and hallucination risk, then repair weak outputs."]
    ]
  },
  {
    title: "Why It Scores Well",
    bullets: [
      "Facts are captured before jokes are written.",
      "All four tones use the same grounded fact sheet, keeping outputs consistent.",
      "The internal judge loop rehearses the hackathon scoring criteria.",
      "Repair is targeted per style, preserving good captions while improving weak ones."
    ]
  },
  {
    title: "Technology",
    bullets: [
      "Next.js app for upload, preview, caption cards, scores, history, and export.",
      "Python CLI for batch runs, schema validation, evaluation summaries, and JSONL batch requests.",
      "FFmpeg/ffprobe for deterministic frame sampling.",
      "Fireworks AI serverless models: Qwen3.7 Plus for vision/captioning and Kimi K2.7 Code for judging."
    ]
  },
  {
    title: "Demo Flow",
    bullets: [
      "Upload a 30s-2min video clip.",
      "Click Analyze clip.",
      "Inspect grounded facts and four caption cards.",
      "Export JSON or CSV for leaderboard-style evaluation.",
      "For bulk testing, mount /videos and run the CLI inside the container."
    ]
  },
  {
    title: "Containerized Submission",
    bullets: [
      "Dockerfile installs Node, Python, FFmpeg, and Claption in one image.",
      "GitHub Actions builds the container remotely and can publish to GHCR.",
      "Secrets are injected at runtime through FIREWORKS_API_KEY.",
      "The repo includes README, .env.example, sample outputs, and judge runbook."
    ]
  },
  {
    title: "Scaling Beyond the Hackathon",
    bullets: [
      "Batch inference for larger video libraries.",
      "Audio transcription and OCR can enrich the fact sheet.",
      "Fine-tuned style adapters can specialize humor and brand voice.",
      "Potential use cases: social captions, accessibility summaries, education clips, moderation previews, and creator tooling."
    ]
  }
];

function rgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  ];
}

function esc(text) {
  return String(text).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function fill(hex) {
  const [r, g, b] = rgb(hex);
  return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} rg`;
}

function rect(x, y, w, h, color) {
  return `${fill(color)}\n${x} ${y} ${w} ${h} re f`;
}

function textLine(text, x, y, size, color = "#151C2B", bold = false) {
  return `BT\n${fill(color)}\n/${bold ? "F2" : "F1"} ${size} Tf\n1 0 0 1 ${x} ${y} Tm\n(${esc(text)}) Tj\nET`;
}

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function bullet(text, x, y, maxChars, size = 19) {
  const lines = wrap(text, maxChars);
  const cmds = [textLine("•", x, y, size, "#315C9C", true)];
  lines.forEach((line, index) => {
    cmds.push(textLine(line, x + 26, y - index * (size + 8), size, "#151C2B"));
  });
  return { cmds, nextY: y - lines.length * (size + 8) - 14 };
}

function pageContent(slide, index) {
  const cmds = [];
  cmds.push(rect(0, 0, pageW, pageH, index === 0 ? "#F4F0E6" : "#FAF8F0"));
  cmds.push(rect(0, 0, 20, pageH, index % 3 === 0 ? "#1F8E5A" : index % 3 === 1 ? "#D96B3A" : "#315C9C"));

  if (slide.cover) {
    cmds.push(textLine(slide.title, 70, 365, 58, "#151C2B", true));
    cmds.push(textLine(slide.subtitle, 72, 318, 22, "#374151"));
    let y = 235;
    for (const item of slide.bullets) {
      const b = bullet(item, 78, y, 74, 21);
      cmds.push(...b.cmds);
      y = b.nextY;
    }
    cmds.push(textLine("AMD Developer Hackathon ACT II", 72, 70, 15, "#374151", true));
    return cmds.join("\n");
  }

  cmds.push(textLine(slide.title, 58, 462, 38, "#151C2B", true));

  if (slide.columns) {
    const colors = ["#E7F3EA", "#F5E1D5", "#DFE8F7"];
    slide.columns.forEach(([heading, body], columnIndex) => {
      const x = 58 + columnIndex * 295;
      cmds.push(rect(x, 145, 255, 250, colors[columnIndex]));
      cmds.push(textLine(heading, x + 20, 348, 22, "#151C2B", true));
      let y = 296;
      for (const line of wrap(body, 25)) {
        cmds.push(textLine(line, x + 20, y, 17, "#151C2B"));
        y -= 27;
      }
    });
    return cmds.join("\n");
  }

  let y = 382;
  for (const item of slide.bullets) {
    const b = bullet(item, 72, y, 82, 19);
    cmds.push(...b.cmds);
    y = b.nextY;
  }

  return cmds.join("\n");
}

function pdfString() {
  const objects = [];
  const add = (value) => {
    objects.push(value);
    return objects.length;
  };

  const catalogId = add("pending");
  const pagesId = add("pending");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds = [];

  slides.forEach((slide, index) => {
    const stream = pageContent(slide, index);
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return output;
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, pdfString());
console.log(outPath);
