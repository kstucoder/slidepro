// src/mustaqil/generate.js
// Mustaqil ish generatsiya orkestri:
//   Pass 1: outline (tuzilma)
//   Pass 2: har bir bob uchun parallel kontent
//   Render: formula + grafiklar parallel
//   Build: docx

const fs = require("fs");
const path = require("path");
const {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
} = require("./prompt");
const { renderFormula } = require("./formula");
const { renderChart } = require("./chart");
const { buildDocument } = require("./builder");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// LLM chaqirish
async function callLLM({ system, user, llm, maxTokens }) {
  const { provider, anthropicKey, anthropicModel, openaiKey, openaiModel } = llm;
  const order = provider === "openai" ? ["openai"] : provider === "anthropic" ? ["anthropic"] : ["anthropic", "openai"];
  const available = order.filter((p) => (p === "anthropic" && anthropicKey) || (p === "openai" && openaiKey));
  if (!available.length) throw new Error("LLM kalit topilmadi.");

  const errors = [];
  for (const name of available) {
    try {
      if (name === "anthropic") {
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          headers: { "content-type":"application/json","x-api-key":anthropicKey,"anthropic-version":"2023-06-01" },
          body: JSON.stringify({ model: anthropicModel||"claude-sonnet-4-6", max_tokens: maxTokens||8000, system, messages:[{role:"user",content:user}] }),
        });
        if (!res.ok) { const t=await res.text(); throw new Error("Anthropic "+res.status+": "+t.slice(0,200)); }
        const d = await res.json();
        return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      } else {
        const res = await fetch(OPENAI_URL, {
          method: "POST",
          headers: { "content-type":"application/json","authorization":"Bearer "+openaiKey },
          body: JSON.stringify({ model: openaiModel||"gpt-4o", max_tokens: maxTokens||8000, temperature:0.7, response_format:{type:"json_object"}, messages:[{role:"system",content:system},{role:"user",content:user}] }),
        });
        if (!res.ok) { const t=await res.text(); throw new Error("OpenAI "+res.status+": "+t.slice(0,200)); }
        const d = await res.json();
        return (d.choices?.[0]?.message?.content||"").trim();
      }
    } catch(e) { errors.push(name+": "+e.message); }
  }
  throw new Error("LLM xato: "+errors.join(" | "));
}

// Barcha formula va grafiklarni parallel pre-render qilish
async function prerenderMedia(chapters) {
  const tasks = [];
  chapters.forEach((ch) => {
    (ch.content||[]).forEach((item) => {
      if (item.type === "formula") {
        tasks.push({ key: "f_"+item.number, fn: () => renderFormula(item.latex||item.display_text||"") });
      }
      if (item.type === "chart") {
        tasks.push({ key: "c_"+item.number, fn: () => renderChart(item) });
      }
    });
  });
  if (!tasks.length) return new Map();
  const results = await Promise.allSettled(tasks.map((t) => t.fn()));
  const cache = new Map();
  tasks.forEach((t, i) => {
    if (results[i].status === "fulfilled" && results[i].value) {
      cache.set(t.key, results[i].value);
    } else {
      console.warn("[mustaqil] render xato:", t.key, results[i].reason?.message);
    }
  });
  console.log("[mustaqil] pre-render: "+cache.size+"/"+tasks.length+" muvaffaqiyatli");
  return cache;
}

// Asosiy generatsiya funksiyasi
async function generateMustaqilIsh({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, llm, outFile }) {
  console.log("[mustaqil] boshlandi:", topic, pages+"bet");

  // ── 1-BOSQICH: OUTLINE ──────────────────────────────────
  console.log("[mustaqil] 1-pass: outline...");
  const outlineText = await callLLM({
    system: outlineSystemPrompt(),
    user: outlineUserPrompt({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent }),
    llm,
    maxTokens: 2500,
  });
  const outline = parseOutline(outlineText);
  // Yilni majburiy joriy yilga o'rnatish (LLM eski yil yozishi mumkin)
  if (outline.meta) outline.meta.year = String(new Date().getFullYear());
  console.log("[mustaqil] outline: "+outline.chapters.length+" bob, target="+outline.total_words_target+" so'z");

  // ── 2-BOSQICH: CHAPTER CONTENT (parallel) ──────────────
  console.log("[mustaqil] 2-pass: boblar parallel...");
  // Sahifalar soniga qarab maxTokensni moslashtirish
  // Kichik hujjat (10-15 bet) -> 4000, o'rtacha (16-25) -> 6000, katta (26-40) -> 8000
  const maxTokensPerChapter = pages <= 15 ? 4000 : pages <= 25 ? 6000 : 8000;
  const chapterResults = await Promise.allSettled(
    outline.chapters.map((ch, i) =>
      callLLM({
        system: chapterSystemPrompt(),
        user: chapterUserPrompt({ chapter: ch, outline, language, sourceContent, chapterIndex: i, totalChapters: outline.chapters.length }),
        llm,
        maxTokens: maxTokensPerChapter,
      }).then((text) => {
        const parsed = parseChapter(text);
        // So'z sonini tekshirish — agar ancha kam bo'lsa, qayta generatsiya urinishi
        const wordCount = (parsed.content || [])
          .filter((item) => item.type === "paragraph" && item.text)
          .reduce((sum, item) => sum + (item.text || "").split(/\s+/).filter(Boolean).length, 0);
        const target = ch.word_target || 400;
        if (wordCount < target * 0.5 && i < outline.chapters.length) {
          console.warn(`[mustaqil] bob #${i} "${ch.title}" so'z yetarli emas: ${wordCount}/${target}, qayta urinish...`);
          // Qayta urinish — aniqroq ko'rsatma bilan
          return callLLM({
            system: chapterSystemPrompt(),
            user: chapterUserPrompt({
              chapter: { ...ch, word_target: target },
              outline, language, sourceContent, chapterIndex: i, totalChapters: outline.chapters.length
            }) + `\n\nMUHIM: Bu bob kamida ${target} so'z bo'lishi SHART. Hozir faqat ${wordCount} so'z chiqdi. Ko'proq tafsilot, misollar, tahlil qo'sh.`,
            llm,
            maxTokens: maxTokensPerChapter,
          }).then((retryText) => {
            const retryParsed = parseChapter(retryText);
            return { ...ch, content: retryParsed.content || parsed.content || [] };
          }).catch(() => {
            return { ...ch, content: parsed.content || [] };
          });
        }
        return { ...ch, content: parsed.content || [] };
      }).catch((e) => {
        console.warn("[mustaqil] bob #"+i+" xato:", e.message);
        return { ...ch, content: [{ type:"paragraph", text: ch.title+" bo'limi tayyorlanishida xato yuz berdi." }] };
      })
    )
  );

  const chapters = chapterResults.map((r, i) =>
    r.status === "fulfilled" ? r.value : { ...outline.chapters[i], content:[] }
  );
  console.log("[mustaqil] kontent tayyor");

  // ── MEDIA PRE-RENDER ────────────────────────────────────
  console.log("[mustaqil] formulalar va grafiklar render...");
  const pngCache = await prerenderMedia(chapters);

  // ── DOCX BUILD ──────────────────────────────────────────
  console.log("[mustaqil] docx qurilmoqda...");
  const spec = { meta: outline.meta, chapters, references: outline.references || [] };
  const docBuf = await buildDocument(spec, pngCache);

  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, docBuf);
  console.log("[mustaqil] tayyor:", outFile, Math.round(docBuf.length/1024)+"KB");

  return { outFile, pageCount: pages, title: outline.meta?.title || topic };
}

module.exports = { generateMustaqilIsh };
