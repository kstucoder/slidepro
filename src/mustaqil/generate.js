// src/mustaqil/generate.js
// 3-pass strategiyasi:
//   Pass 1: outline (tuzilma + so'z maqsadlari)
//   Pass 2: har bir bob parallel kontent
//   Pass 3: qisqa boblarni parallel KENGAYTIRISH (agar maqsaddan <82%)
//   Render: formula + grafik parallel
//   Build: docx

const fs   = require("fs");
const path = require("path");
const {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter, wordsForPages,
} = require("./prompt");
const { renderFormula } = require("./formula");
const { renderChart }   = require("./chart");
const { buildDocument } = require("./builder");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL    = "https://api.openai.com/v1/chat/completions";

// ── LLM yordamchi ──────────────────────────────────────────
async function callLLM({ system, user, llm, maxTokens = 6000 }) {
  const { provider, anthropicKey, anthropicModel, openaiKey, openaiModel } = llm;
  const order = provider === "openai" ? ["openai"]
    : provider === "anthropic" ? ["anthropic"] : ["anthropic", "openai"];
  const avail = order.filter(p => (p==="anthropic"&&anthropicKey)||(p==="openai"&&openaiKey));
  if (!avail.length) throw new Error("LLM kalit topilmadi.");
  const errs = [];
  for (const name of avail) {
    try {
      if (name === "anthropic") {
        const r = await fetch(ANTHROPIC_URL, {
          method:"POST",
          headers:{"content-type":"application/json","x-api-key":anthropicKey,"anthropic-version":"2023-06-01"},
          body: JSON.stringify({ model: anthropicModel||"claude-sonnet-4-6", max_tokens: maxTokens,
            system, messages:[{role:"user",content:user}] }),
        });
        if (!r.ok) throw new Error("Anthropic "+r.status+": "+(await r.text()).slice(0,200));
        const d = await r.json();
        return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      } else {
        const r = await fetch(OPENAI_URL, {
          method:"POST",
          headers:{"content-type":"application/json","authorization":"Bearer "+openaiKey},
          body: JSON.stringify({ model: openaiModel||"gpt-4o", max_tokens: maxTokens,
            temperature:0.7, response_format:{type:"json_object"},
            messages:[{role:"system",content:system},{role:"user",content:user}] }),
        });
        if (!r.ok) throw new Error("OpenAI "+r.status+": "+(await r.text()).slice(0,200));
        const d = await r.json();
        return (d.choices?.[0]?.message?.content||"").trim();
      }
    } catch(e) { errs.push(name+": "+e.message); }
  }
  throw new Error("LLM: "+errs.join(" | "));
}

// So'zlarni sanash
function countWords(content) {
  return (content||[])
    .filter(b => b.type === "paragraph")
    .reduce((s, b) => s + String(b.text||"").split(/\s+/).filter(Boolean).length, 0);
}

// Media pre-render
async function prerenderMedia(chapters) {
  const tasks = [];
  chapters.forEach(ch => {
    (ch.content||[]).forEach(item => {
      if (item.type === "formula") tasks.push({ key:"f_"+item.number, fn:()=>renderFormula(item.latex||item.display_text||"") });
      if (item.type === "chart")   tasks.push({ key:"c_"+item.number, fn:()=>renderChart(item) });
    });
  });
  if (!tasks.length) return new Map();
  const res = await Promise.allSettled(tasks.map(t=>t.fn()));
  const cache = new Map();
  tasks.forEach((t,i) => { if(res[i].status==="fulfilled"&&res[i].value) cache.set(t.key,res[i].value); });
  console.log("[mustaqil] render: "+cache.size+"/"+tasks.length);
  return cache;
}

// ── ASOSIY GENERATSIYA ─────────────────────────────────────
async function generateMustaqilIsh({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, llm, outFile }) {
  console.log("[mustaqil] boshlandi:", topic, pages+"bet");
  const lang     = language || "o'zbek";
  const totalWt  = wordsForPages(pages);

  // ─ PASS 1: OUTLINE ─────────────────────────────────────
  console.log("[mustaqil] 1-pass: outline...");
  const outline = parseOutline(await callLLM({
    system: outlineSystemPrompt(),
    user: outlineUserPrompt({ topic, pages, language:lang, studentName, studentGroup, org, supervisor, sourceContent }),
    llm, maxTokens: 2500,
  }));
  if (outline.meta) outline.meta.year = String(new Date().getFullYear());
  outline.total_words_target = outline.total_words_target || totalWt;
  console.log("[mustaqil] outline:", outline.chapters.length+" bob, target="+outline.total_words_target+" so'z");

  // ─ PASS 2: CHAPTER CONTENT (parallel) ──────────────────
  console.log("[mustaqil] 2-pass: boblar parallel...");
  const results = await Promise.allSettled(
    outline.chapters.map((ch, i) =>
      callLLM({
        system: chapterSystemPrompt(),
        user: chapterUserPrompt({ chapter:ch, outline, language:lang, sourceContent, chapterIndex:i, totalChapters:outline.chapters.length }),
        llm, maxTokens: 6000,   // ko'proq token = ko'proq kontent
      }).then(t => {
        const p = parseChapter(t);
        return { ...ch, content: p.content || [] };
      }).catch(e => {
        console.warn("[mustaqil] bob #"+i+" xato:", e.message);
        return { ...ch, content:[] };
      })
    )
  );
  let chapters = results.map((r, i) => r.status==="fulfilled" ? r.value : {...outline.chapters[i], content:[]});

  // ─ PASS 3: KENGAYTIRISH ────────────────────────────────
  // So'z maqsadidan <82% bo'lsa, qisqa boblarni parallel kengaytirish
  const actualWords = chapters.reduce((s,ch)=>s+countWords(ch.content),0);
  const fillPct = totalWt>0 ? actualWords/totalWt : 1;
  console.log("[mustaqil] so'z:", actualWords+"/"+totalWt+" ("+Math.round(fillPct*100)+"%)");

  if (fillPct < 0.82) {
    // Deficit bo'yicha boblarni tartiblash
    const toExpand = chapters
      .map((ch, i) => {
        const target = Number(outline.chapters[i]?.word_target) || Math.round(totalWt / chapters.length);
        const actual = countWords(ch.content);
        return { i, ch, target, actual, deficit: target - actual };
      })
      .filter(x => x.deficit > 100)
      .sort((a,b) => b.deficit - a.deficit)
      .slice(0, 4);   // eng ko'pi 4 ta

    if (toExpand.length > 0) {
      console.log("[mustaqil] kengaytirish:", toExpand.map(x=>`'${x.ch.title}' +${x.deficit}so'z`).join(", "));
      const expRes = await Promise.allSettled(
        toExpand.map(({ i, ch, deficit }) =>
          callLLM({
            system: `Sen akademik mustaqil ish yozuvchisi mutaxassissan. Faqat JSON qaytarasan.`,
            user:
`"${outline.meta?.title||topic}" asari, "${ch.title}" bo'limi uchun qo'shimcha akademik kontent.
Bu bo'lim ${countWords(ch.content)} so'z — kamida ${deficit} so'z qo'shimcha kerak.
Til: ${lang}. Akademik, rasmiy uslubda yoz.
Kamida ${Math.max(3, Math.ceil(deficit/90))} ta paragraf yoz, har biri 90-130 so'z.
Mavjud kontentni TAKRORLAMASDAN, yangi tafsilotlar, misollar, tahlillar qo'sh.
FAQAT JSON: {"content":[{"type":"paragraph","text":"..."},{"type":"paragraph","text":"..."},...]}`,
            llm, maxTokens: 4000,
          }).then(t => {
            const extra = parseChapter(t).content || [];
            return { i, extra };
          }).catch(e => { console.warn("[mustaqil] expand xato:", e.message); return { i, extra:[] }; })
        )
      );

      const extended = [...chapters];
      expRes.forEach(r => {
        if (r.status === "fulfilled" && r.value.extra.length > 0) {
          const { i, extra } = r.value;
          extended[i] = { ...extended[i], content: [...(extended[i].content||[]), ...extra] };
        }
      });
      chapters = extended;

      const newTotal = chapters.reduce((s,ch)=>s+countWords(ch.content),0);
      console.log("[mustaqil] kengaytirish keyin:", newTotal+" so'z ("+Math.round(newTotal/totalWt*100)+"%)");
    }
  }

  // ─ RENDER + BUILD ───────────────────────────────────────
  console.log("[mustaqil] render + docx...");
  const pngCache = await prerenderMedia(chapters);
  const spec = { meta: outline.meta, chapters, references: outline.references||[] };
  const buf  = await buildDocument(spec, pngCache);

  const dir = path.dirname(outFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
  fs.writeFileSync(outFile, buf);
  console.log("[mustaqil] tayyor:", outFile, Math.round(buf.length/1024)+"KB");
  return { outFile, pageCount: pages, title: outline.meta?.title || topic };
}

module.exports = { generateMustaqilIsh };
