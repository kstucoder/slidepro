const { spawn } = require("node:child_process");
const sharp = require("sharp");
const { normalizeFlowchartData } = require("./flowchart-data");

const MAX_DOT_BYTES = 64 * 1024;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;

function escapeDotText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\n");
}

function buildFlowchartDot(input) {
  const flowchart = normalizeFlowchartData(input);
  const lines = [
    "digraph Flowchart {",
    '  graph [rankdir=TB, bgcolor="white", pad="0.18", nodesep="0.24", ranksep="0.34", splines=ortho, fontname="DejaVu Sans", labelloc="t", label="' + escapeDotText(flowchart.title) + '", fontsize=18, fontcolor="#18324B"];',
    '  node [style="rounded,filled", color="#457B9D", fillcolor="#F0F7FA", penwidth=1.4, fontname="DejaVu Sans", fontsize=12, fontcolor="#18324B", margin="0.16,0.10"];',
    '  edge [color="#457B9D", penwidth=1.5, arrowsize=0.8, fontname="DejaVu Sans", fontsize=10, fontcolor="#40566B"];',
  ];

  for (const node of flowchart.nodes) {
    const label = escapeDotText(node.label);
    const options = {
      start: 'shape=oval, fillcolor="#E5F4EA", color="#4C956C"',
      end: 'shape=oval, fillcolor="#E5F4EA", color="#4C956C"',
      process: 'shape=box, style="rounded,filled"',
      decision: 'shape=diamond, style="filled", fillcolor="#FFF3D6", color="#D4A72C", width=2.8, height=0.85, margin="0.10,0.04"',
      input: 'shape=parallelogram, style="filled", fillcolor="#F5F8FC"',
      output: 'shape=parallelogram, style="filled", fillcolor="#E5F4EA", color="#4C956C"',
    }[node.kind];
    lines.push(`  ${node.id} [label="${label}", ${options}];`);
  }

  for (const edge of flowchart.edges) {
    const isNegative = /^(yo'q|yo‘q|yo'q|no|false)$/i.test(edge.label);
    const edgeAttributes = [];
    if (edge.label) edgeAttributes.push(`label="${escapeDotText(edge.label)}"`);
    if (isNegative) edgeAttributes.push('color="#D9776A"', 'fontcolor="#D9776A"');
    const attributes = edgeAttributes.length ? ` [${edgeAttributes.join(", ")}]` : "";
    lines.push(`  ${edge.from} -> ${edge.to}${attributes};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function runGraphviz(dot) {
  if (Buffer.byteLength(dot, "utf8") > MAX_DOT_BYTES) {
    return Promise.reject(new Error("flowchart: DOT manbasi ruxsat etilgan hajmdan katta"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdoutBytes = 0;
    let stderr = "";
    const stdout = [];
    const child = spawn("dot", ["-Tpng", "-Gdpi=160"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, RENDER_TIMEOUT_MS);

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    child.on("error", error => {
      finish(new Error(`flowchart: Graphviz ishga tushmadi (${error.message})`));
    });
    child.stdout.on("data", chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_PNG_BYTES) {
        child.kill("SIGKILL");
        finish(new Error("flowchart: Graphviz natijasi 8 MB limitdan oshdi"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", chunk => {
      if (stderr.length < 2000) stderr += chunk.toString("utf8").slice(0, 2000 - stderr.length);
    });
    child.on("close", code => {
      if (timedOut) return finish(new Error("flowchart: Graphviz render 15 soniyada tugamadi"));
      if (code !== 0) return finish(new Error(`flowchart: Graphviz render xatosi (${String(stderr).trim().slice(0, 500) || `exit ${code}`})`));
      if (!stdoutBytes) return finish(new Error("flowchart: Graphviz bo'sh rasm qaytardi"));
      finish(null, Buffer.concat(stdout, stdoutBytes));
    });
    child.stdin.on("error", error => {
      if (!settled) finish(new Error(`flowchart: DOT manbasini Graphvizga yuborib bo'lmadi (${error.message})`));
    });
    child.stdin.end(dot, "utf8");
  });
}

async function renderFlowchart(input) {
  const dot = buildFlowchartDot(input);
  const rawPng = await runGraphviz(dot);
  const normalizedPng = await sharp(rawPng)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width: 1400, height: 1800, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const metadata = await sharp(normalizedPng).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height) {
    throw new Error("flowchart: yaroqli PNG rasm olinmadi");
  }
  const scale = Math.min(520 / metadata.width, 620 / metadata.height, 1);
  return {
    buf: normalizedPng,
    width: Math.max(1, Math.round(metadata.width * scale)),
    height: Math.max(1, Math.round(metadata.height * scale)),
  };
}

module.exports = { buildFlowchartDot, renderFlowchart };
