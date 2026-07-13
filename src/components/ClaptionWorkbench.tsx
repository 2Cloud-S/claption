"use client";

import { useMemo, useState } from "react";

type StyleKey = "formal" | "sarcastic" | "humorous-tech" | "humorous-non-tech";

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

type Result = {
  video_id: string;
  metadata: {
    duration: number;
    fps: number | null;
    sampled_frame_timestamps: number[];
  };
  facts: {
    summary: string;
    visible_entities: string[];
    actions: string[];
    uncertainty_notes: string[];
  };
  captions: Record<StyleKey, Caption>;
  judge_scores: Record<StyleKey, JudgeScore>;
};

const styleLabels: Record<StyleKey, string> = {
  formal: "Formal",
  sarcastic: "Sarcastic",
  "humorous-tech": "Humorous-tech",
  "humorous-non-tech": "Humorous-non-tech"
};

const sampleResult: Result = {
  video_id: "sample-clip",
  metadata: {
    duration: 48,
    fps: 30,
    sampled_frame_timestamps: [0, 8, 16, 24, 32, 40, 48]
  },
  facts: {
    summary:
      "A person demonstrates a short activity in a controlled indoor scene while the camera stays focused on the main action.",
    visible_entities: ["person", "indoor setting", "primary object"],
    actions: ["demonstrates", "moves through a short sequence", "finishes the action"],
    uncertainty_notes: ["Sample mode uses placeholder facts until a real video is processed by the Python pipeline."]
  },
  captions: {
    formal: {
      text: "A person completes a brief indoor demonstration while the camera remains focused on the main action.",
      rationale: "Objective summary with no humor.",
      risk_flags: []
    },
    sarcastic: {
      text: "A focused indoor demonstration unfolds, bravely proving that one clear action can indeed fill a whole clip.",
      rationale: "Dry irony without inventing extra events.",
      risk_flags: []
    },
    "humorous-tech": {
      text: "The clip runs a single-action demo with excellent uptime and no visible stack trace.",
      rationale: "Uses software humor while staying tied to the observed action.",
      risk_flags: []
    },
    "humorous-non-tech": {
      text: "Someone gives a quick indoor demo and wraps it up before the room has time to get bored.",
      rationale: "Everyday humor without technical references.",
      risk_flags: []
    }
  },
  judge_scores: {
    formal: { accuracy: 8.7, tone: 9.2, humor: 10, overall: 9.1, critique: "Grounded and direct.", repair_count: 0 },
    sarcastic: { accuracy: 8.5, tone: 8.8, humor: 8.1, overall: 8.5, critique: "Sarcasm is mild and safe.", repair_count: 0 },
    "humorous-tech": { accuracy: 8.4, tone: 9.0, humor: 8.6, overall: 8.7, critique: "Clear technical joke.", repair_count: 0 },
    "humorous-non-tech": { accuracy: 8.6, tone: 8.9, humor: 8.4, overall: 8.6, critique: "Accessible joke.", repair_count: 0 }
  }
};

export function ClaptionWorkbench() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("sample-clip.mp4");
  const [duration, setDuration] = useState(48);
  const [status, setStatus] = useState("Ready");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<Result>(sampleResult);
  const [history, setHistory] = useState<Result[]>([sampleResult]);

  const averageScore = useMemo(() => {
    const scores = Object.values(result.judge_scores).map((score) => score.overall);
    return (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1);
  }, [result]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setFileName(file.name);
    setVideoUrl(URL.createObjectURL(file));
    setStatus("Video loaded");
  }

  async function analyzeVideo() {
    if (!selectedFile) {
      setStatus("Load a video first");
      return;
    }
    setIsProcessing(true);
    setStatus("Extracting frames");
    try {
      const formData = new FormData();
      formData.append("video", selectedFile);
      formData.append("duration", String(duration));
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Caption generation failed.");
      }
      const nextResult = payload as Result;
      setResult(nextResult);
      setHistory((items) => [nextResult, ...items].slice(0, 5));
      setStatus("Scored and repaired");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Caption generation failed");
    } finally {
      setIsProcessing(false);
    }
  }

  function exportJson() {
    download(`claption-${result.video_id}.json`, JSON.stringify(result, null, 2), "application/json");
  }

  function exportCsv() {
    const rows = [
      ["video_id", "style", "caption", "overall", "accuracy", "tone", "humor"],
      ...Object.entries(result.captions).map(([style, caption]) => {
        const score = result.judge_scores[style as StyleKey];
        return [result.video_id, style, caption.text, score.overall, score.accuracy, score.tone, score.humor];
      })
    ];
    download(
      `claption-${result.video_id}.csv`,
      rows.map((row) => row.map(csvCell).join(",")).join("\n"),
      "text/csv"
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>Claption</h1>
          <span>caption lab for AMD GPU tracks</span>
        </div>
        <div className="status-pill">Overall {averageScore} / 10 · {status}</div>
      </header>

      <section className="judge-notice" aria-label="Judge evaluation notice">
        <strong>Judge note:</strong> this Vercel URL is a public UI preview. For automated Track 2 scoring and full
        video processing with system FFmpeg, use the container image{" "}
        <code>ghcr.io/2cloud-s/claption:latest</code>. The Docker path is the intended evaluation runtime.
      </section>

      <section className="workspace" aria-label="Claption workbench">
        <div className="panel">
          <div className="panel-header">
            <h2>Video input</h2>
            <span className="status-pill">{fileName}</span>
          </div>
          <div className="panel-body">
            <div className="video-frame">
              {videoUrl ? (
                <video src={videoUrl} controls onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
              ) : (
                <p className="empty-video">
                  Load one of the hackathon clips to preview the four-style caption pass. Judges should use the Docker
                  image for the official run because it includes the full FFmpeg runtime.
                </p>
              )}
            </div>

            <div className="controls">
              <input className="file-input" type="file" accept="video/*" onChange={onFileChange} />
              <div className="button-row">
                <button className="btn" onClick={analyzeVideo} disabled={!selectedFile || isProcessing}>
                  {isProcessing ? "Analyzing" : "Analyze clip"}
                </button>
                <button className="btn secondary" onClick={exportJson}>
                  Export JSON
                </button>
                <button className="btn secondary" onClick={exportCsv}>
                  Export CSV
                </button>
              </div>
            </div>

            <div className="facts">
              <strong>Grounded facts</strong>
              <p>{result.facts.summary}</p>
              <p>Actions: {result.facts.actions.join(", ")}</p>
              <p>Uncertainty: {result.facts.uncertainty_notes.join(" ")}</p>
            </div>

            <div className="history" aria-label="Run history">
              <strong>Run history</strong>
              {history.map((item) => (
                <div className="history-row" key={`${item.video_id}-${item.metadata.duration}-${item.judge_scores.formal.overall}`}>
                  <span>{item.video_id}</span>
                  <span>{averageOf(item.judge_scores).toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Four judged captions</h2>
            <span className="status-pill">{result.metadata.sampled_frame_timestamps.length} frames</span>
          </div>
          <div className="panel-body">
            <div className="caption-grid">
              {(Object.keys(styleLabels) as StyleKey[]).map((style) => {
                const caption = result.captions[style];
                const score = result.judge_scores[style];
                return (
                  <article className="caption-card" key={style}>
                    <div className="scorebar">
                      <h3>{styleLabels[style]}</h3>
                      <span className="score">{score.overall.toFixed(1)}</span>
                    </div>
                    <p className="caption-text">{caption.text}</p>
                    <p className="caption-meta">{caption.rationale}</p>
                    <p className="caption-meta">{score.critique}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function averageOf(scores: Record<StyleKey, JudgeScore>) {
  const values = Object.values(scores).map((score) => score.overall);
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function download(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
