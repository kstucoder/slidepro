// src/mustaqil/generate.js
// Mustaqil ish generator — yangilangan sahifa/bo'lim qoidalariga mos

const fs   = require("fs");
const path = require("path");
const {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter, wordsForPages,
  collectUsedFormulasAndCharts,
  normalizeFormula, formulaSignature,
  normalizeChartPurpose,
  paragraphSimilarity,
  detectForbiddenIntroConclusion,
} = require("./prompt");
const { renderFormula } = require("./formula");
const { renderChart }   = require("./chart");
const { buildDocument } = require("./builder");

// LLM chaqiruv (Anthropic -> OpenAI failover)
async function callLLM({ system, user, llm, maxTokens = 6000 }) {
  const { provider, anthropicKey, anthropicModel, openaiKey, openaiModel } = llm;
  const order = provider === "openai" ? ["openai"]
    : provider === "anthropic" ? ["anthropic"] : ["anthropic","openai"];
  const avail = order.filter(p => (p === "anthropic" && anthropicKey) || (p === "openai" && openaiKey));
  if (!avail.length) throw new Error("LLM kalit topilmadi.");
  const errs = [];
  for (const name of avail) {
    try {
      if (name === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"content-type":"application/json","x-api-key":anthropicKey,"anthropic-version":"2023-06-01"},
          body: JSON.stringify({ model:anthropicModel||"claude-sonnet-4-6", max_tokens:maxTokens,
            system, messages:[{role:"user",content:user}] }),
        });
        if(!r.ok) throw new Error("Anthropic "+r.status+": "+(await r.text()).slice(0,200));
        const d = await r.json();
        return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      } else {
        const r = await fetch("https://api.openai.com/v1/chat/completions",{
          method:"POST",
          headers:{"content-type":"application/json","authorization":"Bearer "+openaiKey},
          body: JSON.stringify({ model:openaiModel||"gpt-5-nano", max_completion_tokens:maxTokens,
            temperature:0.7, response_format:{type:"json_object"},
            messages:[{role:"system",content:system},{role:"user",content:user}] }),
        });
        if(!r.ok) throw new Error("OpenAI "+r.status+": "+(await r.text()).slice(0,200));
        const d = await r.json();
        return (d.choices?.[0]?.message?.content||"").trim();
      }
    } catch(e) { errs.push(name+": "+e.message); }
  }
  throw new Error(errs.join(" | "));
}

// So'zlarni sanash
function countWords(content) {
  return (content||[])
    .filter(b=>b.type==="paragraph")
    .reduce((s,b)=>s+(String(b.text||"").split(/\s+/).filter(Boolean).length),0);
}

// Ban-list yaratuvchi (outline kontekstidan)
function buildBanLists(outline, chapterIdx) {
  const formulas = [], charts = [];
  outline.chapters.forEach((c, j) => {
    if (j === chapterIdx) return;
    if (Array.isArray(c.formula_plans)) {
      c.formula_plans.forEach(f => {
        const latex = typeof f === "string" ? f : (f.latex || "");
        const concept = typeof f === "object" && f.concept ? ` (${f.concept})` : "";
        if (latex) formulas.push(latex + concept);
      });
    } else if (Array.isArray(c.formula_latex)) {
      c.formula_latex.forEach(f => f && formulas.push(f));
    }
    if (Array.isArray(c.chart_plans)) {
      c.chart_plans.forEach(g => {
        const title = typeof g === "string" ? g : (g.title || "");
        const variable = typeof g === "object" && g.variable ? ` [ma'lumot: ${g.variable}]` : "";
        if (title) charts.push(title + variable);
      });
    } else if (Array.isArray(c.chart_titles)) {
      c.chart_titles.forEach(t => t && charts.push(t));
    }
  });
  return { usedFormulas: [...new Set(formulas)], usedCharts: [...new Set(charts)] };
}

// Formulalar va grafiklar uchun butun hujjat bo'ylab unikal raqamlar
function renumberMedia(chapters) {
  let fNum = 0, cNum = 0, tNum = 0;
  chapters.forEach(ch => {
    (ch.content || []).forEach(item => {
      if (item.type === "formula") item.number = ++fNum;
      else if (item.type === "chart") item.number = ++cNum;
      else if (item.type === "table") item.number = ++tNum;
    });
  });
}

// Media pre-render (parallel)
async function prerenderMedia(chapters) {
  const tasks = [];
  chapters.forEach((ch, chIdx) => {
    (ch.content || []).forEach(item => {
      if (item.type === "formula") {
        const key = `f_${item.number}`;
        item._mediaKey = key;
        tasks.push({ key, fn: () => renderFormula(item.latex || item.display_text || "") });
      }
      if (item.type === "chart") {
        const key = `c_${item.number}`;
        item._mediaKey = key;
        tasks.push({ key, fn: () => renderChart(item) });
      }
    });
  });
  if (!tasks.length) return new Map();
  const res = await Promise.allSettled(tasks.map(t => t.fn()));
  const cache = new Map();
  tasks.forEach((t, i) => { if (res[i].status === "fulfilled" && res[i].value) cache.set(t.key, res[i].value); });
  console.log("[mustaqil] render:", cache.size + "/" + tasks.length);
  return cache;
}

// --- ASL: sahifa/bo'lim hisoblash qoidalari (oldingi versiya) ---
function computeMustaqilStructure(pages) {
  // Original simple behaviour: do not enforce complex main/sub counts.
  const p = Math.max(0, Number(pages) || 0);
  const main = Math.max(3, Math.min(5, Math.round((p - 3) / 4) || 3));
  const availableForInner = Math.max(0, p - 3);
  const inner = Math.max(0, Math.floor(availableForInner / 2));
  const subCounts = [];
  if (main > 0) {
    let base = Math.floor(inner / main);
    let rem = inner % main;
    for (let i = 0; i < main; i++) {
      const v = base + (rem > 0 ? 1 : 0);
      subCounts.push(v);
      if (rem > 0) rem--;
    }
  }
  return { pages: p, main, inner, availableForInner, subCounts };
}

// Agar kerak bo'lsa pages ni minimal qo'shish orqali inner integer bo'lishini ta'minlash
function adjustPagesForInner(requestedPages) {
  return Number(requestedPages) || 0;
}

// Asosiy generatsiya funksiyasi
async function generateMustaqilIsh({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, llm, outFile }) {
  console.log("[mustaqil] boshlandi:", topic, pages+"bet");
  const lang    = language || "o'zbek";
  pages = adjustPagesForInner(pages);
  const totalWt = wordsForPages(pages);

  // PASS 1: OUTLINE
  console.log("[mustaqil] 1-pass: outline...");
  let outline = parseOutline(await callLLM({
    system: outlineSystemPrompt(),
    user:   outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent }),
    llm, maxTokens: 6000,
  }));
  if (outline.meta) outline.meta.year = String(new Date().getFullYear());
  outline.total_words_target = outline.total_words_target || totalWt;

  // Tuzilma tekshiruvi — intro & conclusion bo'lishi kerak
  const hasIntro = outline.chapters.some(c=>c.id==="intro");
  const hasConc  = outline.chapters.some(c=>c.id==="conclusion");
  if (!hasIntro || !hasConc) {
    console.log("[mustaqil] tuzilma noto'g'ri (intro/xulosa yo'q), qayta so'ralmoqda...");
    const retry = parseOutline(await callLLM({
      system: outlineSystemPrompt(),
      user:   outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent }),
      llm, maxTokens: 6000,
    }));
    if (retry.chapters.some(c=>c.id==="intro") && retry.chapters.some(c=>c.id==="conclusion")) {
      if (retry.meta) retry.meta.year = String(new Date().getFullYear());
      outline = retry;
      console.log("[mustaqil] outline qayta olindi — muvaffaqiyatli");
    } else {
      console.warn("[mustaqil] ikkinchi urinishda ham tuzilma noto'g'ri — davom etiladi");
    }
  }

  // Remove duplicate intros/conclusions
  let seenI=false, seenC=false;
  outline.chapters = outline.chapters.filter(c=>{
    if(c.id==="intro")      { if(seenI) return false; seenI=true; }
    if(c.id==="conclusion") { if(seenC) return false; seenC=true; }
    return true;
  });

  // --- ASL: mustaqil strukturani ozgina moslash (Kirish + main + Xulosa) ---
  const struct = computeMustaqilStructure(pages);
  // Collect existing mains (non-intro/non-conclusion)
  const isMain = (c) => c.id !== "intro" && c.id !== "conclusion";
  let mains = outline.chapters.filter(isMain);
  const others = outline.chapters.filter(c => !isMain(c));

  // If mains less than required, append synthetic ones (simple round-robin)
  if (mains.length < struct.main) {
    const ANGLES = [
      { title: "Mavzuning nazariy asoslari", role: "theory" },
      { title: "Amaliy tahlil va hozirgi holat", role: "analysis" },
      { title: "Muammolar va ularning yechimlari", role: "problems" },
      { title: "Istiqbol va takliflar", role: "proposals" },
    ];
    let ai = 0;
    const restWt = outline.total_words_target || totalWt;
    while (mains.length < struct.main) {
      const a = ANGLES[ai++ % ANGLES.length];
      mains.push({ id: "ch" + (mains.length + 1), title: a.title, role: a.role,
        word_target: Math.round(restWt / struct.main), sections: [], formula_count: 0, chart_count: 0, table_count: 0 });
    }
    console.log("[mustaqil] boblar soni kam edi — to'ldirildi: "+mains.length+" ta");
  } else if (mains.length > struct.main) {
    // If more than desired, trim extras and redistribute their weight
    const keep = mains.slice(0, struct.main);
    const extra = mains.slice(struct.main);
    const extraWt = extra.reduce((s, c) => s + (Number(c.word_target) || 200), 0);
    const keepSum = keep.reduce((s, c) => s + (Number(c.word_target) || 200), 0) || 1;
    keep.forEach(c => { c.word_target = Math.round((Number(c.word_target) || 200) + extraWt * ((Number(c.word_target) || 200) / keepSum)); });
    mains = keep;
    console.log("[mustaqil] boblar ortiqcha edi — "+extra.length+" ta olib tashlandi, hajmi taqsimlandi");
  }
  // Reindex and assemble outline.chapters as [intro, ...mains, conclusion]
  mains.forEach((c, k) => { c.id = "ch" + (k+1); });
  const intro = others.find(c => c.id === "intro");
  const conc  = others.find(c => c.id === "conclusion");
  outline.chapters = [ ...(intro ? [intro] : []), ...mains, ...(conc ? [conc] : []) ];

  // Assign subCounts to mains and compute word_targets based on pages and a simple rule
  const subCounts = struct.subCounts; // length == struct.main
  // Words per page
  const totalWords = wordsForPages(struct.pages);
  const wordsPerPage = struct.pages > 0 ? totalWords / struct.pages : 400;

  // For each main, compute page allocation = sub_count * 2 (approx) + 1 page for main header/body
  const pagesAllocated = subCounts.map(sc => sc * 2 + 1);
  const sumAllocated = pagesAllocated.reduce((s,x)=>s+x,0);
  const contentPages = Math.max(0, struct.pages - 3);
  let scale = 1;
  if (sumAllocated > 0) scale = contentPages / sumAllocated;
  const pagesPerMain = pagesAllocated.map(pv => Math.max(1, pv * scale));

  // Finally set word_target per main
  outline.chapters.forEach((ch, idx) => {
    if (ch.id === "intro" || ch.id === "conclusion") return;
    const mainIdx = parseInt(ch.id.replace(/^ch/,""),10) - 1;
    const pageForThis = Math.max(1, Math.round(pagesPerMain[mainIdx]));
    ch.page_target = pageForThis; // informational
    ch.word_target = Math.max(200, Math.round(pageForThis * wordsPerPage));
    ch.sub_count = subCounts[mainIdx] || 0;
  });

  console.log("[mustaqil] struktur: pages=", struct.pages, " main=", struct.main, " inner=", struct.inner, " subCounts=", JSON.stringify(subCounts));

  // --- PASS 2: parallel chapter generation ---
  console.log("[mustaqil] 2-pass: boblar parallel...");
  const results = await Promise.allSettled(
    outline.chapters.map((ch, i) => {
      const { usedFormulas, usedCharts } = buildBanLists(outline, i);
      return callLLM({
        system: chapterSystemPrompt(),
        user:   chapterUserPrompt({
          chapter:ch, outline, language:lang, sourceContent,
          chapterIndex:i, totalChapters:outline.chapters.length, mainNum: outline.chapters.slice(0, i).filter(c => c.id !== "intro" && c.id !== "conclusion").length + (ch.id !== "intro" && ch.id !== "conclusion" ? 1 : 0),
          usedFormulas, usedCharts,
        }),
        llm, maxTokens: 6000,
      }).then(t => {
        const p = parseChapter(t);
        let content = p.content || [];
        const isMainChapter = ch.id !== "intro" && ch.id !== "conclusion";
        if (isMainChapter) {
          content = content.filter(item => {
            if (item.type === "heading") {
              const t = String(item.text || "").toLowerCase().replace(/^\d+(\.\d+)?\.\s*/, "");
              if (/^(kirish|xulosa|yakun|umumlashtirish)\b/i.test(t)) {
                console.log(`[mustaqil] '${ch.title}' ichidan "${item.text}" sarlavhasi olib tashlandi`);
                return false;
              }
            }
            return true;
          });
        }
        return { ...ch, content };
      }).catch(e => {
        console.warn("[mustaqil] bob #"+i+" xato:", e.message);
        return { ...ch, content:[] };
      });
    })
  );

  let chapters = results.map((r,i) => r.status==="fulfilled" ? r.value : {...outline.chapters[i],content:[]});

  // VALIDATSIYA: takror formulalar/grafik va intro/xulosa forbidden
  const state = { usedFormulaSigs: new Map(), usedChartKeys: new Map(), paragraphPool: [], violations: [] };
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
        for (const p of state.paragraphPool) {
          if (p.chIdx !== chIdx) {
            const sim = paragraphSimilarity(item.text, p.text);
            if (sim > 0.55) {
              issues.push({ kind: "paragraph_dup", item, prev: p, similarity: sim, idx: i });
              break;
            }
          }
        }
        state.paragraphPool.push({ chIdx, text: item.text });
      }
    });
    const role = ch.role || (ch.id==="intro"?"introduction":ch.id==="conclusion"?"conclusion":"theory");
    const forbidden = detectForbiddenIntroConclusion(ch.content, role);
    forbidden.forEach(v => issues.push({ kind: "forbidden_intro_conclusion", item: v, role }));
    return issues;
  }

  chapters.forEach((ch, idx) => {
    const issues = scanChapter(ch, idx);
    if (issues.length > 0) state.violations.push({ chIdx: idx, title: ch.title, issues });
  });

  // QAYTA GENERATSIYA: faqat muammoli boblarni (takror yoki forbidden)
  if (state.violations.length > 0) {
    console.log("[mustaqil] validatsiya:", state.violations.length, "ta bobda muammo topildi");
    const needRegen = state.violations.filter(v => v.issues.some(i => i.kind === "formula_dup" || i.kind === "chart_dup" || i.kind === "paragraph_dup"));
    if (needRegen.length > 0) {
      console.log("[mustaqil] qayta generatsiya:", needRegen.length, "ta bob");
      const allFormulas = [...state.usedFormulaSigs.values()].map(v=>v.latex);
      const allCharts   = [...state.usedChartKeys.values()].map(v=>v.title);
      const regenRes = await Promise.allSettled(
        needRegen.map(({ chIdx, title }) => {
          const ch = chapters[chIdx];
          const thisF = (ch.content||[]).filter(b=>b.type==="formula").map(b=>b.latex);
          const thisC = (ch.content||[]).filter(b=>b.type==="chart").map(b=>b.title);
          const finalFBan = allFormulas.filter(f => !thisF.includes(f));
          const finalCBan = allCharts.filter(c => !thisC.includes(c));
          return callLLM({
            system: chapterSystemPrompt(),
            user: chapterUserPrompt({ chapter: ch, outline, language: lang, sourceContent,
              chapterIndex: chIdx, totalChapters: outline.chapters.length, usedFormulas: finalFBan, usedCharts: finalCBan
            }) + `\n\n// QAYTA: oldingi urinish muammoli edi — quyidagi formulalar/grafiklar ishlatilmasin:\n${finalFBan.length?"Formulalar: "+finalFBan.join(", "):""}${finalCBan.length?"\nGraf[...]":""}`,
            llm, maxTokens: 6000,
          }).then(t => {
            const p = parseChapter(t);
            let content = p.content || [];
            const role = ch.role || (ch.id==="intro"?"introduction":ch.id==="conclusion"?"conclusion":"theory");
            if (role !== "introduction" && role !== "conclusion") {
              content = content.filter(item => {
                if (item.type === "heading") {
                  const t = String(item.text||"").replace(/^\d+(\.\d+)?\.\s*/, "");
                  if (/^(kirish|xulosa|yakun|umumlashtirish)\b/i.test(t)) return false;
                }
                return true;
              });
            }
            return { chIdx, content };
          }).catch(e => { console.warn("[mustaqil] qayta gen #"+chIdx+" xato:", e.message); return { chIdx, content: null }; });
        })
      );
      regenRes.forEach(r => {
        if (r.status === "fulfilled" && r.value && r.value.content) {
          chapters[r.value.chIdx] = { ...chapters[r.value.chIdx], content: r.value.content };
        }
      });
      // Re-scan quickly (best-effort)
      state.usedFormulaSigs.clear(); state.usedChartKeys.clear(); state.paragraphPool.length = 0; state.violations.length = 0;
      chapters.forEach((ch, idx) => { const issues = scanChapter(ch, idx); if (issues.length) state.violations.push({ chIdx: idx, title: ch.title, issues }); });
      if (state.violations.length > 0) console.warn("[mustaqil] qayta gen'dan keyin ham muammolar qolishi mumkin — davom etilmoqda");
    }
  } else {
    console.log("[mustaqil] validatsiya: takror yo'q — ok");
  }

  // PASS 3: kengaytirish — shu joyda hujjatni to'ldirish uchun kamchiliklar aniqlanadi
  const actualWords = chapters.reduce((s,ch)=>s+countWords(ch.content),0);
  const fillPct = totalWt>0 ? actualWords/totalWt : 1;
  console.log("[mustaqil] so'z:", actualWords+"/"+totalWt+" ("+Math.round(fillPct*100)+"%)");

  if (fillPct < 0.82) {
    const { usedFormulas:realFormulas, usedCharts:realCharts } = collectUsedFormulasAndCharts(chapters);
    const toExpand = chapters
      .map((ch, i) => {
        const target = Number(outline.chapters[i]?.word_target) || Math.round(totalWt / chapters.length);
        const actual = countWords(ch.content);
        return { i, ch, target, actual, deficit: target - actual };
      })
      .filter(x => x.deficit > 100)
      .sort((a, b) => b.deficit - a.deficit)
      .slice(0, 4);

    if (toExpand.length > 0) {
      console.log("[mustaqil] kengaytirish:", toExpand.map(x=>`'${x.ch.title}' +${x.deficit}so'z`).join(", "));
      const expRes = await Promise.allSettled(
        toExpand.map(({i,ch,deficit}) => {
          const otherBan = buildBanLists(outline,i);
          const allBanFormulas = [...new Set([...(realFormulas||[]), ...otherBan.usedFormulas])];
          const allBanCharts   = [...new Set([...(realCharts||[]), ...otherBan.usedCharts])];
          const thisFormulas = chapters[i].content ? chapters[i].content.filter(b=>b.type==="formula").map(b=>b.latex) : [];
          const thisCharts   = chapters[i].content ? chapters[i].content.filter(b=>b.type==="chart").map(b=>b.title)  : [];
          const finalFBan = allBanFormulas.filter(f=>!thisFormulas.includes(f));
          const finalCBan = allBanCharts.filter(c=>!thisCharts.includes(c));
          return callLLM({
            system: `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT JSON qaytarasan.`,
            user: `"${outline.meta?.title||topic}" — "${ch.title}" bo'limi uchun qo'shimcha kontent.\nHozir ${countWords(ch.content)} so'z, kamida ${deficit} so'z qo'shimcha kerak.\nTil: ${lang}. Akademik, rasmiy, chuqur tahliliy uslub.\nKamida ${Math.max(3,Math.ceil(deficit/110))} ta paragraf (100-140 so'z/paragraf).\nMavjud kontentni TAKRORLAMASDAN, YANGI jihatlar, misollar, tahlillar qo'sh.\n${finalFBan.length ? "Bu formulalar ishlatilmagan: "+finalFBan.join(", ") : ""}\n${finalCBan.length ? "Bu grafik sarlavhalari ishlatilmagan: "+finalCBan.join(", ") : ""}\nFAQAT JSON: {\"content\":[{\"type\":\"paragraph\",\"text\":\"...\"},...] }`,
            llm, maxTokens: 4000,
          }).then(t=>({ i, extra: parseChapter(t).content||[] }))
          .catch(e=>{ console.warn("[mustaqil] expand xato:", e.message); return {i,extra:[]}; });
        })
      );
      const extended = [...chapters];
      expRes.forEach(r=>{ if(r.status==="fulfilled"&&r.value.extra.length>0) { const {i,extra} = r.value; extended[i] = {...extended[i], content:[...(extended[i].content||[]),...extra]}; } });
      chapters = extended;
      const newTotal = chapters.reduce((s,ch)=>s+countWords(ch.content),0);
      console.log("[mustaqil] kengaytirish keyin:", newTotal+" so'z ("+Math.round(newTotal/totalWt*100)+"%)");
    }
  }

  // RENDER + BUILD
  console.log("[mustaqil] render + docx...");
  renumberMedia(chapters);
  const pngCache = await prerenderMedia(chapters);
  const spec = { meta: outline.meta, chapters, references: outline.references || [] };
  const buf  = await buildDocument(spec, pngCache);
  const dir  = path.dirname(outFile);
  if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(outFile, buf);
  console.log("[mustaqil] tayyor:", outFile, Math.round(buf.length/1024)+"KB");

  // Cleanup
  state.usedFormulaSigs && state.usedFormulaSigs.clear && state.usedFormulaSigs.clear();
  state.usedChartKeys && state.usedChartKeys.clear && state.usedChartKeys.clear();
  state.paragraphPool && (state.paragraphPool.length = 0);
  state.violations && (state.violations.length = 0);

  return { outFile, pageCount: pages, title: outline.meta?.title || topic };
}

module.exports = { generateMustaqilIsh };
