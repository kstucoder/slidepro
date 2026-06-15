// src/mustaqil/generate.js
// Mustaqil ish generatsiya orkestri:
//   Pass 1: outline (tuzilma + aniq boblar soni)
//   Pass 2: har bir bob/bo'lim uchun parallel kontent (subsection-level)
//   Pass 3: render (formula + grafiklar parallel)
//   Pass 4: build docx

const fs = require("fs");
const path = require("path");
const {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  subsectionSystemPrompt, subsectionUserPrompt, parseSubsection,
  chaptersForPages,
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
          headers: { "content-type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: anthropicModel || "claude-sonnet-4-6", max_tokens: maxTokens || 8000, system, messages: [{ role: "user", content: user }] }),
        });
        if (!res.ok) { const t = await res.text(); throw new Error("Anthropic " + res.status + ": " + t.slice(0, 200)); }
        const d = await res.json();
        return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      } else {
        const res = await fetch(OPENAI_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + openaiKey },
          body: JSON.stringify({ model: openaiModel || "gpt-4o", max_tokens: maxTokens || 8000, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        });
        if (!res.ok) { const t = await res.text(); throw new Error("OpenAI " + res.status + ": " + t.slice(0, 200)); }
        const d = await res.json();
        return (d.choices?.[0]?.message?.content || "").trim();
      }
    } catch (e) { errors.push(name + ": " + e.message); }
  }
  throw new Error("LLM xato: " + errors.join(" | "));
}

// Barcha formula va grafiklarni parallel pre-render qilish
async function prerenderMedia(chapters) {
  const tasks = [];
  chapters.forEach((ch) => {
    (ch.content || []).forEach((item) => {
      if (item.type === "formula") {
        tasks.push({ key: "f_" + item.number, fn: () => renderFormula(item.latex || item.display_text || "") });
      }
      if (item.type === "chart") {
        tasks.push({ key: "c_" + item.number, fn: () => renderChart(item) });
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
  console.log("[mustaqil] pre-render: " + cache.size + "/" + tasks.length + " muvaffaqiyatli");
  return cache;
}

// So'z sonini hisoblash (faqat paragraph bloklar)
function countWords(content) {
  return (content || [])
    .filter((item) => item.type === "paragraph" && item.text)
    .reduce((sum, item) => sum + (item.text || "").split(/\s+/).filter(Boolean).length, 0);
}

// Bitta subsection/chapter uchun kontent generatsiya + so'z nazorati + retry
async function generateSectionContent({ chapter, section, outline, language, sourceContent, chapterIndex, totalChapters, llm, maxTokens, useSubsection }) {
  const isSub = useSubsection;
  const prompts = isSub
    ? {
        system: subsectionSystemPrompt(),
        user: subsectionUserPrompt({ chapter, section, outline, language, sourceContent, chapterIndex, totalChapters }),
      }
    : {
        system: chapterSystemPrompt(),
        user: chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters }),
      };

  try {
    const text = await callLLM({ ...prompts, llm, maxTokens });
    const parsed = isSub ? parseSubsection(text) : parseChapter(text);
    const content = parsed.content || [];

    // So'z nazorati
    const wordTarget = section.word_target || chapter.word_target || 400;
    const wordCount = countWords(content);
    if (wordCount < wordTarget * 0.5) {
      console.warn(`[mustaqil] so'z yetarli emas: ${wordCount}/${wordTarget}, qayta urinish...`);
      const retryPrompts = {
        system: prompts.system,
        user: prompts.user + `\n\nMUHIM: Bu bo'lim kamida ${wordTarget} so'z bo'lishi SHART. Hozir faqat ${wordCount} so'z chiqdi. Ko'proq tafsilot, misollar, tahlil, dalillar qo'sh.`,
      };
      try {
        const retryText = await callLLM({ ...retryPrompts, llm, maxTokens });
        const retryParsed = isSub ? parseSubsection(retryText) : parseChapter(retryText);
        return { ...chapter, content: retryParsed.content || content };
      } catch (_) {
        return { ...chapter, content };
      }
    }
    return { ...chapter, content };
  } catch (e) {
    console.warn(`[mustaqil] generatsiya xato: ${e.message}`);
    return { ...chapter, content: [{ type: "paragraph", text: (section.title || chapter.title) + " bo'limi tayyorlanishida xato yuz berdi." }] };
  }
}

// Asosiy generatsiya funksiyasi
async function generateMustaqilIsh({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, llm, outFile }) {
  const requiredChapters = chaptersForPages(pages);
  console.log("[mustaqil] boshlandi:", topic, pages + "bet, " + requiredChapters + " bob");

  // ── 1-BOSQICH: OUTLINE ──────────────────────────────────
  console.log("[mustaqil] 1-pass: outline...");
  const outlineText = await callLLM({
    system: outlineSystemPrompt(),
    user: outlineUserPrompt({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, requiredChapters }),
    llm,
    maxTokens: 2500,
  });
  const outline = parseOutline(outlineText);
  // Yilni majburiy joriy yilga o'rnatish
  if (outline.meta) outline.meta.year = String(new Date().getFullYear());
  console.log("[mustaqil] outline: " + outline.chapters.length + " bob (kerak: " + requiredChapters + "), target=" + outline.total_words_target + " so'z");

  // ── 2-BOSQICH: SUBSECTION-LEVEL PARALLEL KONTENT ─────────
  console.log("[mustaqil] 2-pass: subsection-level parallel kontent...");
  const maxTokensPerSection = pages <= 15 ? 4000 : pages <= 25 ? 6000 : 8000;

  // Barcha generatsiya qilinadigan bo'limlarni yig'ish
  // Har bir chapter uchun: agar sections bor → subsection parallel, yo'q → chapter parallel
  const allTasks = []; // { chapterIdx, sectionIdx, chapter, section, useSubsection }

  outline.chapters.forEach((ch, chIdx) => {
    const sections = ch.sections || [];
    if (sections.length > 0) {
      // Subsectionlar alohida generatsiya
      sections.forEach((sec, secIdx) => {
        allTasks.push({
          chapterIdx: chIdx,
          sectionIdx: secIdx,
          chapter: ch,
          section: sec,
          useSubsection: true,
        });
      });
    } else {
      // Sections yo'q — butun chapter sifatida generatsiya
      allTasks.push({
        chapterIdx: chIdx,
        sectionIdx: -1,
        chapter: ch,
        section: ch,
        useSubsection: false,
      });
    }
  });

  console.log("[mustaqil] " + allTasks.length + " bo'lim parallel generatsiya...");

  // Parallel generatsiya — barcha subsectionlarni bir vaqtda
  const sectionResults = await Promise.allSettled(
    allTasks.map((task) =>
      generateSectionContent({
        chapter: task.chapter,
        section: task.section,
        outline,
        language,
        sourceContent,
        chapterIndex: task.chapterIdx,
        totalChapters: outline.chapters.length,
        llm,
        maxTokens: maxTokensPerSection,
        useSubsection: task.useSubsection,
      })
        .then((result) => ({ ...task, result }))
        .catch((e) => {
          console.warn("[mustaqil] xato:", task.chapter.title, e.message);
          return {
            ...task,
            result: { ...task.chapter, content: [{ type: "paragraph", text: (task.section.title || task.chapter.title) + " bo'limi xato." }] },
          };
        })
    )
  );

  // Natijalarni chapter'ga birlashtirish
  const chapters = outline.chapters.map((ch, chIdx) => {
    const chapterResults = sectionResults.filter(
      (r) => r.status === "fulfilled" && r.value.chapterIdx === chIdx
    );

    if (chapterResults.length === 1 && !chapterResults[0].value.useSubsection) {
      // Butun chapter generatsiya — to'g'ridan-to'g'ri kontent
      return { ...ch, content: chapterResults[0].value.result.content || [] };
    }

    // Subsectionlar birlashtirish — tartib bo'yicha
    const sorted = chapterResults.sort((a, b) => a.value.sectionIdx - b.value.sectionIdx);
    const mergedContent = [];
    let formulaNum = 0;
    let chartNum = 0;
    let tableNum = 0;

    sorted.forEach((r) => {
      const content = r.value.result.content || [];
      content.forEach((item) => {
        if (item.type === "heading" && item.level === 2) {
          // Kichik sarlavhani saqlash
          mergedContent.push(item);
        } else if (item.type === "paragraph") {
          mergedContent.push(item);
        } else if (item.type === "formula") {
          formulaNum++;
          mergedContent.push({ ...item, number: formulaNum });
        } else if (item.type === "chart") {
          chartNum++;
          mergedContent.push({ ...item, number: chartNum });
        } else if (item.type === "table") {
          tableNum++;
          mergedContent.push({ ...item, number: tableNum });
        } else {
          mergedContent.push(item);
        }
      });
    });

    return { ...ch, content: mergedContent };
  });

  // Umumiy so'z hisobi
  const totalWords = chapters.reduce((sum, ch) => sum + countWords(ch.content), 0);
  console.log("[mustaqil] kontent tayyor: " + chapters.length + " bob, jami ≈ " + totalWords + " so'z");

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
  console.log("[mustaqil] tayyor:", outFile, Math.round(docBuf.length / 1024) + "KB");

  return { outFile, pageCount: pages, title: outline.meta?.title || topic };
}

module.exports = { generateMustaqilIsh };
