import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const outPath = join(process.cwd(), "submission", "Claption-Hackathon-Deck.pptx");

const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

const slides = [
  {
    title: "Claption",
    subtitle: "Four-tone video captioning for AMD Developer Hackathon ACT II",
    notes: ["Grounded video understanding", "Formal, sarcastic, humorous-tech, humorous-non-tech", "Fireworks AI + FFmpeg + internal LLM judge"]
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
      { heading: "1. Ground", text: "Sample frames with FFmpeg and generate a neutral fact sheet from visible evidence." },
      { heading: "2. Style", text: "Rewrite facts into formal, sarcastic, humorous-tech, and humorous-non-tech captions." },
      { heading: "3. Judge", text: "Score each caption for accuracy, tone, humor, and hallucination risk, then repair weak outputs." }
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

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textShape(id, x, y, cx, cy, lines, options = {}) {
  const fontSize = options.fontSize ?? 2400;
  const color = options.color ?? "151C2B";
  const bold = options.bold ? ' b="1"' : "";
  const paragraphs = lines
    .map((line) => `<a:p><a:r><a:rPr lang="en-US" sz="${fontSize}"${bold}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${escapeXml(line)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${fontSize}"/></a:p>`)
    .join("");
  return `<p:sp>
    <p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>
    <p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>${paragraphs}</p:txBody>
  </p:sp>`;
}

function rectShape(id, x, y, cx, cy, color) {
  return `<p:sp>
    <p:nvSpPr><p:cNvPr id="${id}" name="Block ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>
  </p:sp>`;
}

function bulletLines(items) {
  return items.map((item) => `- ${item}`);
}

function slideXml(slide, index) {
  const shapes = [];
  shapes.push(rectShape(2, 0, 0, SLIDE_W, SLIDE_H, index === 0 ? "F4F0E6" : "FAF8F0"));
  shapes.push(rectShape(3, 0, 0, 260000, SLIDE_H, index % 3 === 0 ? "1F8E5A" : index % 3 === 1 ? "D96B3A" : "315C9C"));

  if (index === 0) {
    shapes.push(textShape(4, 800000, 1050000, 9800000, 1000000, [slide.title], { fontSize: 6400, bold: true, color: "151C2B" }));
    shapes.push(textShape(5, 820000, 2150000, 9000000, 800000, [slide.subtitle], { fontSize: 2500, color: "374151" }));
    shapes.push(textShape(6, 820000, 3350000, 8500000, 1500000, bulletLines(slide.notes), { fontSize: 2200, color: "151C2B" }));
  } else if (slide.columns) {
    shapes.push(textShape(4, 700000, 500000, 10000000, 650000, [slide.title], { fontSize: 4200, bold: true }));
    slide.columns.forEach((column, columnIndex) => {
      const x = 700000 + columnIndex * 3700000;
      shapes.push(rectShape(10 + columnIndex, x, 1700000, 3200000, 3000000, columnIndex === 0 ? "E7F3EA" : columnIndex === 1 ? "F5E1D5" : "DFE8F7"));
      shapes.push(textShape(20 + columnIndex, x + 260000, 2000000, 2600000, 500000, [column.heading], { fontSize: 2600, bold: true }));
      shapes.push(textShape(30 + columnIndex, x + 260000, 2650000, 2600000, 1600000, [column.text], { fontSize: 1900 }));
    });
  } else {
    shapes.push(textShape(4, 700000, 500000, 10000000, 650000, [slide.title], { fontSize: 4200, bold: true }));
    shapes.push(textShape(5, 850000, 1550000, 9700000, 4000000, bulletLines(slide.bullets), { fontSize: 2100 }));
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapes.join("\n")}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function relsXml(slideCount) {
  const slideRels = Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
  <Relationship Id="rId${slideCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;
}

function presentationXml(slideCount) {
  const slideIds = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
}

function contentTypes(slideCount) {
  const slidesXml = Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slidesXml}
</Types>`;
}

const staticFiles = {
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Claption Hackathon Deck</dc:title><dc:creator>Claption</dc:creator><cp:lastModifiedBy>Claption</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-07-13T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-07-13T00:00:00Z</dcterms:modified></cp:coreProperties>`,
  "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Claption</Application><PresentationFormat>Wide</PresentationFormat><Slides>${slides.length}</Slides></Properties>`,
  "ppt/presentation.xml": presentationXml(slides.length),
  "ppt/_rels/presentation.xml.rels": relsXml(slides.length),
  "ppt/slideMasters/slideMaster1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
  "ppt/slideMasters/_rels/slideMaster1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
  "ppt/slideLayouts/slideLayout1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  "ppt/slideLayouts/_rels/slideLayout1.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  "ppt/theme/theme1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Claption"><a:themeElements><a:clrScheme name="Claption"><a:dk1><a:srgbClr val="151C2B"/></a:dk1><a:lt1><a:srgbClr val="FAF8F0"/></a:lt1><a:dk2><a:srgbClr val="374151"/></a:dk2><a:lt2><a:srgbClr val="F4F0E6"/></a:lt2><a:accent1><a:srgbClr val="1F8E5A"/></a:accent1><a:accent2><a:srgbClr val="D96B3A"/></a:accent2><a:accent3><a:srgbClr val="315C9C"/></a:accent3><a:accent4><a:srgbClr val="E7F3EA"/></a:accent4><a:accent5><a:srgbClr val="F5E1D5"/></a:accent5><a:accent6><a:srgbClr val="DFE8F7"/></a:accent6><a:hlink><a:srgbClr val="315C9C"/></a:hlink><a:folHlink><a:srgbClr val="D96B3A"/></a:folHlink></a:clrScheme><a:fontScheme name="Claption"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Claption"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`
};

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function zip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
      u16(nameBuffer.length), u16(0), nameBuffer, data
    ]);
    localParts.push(local);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
      u16(nameBuffer.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBuffer
    ]);
    centralParts.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(Object.keys(files).length), u16(Object.keys(files).length),
    u32(central.length), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, central, end]);
}

const files = {
  "[Content_Types].xml": contentTypes(slides.length),
  ...staticFiles
};

slides.forEach((slide, index) => {
  files[`ppt/slides/slide${index + 1}.xml`] = slideXml(slide, index);
  files[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, zip(files));
console.log(outPath);
