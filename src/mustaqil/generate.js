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

// Formulalar va grafiklarni QAYTA RAQAMLASH:
// LLM har bob uchun mustaqil ravishda number:1, number:2 qaytaradi вЂ”
// natijada bir xil kesh kaliti ("c_1") bir nechta turli rasmga ishora qiladi.
// Bu funksiya butun hujjat bo'ylab unikal raqamlar beradi: 1, 2, 3, ...
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

// Media pre-render (formula + grafik parallel)
async function prerenderMedia(chapters) {
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

// в”Ђв”Ђ ASOSIY GENERATSIYA в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function generateMustaqilIsh({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, llm, outFile }) {
  console.log("[mustaqil] boshlandi:", topic, pages+"bet");
  const lang    = language || "o'zbek";
  const totalWt = wordsForPages(pages);

  // в”Ђв”Ђ PASS 1: OUTLINE в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  console.log("[mustaqil] 1-pass: outline...");
  let outline = parseOutline(await callLLM({
    system: outlineSystemPrompt(),
    user:   outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent }),
    llm, maxTokens: 6000, // S2-T4: outline keng budget (JSON uzilishi oldini oladi)
  }));
  if (outline.meta) outline.meta.year = String(new Date().getFullYear());
  outline.total_words_target = outline.total_words_target || totalWt;

  // Tuzilma tekshiruvi вЂ” soxta qo'shish yo'q, zarur bo'lsa qayta so'rash
  const hasIntro = outline.chapters.some(c=>c.id==="intro");
  const hasConc  = outline.chapters.some(c=>c.id==="conclusion");
  if (!hasIntro || !hasConc) {
    console.log("[mustaqil] tuzilma noto'g'ri (intro/xulosa yo'q), qayta so'ralmoqda...");
    const retry = parseOutline(await callLLM({
      system: outlineSystemPrompt(),
      user:   outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent }),
      llm, maxTokens: 6000, // S2-T4: outline keng budget (JSON uzilishi oldini oladi)
    }));
    if (retry.chapters.some(c=>c.id==="intro") && retry.chapters.some(c=>c.id==="conclusion")) {
      if (retry.meta) retry.meta.year = String(new Date().getFullYear());
      outline = retry;
      console.log("[mustaqil] outline qayta olindi вњ…");
    } else {
      console.warn("[mustaqil] ikkinchi urinishda ham tuzilma noto'g'ri вЂ” mavjud bilan davom");
    }
  }

  // Bir nechta intro/conclusion bo'lsa, ortiqchasini olib tashlash
  let seenI=false, seenC=false;
  outline.chapters = outline.chapters.filter(c=>{
    if(c.id==="intro")      { if(seenI) return false; seenI=true; }
    if(c.id==="conclusion") { if(seenC) return false; seenC=true; }
    return true;
  });

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
        let content = p.content || [];
        // Asosiy boblarda "Kirish/Xulosa/Yakun" kichik bo'limlari TA'QIQLANGAN
        const isMain = ch.id !== "intro" && ch.id !== "conclusion";
        if (isMain) {
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
            let content = p.content || [];
            // Yana intro/conclusion filtri (asosiy boblar uchun)
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

  if (fillPct < 0.82) {
    // Haqiqiy ban-list: generatsiya qilingan kontent'dan
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
          // Haqiqiy ban-list + bu bobdan boshqa boblarning ban-list'i
          const otherBan = buildBanLists(outline,i);
          const allBanFormulas = [...new Set([...realFormulas,...otherBan.usedFormulas])];
          const allBanCharts   = [...new Set([...realCharts,...otherBan.usedCharts])];
          // Bu bobda allaqachon ishlatilganlarni ban-listdan chiqar
          const thisFormulas = chapters[i].content ? chapters[i].content.filter(b=>b.type==="formula").map(b=>b.latex) : [];
          const thisCharts   = chapters[i].content ? chapters[i].content.filter(b=>b.type==="chart").map(b=>b.title)  : [];
          const finalFBan = allBanFormulas.filter(f=>!thisFormulas.includes(f));
          const finalCBan = allBanCharts.filter(c=>!thisCharts.includes(c));

          return callLLM({
            system: `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT JSON qaytarasan.`,
            user: `"${outline.meta?.title||topic}" вЂ” "${ch.title}" bo'limi uchun qo'shimcha kontent.
Hozir ${countWords(ch.content)} so'z, kamida ${deficit} so'z qo'shimcha kerak.
Til: ${lang}. Akademik, rasmiy uslub.
Kamida ${Math.max(3,Math.ceil(deficit/110))} ta paragraf (100-140 so'z/paragraf).
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

  // в”Ђв”Ђ RENDER + BUILD в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  console.log("[mustaqil] render + docx...");
  renumberMedia(chapters);  // formula/chart/table raqamlari butun hujjat bo'ylab unikal bo'ladi
  const pngCache = await prerenderMedia(chapters);
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

  return { outFile, pageCount:pages, title:outline.meta?.title||topic };
}

module.exports = { generateMustaqilIsh };
