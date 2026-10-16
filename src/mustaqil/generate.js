// src/mustaqil/generate.js
// 3-pass strategiyasi:
//   Pass 1: outline (tuzilma + formula/grafik rejalashtirish)
//   Pass 2: parallel chapter generation (outline ban-list bilan)
//   Pass 3: qisqa boblarni parallel kengaytirish (haqiqiy ban-list bilan)
//   Media: formula + grafik render
//   Build: docx

const fs   = require("fs");
const path = require("path");
const {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  pagePlan, normalizeOutlineForPages,
  collectUsedFormulasAndCharts,
  normalizeFormula, formulaSignature,
  normalizeChartPurpose,
  paragraphSimilarity,
  detectForbiddenIntroConclusion,
} = require("./prompt");
const { renderFormula } = require("./formula");
const { renderChart }   = require("./chart");
const { renderFlowchart } = require("./flowchart");
const { buildDocument } = require("./builder");
const { renumberMedia } = require("./media-numbering");
const { countWords, countSectionWords, chapterMainNumber, normalizeChapterContent, clampChapterContent } = require("./structure");
const { validatePlannedMedia } = require("./media-validation");
const { resolveDiagramQuotas } = require("./media-requirements");
const { buildFlowchartCaption } = require("./flowchart-data");
const { postJsonWithRetry } = require("./llm-http");

// в”Ђв”Ђ LLM chaqiruv (anthropic в†’ openai failover) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function callLLM({ system, user, llm, maxTokens = 6000 }) {
  const { provider, anthropicKey, anthropicModel, openaiKey, openaiModel } = llm;
  const order = provider === "openai" ? ["openai"]
    : provider === "anthropic" ? ["anthropic"] : ["anthropic","openai"];
  const avail = order.filter(p=>(p==="anthropic"&&anthropicKey)||(p==="openai"&&openaiKey));
  if (!avail.length) throw new Error("LLM kalit topilmadi.");
  const errs = [];
  for (const name of avail) {
    try {
      if (name === "anthropic") {
        const d = await postJsonWithRetry("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"content-type":"application/json","x-api-key":anthropicKey,"anthropic-version":"2023-06-01"},
          body: JSON.stringify({ model:anthropicModel||"claude-sonnet-4-6", max_tokens:maxTokens,
            system, messages:[{role:"user",content:user}] }),
        }, "Anthropic");
        return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      } else {
        const d = await postJsonWithRetry("https://api.openai.com/v1/chat/completions",{
          method:"POST",
          headers:{"content-type":"application/json","authorization":"Bearer "+openaiKey},
          body: JSON.stringify({ model:openaiModel||"gpt-5-nano", max_completion_tokens:maxTokens,
            temperature:0.7, response_format:{type:"json_object"},
            messages:[{role:"system",content:system},{role:"user",content:user}] }),
        }, "OpenAI");
        return (d.choices?.[0]?.message?.content||"").trim();
      }
    } catch(e) { errs.push(name+": "+e.message); }
  }
  throw new Error(errs.join(" | "));
}

// Outline'dan KONSEPT darajasida ban-list qurish
// formula_plans: [{latex, concept}] вЂ” notation emas, MA'NO darajasida ban
// chart_plans:   [{title, variable}] вЂ” sarlavha emas, MA'LUMOT darajasida ban
function buildBanLists(outline, chapterIdx) {
  const formulas = [], charts = [];
  outline.chapters.forEach((c, j) => {
    if (j === chapterIdx) return;
    // Formula ban: "latex вЂ” concept" formatida в†’ LLM notationni o'zgartirib aldolmaydi
    if (Array.isArray(c.formula_plans)) {
      c.formula_plans.forEach(f => {
        const latex   = typeof f === "string" ? f : (f.latex || "");
        const concept = typeof f === "object" && f.concept ? ` (${f.concept})` : "";
        if (latex) formulas.push(latex + concept);
      });
    } else if (Array.isArray(c.formula_latex)) {
      c.formula_latex.forEach(f => f && formulas.push(f));
    }
    // Chart ban: "title вЂ” variable" formatida в†’ sarlavha o'zgartirib aldolmaydi
    if (Array.isArray(c.chart_plans)) {
      c.chart_plans.forEach(g => {
        const title    = typeof g === "string" ? g : (g.title || "");
        const variable = typeof g === "object" && g.variable ? ` [ma'lumot: ${g.variable}]` : "";
        if (title) charts.push(title + variable);
      });
    } else if (Array.isArray(c.chart_titles)) {
      c.chart_titles.forEach(t => t && charts.push(t));
    }
  });
  return {
    usedFormulas: [...new Set(formulas)],
    usedCharts:   [...new Set(charts)],
  };
}

// Media pre-render (formula + grafik parallel)
async function prerenderMedia(chapters, language = "o'zbek") {
  const tasks = [];
  chapters.forEach((ch, chIdx) => {
    (ch.content || []).forEach(item => {
      // KESH KALITI: faqat raqam (renumberMedia butun hujjat bo'ylab
      // unikal raqam bergan вЂ” chIdx ga hojat yo'q).
      // MUHIM: builder.js ham "f_<number>" / "c_<number>" qidiradi вЂ”
      // kalitlar MOS bo'lishi shart, aks holda rasm hujjatga chiqmaydi.
      if (item.type === "formula") {
        const key = `f_${item.number}`;
        item._mediaKey = key;
        tasks.push({
          key, kind: "formula", chapter: ch.title || ch.id, latex: item.latex || item.display_text || "",
          fn: () => renderFormula(item.latex || item.display_text || ""),
        });
      }
      if (item.type === "chart") {
        const key = `c_${item.number}`;
        item._mediaKey = key;
        tasks.push({ key, kind: "chart", chapter: ch.title || ch.id, fn: () => renderChart(item) });
      }
      if (item.type === "flowchart") {
        const key = `d_${item.number}`;
        item._mediaKey = key;
        tasks.push({ key, kind: "flowchart", chapter: ch.title || ch.id, fn: () => renderFlowchart({ ...item, language }) });
      }
    });
  });
  if (!tasks.length) return new Map();
  const res = await Promise.allSettled(tasks.map(t => t.fn()));
  const cache = new Map();
  const failedMedia = [];
  tasks.forEach((t, i) => {
    const value = res[i].status === "fulfilled" ? res[i].value : null;
    const validImage = value && Buffer.isBuffer(value.buf) && value.buf.length > 0
      && Number.isFinite(value.width) && value.width > 0
      && Number.isFinite(value.height) && value.height > 0;
    if (validImage) cache.set(t.key, value);
    else {
      const reason = res[i].status === "rejected" ? res[i].reason?.message : "render bo'sh yoki rasm yaroqsiz";
      const detail = t.kind === "formula" ? `: ${String(t.latex).slice(0, 70)}` : "";
      failedMedia.push(`${t.kind} ${t.chapter}${detail} (${reason})`);
    }
  });
  console.log("[mustaqil] render:", cache.size + "/" + tasks.length);
  if (failedMedia.length) {
    throw new Error(`${failedMedia.length} ta formula/grafik/oqim sxemasi renderi ishonchli tugamadi; to'liq media bilan qayta yaratish uchun DOCX chiqarilmadi: ${failedMedia.join(" | ")}`);
  }
  return cache;
}

function alignPlannedChartBlocks(chapter, content) {
  const items = Array.isArray(content) ? content : [];
  const limit = Math.max(0, Math.floor(Number(chapter.chart_count) || 0));
  const plan = Array.isArray(chapter.chart_plans) ? chapter.chart_plans[0] : null;
  const planWords = [plan?.title, plan?.variable].filter(Boolean).join(" ").toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 3);
  const chartCandidates = items.filter(item => item?.type === "chart").map((item, index) => {
    const text = [item.title, item.caption, item.data_source].filter(Boolean).join(" ").toLocaleLowerCase();
    const score = planWords.reduce((sum, word) => sum + Number(text.includes(word)), 0);
    return { item, index, score };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const retained = new Set(chartCandidates.slice(0, limit).map(candidate => candidate.item));
  const aligned = items.flatMap(item => {
    if (item?.type !== "chart") return [item];
    if (!retained.has(item)) return [];
    return [{
      ...item,
      chartType: chapter.chart_type || item.chartType || item.chart_type,
      title: plan?.title || item.title,
      caption: plan?.caption || plan?.title || item.caption || item.title,
      labels: Array.isArray(plan?.labels) ? plan.labels : item.labels,
      values: Array.isArray(plan?.values) ? plan.values : item.values,
      unit: plan?.unit || item.unit,
      data_source: plan?.data_source || item.data_source || item.source,
    }];
  });
  if (plan && Array.isArray(plan.labels) && Array.isArray(plan.values) && plan.labels.length === plan.values.length) {
    for (let index = retained.size; index < limit; index++) {
      aligned.push({
        type: "chart",
        chartType: chapter.chart_type || plan.chartType || "bar",
        title: plan.title || "",
        caption: plan.caption || plan.title || "",
        labels: plan.labels,
        values: plan.values,
        unit: plan.unit || "",
        data_source: plan.data_source || "Sintetik simulyatsiya ma'lumoti",
      });
    }
  }
  return aligned;
}

function alignPlannedFormulaBlocks(chapter, content) {
  const items = Array.isArray(content) ? content : [];
  const plans = Array.isArray(chapter.formula_plans) ? chapter.formula_plans : [];
  let planIndex = 0;
  const aligned = items.flatMap(item => {
    if (item?.type !== "formula") return [item];
    const plan = plans[planIndex++];
    if (!plan) return [];
    const latex = typeof plan === "string" ? plan : String(plan.latex || "").trim();
    if (!latex) return [];
    return [{
      ...item,
      latex,
      display_text: typeof plan === "object" && plan.display_text ? plan.display_text : latex,
      caption: (typeof plan === "object" && (plan.caption || plan.concept)) || item.caption || "",
    }];
  });
  while (planIndex < plans.length) {
    const plan = plans[planIndex++];
    const latex = typeof plan === "string" ? plan : String(plan?.latex || "").trim();
    if (!latex) continue;
    aligned.push({
      type: "formula",
      latex,
      display_text: typeof plan === "object" && plan.display_text ? plan.display_text : latex,
      caption: (typeof plan === "object" && (plan.caption || plan.concept)) || "",
    });
  }
  return aligned;
}

function alignPlannedFlowchartBlocks(chapter, content, language = "o'zbek") {
  const items = Array.isArray(content) ? content : [];
  const plans = Array.isArray(chapter.flowchart_plans) ? chapter.flowchart_plans : [];
  let planIndex = 0;
  return items.flatMap(item => {
    if (item?.type !== "flowchart") return [item];
    const plan = plans[planIndex++];
    if (!plan) return [];
    return [{
      ...item,
      title: String(item.title || plan.title || "").trim(),
      caption: String(item.caption || "").trim() || buildFlowchartCaption(item, plan.purpose, language),
    }];
  });
}

// в”Ђв”Ђ ASOSIY GENERATSIYA в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function generateMustaqilIsh({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, llm, outFile, flowchartCount = 1, chartCount, chartPlans, formulaCount, formulaPlans }) {
  console.log("[mustaqil] boshlandi:", topic, pages+"bet");
  const lang    = language || "o'zbek";
  const rawRequestedFlowchartCount = Math.max(0, Math.floor(Number(flowchartCount) || 0));
  const rawRequestedChartCount = chartCount == null ? undefined : Math.max(0, Math.floor(Number(chartCount) || 0));
  const requestedFormulaCount = formulaCount == null ? undefined : Math.max(0, Math.floor(Number(formulaCount) || 0));
  const pagePlanForWork = pagePlan(pages);
  const diagramQuotas = resolveDiagramQuotas(pagePlanForWork.mainChapterCount, {
    flowchartCount: rawRequestedFlowchartCount,
    chartCount: rawRequestedChartCount,
  });
  const requestedFlowchartCount = diagramQuotas.flowchartCount;
  const requestedChartCount = diagramQuotas.chartCount;
  for (const [name, count] of [["formula", requestedFormulaCount], ["chart", requestedChartCount], ["flowchart", requestedFlowchartCount]]) {
    if (count != null && count > pagePlanForWork.mainChapterCount) {
      throw new Error(`${count} ta ${name} uchun kamida ${count} ta asosiy bo'lim kerak; sahifa rejasi esa ${pagePlanForWork.mainChapterCount} ta bo'lim beradi.`);
    }
  }
  if (requestedFormulaCount != null && Array.isArray(formulaPlans) && formulaPlans.length !== requestedFormulaCount) {
    throw new Error(`Formula kvotasi ${requestedFormulaCount}, lekin formulaPlans ro'yxatida ${formulaPlans.length} ta reja bor.`);
  }
  if (rawRequestedChartCount != null && Array.isArray(chartPlans) && chartPlans.length !== rawRequestedChartCount) {
    throw new Error(`Grafik kvotasi ${rawRequestedChartCount}, lekin chartPlans ro'yxatida ${chartPlans.length} ta reja bor.`);
  }
  const plannedPages = pagePlanForWork.pages;
  const totalWt = pagePlanForWork.totalWords;
  if (pagePlanForWork.addedPages) {
    console.log(`[mustaqil] sahifa rejasi: ${pagePlanForWork.requestedPages} → ${plannedPages} bet (+${pagePlanForWork.addedPages}), 1.5 betlik bo'lim/grafik hisob modeliga mos`);
  }

  // в”Ђв”Ђ PASS 1: OUTLINE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  console.log("[mustaqil] 1-pass: outline...");
  let outline = parseOutline(await callLLM({
    system: outlineSystemPrompt(),
    user:   outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent, flowchartCount: requestedFlowchartCount, chartCount: requestedChartCount, formulaCount: requestedFormulaCount }),
    llm, maxTokens: 6000, // S2-T4: outline keng budget (JSON uzilishi oldini oladi)
  }));
  if (outline.meta) outline.meta.year = String(new Date().getFullYear());
  outline.total_words_target = outline.total_words_target || totalWt;

  // Tuzilma tekshiruvi вЂ” soxta qo'shish yo'q, zarur bo'lsa qayta so'rash
  const expectedPlan = pagePlanForWork;
  const isIntro = (c) => c && (c.id === "intro" || c.role === "introduction" || /^kirish$/i.test(String(c.title || "").trim()));
  const isConclusion = (c) => c && (c.id === "conclusion" || c.role === "conclusion" || /^xulosa$/i.test(String(c.title || "").trim()));
  const isReferences = (c) => c && (/reference|bibliography/i.test(`${c.id || ""} ${c.role || ""}`) || /^(foydalanilgan adabiyotlar(?: ro'yxati)?|adabiyotlar(?: ro'yxati)?|references|bibliography)$/i.test(String(c.title || "").trim()));
  const referenceCount = (candidate) => Array.isArray(candidate?.references)
    ? candidate.references.filter(reference => typeof reference === "string" && reference.trim()).length
    : 0;
  const matchesExpectedStructure = (candidate) => {
    const candidateChapters = Array.isArray(candidate?.chapters) ? candidate.chapters : [];
    const hasIntro = candidateChapters.some(isIntro);
    const hasConclusion = candidateChapters.some(isConclusion);
    const mainChapters = candidateChapters.filter(c => !isIntro(c) && !isConclusion(c) && !isReferences(c));
    const subsectionCount = mainChapters.reduce((sum, c) => sum + (Array.isArray(c.sections) ? c.sections.length : 0), 0);
    return hasIntro && hasConclusion && mainChapters.length === expectedPlan.mainChapterCount && subsectionCount === expectedPlan.subsectionCount && referenceCount(candidate) >= 8;
  };
  if (!matchesExpectedStructure(outline)) {
    console.log("[mustaqil] outline tuzilmasi talabga mos emas, qayta so'ralmoqda...");
    const retry = parseOutline(await callLLM({
      system: outlineSystemPrompt(),
      user:   outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent, flowchartCount: requestedFlowchartCount, chartCount: requestedChartCount, formulaCount: requestedFormulaCount }),
      llm, maxTokens: 6000, // S2-T4: outline keng budget (JSON uzilishi oldini oladi)
    }));
    if (matchesExpectedStructure(retry)) {
      if (retry.meta) retry.meta.year = String(new Date().getFullYear());
      outline = retry;
      console.log("[mustaqil] outline qayta olindi вњ…");
    } else if (referenceCount(retry) >= 8) {
      outline = retry;
      console.warn("[mustaqil] tuzilma fallback bilan normallashtiriladi; manbalar yetarli");
    } else {
      console.warn("[mustaqil] ikkinchi urinishda ham tuzilma noto'g'ri вЂ” mavjud bilan davom");
    }
  }
  if (referenceCount(outline) < 8) {
    throw new Error(`Ish uchun kamida 8 ta bo'sh bo'lmagan adabiyot manbasi olinmadi (${referenceCount(outline)}/8). Qayta urinib ko'ring.`);
  }

  // Bir nechta intro/conclusion bo'lsa, ortiqchasini olib tashlash
  let seenI=false, seenC=false;
  outline.chapters = (Array.isArray(outline.chapters) ? outline.chapters : []).filter(c=>{
    if(c.id==="intro")      { if(seenI) return false; seenI=true; }
    if(c.id==="conclusion") { if(seenC) return false; seenC=true; }
    return true;
  });
  outline = normalizeOutlineForPages(outline, { pages, topic, language: lang, studentName, studentGroup, org, supervisor, flowchartCount: requestedFlowchartCount, chartCount: requestedChartCount, chartPlans, formulaCount: requestedFormulaCount, formulaPlans });

  const plannedMediaCounts = outline.chapters.reduce((counts, chapter) => ({
    formula: counts.formula + (chapter.formula_plans || []).length,
    chart: counts.chart + (chapter.chart_plans || []).length,
    flowchart: counts.flowchart + (chapter.flowchart_plans || []).length,
  }), { formula: 0, chart: 0, flowchart: 0 });
  for (const [name, requested] of [["formula", requestedFormulaCount], ["chart", requestedChartCount], ["flowchart", requestedFlowchartCount]]) {
    if (requested != null && plannedMediaCounts[name] !== requested) {
      throw new Error(`Outline media rejasida ${plannedMediaCounts[name]}/${requested} ta ${name} bor; to'liq media rejasi tuzilmagani uchun hujjat chiqarilmadi.`);
    }
  }

  // Formula va grafik rejalashtirishini loglash
  const fLog = outline.chapters
    .filter(c=>(c.formula_plans||c.formula_latex||[]).length>0)
    .map(c=>{
      const plans = c.formula_plans || (c.formula_latex||[]).map(l=>({latex:l}));
      return `'${c.title}': [${plans.map(f=>(f.concept||f.latex||f)).join(", ")} ]`;
    });
  const gLog = outline.chapters
    .filter(c=>(c.chart_plans||c.chart_titles||[]).length>0)
    .map(c=>{
      const plans = c.chart_plans || (c.chart_titles||[]).map(t=>({title:t}));
      return `'${c.title}' (${c.chart_type}): [${plans.map(g=>(g.variable||g.title||g)).join(", ")} ]`;
    });
  if(fLog.length) console.log("[mustaqil] formulalar:", fLog.join(" | "));
  if(gLog.length) console.log("[mustaqil] grafiklar:", gLog.join(" | "));
  console.log("[mustaqil] outline:", outline.chapters.length+" bob, target="+outline.total_words_target+" so'z");

  // в”Ђв”Ђ PASS 2: PARALLEL CHAPTER GENERATION в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  console.log("[mustaqil] 2-pass: boblar parallel...");
  const results = await Promise.allSettled(
    outline.chapters.map((ch, i) => {
      // Ban-list: boshqa boblarning rejalashtirilgan formula/chart'lari
      const { usedFormulas, usedCharts } = buildBanLists(outline, i);
      return callLLM({
        system: chapterSystemPrompt(),
        user:   chapterUserPrompt({
          chapter:ch, outline, language:lang, sourceContent,
          chapterIndex:i, totalChapters:outline.chapters.length,
          usedFormulas, usedCharts,
        }),
        llm, maxTokens: 6000,
      }).then(t => {
        const p = parseChapter(t);
        const normalizedContent = normalizeChapterContent(ch, p.content || [], chapterMainNumber(outline.chapters, i));
        const content = alignPlannedFlowchartBlocks(ch, alignPlannedFormulaBlocks(ch, alignPlannedChartBlocks(ch, normalizedContent)), lang);
        return { ...ch, content };
      }).catch(e => {
        console.warn("[mustaqil] bob #"+i+" xato:", e.message);
        return { ...ch, content:[] };
      });
    })
  );
  let chapters = results.map((r,i) => r.status==="fulfilled" ? r.value : {...outline.chapters[i],content:[]});

  // в”Ђв”Ђ VALIDATSIYA: takror formula/grafik, asosiy bobda kirish/xulosa в”Ђв”Ђ
  // State tracking (faqat shu generatsiya uchun):
  const state = {
    usedFormulaSigs:  new Map(),  // signature в†’ {chIdx, latex}
    usedChartKeys:    new Map(),  // purpose key в†’ {chIdx, title}
    paragraphPool:    [],          // {chIdx, text}
    violations:       [],
  };

  function scanChapter(ch, chIdx) {
    const issues = [];
    (ch.content || []).forEach((item, i) => {
      if (item.type === "formula" && item.latex) {
        const sig = normalizeFormula(item.latex);
        if (sig && state.usedFormulaSigs.has(sig)) {
          const prev = state.usedFormulaSigs.get(sig);
          issues.push({ kind: "formula_dup", item, prev, idx: i });
        } else if (sig) {
          state.usedFormulaSigs.set(sig, { chIdx, latex: item.latex });
        }
      }
      if (item.type === "chart") {
        const purpose = normalizeChartPurpose(item);
        if (purpose && state.usedChartKeys.has(purpose)) {
          const prev = state.usedChartKeys.get(purpose);
          issues.push({ kind: "chart_dup", item, prev, idx: i });
        } else if (purpose) {
          state.usedChartKeys.set(purpose, { chIdx, title: item.title });
        }
      }
      if (item.type === "paragraph" && item.text) {
        // Boshqa bob paragraflari bilan o'xshashlik
        for (const p of state.paragraphPool) {
          if (p.chIdx !== chIdx) {
            const sim = paragraphSimilarity(item.text, p.text);
            if (sim > 0.55) {  // 55%+ o'xshashlik = takror
              issues.push({ kind: "paragraph_dup", item, prev: p, similarity: sim, idx: i });
              break;
            }
          }
        }
        state.paragraphPool.push({ chIdx, text: item.text });
      }
    });
    // Forbidden intro/conclusion in main chapter
    const role = ch.role || (ch.id==="intro"?"introduction":ch.id==="conclusion"?"conclusion":"theory");
    const forbidden = detectForbiddenIntroConclusion(ch.content, role);
    forbidden.forEach(v => issues.push({ kind: "forbidden_intro_conclusion", item: v, role }));
    return issues;
  }

  // 1-VALIDATSIYA: barcha boblarni skanlash
  chapters.forEach((ch, idx) => {
    const issues = scanChapter(ch, idx);
    if (issues.length > 0) {
      state.violations.push({ chIdx: idx, title: ch.title, issues });
    }
  });

  // QAYTA GENERATSIYA: faqat muammoli boblarni
  if (state.violations.length > 0) {
    console.log("[mustaqil] validatsiya:", state.violations.length, "ta bobda muammo topildi");
    state.violations.forEach(v => {
      const types = v.issues.map(i => i.kind).join(", ");
      console.log(`  - '${v.title}': ${v.issues.length} ta muammo (${types})`);
    });

    // Faqat takrorli formula/chart bo'lgan boblarni qayta so'rash (forbidden intro/conclusion filterlanadi)
    const needRegen = state.violations.filter(v =>
      v.issues.some(i => i.kind === "formula_dup" || i.kind === "chart_dup" || i.kind === "paragraph_dup")
    );

    if (needRegen.length > 0) {
      console.log("[mustaqil] qayta generatsiya:", needRegen.length, "ta bob");

      // To'liq ban-list (barcha boblardagi haqiqiy formula/chart)
      const allFormulas = [...state.usedFormulaSigs.values()].map(v=>v.latex);
      const allCharts   = [...state.usedChartKeys.values()].map(v=>v.title);

      const regenRes = await Promise.allSettled(
        needRegen.map(({ chIdx, title }) => {
          const ch = chapters[chIdx];
          // Bu bobning o'z formula/chart'ini ban-listdan chiqarish
          const thisCh = chapters[chIdx];
          const thisF = (thisCh.content||[]).filter(b=>b.type==="formula").map(b=>b.latex);
          const thisC = (thisCh.content||[]).filter(b=>b.type==="chart").map(b=>b.title);
          const finalFBan = allFormulas.filter(f => !thisF.includes(f));
          const finalCBan = allCharts.filter(c => !thisC.includes(c));

          // Kuchaytirilgan ban-list bilan qayta chaqirish
          return callLLM({
            system: chapterSystemPrompt(),
            user: chapterUserPrompt({
              chapter: ch, outline, language: lang, sourceContent,
              chapterIndex: chIdx, totalChapters: outline.chapters.length,
              usedFormulas: finalFBan, usedCharts: finalCBan,
            }) + `\n\nвљ пёЏ AVVALGI URINISH MUAMMOLI EDI вЂ” quyidagi formula/grafiklar BOSHQA boblarda ishlatilgan, AYNAN SHULARNI ISHLATMA:\n${finalFBan.length?"Formulalar: "+finalFBan.join(","):""}`,
            llm, maxTokens: 6000,
          }).then(t => {
            const p = parseChapter(t);
            const normalizedContent = normalizeChapterContent(ch, p.content || [], chapterMainNumber(outline.chapters, chIdx));
            const content = alignPlannedFlowchartBlocks(ch, alignPlannedFormulaBlocks(ch, alignPlannedChartBlocks(ch, normalizedContent)), lang);
            return { chIdx, content };
          }).catch(e => {
            console.warn("[mustaqil] qayta gen #"+chIdx+" xato:", e.message);
            return { chIdx, content: null };
          });
        })
      );

      // Natijalarni qo'llash
      regenRes.forEach(r => {
        if (r.status === "fulfilled" && r.value.content) {
          chapters[r.value.chIdx] = { ...chapters[r.value.chIdx], content: r.value.content };
        }
      });

      // State'ni qayta qurish (qayta gen'dan keyin)
      state.usedFormulaSigs.clear();
      state.usedChartKeys.clear();
      state.paragraphPool.length = 0;
      state.violations.length = 0;
      chapters.forEach((ch, idx) => {
        const issues = scanChapter(ch, idx);
        if (issues.length > 0) state.violations.push({ chIdx: idx, title: ch.title, issues });
      });

      if (state.violations.length > 0) {
        console.warn("[mustaqil] qayta gen'dan keyin ham", state.violations.length, "ta bobda muammo qoldi (davom etilmoqda)");
      } else {
        console.log("[mustaqil] qayta gen muvaffaqiyatli вЂ” takrorlar yo'q вњ…");
      }
    }

    // Forbidden intro/conclusion'ni har holda filtrlash (regen bo'lmasa ham)
    chapters.forEach(ch => {
      const role = ch.role || (ch.id==="intro"?"introduction":ch.id==="conclusion"?"conclusion":"theory");
      if (role !== "introduction" && role !== "conclusion" && Array.isArray(ch.content)) {
        ch.content = ch.content.filter(item => {
          if (item.type === "heading") {
            const t = String(item.text||"").replace(/^\d+(\.\d+)?\.\s*/, "");
            if (/^(kirish|xulosa|yakun|umumlashtirish)\b/i.test(t)) {
              console.log(`[mustaqil] '${ch.title}'dan "${item.text}" sarlavhasi olib tashlandi`);
              return false;
            }
          }
          return true;
        });
      }
    });
  } else {
    console.log("[mustaqil] validatsiya: takror yo'q вњ…");
  }

  // в”Ђв”Ђ PASS 3: KENGAYTIRISH в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const actualWords = chapters.reduce((s,ch)=>s+countWords(ch.content),0);
  const fillPct = totalWt>0 ? actualWords/totalWt : 1;
  console.log("[mustaqil] so'z:", actualWords+"/"+totalWt+" ("+Math.round(fillPct*100)+"%)");

  const hasShortSections = chapters.some((chapter, index) => {
    const targets = outline.chapters[index]?.sections || [];
    if (!targets.length) return false;
    const audited = normalizeChapterContent(chapter, chapter.content || [], chapterMainNumber(outline.chapters, index));
    const actuals = countSectionWords({ content: audited });
    return targets.some((section, sectionIndex) => Number(section.word_target) > 0
      && (actuals[sectionIndex] || 0) < Number(section.word_target) - 100);
  });

  if (fillPct < 0.82 || hasShortSections) {
    // Haqiqiy ban-list: generatsiya qilingan kontent'dan
    const { usedFormulas:realFormulas, usedCharts:realCharts } = collectUsedFormulasAndCharts(chapters);

    const toExpand = chapters
      .map((ch, i) => {
        const target = Number(outline.chapters[i]?.word_target) || Math.round(totalWt / chapters.length);
        const actual = countWords(ch.content);
        const sectionTargets = (outline.chapters[i]?.sections || []).map(s => Number(s.word_target) || 0);
        const auditedContent = normalizeChapterContent(ch, ch.content || [], chapterMainNumber(outline.chapters, i));
        const sectionActuals = countSectionWords({ content: auditedContent });
        const shortSections = sectionTargets.map((sectionTarget, index) => ({
          title: outline.chapters[i].sections[index].title,
          target: sectionTarget,
          actual: sectionActuals[index] || 0,
          deficit: Math.max(0, sectionTarget - (sectionActuals[index] || 0)),
        })).filter(section => section.deficit > 100);
        const deficit = Math.max(0, target - actual);
        const sectionDeficit = shortSections.reduce((sum, section) => sum + section.deficit, 0);
        return { i, ch, target, actual, deficit: Math.max(deficit, sectionDeficit), shortSections };
      })
      .filter(x => x.deficit > 100 || x.shortSections.length > 0)
      .sort((a, b) => b.deficit - a.deficit);

    if (toExpand.length > 0) {
      console.log("[mustaqil] kengaytirish:", toExpand.map(x=>`'${x.ch.title}' +${x.deficit}so'z`).join(", "));
      const expRes = await Promise.allSettled(
        toExpand.map(({i,ch,deficit,shortSections}) => {
          // Haqiqiy ban-list + bu bobdan boshqa boblarning ban-list'i
          const otherBan = buildBanLists(outline,i);
          const allBanFormulas = [...new Set([...realFormulas,...otherBan.usedFormulas])];
          const allBanCharts   = [...new Set([...realCharts,...otherBan.usedCharts])];
          // Bu bobda allaqachon ishlatilganlarni ban-listdan chiqar
          const thisFormulas = chapters[i].content ? chapters[i].content.filter(b=>b.type==="formula").map(b=>b.latex) : [];
          const thisCharts   = chapters[i].content ? chapters[i].content.filter(b=>b.type==="chart").map(b=>b.title)  : [];
          const finalFBan = allBanFormulas.filter(f=>!thisFormulas.includes(f));
          const finalCBan = allBanCharts.filter(c=>!thisCharts.includes(c));

          const extraParagraphs = Math.max(1, Math.ceil(deficit / 100));
          const extraPerParagraph = Math.ceil(deficit / extraParagraphs);
          const minExtraWords = Math.max(45, Math.floor(extraPerParagraph * 0.85));
          const maxExtraWords = Math.ceil(extraPerParagraph * 1.15);
          return callLLM({
            system: `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT JSON qaytarasan.`,
            user: `"${outline.meta?.title||topic}" вЂ” "${ch.title}" bo'limi uchun qo'shimcha kontent.
Hozir ${countWords(ch.content)} so'z, kamida ${deficit} so'z qo'shimcha kerak.
Til: ${lang}. Akademik, rasmiy uslub.
Taxminan ${extraParagraphs} ta paragraf, har biri ${minExtraWords}-${maxExtraWords} so'z; umumiy qo'shimcha hajm kamomadga yaqin bo'lsin.
${shortSections.length ? "Quyidagi ichki bo'limlar so'z maqsadiga yetmagan; qo'shimcha matn aynan shu yo'nalishlarni mazmunan to'ldirsin (sarlavha qaytarmang):\n"+shortSections.map(s=>`- ${s.title}: hozir ${s.actual}, maqsad ${s.target}, yana taxminan ${s.deficit} so'z`).join("\n") : ""}
Mavjud kontentni TAKRORLAMASDAN, YANGI jihatlar, misollar, tahlillar qo'sh.
${finalFBan.length ? "рџљ« Bu formulalar ishlatilmagan: "+finalFBan.join(", ") : ""}
${finalCBan.length ? "рџљ« Bu grafik sarlavhalari ishlatilmagan: "+finalCBan.join(", ") : ""}
FAQAT JSON: {\"content\":[{\"type\":\"paragraph\",\"text\":\"...\"},{\"type\":\"paragraph\",\"text\":\"...\"},...]}
`,
            llm, maxTokens: 4000,
          }).then(t=>({ i, extra: parseChapter(t).content||[] }))
          .catch(e=>{ console.warn("[mustaqil] expand xato:", e.message); return {i,extra:[]}; });
        })
      );
      const extended = [...chapters];
      expRes.forEach(r=>{
        if(r.status==="fulfilled"&&r.value.extra.length>0) {
          const {i,extra} = r.value;
          extended[i] = {...extended[i], content:[...(extended[i].content||[]),...extra]};
        }
      });
      chapters = extended;
      const newTotal = chapters.reduce((s,ch)=>s+countWords(ch.content),0);
      console.log("[mustaqil] kengaytirish keyin:", newTotal+" so'z ("+Math.round(newTotal/totalWt*100)+"%)");
    }
  }

  const finalWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  const underfilledChapters = [];
  const underfilledSections = [];
  chapters.forEach((chapter, index) => {
    const outlineChapter = outline.chapters[index] || {};
    const chapterTarget = Number(outlineChapter.word_target) || 0;
    if (chapterTarget > 0 && countWords(chapter.content) < chapterTarget * 0.7) {
      underfilledChapters.push(chapter.title);
    }
    const sectionTargets = Array.isArray(outlineChapter.sections) ? outlineChapter.sections : [];
    if (sectionTargets.length) {
      const auditedContent = normalizeChapterContent(chapter, chapter.content || [], chapterMainNumber(outline.chapters, index));
      const sectionActuals = countSectionWords({ content: auditedContent });
      sectionTargets.forEach((section, sectionIndex) => {
        const target = Number(section.word_target) || 0;
        if (target > 0 && (sectionActuals[sectionIndex] || 0) < target * 0.7) {
          underfilledSections.push(`${chapter.title}: ${section.title}`);
        }
      });
    }
  });
  if (underfilledChapters.length || underfilledSections.length || finalWords < totalWt * 0.82) {
    const names = [...new Set([...underfilledChapters, ...underfilledSections])].join(", ") || "umumiy kontent";
    throw new Error(`Mustaqil ish uchun yetarli matn yaratilmadi (${finalWords}/${totalWt} so'z; bob/bo'lim muammosi: ${names}). Qayta urinib ko'ring.`);
  }

  chapters = chapters.map((ch, i) => ({
    ...ch,
    content: clampChapterContent(ch, ch.content || [], chapterMainNumber(outline.chapters, i)),
  }));
  const budgetedWords = chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0);
  console.log("[mustaqil] Word matn byudjeti:", budgetedWords + "/" + totalWt);
  validatePlannedMedia(chapters, outline.chapters, { language: lang });

  // Render and build the final document.
  console.log("[mustaqil] render + docx...");
  renumberMedia(chapters);  // formula/chart/table raqamlari butun hujjat bo'ylab unikal bo'ladi
  const pngCache = await prerenderMedia(chapters, lang);
  const spec = { meta:outline.meta, chapters, references:outline.references||[] };
  const buf  = await buildDocument(spec, pngCache);
  const dir  = path.dirname(outFile);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(outFile, buf);
  console.log("[mustaqil] tayyor:", outFile, Math.round(buf.length/1024)+"KB");

  // CLEANUP: state ma'lumotlari faqat shu generatsiya uchun ishlatildi
  // DB'ga saqlanmaydi, har generatsiya mustaqil
  state.usedFormulaSigs.clear();
  state.usedChartKeys.clear();
  state.paragraphPool.length = 0;
  state.violations.length = 0;

  return {
    outFile,
    pageCount: plannedPages,
    requestedPageCount: pagePlanForWork.requestedPages,
    addedPages: pagePlanForWork.addedPages,
    title: outline.meta?.title || topic,
  };
}

module.exports = { generateMustaqilIsh, alignPlannedChartBlocks, alignPlannedFormulaBlocks, alignPlannedFlowchartBlocks };
