const { spawn } = require("node:child_process");
const sharp = require("sharp");
const { normalizeFlowchartData } = require("./flowchart-data");
const { getFlowchartTemplate } = require("./flowchart-templates");
const { classifyGraphvizType, isGraphvizDiagramType } = require("./diagram-types");

const MAX_DOT_BYTES = 64 * 1024;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;
const FLOWCHART_HEIGHT_SCALE = 1.5;
const FLOWCHART_LABEL_LINE_LENGTH = 20;

function escapeDotText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\n");
}

function wrapFlowchartLabel(value, maxLineLength = FLOWCHART_LABEL_LINE_LENGTH) {
  const lines = [];
  let line = "";
  for (const word of String(value).trim().split(/\s+/).filter(Boolean)) {
    const parts = [];
    const characters = Array.from(word);
    for (let offset = 0; offset < characters.length; offset += maxLineLength) {
      parts.push(characters.slice(offset, offset + maxLineLength).join(""));
    }
    for (const part of parts) {
      if (line && line.length + 1 + part.length > maxLineLength) {
        lines.push(line);
        line = part;
      } else {
        line += `${line ? " " : ""}${part}`;
      }
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

function buildFlowchartDot(input, { wrapLabels = true, ranksepMultiplier = FLOWCHART_HEIGHT_SCALE } = {}) {
  const explicitType = input?.diagram_type || input?.template_id;
  if (explicitType && !isGraphvizDiagramType(explicitType)) {
    throw new Error(`flowchart: noma'lum diagram_type (${explicitType})`);
  }
  const diagramType = explicitType || classifyGraphvizType({
    topic: input?.title,
    planTitle: input?.title,
    purpose: input?.caption,
  });
  const template = getFlowchartTemplate(diagramType);
  const flowchart = normalizeFlowchartData(input, { diagramType: template.id });
  const graphAttrs = template.graphAttrs.map(attribute => {
    const ranksep = attribute.match(/^ranksep="([\d.]+)"$/);
    return ranksep
      ? `ranksep="${(Number(ranksep[1]) * ranksepMultiplier).toFixed(3)}"`
      : attribute;
  });
  const graphTitle = wrapLabels ? wrapFlowchartLabel(flowchart.title) : flowchart.title;
  const lines = [
    "digraph Flowchart {",
    `  graph [${[...graphAttrs, 'bgcolor="white"', 'pad="0.18"', 'fontname="Times New Roman"', 'labelloc="t"', `label="${escapeDotText(graphTitle)}"`, 'fontsize=18', 'fontcolor="#18324B"'].join(", ")}];`,
    '  node [color="#457B9D", penwidth=1.4, fontname="Times New Roman", fontsize=12, fontcolor="#18324B", margin="0.16,0.10"];',
    `  edge [${[...template.edgeAttrs, 'fontname="Times New Roman"', 'fontsize=10', 'fontcolor="#40566B"'].join(", ")}];`,
  ];

  const nodeLine = (node, index) => {
    const label = escapeDotText(wrapLabels ? wrapFlowchartLabel(node.label) : node.label);
    const options = template.nodeAttrs[node.kind];
    return `    ${node.id} [label="${label}", ${options}];`;
  };

  flowchart.nodes.forEach((node, index) => lines.push(nodeLine(node, index)));

  for (const edge of flowchart.edges) {
    const edgeAttributes = [];
    if (edge.label) edgeAttributes.push(`label="${escapeDotText(edge.label)}"`);
    const fromIndex = flowchart.nodes.findIndex(node => node.id === edge.from);
    const toIndex = flowchart.nodes.findIndex(node => node.id === edge.to);
    if (template.id === "pid_control_system" && edge.from === flowchart.nodes.find(node => node.kind === "sensor")?.id) {
      edgeAttributes.push('constraint=false', 'minlen=2', 'color="#A15C45"');
    } else if (template.id === "algorithm_flowchart" && toIndex <= fromIndex) {
      edgeAttributes.push('constraint=false', 'minlen=2');
    }
    const attributes = edgeAttributes.length ? ` [${edgeAttributes.join(", ")}]` : "";
    lines.push(`  ${edge.from} -> ${edge.to}${attributes};`);
  }

  if (template.id === "process_sequence") {
    for (let index = 0; index < flowchart.nodes.length - 1; index++) {
      const current = flowchart.nodes[index];
      const next = flowchart.nodes[index + 1];
      if (flowchart.edges.some(edge => edge.from === current.id && edge.to === next.id)) continue;
      lines.push(`  ${current.id} -> ${next.id} [style=invis, weight=100, arrowhead=none];`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function runGraphviz(dot, layoutEngine = "dot") {
  if (Buffer.byteLength(dot, "utf8") > MAX_DOT_BYTES) {
    return Promise.reject(new Error("flowchart: DOT manbasi ruxsat etilgan hajmdan katta"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let stdoutBytes = 0;
    let stderr = "";
    const stdout = [];
    const child = spawn("dot", [`-K${layoutEngine}`, "-Tpng", "-Gdpi=160"], {
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
  const template = getFlowchartTemplate(input?.template_id);
  const rawPng = await runGraphviz(dot, template.layoutEngine);
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
