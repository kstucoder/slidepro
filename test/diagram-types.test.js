const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const sharp = require("sharp");
const {
  GRAPHVIZ_DIAGRAM_TYPES,
  MATPLOTLIB_DIAGRAM_TYPES,
  classifyGraphvizType,
  classifyMatplotlibType,
} = require("../src/mustaqil/diagram-types");
const { normalizeFlowchartData } = require("../src/mustaqil/flowchart-data");
const { buildFlowchartDot } = require("../src/mustaqil/flowchart");
const { normalizeChartData, safeMathExpression } = require("../src/mustaqil/chart-data");
const { renderChart } = require("../src/mustaqil/chart");

const algorithm = {
  diagram_type: "algorithm_flowchart",
  title: "Suv sifatini tekshirish algoritmi",
  nodes: [
    { id: "start", label: "Boshlash", kind: "start" },
    { id: "measure", label: "Suvni o'lchash", kind: "process" },
    { id: "check", label: "Mezonni tekshirish", kind: "decision" },
    { id: "treat", label: "Suvni tozalash", kind: "process" },
    { id: "end", label: "Tugatish", kind: "end" },
  ],
  edges: [
    { from: "start", to: "measure" },
    { from: "measure", to: "check" },
    { from: "check", to: "treat", label: "Ha" },
    { from: "check", to: "end", label: "Yo'q" },
    { from: "treat", to: "end" },
  ],
};

const pid = {
  diagram_type: "pid_control_system",
  title: "PID yopiq boshqaruv konturi",
  nodes: [
    { id: "ref", label: "Topshiriq signali", kind: "input" },
    { id: "sum", label: "Xatolik yig'indisi", kind: "sum" },
    { id: "pid", label: "PID rostlagich", kind: "controller" },
    { id: "plant", label: "Boshqaruv obyekti", kind: "plant" },
    { id: "sensor", label: "O'lchov datchigi", kind: "sensor" },
  ],
  edges: [
    { from: "ref", to: "sum" },
    { from: "sum", to: "pid" },
    { from: "pid", to: "plant" },
    { from: "plant", to: "sensor" },
    { from: "sensor", to: "sum", label: "Teskari aloqa" },
  ],
};

test("mavzu semantikasi yetti nomlangan diagramma turiga yo‘naltiriladi", () => {
  assert.deepEqual(GRAPHVIZ_DIAGRAM_TYPES, [
    "functional_block_diagram", "algorithm_flowchart", "pid_control_system", "uml_software_architecture", "process_sequence",
  ]);
  assert.deepEqual(MATPLOTLIB_DIAGRAM_TYPES, ["mathematical_graph", "experiment_results"]);
  assert.equal(classifyGraphvizType({ topic: "Funksional blok-sxema Graphviz" }), "functional_block_diagram");
  assert.equal(classifyGraphvizType({ topic: "Algoritm blok-sxemasi Graphviz" }), "algorithm_flowchart");
  assert.equal(classifyGraphvizType({ topic: "Boshqaruv tizimi PID Graphviz" }), "pid_control_system");
  assert.equal(classifyGraphvizType({ topic: "UML va dastur arxitekturasi Graphviz" }), "uml_software_architecture");
  assert.equal(classifyGraphvizType({ topic: "Jarayonlar ketma-ketligi Graphviz" }), "process_sequence");
  assert.equal(classifyGraphvizType({ topic: "Suvni tozalash jarayoni" }), "functional_block_diagram");
  assert.equal(classifyGraphvizType({ topic: "UML arxitekturasi", diagram_type: "process_sequence" }), "process_sequence");
  assert.equal(classifyMatplotlibType({ topic: "Matematik grafiklar" }), "mathematical_graph");
  assert.equal(classifyMatplotlibType({ topic: "Tajriba natijalari diagrammasi" }), "experiment_results");
  assert.equal(classifyMatplotlibType({ topic: "Matematik tahlildagi tajriba natijalari" }), "experiment_results");
  assert.equal(classifyMatplotlibType({ topic: "Suv ta'minoti tizimi" }), null, "ma'nosiz ravishda matematik yoki tajriba grafigi belgilanmasin");
});

test("algoritm flowchart standart belgilar va Ha/Yo‘q shoxlarini talab qiladi", () => {
  const normalized = normalizeFlowchartData(algorithm);
  assert.equal(normalized.diagram_type, "algorithm_flowchart");
  const dot = buildFlowchartDot(algorithm);
  assert.match(dot, /rankdir=TB/);
  assert.match(dot, /shape=diamond/);
  assert.match(dot, /shape=ellipse/);
  assert.match(dot, /Times New Roman/);
  assert.throws(() => normalizeFlowchartData({ ...algorithm, edges: algorithm.edges.map(edge => edge.from === "check" && edge.label === "Yo'q" ? { ...edge, label: "Balki" } : edge) }), /Ha va Yo'q/);
  assert.throws(() => normalizeFlowchartData({ ...algorithm, nodes: algorithm.nodes.map(node => node.kind === "start" ? { ...node, kind: "process" } : node) }), /bittadan start va end/);
});

test("PID Graphviz modeli besh blok va haqiqiy sensor teskari aloqasini talab qiladi", () => {
  const normalized = normalizeFlowchartData(pid);
  assert.equal(normalized.nodes.length, 5);
  const dot = buildFlowchartDot(pid);
  assert.match(dot, /rankdir=LR/);
  assert.match(dot, /constraint=false/);
  assert.match(dot, /Times New Roman/);
  assert.throws(() => normalizeFlowchartData({ ...pid, edges: pid.edges.map(edge => edge.from === "sensor" ? { ...edge, to: "pid" } : edge) }), /PID signal path/);
  assert.throws(() => normalizeFlowchartData({ ...pid, nodes: pid.nodes.slice(0, 4) }), /aynan 5 ta node/);
});

test("jarayon ketma-ketligi oldinga, UML esa arxitektura elementlari bilan quriladi", () => {
  const sequence = {
    diagram_type: "process_sequence", title: "Jarayon bosqichlari",
    nodes: [{ id: "a", label: "Namuna olish", kind: "step" }, { id: "b", label: "Sifatni o'lchash", kind: "step" }, { id: "c", label: "Natijani qayd qilish", kind: "output" }],
    edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
  };
  assert.match(buildFlowchartDot(sequence), /rankdir=LR/);
  assert.throws(() => normalizeFlowchartData({ ...sequence, edges: [{ from: "b", to: "a" }, { from: "b", to: "c" }] }), /chapdan o'ngga/);
  const uml = {
    diagram_type: "uml_software_architecture", title: "Dastur komponentlari",
    nodes: [{ id: "api", label: "API komponenti", kind: "component" }, { id: "service", label: "Domen klassi", kind: "class" }, { id: "db", label: "Ma'lumotlar ombori", kind: "database" }],
    edges: [{ from: "api", to: "service", label: "calls" }, { from: "service", to: "db", label: "reads" }],
  };
  assert.match(buildFlowchartDot(uml), /shape=component/);
  assert.match(buildFlowchartDot(uml), /rankdir=TB/);
  assert.throws(() => normalizeFlowchartData({ ...uml, nodes: uml.nodes.map(node => ({ ...node, kind: "process" })) }), /mos bo'lmagan node turi/);
});

test("IPO va sabab–oqibat Graphviz sxemalari besh tugun ichida semantik joylashadi", () => {
  const ipo = {
    diagram_type: "functional_block_diagram", title: "Kirish–jarayon–chiqish modeli",
    nodes: [{ id: "input", label: "Ma'lumot va resurs", kind: "input" }, { id: "process", label: "Qayta ishlash", kind: "process" }, { id: "output", label: "Natija", kind: "output" }],
    edges: [{ from: "input", to: "process" }, { from: "process", to: "output" }],
  };
  const ipoDot = buildFlowchartDot(ipo);
  assert.match(ipoDot, /input -> process/);
  assert.match(ipoDot, /process -> output/);
  assert.match(ipoDot, /shape=parallelogram/);
  assert.throws(() => buildFlowchartDot({ ...ipo, diagram_type: "random_picture" }), /noma'lum diagram_type/);

  const causeEffect = {
    diagram_type: "functional_block_diagram", title: "Sabab–oqibat tahlili",
    nodes: [
      { id: "method", label: "Usul", kind: "input" },
      { id: "people", label: "Inson omili", kind: "input" },
      { id: "tools", label: "Vositalar", kind: "input" },
      { id: "data", label: "Ma'lumotlar", kind: "input" },
      { id: "effect", label: "Asosiy muammo", kind: "output" },
    ],
    edges: [{ from: "method", to: "effect" }, { from: "people", to: "effect" }, { from: "tools", to: "effect" }, { from: "data", to: "effect" }],
  };
  const causeDot = buildFlowchartDot(causeEffect);
  assert.equal(causeEffect.nodes.length, 5);
  assert.match(causeDot, /method -> effect/);
  assert.match(causeDot, /data -> effect/);
  assert.doesNotMatch(causeDot, /style=invis/, "sabablar sun'iy ketma-ket ulanmasin");
  const rendered = spawnSync("dot", ["-Tpng"], { input: causeDot, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(rendered.status, 0, rendered.stderr?.toString("utf8"));
  assert.equal(rendered.stdout.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});

test("Matplotlib chart schemalari matematik ifoda va beshtagacha tajriba seriyasini tekshiradi", () => {
  assert.equal(safeMathExpression("sin(x) + x**2 / pi"), true);
  assert.equal(safeMathExpression("__import__('os').system('id')"), false);
  assert.equal(safeMathExpression("np.sin(x)"), false);
  const math = normalizeChartData({
    diagram_type: "mathematical_graph", title: "Parabola va sinusoid",
    functions: [{ name: "f(x)", expression: "x**2" }, { name: "g(x)", expression: "sin(x)" }],
    x_min: -5, x_max: 5, x_label: "x", y_label: "f(x)",
  });
  assert.equal(math.chartType, "line");
  assert.equal(math.functions.length, 2);
  assert.throws(() => normalizeChartData({ ...math, functions: Array.from({ length: 6 }, (_, index) => ({ name: `f${index}`, expression: "x" })) }), /1–5 ta funksiya/);
  assert.throws(() => normalizeChartData({ ...math, functions: [{ expression: "__import__('os')" }] }), /xavfsiz matematik ifoda/);

  const experimental = normalizeChartData({
    diagram_type: "experiment_results", chartType: "bar", title: "Harorat bo‘yicha sinov",
    labels: ["10 °C", "20 °C", "30 °C"], unit: "mg/L",
    series: [{ name: "Nazorat", values: [5.1, 4.6, 4.2] }, { name: "Sinov", values: [4.7, 3.9, 3.1] }],
  });
  assert.equal(experimental.series.length, 2);
  assert.throws(() => normalizeChartData({ ...experimental, series: Array.from({ length: 6 }, () => ({ name: "x", values: [1, 2, 3] })) }), /1–5 ta series/);
  assert.throws(() => normalizeChartData({ ...experimental, series: [{ name: "bad", values: [1, 2] }] }), /labels bilan teng uzunlik/);
  assert.throws(() => normalizeChartData({ ...experimental, diagram_type: "random_picture" }), /noma'lum diagram_type/);
});

test("Matplotlib matematik va eksperimental PNG’larni chizadi", async () => {
  const matplotlibCheck = spawnSync("python3", ["-c", "import matplotlib, numpy; print(matplotlib.__version__)"]);
  assert.equal(matplotlibCheck.status, 0, matplotlibCheck.stderr.toString("utf8"));
  const cases = [
    {
      diagram_type: "mathematical_graph", title: "f(x) = x² va sin(x)",
      functions: [{ name: "x squared", expression: "x**2" }, { name: "sin(x)", expression: "sin(x)" }],
      x_min: -4, x_max: 4, x_label: "x qiymati", y_label: "f(x)",
    },
    {
      diagram_type: "experiment_results", chartType: "line", title: "Tajriba natijalari", labels: ["1-kun", "2-kun", "3-kun"],
      series: [{ name: "Nazorat", values: [3.1, 3.4, 3.2] }, { name: "Sinov", values: [2.9, 2.4, 1.8] }], unit: "mg/L", x_label: "Vaqt", y_label: "Konsentratsiya (mg/L)",
    },
  ];
  for (const chart of cases) {
    const image = await renderChart(chart);
    const metadata = await sharp(image.buf).metadata();
    assert.equal(metadata.format, "png");
    assert.ok(metadata.width >= 800 && metadata.height >= 400);
    assert.ok(image.width > 0 && image.height > 0);
    assert.ok(Math.abs(image.width / image.height - metadata.width / metadata.height) < 0.01);
  }
});
