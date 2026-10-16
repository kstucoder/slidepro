const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFlowchartData } = require("../src/mustaqil/flowchart-data");
const { buildFlowchartCaption } = require("../src/mustaqil/flowchart-data");
const { buildFlowchartDot } = require("../src/mustaqil/flowchart");
const { normalizeOutlineForPages, outlineUserPrompt, chapterUserPrompt } = require("../src/mustaqil/prompt");
const { validatePlannedMedia } = require("../src/mustaqil/media-validation");
const { alignPlannedFlowchartBlocks } = require("../src/mustaqil/generate");

const validFlowchart = {
  type: "flowchart",
  title: "Jarayon oqimi",
  caption: "Izoh: sxemada jarayon bosqichlari ketma-ket ko'rsatilgan va qaror nuqtasi ajratilgan.",
  nodes: [
    { id: "start", label: "Boshlash", kind: "start" },
    { id: "step", label: 'Jarayon "; system("x")', kind: "process" },
    { id: "check", label: "Shart bajarildimi?", kind: "decision" },
    { id: "done", label: "Yakun", kind: "end" },
  ],
  edges: [
    { from: "start", to: "step" },
    { from: "step", to: "check" },
    { from: "check", to: "done", label: "Ha" },
  ],
};

test("Graphviz oqim sxemasi xavfsiz JSON sxemasi va DOT string escaping bilan tuziladi", () => {
  assert.equal(normalizeFlowchartData(validFlowchart).nodes.length, 4);
  const dot = buildFlowchartDot(validFlowchart);
  assert.match(dot, /digraph Flowchart/);
  assert.match(dot, /label="Jarayon \\\"; system/);
  assert.match(dot, /Shart bajarildimi\?/);
  assert.throws(() => normalizeFlowchartData({ ...validFlowchart, nodes: validFlowchart.nodes.map((node, index) => index ? node : { ...node, id: 'x; system("bad")' }) }), /xavfsiz format/);
  assert.throws(() => normalizeFlowchartData({ ...validFlowchart, edges: [{ from: "start", to: "missing" }] }), /mavjud bo'lmagan node/);
  assert.throws(() => normalizeFlowchartData({ ...validFlowchart, nodes: validFlowchart.nodes.map((node, index) => index ? node : { ...node, kind: "record" }) }), /noma'lum node turi/);
  assert.throws(() => normalizeFlowchartData({ ...validFlowchart, nodes: validFlowchart.nodes.slice(0, 3) }), /4–12 ta/);
  assert.throws(() => normalizeFlowchartData({ ...validFlowchart, nodes: [...validFlowchart.nodes, ...Array(9).fill(validFlowchart.nodes[0]).map((node, index) => ({ ...node, id: `extra${index}` }))] }), /4–12 ta/);
});

test("o‘zbekcha ishda Graphviz ichidagi inglizcha title, tugun va qirra matni saqlanadi", () => {
  const englishLabels = {
    language: "o'zbek",
    title: "Feedback control system",
    nodes: [
      { id: "start", label: "Start", kind: "start" },
      { id: "sensor", label: "Sensor input", kind: "input" },
      { id: "controller", label: "Controller output", kind: "output" },
      { id: "end", label: "End", kind: "end" },
    ],
    edges: [
      { from: "start", to: "sensor", label: "Yes" },
      { from: "sensor", to: "controller", label: "No" },
      { from: "controller", to: "end", label: "" },
    ],
  };
  const normalized = normalizeFlowchartData(englishLabels, { language: "o'zbek" });
  assert.equal(normalized.title, "Feedback control system");
  assert.deepEqual(normalized.nodes.map(node => node.label), ["Start", "Sensor input", "Controller output", "End"]);
  assert.deepEqual(normalized.edges.map(edge => edge.label), ["Yes", "No", ""]);
  const visibleText = [normalized.title, ...normalized.nodes.map(node => node.label), ...normalized.edges.map(edge => edge.label)].join(" ");
  assert.match(visibleText, /\b(?:start|end|sensor|controller|input|output|yes|no|feedback|control|system)\b/i);
  assert.match(buildFlowchartDot(englishLabels), /label="Feedback control system"/);

  const mixedLanguage = normalizeFlowchartData({ ...englishLabels, title: "Modeldan vaqt-domain javobigacha" }, { language: "o'zbek" });
  assert.equal(mixedLanguage.title, "Modeldan vaqt-domain javobigacha");
  assert.match(mixedLanguage.title, /\bdomain\b/i);

  const kontroller = normalizeFlowchartData({ ...englishLabels, title: "Kontroller parametrlari", nodes: englishLabels.nodes.map((node, index) => index === 2 ? { ...node, label: "Kontroller chiqishi" } : node) }, { language: "o'zbek" });
  assert.equal(kontroller.nodes[2].label, "Kontroller chiqishi");

  const antiWindup = normalizeFlowchartData({ ...englishLabels, nodes: englishLabels.nodes.map((node, index) => index === 2 ? { ...node, label: "Barqarorlikni tekshirish va antiwindupni faollashtirish" } : node) }, { language: "o'zbek" });
  assert.equal(antiWindup.nodes[2].label, "Barqarorlikni tekshirish va antiwindupni faollashtirish");
  assert.match(antiWindup.nodes[2].label, /anti-?windup\w*/i);

  const transferTitle = normalizeFlowchartData({ ...englishLabels, title: "Modeldan javobgacha: transfer funksiya asosida tahlil oqimi" }, { language: "o'zbek" });
  assert.equal(transferTitle.title, "Modeldan javobgacha: transfer funksiya asosida tahlil oqimi");
  assert.match(transferTitle.title, /\btransfer\b/i);

  const overshoot = normalizeFlowchartData({ ...englishLabels, nodes: englishLabels.nodes.map((node, index) => index === 2 ? { ...node, label: "Shartli tekshiruv: overshoot va o'rnatilish" } : node) }, { language: "o'zbek" });
  assert.equal(overshoot.nodes[2].label, "Shartli tekshiruv: overshoot va o'rnatilish");
  assert.match(overshoot.nodes[2].label, /\bovershoot\w*/i);
});

test("outline bir ishda ko'pi bilan bitta flowchart rejalashtiradi", () => {
  const outline = normalizeOutlineForPages({
    chapters: [
      { id: "intro", title: "Kirish" },
      { title: "Birinchi jarayon", flowchart_count: 1, flowchart_plans: [{ title: "Birinchi oqim", purpose: "Birinchi" }] },
      { title: "Ikkinchi jarayon", flowchart_count: 1, flowchart_plans: [{ title: "Ikkinchi oqim", purpose: "Ikkinchi" }] },
      { title: "Uchinchi jarayon", flowchart_count: 1, flowchart_plans: [{ title: "Uchinchi oqim", purpose: "Uchinchi" }] },
      { id: "conclusion", title: "Xulosa" },
    ],
    references: Array.from({ length: 8 }, (_, index) => `Manba ${index + 1}`),
  }, { pages: 10, topic: "Jarayonlar" });
  const main = outline.chapters.filter(chapter => chapter.id !== "intro" && chapter.id !== "conclusion");
  assert.equal(main.reduce((sum, chapter) => sum + chapter.flowchart_count, 0), 1);
  assert.equal(main.reduce((sum, chapter) => sum + chapter.flowchart_plans.length, 0), 1);
  assert.equal(outline.chapters[0].flowchart_count, 0);
  assert.equal(outline.chapters.at(-1).flowchart_count, 0);
});

test("flowchartCount=2 ikki farqli sxemani mos asosiy bo'limlarga joylaydi", () => {
  const outline = normalizeOutlineForPages({
    chapters: [
      { id: "intro", title: "Kirish" },
      { title: "Tizimning tarkibiy tuzilishi", flowchart_count: 1, flowchart_plans: [{ title: "Yopiq kontur sxemasi", purpose: "Topshiriqdan teskari aloqagacha bo'lgan uzluksiz boshqaruv konturi" }] },
      { title: "Rostlash algoritmi va ishlash jarayoni" },
      { title: "Amaliy qo'llanish" },
      { id: "conclusion", title: "Xulosa" },
    ],
    references: Array.from({ length: 8 }, (_, index) => `Manba ${index + 1}`),
  }, { pages: 10, topic: "Avtomatik boshqaruv tizimi", flowchartCount: 2 });

  const main = outline.chapters.filter(chapter => chapter.id !== "intro" && chapter.id !== "conclusion");
  const planned = main.filter(chapter => chapter.flowchart_count === 1);
  assert.equal(planned.length, 2);
  assert.deepEqual(planned.map(chapter => chapter.flowchart_plans[0].title), [
    "Yopiq kontur sxemasi",
    "Avtomatik boshqaruv tizimi: tahlil va qarorlar ketma-ketligi",
  ]);
  assert.equal(new Set(planned.map(chapter => chapter.id)).size, 2);
});

test("chartCount=0 bo'lsa ham diagrammalar jami kamida uchtaga yetkaziladi", () => {
  const outline = normalizeOutlineForPages({ chapters: [], references: [] }, {
    pages: 10, topic: "Avtomatik boshqaruv tizimi", chartCount: 0, flowchartCount: 2,
  });
  const main = outline.chapters.filter(chapter => chapter.id !== "intro" && chapter.id !== "conclusion");
  assert.equal(main.reduce((sum, chapter) => sum + chapter.chart_count, 0), 1);
  assert.equal(main.reduce((sum, chapter) => sum + chapter.flowchart_count, 0), 2);
  const prompt = outlineUserPrompt({ topic: "Avtomatik boshqaruv tizimi", pages: 10, chartCount: 0, flowchartCount: 2 });
  assert.match(prompt, /1 miqdoriy grafik/);
  assert.match(prompt, /2 ta Graphviz oqim sxemasi/);
  assert.match(prompt, /jami kamida 3 ta/);
});

test("oddiy ish kamida uchta diagramma oladi, katta ish esa uchdan ko'pini rejalashtiradi", () => {
  const standard = normalizeOutlineForPages({ chapters: [] }, { pages: 10, topic: "Suvni tozalash" });
  const standardMain = standard.chapters.filter(chapter => chapter.id !== "intro" && chapter.id !== "conclusion");
  assert.equal(standardMain.reduce((sum, chapter) => sum + chapter.chart_count + chapter.flowchart_count, 0), 3);

  const longer = normalizeOutlineForPages({ chapters: [] }, { pages: 20, topic: "Suvni tozalash" });
  const longerMain = longer.chapters.filter(chapter => chapter.id !== "intro" && chapter.id !== "conclusion");
  assert.ok(longerMain.reduce((sum, chapter) => sum + chapter.chart_count + chapter.flowchart_count, 0) > 3);
  const fallback = standardMain.flatMap(chapter => chapter.flowchart_plans || []);
  assert.equal(fallback.length, 1);
  assert.match(fallback[0].title, /Suvni tozalash: asosiy jarayon bosqichlari/);
  assert.doesNotMatch(fallback[0].purpose, /rostlagich|teskari aloqa|boshqaruv obyekti/i);
});

test("outline va bob promptlari Graphviz flowchartni JSON media sifatida so'raydi", () => {
  assert.match(outlineUserPrompt({ topic: "Suvni tozalash", pages: 10 }), /Graphviz oqim sxemasi/);
  assert.match(outlineUserPrompt({ topic: "Boshqaruv", pages: 10, flowchartCount: 2 }), /aynan 2 ta Graphviz oqim sxemasi/);
  const chapter = {
    id: "ch1", title: "Jarayon bosqichlari", role: "theory", word_target: 398,
    sections: [{ title: "Asosiy bosqichlar", word_target: 398 }],
    flowchart_count: 1,
    flowchart_plans: [{ title: "Tozalash oqimi", purpose: "suv tozalash ketma-ketligi" }],
  };
  const prompt = chapterUserPrompt({
    chapter,
    outline: { meta: { title: "Suvni tozalash" }, chapters: [chapter] },
    language: "o'zbek", chapterIndex: 0, totalChapters: 1,
  });
  assert.match(prompt, /Graphviz oqim sxemasi rejasi/);
  assert.match(prompt, /inglizcha atamalar .* chizmada qolishi mumkin/);
  assert.match(prompt, /har bir inglizcha atamaning o'zbekcha muqobilini/);
  assert.match(prompt, /"Atamalar:/);
  assert.match(prompt, /"type":"flowchart"/);
  assert.match(prompt, /DOT manbasini hech qachon JSON ichida yozma/);
});

test("rejalashtirilgan flowchartning yo‘qligi yoki yaroqsiz JSON’i renderdan oldin rad etiladi", () => {
  const planned = [{ id: "ch1", title: "Jarayon", flowchart_count: 1, flowchart_plans: [{ title: "Oqim" }] }];
  assert.throws(() => validatePlannedMedia([{ content: [] }], planned, { minimumDiagramCount: 0 }), /flowchart 0\/1/);
  assert.throws(() => validatePlannedMedia([{ content: [{ ...validFlowchart, nodes: [{ id: "bad id", label: "X", kind: "process" }] }] }], planned, { minimumDiagramCount: 0 }), /flowchart 1 yaroqsiz/);
  assert.equal(validatePlannedMedia([{ content: [validFlowchart] }], planned, { minimumDiagramCount: 0 }), true);
});

test("ikki bobda rejalashtirilgan ikkita flowchart ikkalasi ham bo'lishi shart", () => {
  const planned = [
    { id: "ch1", title: "Tarkib", flowchart_count: 1, flowchart_plans: [{ title: "Yopiq kontur" }] },
    { id: "ch2", title: "Algoritm", flowchart_count: 1, flowchart_plans: [{ title: "Boshqaruv algoritmi" }] },
  ];
  assert.equal(validatePlannedMedia([{ content: [validFlowchart] }, { content: [validFlowchart] }], planned, { minimumDiagramCount: 0 }), true);
  assert.throws(() => validatePlannedMedia([{ content: [validFlowchart] }, { content: [] }], planned, { minimumDiagramCount: 0 }), /Algoritm: flowchart 0\/1/);
});

test("yakuniy media tekshiruvi uchta diagrammadan kamini rad etadi va to'rtta diagrammani qabul qiladi", () => {
  const chart = { type: "chart", chartType: "bar", labels: ["A", "B"], values: [1, 2], data_source: "sintetik sinov ma'lumoti" };
  const plannedTwo = [
    { id: "ch1", title: "Birinchi", chart_count: 1, chart_plans: [{ title: "A" }], flowchart_count: 1, flowchart_plans: [{ title: "Oqim" }] },
  ];
  assert.throws(() => validatePlannedMedia([{ content: [chart, validFlowchart] }], plannedTwo), /Umumiy diagrammalar soni 2\/3/);

  const plannedFour = [
    { id: "ch1", title: "Birinchi", chart_count: 1, chart_plans: [{ title: "A" }], flowchart_count: 1, flowchart_plans: [{ title: "Oqim 1" }] },
    { id: "ch2", title: "Ikkinchi", chart_count: 1, chart_plans: [{ title: "B" }], flowchart_count: 1, flowchart_plans: [{ title: "Oqim 2" }] },
  ];
  const generatedFour = [
    { content: [chart, validFlowchart] },
    { content: [chart, validFlowchart] },
  ];
  assert.equal(validatePlannedMedia(generatedFour, plannedFour), true);
});

test("Graphviz caption inglizcha yorliqlarning o'zbekcha muqobillari va qisqa izohni saqlaydi", () => {
  const english = {
    ...validFlowchart,
    title: "Feedback control system",
    nodes: [
      { id: "start", label: "Start", kind: "start" },
      { id: "sensor", label: "Sensor input", kind: "input" },
      { id: "controller", label: "Controller output", kind: "output" },
      { id: "end", label: "End", kind: "end" },
    ],
    edges: [{ from: "start", to: "sensor", label: "Yes" }, { from: "sensor", to: "controller", label: "No" }, { from: "controller", to: "end", label: "" }],
  };
  english.caption = buildFlowchartCaption(english, "O'lchovga qarab boshqaruv qarorini yangilash jarayoni", "o'zbek");
  const planned = [{ id: "ch1", title: "Tizim", flowchart_count: 1, flowchart_plans: [{ title: english.title }] }];
  assert.equal(validatePlannedMedia([{ content: [english] }], planned, { language: "o'zbek", minimumDiagramCount: 0 }), true);
  const missingTranslation = { ...english, caption: english.caption.replace(/datchik/gi, "") };
  assert.throws(() => validatePlannedMedia([{ content: [missingTranslation] }], planned, { language: "o'zbek", minimumDiagramCount: 0 }), /captionda "sensor" atamasining o'zbekcha muqobili/);

  const withoutCaption = alignPlannedFlowchartBlocks({
    flowchart_plans: [{ title: english.title, purpose: "O'lchovga qarab boshqaruv qarorini yangilash jarayoni" }],
  }, [{ ...english, caption: "" }], "o'zbek");
  assert.match(withoutCaption[0].caption, /sensor — datchik/);
  assert.match(withoutCaption[0].caption, /Izoh:/);
});

test("ruscha flowchart fallback captionida ruscha izoh belgisi ishlatiladi", () => {
  assert.equal(buildFlowchartCaption({ title: "Схема" }, "Порядок обработки", "rus"), "Схема. Пояснение: Порядок обработки.");
});
