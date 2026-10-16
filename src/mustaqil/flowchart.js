const { spawn } = require("node:child_process");
const sharp = require("sharp");
const { normalizeFlowchartData } = require("./flowchart-data");
const { getFlowchartTemplate } = require("./flowchart-templates");

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
  const template = getFlowchartTemplate(input?.template_id);
  const graphAttrs = template.graphAttrs;
  const lines = [
    "digraph Flowchart {",
    `  graph [${[...graphAttrs, 'bgcolor="white"', 'pad="0.18"', 'fontname="DejaVu Sans"', 'labelloc="t"', `label="${escapeDotText(flowchart.title)}"`, 'fontsize=18', 'fontcolor="#18324B"'].join(", ")}];`,
    '  node [color="#457B9D", penwidth=1.4, fontname="DejaVu Sans", fontsize=12, fontcolor="#18324B", margin="0.16,0.10"];',
    `  edge [${[...template.edgeAttrs, 'fontname="DejaVu Sans"', 'fontsize=10', 'fontcolor="#40566B"'].join(", ")}];`,
  ];

  const nodeLine = node => {
    const label = escapeDotText(node.label);
    const options = template.nodeAttrs[node.kind] || template.nodeAttrs.process;
    return `    ${node.id} [label="${label}", ${options}];`;
  };

  flowchart.nodes.forEach(node => lines.push(nodeLine(node)));
  const rows = [flowchart.nodes.slice(0, 3), flowchart.nodes.slice(3, 5)];
  for (const row of rows) {
    lines.push(`  { rank=same; ${row.map(node => node.id).join("; ")}; }`);
    for (let index = 0; index < row.length - 1; index++) {
      lines.push(`  ${row[index].id} -> ${row[index + 1].id} [style=invis, weight=100, arrowhead=none];`);
    }
  }
  lines.push(`  ${rows[0][2].id} -> ${rows[1][0].id} [style=invis, weight=100, arrowhead=none];`);

  for (const edge of flowchart.edges) {
    const edgeAttributes = [];
    if (edge.label) edgeAttributes.push(`label="${escapeDotText(edge.label)}"`);
    const attributes = edgeAttributes.length ? ` [${edgeAttributes.join(", ")}]` : "";
    lines.push(`  ${edge.from} -> ${edge.to}${attributes};`);
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
