const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");
const sharp = require("sharp");
const { renderFormula } = require("../src/mustaqil/formula");
const { renderChart, wrapLabelLines, barSVG, lineSVG } = require("../src/mustaqil/chart");
const { renderFlowchart } = require("../src/mustaqil/flowchart");
const { buildDocument } = require("../src/mustaqil/builder");
const { prerenderMedia } = require("../src/mustaqil/generate");

test("MathJax, bar/line/pie va DOCX ichiga rasm qo‘shish integratsiyasi", async () => {
  const imageCache = new Map();
  const formulaCases = [
    { latex: "\\frac{a+b}{c}", key: "f_1" },
    { latex: "\\int_0^1 x^2 \\, dx = \\frac{1}{3}", key: "f_2" },
    { latex: "\\sqrt{x^2+1}", key: "f_3" },
  ];

  for (const { latex, key } of formulaCases) {
    const image = await renderFormula(latex);
    const metadata = await sharp(image.buf).metadata();
    assert.equal(metadata.format, "png", `${latex} PNG bo‘lishi kerak`);
    assert.ok(metadata.width > 0 && metadata.height > 0);
    assert.ok(image.width > 0 && image.width <= 180);
    assert.ok(image.height > 0 && image.height <= 28);
    imageCache.set(key, image);
  }

  for (const [index, chartType] of ["bar", "line", "pie"].entries()) {
    const image = await renderChart({
      chartType,
      title: "Sinov grafik — o‘zbekcha",
      labels: ["A", "B", "C"],
      values: chartType === "pie" ? [2, 3, 5] : [-2, 4, 6],
      data_source: "sintetik sinov ma’lumoti",
    });
    const metadata = await sharp(image.buf).metadata();
    assert.equal(metadata.format, "png", `${chartType} PNG bo‘lishi kerak`);
    assert.ok(metadata.width > 0 && metadata.height > 0);
    assert.ok(image.width > 0 && image.height > 0);
    imageCache.set(index === 0 ? "c_1" : "c_3", image);
  }

  const singleSlicePie = await renderChart({ chartType: "pie", title: "Yagona ulush", labels: ["A", "B"], values: [5, 0] });
  const piePixels = await sharp(singleSlicePie.buf).raw().toBuffer({ resolveWithObject: true });
  const centerOffset = (150 * piePixels.info.width + 180) * piePixels.info.channels;
  assert.notDeepEqual([...piePixels.data.subarray(centerOffset, centerOffset + 3)], [255, 255, 255], "100% li pie bo‘lagi to‘liq doira sifatida chizilishi kerak");

  const flowchart = await renderFlowchart({
    type: "flowchart",
    title: "Ichimlik suvini tozalash oqimi",
    nodes: [
      { id: "source", label: "Xom suv manbai", kind: "start" },
      { id: "filter", label: "Filtrlash", kind: "process" },
      { id: "check", label: "Sifat maqbulmi?", kind: "decision" },
      { id: "deliver", label: "Iste'molchiga uzatish", kind: "end" },
    ],
    edges: [
      { from: "source", to: "filter" },
      { from: "filter", to: "check" },
      { from: "check", to: "deliver", label: "Ha" },
      { from: "check", to: "filter", label: "Yo'q" },
    ],
    caption: "Ichimlik suvini tozalash oqimi. Izoh: sxemada filtrlash va sifat nazoratining ketma-ketligi ko'rsatilgan.",
  });
  const flowchartMetadata = await sharp(flowchart.buf).metadata();
  assert.equal(flowchartMetadata.format, "png");
  assert.ok(flowchart.width > 0 && flowchart.width <= 520);
  assert.ok(flowchart.height > 0 && flowchart.height <= 620);
  imageCache.set("d_2", flowchart);

  const controllerFlowchart = await renderFlowchart({
    type: "flowchart",
    title: "PID rostlagichining boshqaruv algoritmi",
    nodes: [
      { id: "begin", label: "O'lchashni boshlash", kind: "start" },
      { id: "read", label: "Chiqish qiymatini datchikdan olish", kind: "input" },
      { id: "compare", label: "Xatolikni topshiriq bilan solishtirish", kind: "process" },
      { id: "within", label: "Xatolik ruxsat etilgan chegaradami?", kind: "decision" },
      { id: "control", label: "Rostlagich boshqaruv ta'sirini hisoblaydi", kind: "process" },
      { id: "finish", label: "Yangilangan qiymatni qayta o'lchash", kind: "end" },
    ],
    edges: [
      { from: "begin", to: "read" },
      { from: "read", to: "compare" },
      { from: "compare", to: "within" },
      { from: "within", to: "finish", label: "Ha" },
      { from: "within", to: "control", label: "Yo'q" },
      { from: "control", to: "read", label: "Teskari aloqa" },
    ],
  });
  assert.equal((await sharp(controllerFlowchart.buf).metadata()).format, "png");
  imageCache.set("d_4", controllerFlowchart);

  const docx = await buildDocument({
    meta: { title: "Render sinovi", student_name: "", student_group: "", supervisor: "" },
    chapters: [
      { id: "intro", title: "Kirish", content: [{ type: "paragraph", text: "Kirish sinov matni." }] },
      {
        id: "ch1",
        title: "1-bob: Tahlil",
        sections: [{ title: "1.1. Nazariy asoslar" }],
        content: [
          { type: "heading", level: 2, text: "1.1. Nazariy asoslar" },
          { type: "formula", number: 1, latex: formulaCases[0].latex, caption: "N-formula. Sinov formulasi" },
          {
            type: "chart", number: 1, title: "Sinov grafik", caption: "N-rasm. Sinov diagrammasi",
            labels: ["A", "B"], values: [1, 2], data_source: "sintetik sinov ma’lumoti",
          },
          {
            type: "flowchart", number: 2, title: "Ichimlik suvini tozalash oqimi",
            caption: "Ichimlik suvini tozalash oqimi. Izoh: sxemada filtrlash va sifat nazoratining ketma-ketligi ko'rsatilgan.",
            nodes: [{ id: "start", label: "Boshlash", kind: "start" }, { id: "step", label: "Jarayon", kind: "process" }, { id: "check", label: "Shart", kind: "decision" }, { id: "end", label: "Yakun", kind: "end" }],
            edges: [{ from: "start", to: "step" }, { from: "step", to: "check" }, { from: "check", to: "end", label: "Ha" }],
          },
          { type: "table", number: 1, title: "Sinov jadvali", caption: "N-jadval. Sinov jadvali", headers: ["A", "B", "C"], rows: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]] },
        ],
      },
      {
        id: "ch2",
        title: "Ikkinchi tahlil",
        content: [
          { type: "formula", number: 1, latex: formulaCases[1].latex, caption: "1-formula. Ikkinchi formula" },
          {
            type: "chart", number: 1, title: "Ikkinchi grafik", caption: "N-rasm. Ikkinchi diagramma",
            labels: ["C", "D"], values: [3, 4], data_source: "Official statistical yearbook",
          },
          {
            type: "flowchart", number: 4, title: "PID rostlagichining boshqaruv algoritmi",
            caption: "PID rostlagichining boshqaruv algoritmi. Izoh: sxemada o'lchov xatoligiga qarab boshqaruv ta'siri yangilanadi.",
            nodes: [{ id: "begin", label: "Boshlash", kind: "start" }, { id: "read", label: "Kiritish", kind: "input" }, { id: "work", label: "Jarayon", kind: "process" }, { id: "finish", label: "Yakun", kind: "end" }],
            edges: [{ from: "begin", to: "read" }, { from: "read", to: "work" }, { from: "work", to: "finish" }],
          },
        ],
      },
      { id: "conclusion", title: "Xulosa", content: [] },
    ],
    references: ["Sinov manbasi"],
  }, imageCache);

  assert.ok(Buffer.isBuffer(docx));
  assert.equal(docx.subarray(0, 2).toString("ascii"), "PK", "DOCX ZIP arxivi bo‘lishi kerak");
  assert.ok(docx.length > 5_000, "DOCX matn va render qilingan media bilan mazmunli hajmga ega bo‘lishi kerak");

  const zip = await JSZip.loadAsync(docx);
  const documentXml = await zip.file("word/document.xml").async("string");
  const mediaEntries = Object.entries(zip.files).filter(([name, entry]) => name.startsWith("word/media/") && !entry.dir);
  assert.equal(mediaEntries.length, 6, "formula, chart va ikkala Graphviz rasm fayli DOCX ichida bo'lishi kerak");
  const imageParagraphs = (documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []).filter(paragraph => paragraph.includes("<w:drawing>"));
  assert.equal(imageParagraphs.length, 6, "barcha oltita rasm alohida DOCX paragrafida joylashishi kerak");
  assert.ok(imageParagraphs.every(paragraph => /<w:keepNext\b/.test(paragraph)), "har bir rasm ostyozuv paragrafi bilan birga keyingi sahifaga ko'chishi kerak");
  assert.match(documentXml, /1-rasm\. Sinov diagrammasi/);
  assert.match(documentXml, /2-rasm\. Ichimlik suvini tozalash oqimi/);
  assert.match(documentXml, /3-rasm\. Ikkinchi diagramma/);
  assert.match(documentXml, /Manba\/izoh: Official statistical yearbook/, "haqiqiy manba chart ostyozuvida saqlansin");
  assert.match(documentXml, /4-rasm\. PID rostlagichining boshqaruv algoritmi/);
  assert.match(documentXml, /\(1-formula\. Sinov formulasi\)/);
  assert.match(documentXml, /\(2-formula\. Ikkinchi formula\)/);
  assert.match(documentXml, /1-jadval\. Sinov jadvali/);
  assert.doesNotMatch(documentXml, /sintetik|synthetic|real o(?:'|&apos;)lchov emas|haqiqiy tajriba o(?:'|&apos;)lchovi emas/i,
    "chart va jadval captionlarida sun'iy ma'lumot statusi ko'rinmasin");
  assert.doesNotMatch(documentXml, /N-(?:rasm|formula|jadval)/i);
});

test("uzun chart X-o'qi yorliqlari satrlarga o'raladi va to'liq matnni saqlaydi", async () => {
  const longLabel = "Northern regional manufacturing throughput efficiency index by quarter and projected baseline";
  assert.equal(wrapLabelLines(longLabel, 18).join(" "), longLabel);
  assert.equal(wrapLabelLines("supercalifragilisticexpialidocious", 8).join(""), "supercalifragilisticexpialidocious",
    "bo'shliqsiz uzun token ham kesilmasin");

  const labels = [longLabel, "Current system response"];
  const barSvg = barSVG({ labels, values: [12, 16], title: "Bar labels" });
  const lineSvg = lineSVG({ labels: [longLabel, "Middle response", "Final output"], values: [12, 16, 18], title: "Line labels" });
  assert.match(barSvg, /<tspan/);
  assert.match(lineSvg, /<tspan/);
  for (const word of longLabel.split(/\s+/)) {
    assert.ok(barSvg.includes(word), `bar SVG yo'riq yorlig'idagi ${word} so'zini saqlasin`);
    assert.ok(lineSvg.includes(word), `line SVG yo'riq yorlig'idagi ${word} so'zini saqlasin`);
  }
  assert.ok(Number(barSvg.match(/height="(\d+)"/)?.[1]) > 360, "bar chart balandligi qo'shimcha yorliq satrlariga mos kengaysin");
  assert.ok(Number(lineSvg.match(/height="(\d+)"/)?.[1]) > 320, "line chart balandligi qo'shimcha yorliq satrlariga mos kengaysin");
  const veryLongLabel = Array(4).fill(longLabel).join(" ");
  const image = await renderChart({ chartType: "line", labels: [veryLongLabel, "Current response"], values: [12, 16], title: "Uzoq yorliqlar" });
  assert.ok(image.height > Math.round(440 * 320 / 600), "PNG renderi o'ralgan yorliqlar uchun vertikal joy ajratsin");
});

test("media renderi xato bo'lsa ham DOCX matnli fallback bilan tayyorlanadi", async () => {
  const chapter = {
    id: "ch1",
    title: "Media fallback sinovi",
    level: 1,
    content: [
      { type: "chart", number: 1, title: "Fallback grafik", caption: "Grafik captioni", chartType: "invalid", labels: ["A", "B"], values: [1, 2], data_source: "Sintetik illustrativ ma'lumot; real o'lchov emas" },
      { type: "flowchart", number: 2, title: "Fallback oqim sxemasi", caption: "Izoh: jarayonning asosiy bosqichlari ketma-ket ko'rsatilgan.", nodes: [], edges: [] },
    ],
  };
  const cache = await prerenderMedia([chapter]);
  assert.equal(cache.size, 0, "ikkala media rasmi render xatosi sabab keshga kirmasligi kerak");

  const docx = await buildDocument({
    meta: { title: "Media fallback sinovi", student_name: "", student_group: "", supervisor: "" },
    chapters: [
      { id: "intro", title: "Kirish", content: [{ type: "paragraph", text: "Kirish matni." }] },
      chapter,
      { id: "conclusion", title: "Xulosa", content: [] },
    ],
    references: ["Sinov manbasi"],
  }, cache);
  assert.equal(docx.subarray(0, 2).toString("ascii"), "PK");
  const zip = await JSZip.loadAsync(docx);
  const documentXml = await zip.file("word/document.xml").async("string");
  assert.match(documentXml, /Fallback grafik/);
  assert.doesNotMatch(documentXml, /sintetik|synthetic|real o(?:'|&apos;)lchov emas/i);
  assert.match(documentXml, /Fallback oqim sxemasi/);
});
