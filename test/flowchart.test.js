const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFlowchartData } = require("../src/mustaqil/flowchart-data");
const { buildFlowchartCaption } = require("../src/mustaqil/flowchart-data");
const { buildFlowchartDot } = require("../src/mustaqil/flowchart");
const { normalizeOutlineForPages, outlineUserPrompt, chapterUserPrompt } = require("../src/mustaqil/prompt");
const { validatePlannedMedia } = require("../src/mustaqil/media-validation");
const { alignPlannedFlowchartBlocks, alignPlannedChartBlocks, mediaSlotPrompt } = require("../src/mustaqil/generate");
const { normalizeChartData } = require("../src/mustaqil/chart-data");

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
  assert.match(prompt, /inglizcha yoki o'zbekcha atamalar chizmada qolishi mumkin/);
  assert.match(prompt, /captionni o'zbekcha yozib, "Izoh:"/);
  assert.match(prompt, /har bir labelni alohida tarjima qilish shart emas/);
  assert.match(prompt, /"type":"flowchart"/);
  assert.match(prompt, /DOT manbasini hech qachon JSON ichida yozma/);
  const mediaPrompt = mediaSlotPrompt({ type: "flowchart", slot_id: "ch1:flowchart:1", plan: chapter.flowchart_plans[0] }, {
    topic: "Suvni tozalash", language: "o'zbek",
  });
  assert.match(mediaPrompt, /inglizcha yoki o'zbekcha/);
  assert.match(mediaPrompt, /har bir label uchun tarjima\/glossariy shart emas/);
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

test("model diagrammalarni tashlab ketsa, reja asosida sintetik grafik va oqim sxemalari to'ldiriladi", () => {
  const planned = {
    id: "ch1",
    title: "Nazariy asoslar va hisobiy yondashuv",
    chart_count: 2,
    chart_type: "bar",
    chart_plans: [
      { title: "Birinchi tahliliy ko'rsatkich" },
      { title: "Ikkinchi tahliliy ko'rsatkich" },
    ],
    flowchart_count: 1,
    flowchart_plans: [{ title: "Setpoint nazorati", purpose: "setpoint qiymatini tekshirish va jarayon qarorini tanlash" }],
  };
  let content = alignPlannedChartBlocks(planned, [{ type: "paragraph", text: "Nazariy tahlil." }]);
  content = alignPlannedFlowchartBlocks(planned, content, "o'zbek");
  const charts = content.filter(item => item.type === "chart");
  const flowcharts = content.filter(item => item.type === "flowchart");

  assert.equal(charts.length, 2);
  charts.forEach(chart => {
    assert.equal(normalizeChartData(chart).values.length, 5);
    assert.match(chart.data_source, /sintetik illustrativ ma'lumot; real o'lchov emas/i);
  });
  assert.equal(flowcharts.length, 1);
  assert.match(flowcharts[0].caption, /Izoh:.*topshiriq qiymati/i);
  assert.equal(validatePlannedMedia([{ content }], [planned], { language: "o'zbek" }), true);
});

test("model captionida topshiriq qiymati bo'lmasa, mavjud flowchart captioni avtomatik qayta tuziladi", () => {
  const chart = {
    ...validFlowchart,
    title: "Setpoint monitoring",
    caption: "Izoh: setpoint monitoring jarayoni.",
  };
  const planned = {
    id: "ch1", title: "Nazorat", flowchart_count: 1,
    flowchart_plans: [{ title: chart.title, purpose: "setpoint qiymatini nazorat qilish bosqichlari" }],
  };
  const [aligned] = alignPlannedFlowchartBlocks(planned, [chart], "o'zbek");
  assert.match(aligned.caption, /Izoh:.*topshiriq qiymati/i);
  assert.equal(validatePlannedMedia([{ content: [aligned] }], [planned], { language: "o'zbek", minimumDiagramCount: 0 }), true);
});

test("Graphviz caption inglizcha yorliqlarni tarjimasiz qabul qilib, qisqa o'zbekcha izoh beradi", () => {
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
  assert.match(english.caption, /^Izoh:/);
  const noGlossary = { ...english, caption: "Izoh: sxemada o'lchovga qarab boshqaruv qarorini yangilash bosqichlari ko'rsatiladi." };
  assert.equal(validatePlannedMedia([{ content: [noGlossary] }], planned, { language: "o'zbek", minimumDiagramCount: 0 }), true);

  const withoutCaption = alignPlannedFlowchartBlocks({
    flowchart_plans: [{ title: english.title, purpose: "O'lchovga qarab boshqaruv qarorini yangilash jarayoni" }],
  }, [{ ...english, caption: "" }], "o'zbek");
  assert.match(withoutCaption[0].caption, /Izoh:/);
  assert.match(withoutCaption[0].caption, /o'lchovga qarab boshqaruv qarorini/i);
});

test("lug'atda yo'q inglizcha Graphviz atamasi ham kodni to'xtatmaydi", () => {
  const throughput = {
    ...validFlowchart,
    title: "Throughput API",
    nodes: validFlowchart.nodes.map((node, index) => index === 1 ? { ...node, label: "Throughput API" } : node),
    caption: "Izoh: o'tkazuvchanlik ko'rsatkichini baholash bosqichlari ko'rsatiladi.",
  };
  const caption = buildFlowchartCaption(throughput, "o'tkazuvchanlik ko'rsatkichini baholash bosqichlari", "o'zbek");
  assert.match(caption, /^Izoh:.*o'tkazuvchanlik/i);
  const aligned = alignPlannedFlowchartBlocks({
    flowchart_count: 1,
    flowchart_plans: [{ title: "Throughput", purpose: "O'tkazuvchanlik qiymatini baholash" }],
  }, [{ ...throughput, caption }], "o'zbek")[0];
  assert.match(aligned.title, /Throughput API/);
  assert.match(aligned.nodes[1].label, /Throughput API/);
  assert.match(buildFlowchartDot(aligned), /Throughput API/);
  assert.match(aligned.caption, /Izoh:/);
  assert.doesNotMatch(aligned.caption, /Atamalar:/);
  assert.equal(validatePlannedMedia([{ content: [aligned] }], [{
    id: "ch1", title: "Tahlil", flowchart_count: 1,
    flowchart_plans: [{ title: "Throughput API" }],
  }], { language: "o'zbek", minimumDiagramCount: 0 }), true);
});

test("ruscha flowchart fallback captionida ruscha izoh belgisi ishlatiladi", () => {
  assert.equal(buildFlowchartCaption({ title: "Схема" }, "Порядок обработки", "rus"), "Схема. Пояснение: Порядок обработки.");
});

test("tarakan nazorati fallbackida o‘zbekcha Tarakan, Risk va IPM terminlari ishlaydi", () => {
  const planned = {
    id: "ch1",
    title: "Tarakanlarni yo‘qotish",
    flowchart_count: 1,
    flowchart_plans: [{
      title: "Tarakanlarni yo‘qotish: IPM va Risk baholash",
      purpose: "zararkunandalarga qarshi usullarni baholash",
    }],
  };
  const [fallback] = alignPlannedFlowchartBlocks(planned, [], "o'zbek");
  assert.match(fallback.caption, /^Izoh:/);
  assert.match(fallback.caption, /zararkunandalarga qarshi usullarni baholash/i);
  assert.doesNotMatch(fallback.caption, /Atamalar:/);
  assert.equal(validatePlannedMedia([{ content: [fallback] }], [planned], {
    language: "o'zbek", minimumDiagramCount: 0,
  }), true);
});
