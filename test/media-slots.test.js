const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pagePlan,
  normalizeOutlineForPages,
  chapterUserPrompt,
} = require("../src/mustaqil/prompt");
const { resolveDiagramQuotas } = require("../src/mustaqil/media-requirements");
const {
  buildMediaSlots,
  groupMediaSlotsByChapter,
  mergeMediaSlotsIntoContent,
} = require("../src/mustaqil/media-slots");
const {
  mapWithConcurrency,
  mediaSlotPrompt,
  normalizeMediaSlotResult,
  fallbackMediaSlot,
} = require("../src/mustaqil/generate");
const { normalizeChartData } = require("../src/mustaqil/chart-data");

function outlineForPages(pages) {
  return pagePlan(pages);
}

test("default Graphviz soni har 5 qo'shimcha so'ralgan betga bittadan oshadi", () => {
  const expected = [[10, 1], [15, 2], [20, 3], [25, 4]];
  for (const [pages, flowcharts] of expected) {
    const plan = outlineForPages(pages);
    const quotas = resolveDiagramQuotas(plan.mainChapterCount);
    assert.equal(quotas.flowchartCount, flowcharts, `${pages} bet`);
    assert.ok(quotas.chartCount + quotas.flowchartCount >= 3, `${pages} betda jami diagramma minimumi saqlansin`);
    const normalized = normalizeOutlineForPages({ chapters: [] }, { pages, topic: "Sinov" });
    assert.equal(normalized.chapters.reduce((sum, chapter) => sum + chapter.flowchart_count, 0), flowcharts, `${pages} bet outline rejasida`);
  }
  assert.equal(resolveDiagramQuotas(outlineForPages(15).mainChapterCount, { flowchartCount: 0 }).flowchartCount, 0, "aniq foydalanuvchi kvotasi avtomatik defaultni almashtiradi");
});

test("outline media rejalari o'zgarmas slot ID'lari va tegishli turlarni beradi", () => {
  const chapters = [{
    id: "ch1", title: "Tahlil", formula_count: 1,
    formula_plans: [{ latex: "G(s)=1/(s+1)" }],
    chart_count: 2, chart_type: "bar", chart_plans: [{ title: "A" }, { title: "B" }],
    flowchart_count: 1, flowchart_plans: [{ title: "Jarayon" }],
    table_count: 1,
    sections: [{ title: "Birinchi" }, { title: "Ikkinchi" }],
  }];
  const slots = buildMediaSlots(chapters);
  assert.deepEqual(slots.map(slot => slot.slot_id), [
    "ch1:formula:1", "ch1:chart:1", "ch1:chart:2", "ch1:flowchart:1", "ch1:table:1",
  ]);
  assert.deepEqual(slots.map(slot => slot.type), ["formula", "chart", "chart", "flowchart", "table"]);
  assert.deepEqual(groupMediaSlotsByChapter(slots).get("ch1").map(slot => slot.slot_id), slots.map(slot => slot.slot_id));
});

test("prose prompt media payloadini so'ramaydi, markerlarni esa barqaror ID bilan joylashtiradi", () => {
  const chapter = {
    id: "ch1", title: "Tahlil", role: "theory", word_target: 398,
    sections: [{ title: "Asosiy tahlil", word_target: 398 }],
  };
  const outline = { meta: { title: "Sinov" }, chapters: [chapter] };
  const prompt = chapterUserPrompt({
    chapter, outline, language: "o'zbek", chapterIndex: 0, totalChapters: 1,
    proseOnly: true,
    mediaSlots: [{ slot_id: "ch1:chart:1", type: "chart" }],
  });
  assert.match(prompt, /ch1:chart:1/);
  assert.match(prompt, /"type":"media_slot","slot_id":"ch1:chart:1"/);
  assert.match(prompt, /bu javobda yaratma/i);
  assert.doesNotMatch(prompt, /"type":"chart"/);
  assert.doesNotMatch(prompt, /"type":"formula"/);
  assert.doesNotMatch(prompt, /"type":"flowchart"/);
});

test("slot ID orqali media matnga to'g'ri birlashadi va takroriy/noma'lum markerlar e'tiborsiz qoladi", () => {
  const chapter = { id: "ch1", sections: [{ title: "Birinchi" }] };
  const slots = [
    { slot_id: "ch1:chart:1", type: "chart", sectionIndex: 0 },
    { slot_id: "ch1:flowchart:1", type: "flowchart", sectionIndex: 0 },
  ];
  const media = new Map([
    ["ch1:chart:1", { type: "chart", slot_id: "ch1:chart:1", title: "Grafik" }],
    ["ch1:flowchart:1", { type: "flowchart", slot_id: "ch1:flowchart:1", title: "Oqim" }],
  ]);
  const merged = mergeMediaSlotsIntoContent(chapter, [
    { type: "heading", level: 2, text: "Sarlavha" },
    { type: "paragraph", text: "Kirish matni." },
    { type: "media_slot", slot_id: "ch1:flowchart:1" },
    { type: "media_slot", slot_id: "unknown:chart:1" },
    { type: "media_slot", slot_id: "ch1:flowchart:1" },
    { type: "paragraph", text: "Davomi." },
  ], slots, media);
  assert.deepEqual(merged.filter(item => item.type === "chart" || item.type === "flowchart").map(item => item.slot_id), [
    "ch1:chart:1", "ch1:flowchart:1",
  ]);
  assert.equal(merged.filter(item => item.type === "media_slot").length, 0);
});

test("media LLM so'rovlari formula, grafik, Graphviz va jadval uchun qisqa strukturali JSON talab qiladi", () => {
  for (const type of ["formula", "chart", "flowchart", "table"]) {
    const prompt = mediaSlotPrompt({ slot_id: `ch1:${type}:1`, type, plan: { title: "Sinov", latex: "x=1" }, chartType: "bar" }, { topic: "Sinov", language: "uz" });
    assert.match(prompt, new RegExp(`ch1:${type}:1`));
    assert.match(prompt, new RegExp(`"type":"${type}"`));
  }
  const flowPrompt = mediaSlotPrompt({ slot_id: "ch1:flowchart:1", type: "flowchart", plan: { title: "Jarayon" } }, { language: "o'zbek" });
  assert.match(flowPrompt, /DOT yoki kod qaytarma/);
  const chartPrompt = mediaSlotPrompt({ slot_id: "ch1:chart:1", type: "chart", chartType: "bar", plan: {} }, { topic: "Sinov", language: "uz" });
  assert.match(chartPrompt, /sintetik.*real o'lchov emas/i);
});

test("chart fallback haqiqiy o'lchov sifatida ko'rsatilmaydi, strukturasi renderga yaroqli", () => {
  const slot = { slot_id: "ch1:chart:1", type: "chart", chapterId: "ch1", ordinal: 1, chartType: "bar", plan: { title: "Sinov ko'rsatkichlari" } };
  const fallback = fallbackMediaSlot(slot, { chapter: { id: "ch1", title: "Tahlil" }, language: "o'zbek" });
  assert.equal(fallback.slot_id, slot.slot_id);
  assert.match(fallback.data_source, /sintetik illustrativ ma'lumot; real o'lchov emas/i);
  assert.match(fallback.caption, /sintetik.*real o'lchov emas/i);
  assert.equal(normalizeChartData(fallback).values.length, 5);
});

test("media chart natijasi va formula reja bo'yicha normallashtiriladi", () => {
  const chartSlot = { slot_id: "ch1:chart:1", type: "chart", chartType: "line", plan: { title: "Vaqt bo'yicha trend" } };
  const chart = normalizeMediaSlotResult(chartSlot, {
    slot_id: chartSlot.slot_id, type: "chart", chartType: "line", title: "Boshqa sarlavha",
    labels: ["1-yil", "2-yil"], values: [1, 2], data_source: "Sintetik namunaviy ma'lumot", caption: "Trend",
  }, { chapter: { title: "Tahlil" }, language: "o'zbek" });
  assert.equal(chart.title, "Vaqt bo'yicha trend");
  assert.match(chart.caption, /sintetik.*real o'lchov emas/i);
  assert.equal(normalizeChartData(chart).chartType, "line");

  const formulaSlot = { slot_id: "ch1:formula:1", type: "formula", ordinal: 1, plan: { latex: "G(s)=\\frac{1}{s+1}", concept: "Uzatish funksiyasi" } };
  const formula = normalizeMediaSlotResult(formulaSlot, {
    slot_id: formulaSlot.slot_id, type: "formula", latex: "G(s)=\\frac{1}{s+1}", display_text: "G(s)", caption: "Formula",
  }, { chapter: { title: "Model" }, language: "o'zbek" });
  assert.equal(formula.latex, formulaSlot.plan.latex);

  const tableSlot = { slot_id: "ch1:table:1", type: "table", ordinal: 1, plan: { title: "Jarayon jadvali" } };
  const table = normalizeMediaSlotResult(tableSlot, {
    slot_id: tableSlot.slot_id, type: "table", title: "Jadval", caption: "Bosqichlar taqqoslanishi",
    headers: ["Bosqich", "Amal", "Natija"],
    rows: [["1", "A", "B"], ["2", "C", "D"], ["3", "E", "F"]],
  }, { chapter: { title: "Jarayon" }, language: "o'zbek" });
  assert.equal(table.synthetic, true);
  assert.match(table.caption, /Sintetik ma'lumot; real o'lchov emas/i);
});

test("parallel worker'lar berilgan concurrency chegarasidan oshmaydi va natija tartibini saqlaydi", async () => {
  let active = 0;
  let maximum = 0;
  const values = await mapWithConcurrency(Array.from({ length: 11 }, (_, index) => index), 3, async value => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 8));
    active--;
    return value * 2;
  });
  assert.ok(maximum <= 3);
  assert.equal(maximum, 3);
  assert.deepEqual(values, Array.from({ length: 11 }, (_, index) => index * 2));
});
