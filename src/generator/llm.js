// src/generator/llm.js
// LLM orkestratori: admin sozlamasiga ko'ra provayderni tanlaydi.
//   provider = "anthropic" | "openai" | "both"
// "both" — avval Anthropic, agar xato/bo'sh bo'lsa avtomatik OpenAI'ga o'tadi (failover).
//
// 2-FAZALI GENERATSIYA:
//   1-faza: outline — faqat N ta slayd skeleton (layout + title + icon)
//   2-faza: slide-content — har bir mazmun slaydiga parallel to'liq kontent

const {
  buildOutlineSystemPrompt, buildOutlineUserPrompt, parseOutline,
  buildSlideContentSystemPrompt, buildSlideContentUserPrompt, parseSlideContent,
  CONTENT_LAYOUTS,
  buildSystemPrompt, buildUserPrompt, parseSpec, // eski 1-fazali (fallback)
} = require("./prompt");
const anthropic = require("./anthropic");
const openai = require("./openai");

// =====================================================================
// LLM CHAQIRISH YORDAMCHILARI
// =====================================================================

// bitta provayderni chaqirib, matn qaytarish
async function callOneText(name, { system, user }, cfg) {
  let text;
  if (name === "anthropic") {
    text = await anthropic.generate({
      system, user, apiKey: cfg.anthropicKey, model: cfg.anthropicModel,
    });
  } else if (name === "openai") {
    text = await openai.generate({
      system, user, apiKey: cfg.openaiKey, model: cfg.openaiModel,
    });
  } else {
    throw new Error("Noma'lum provayder: " + name);
  }
  return text.trim();
}

// bitta provayderni chaqirib, JSON spec qaytarish (eski 1-fazali uchun)
async function callOne(name, prompts, cfg) {
  const text = await callOneText(name, prompts, cfg);
  const spec = parseSpec(text);
  if (!spec || !Array.isArray(spec.slides) || spec.slides.length === 0) {
    throw new Error(`${name}: yaroqsiz spec (slides yo'q)`);
  }
  return spec;
}

// Provayderlarni tanlash (failover)
function getAvailableProviders(provider, cfg) {
  const order =
    provider === "openai" ? ["openai"] :
    provider === "anthropic" ? ["anthropic"] :
    ["anthropic", "openai"];
  return order.filter((p) =>
    (p === "anthropic" && cfg.anthropicKey) || (p === "openai" && cfg.openaiKey)
  );
}

// Har qanday provayder bilan LLM chaqirish (failover bilan)
async function callWithFailover(providers, prompts, cfg, maxTokens) {
  const errors = [];
  for (const name of providers) {
    try {
      const text = await callOneText(name, { ...prompts, maxTokens }, { ...cfg, maxTokens });
      return { text, usedProvider: name };
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  throw new Error("Barcha provayderlar muvaffaqiyatsiz:\n" + errors.join("\n"));
}

// =====================================================================
// 1-FAZALI GENERATSIYA (eski, fallback sifatida saqlanadi)
// =====================================================================

async function generateSpec({ topic, slides, sourceContent, extra, studentName, studentGroup, provider, anthropicKey, anthropicModel, openaiKey, openaiModel }) {
  const prompts = {
    system: buildSystemPrompt(),
    user: buildUserPrompt({ topic, slides, extra, sourceContent, studentName, studentGroup }),
  };
  const cfg = { anthropicKey, anthropicModel, openaiKey, openaiModel };
  const available = getAvailableProviders(provider, cfg);
  if (available.length === 0) {
    throw new Error("Hech qaysi LLM provayderga kalit topilmadi. ANTHROPIC_API_KEY yoki OPENAI_API_KEY o'rnating.");
  }

  const errors = [];
  for (const name of available) {
    try {
      const spec = await callOne(name, prompts, cfg);
      ensureStructure(spec, topic);
      return { spec, usedProvider: name };
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  throw new Error("Barcha provayderlar muvaffaqiyatsiz:\n" + errors.join("\n"));
}

// =====================================================================
// 2-FAZALI GENERATSIYA — ASOSIY YANGI USUL
// =====================================================================

async function generateSpecTwoPhase({ topic, slides, sourceContent, extra, studentName, studentGroup, provider, anthropicKey, anthropicModel, openaiKey, openaiModel }) {
  const cfg = { provider, anthropicKey, anthropicModel, openaiKey, openaiModel };
  const available = getAvailableProviders(provider, cfg);
  if (available.length === 0) {
    throw new Error("Hech qaysi LLM provayderga kalit topilmadi.");
  }

  const FIXED = 4; // title + agenda + conclusion + references
  const contentCount = Math.max(slides - FIXED, 1);

  console.log(`[llm] 2-fazali generatsiya: ${slides} slayd (${contentCount} mazmun), provider: ${available.join("/")}`);

  // ── 1-FAZA: OUTLINE ─────────────────────────────────────────
  console.log("[llm] 1-faza: outline...");
  let outlineData;
  let usedProvider;

  try {
    const outlineResult = await callWithFailover(
      available,
      {
        system: buildOutlineSystemPrompt(),
        user: buildOutlineUserPrompt({ topic, slides, sourceContent, studentName, studentGroup }),
      },
      cfg,
      2000, // outline kichik — 2000 token yetarli
    );
    outlineData = parseOutline(outlineResult.text);
    usedProvider = outlineResult.usedProvider;
  } catch (e) {
    console.warn("[llm] 1-faza outline xato, fallback 1-fazali:", e.message);
    // Fallback: eski 1-fazali usul
    return generateSpec({ topic, slides, sourceContent, extra, studentName, studentGroup, provider, anthropicKey, anthropicModel, openaiKey, openaiModel });
  }

  // Outline'ni tekshirish va moslashtirish
  let contentSlides = (outlineData.slides || []).slice(0, contentCount);
  const palette = outlineData.palette || "ocean";

  // Agar kam slayd kelsa — qo'shish
  while (contentSlides.length < contentCount) {
    const i = contentSlides.length;
    const fallbackLayouts = CONTENT_LAYOUTS.filter((l) =>
      !contentSlides.some((s) => s.layout === l)
    );
    const layout = fallbackLayouts[i % fallbackLayouts.length] || CONTENT_LAYOUTS[i % CONTENT_LAYOUTS.length];
    contentSlides.push({ layout, title: `${topic} — ${i + 1}-bo'lim`, icon: "info" });
  }
  contentSlides = contentSlides.slice(0, contentCount);

  // Har bir skeleton'ga indeks qo'shish
  contentSlides = contentSlides.map((s, i) => ({
    ...s,
    _index: i + 1,
    _total: contentCount,
    icon: s.icon || "info",
  }));

  console.log(`[llm] outline: ${contentSlides.length} mazmun slayd, palette=${palette}, provider=${usedProvider}`);

  // ── MAJBURIY SLAYDLARNI KOD BILAN YARATISH ────────────────
  const spec = { palette, slides: [] };

  // 1) TITLE
  spec.slides.push({
    layout: "title",
    title: topic,
    kicker: "TAQDIMOT",
    icon: "presentation",
    meta: [],
    date: String(new Date().getFullYear()),
  });

  // 2) AGENDA — outline'dan sarlavhalarni olamiz
  const agendaItems = contentSlides.map((s) => ({ title: s.title }));
  spec.slides.push({
    layout: "agenda",
    title: "Reja",
    icon: "list",
    items: agendaItems,
  });

  // Mazmun slaydlari — skeleton sifatida joylash (2-faza to'ldiradi)
  spec.slides.push(...contentSlides.map((s) => ({ layout: s.layout, title: s.title, icon: s.icon })));

  // CONCLUSION — oldindan tayyor
  spec.slides.push({
    layout: "conclusion",
    title: "Xulosa",
    items: [
      { icon: "check", text: "Mavzu bo'yicha asosiy xulosalar" },
      { icon: "check", text: "Tahlil natijalari" },
      { icon: "check", text: "Takliflar va tavsiyalar" },
    ],
  });

  // REFERENCES — oldindan tayyor (2-faza oxirida LLM to'ldiradi)
  spec.slides.push({
    layout: "references",
    title: "Foydalanilgan adabiyotlar",
    icon: "book",
    items: [],
    note: "Manbalar ro'yxati",
    thanks: "E'tiboringiz uchun rahmat!",
  });

  // ── 2-FAZA: PARALLEL KONTENT ────────────────────────────────
  console.log("[llm] 2-faza: parallel kontent generatsiya...");
  const outlineTitles = contentSlides.map((s) => s.title);

  // Batch parallel: 4 tadan bir vaqtda
  const BATCH_SIZE = 4;
  const results = [];

  for (let batchStart = 0; batchStart < contentSlides.length; batchStart += BATCH_SIZE) {
    const batch = contentSlides.slice(batchStart, batchStart + BATCH_SIZE);
    console.log(`[llm] 2-faza batch: ${batchStart + 1}-${batchStart + batch.length}/${contentSlides.length}`);

    const batchResults = await Promise.allSettled(
      batch.map(async (skeleton, i) => {
        const globalIndex = batchStart + i; // spec.slides ichidagi haqiqiy indeks (FIXED offset bilan)
        const slideIndexInSpec = FIXED + globalIndex; // 4 (title+agenda+conclusion+references offset)

        try {
          const result = await callWithFailover(
            available,
            {
              system: buildSlideContentSystemPrompt(),
              user: buildSlideContentUserPrompt({
                slideSkeleton: skeleton,
                topic,
                outlineTitles,
                studentName,
                studentGroup,
                sourceContent,
              }),
            },
            cfg,
            3000, // bitta slayd kontent uchun 3000 token
          );

          const contentData = parseSlideContent(result.text, skeleton.layout);
          if (contentData) {
            // Layout va title'ni skeleton'dan saqlash (LLM o'zgartirib yuborishi mumkin)
            contentData.layout = skeleton.layout;
            contentData.title = skeleton.title;
            contentData.icon = skeleton.icon || contentData.icon;
            return { index: slideIndexInSpec, data: contentData, provider: result.usedProvider };
          } else {
            // Parse xato — skeleton bilan qoladi
            return { index: slideIndexInSpec, data: null, provider: result.usedProvider };
          }
        } catch (e) {
          console.warn(`[llm] 2-faza slayd #${globalIndex + 1} xato: ${e.message}`);
          // Fallback — skeleton bilan render
          return { index: slideIndexInSpec, data: null, provider: null };
        }
      })
    );

    results.push(...batchResults);
  }

  // Natijalarni spec'ga yozish
  let filledCount = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value && r.value.data) {
      spec.slides[r.value.index] = r.value.data;
      filledCount++;
      if (r.value.provider) usedProvider = r.value.provider;
    }
    // data: null bo'lsa skeleton saqlanib qoladi (defensive layouts)
  }
  console.log(`[llm] 2-faza: ${filledCount}/${contentSlides.length} slayd to'ldirildi`);

  // ── STRUCTURE KAFOLATI ──────────────────────────────────────
  ensureStructure(spec, topic);

  // ── TITUL SLAYDGA TALABA MA'LUMOTLARI ─────────────────────
  // Bu build.js da ham qilinadi, lekin early binding ham foydali
  const titleSlide = spec.slides.find((s) => s.layout === "title");
  if (titleSlide) {
    titleSlide.date = String(new Date().getFullYear());
    if (studentName || studentGroup) {
      const meta = [];
      if (studentName) meta.push({ label: "Bajardi:", value: studentName });
      if (studentGroup) meta.push({ label: "Guruh:", value: studentGroup });
      titleSlide.meta = meta;
    }
  }

  // ── DUBLIKATLARNI OLDINI OLISH ─────────────────────────────
  spec.slides = breakConsecutiveDuplicates(spec.slides);

  return { spec, usedProvider: usedProvider || available[0] };
}

// =====================================================================
// STRUKTURA KAFOLATLARI
// =====================================================================

// STRUKTURA KAFOLATI: titul(1) + reja(2) + ... + xulosa + adabiyotlar(oxirgi).
function ensureStructure(spec, topic) {
  let slides = Array.isArray(spec.slides) ? spec.slides.slice() : [];

  // 1) TITUL — birinchi bo'lsin
  let ti = slides.findIndex((s) => s.layout === "title");
  if (ti > 0) slides.unshift(slides.splice(ti, 1)[0]);
  else if (ti === -1) slides.unshift({ layout: "title", title: topic || "Taqdimot", meta: [] });

  // 2) ADABIYOTLAR — oxirgi bo'lsin
  let ri = slides.findIndex((s) => s.layout === "references");
  if (ri !== -1 && ri !== slides.length - 1) slides.push(slides.splice(ri, 1)[0]);
  else if (ri === -1) {
    slides.push({
      layout: "references", title: "Foydalanilgan adabiyotlar", icon: "book",
      items: [
        "Mavzu bo'yicha asosiy darslik va o'quv adabiyotlari.",
        "Tegishli sohaviy ilmiy maqolalar va nashrlar.",
        "Rasmiy hujjatlar, standartlar va me'yoriy manbalar.",
        "Ishonchli internet manbalari va ochiq akademik bazalar.",
      ],
      note: "Manbalar ro'yxatini aniq talab asosida to'ldirish tavsiya etiladi.",
      thanks: "E'tiboringiz uchun rahmat!",
    });
  }

  // 3) XULOSA — adabiyotlardan oldin bo'lsin
  let ci = slides.findIndex((s) => s.layout === "conclusion");
  if (ci !== -1) {
    const refIdx = slides.findIndex((s) => s.layout === "references");
    if (ci > refIdx) {
      const [c] = slides.splice(ci, 1);
      const newRefIdx = slides.findIndex((s) => s.layout === "references");
      slides.splice(newRefIdx, 0, c);
    }
  }

  // 4) REJA (agenda) — ikkinchi bo'lsin
  let ai = slides.findIndex((s) => s.layout === "agenda");
  if (ai === -1) {
    const skip = new Set(["title", "agenda", "conclusion", "references"]);
    const items = slides.filter((s) => !skip.has(s.layout) && s.title).map((s) => ({ title: s.title })).slice(0, 7);
    if (items.length) slides.splice(1, 0, { layout: "agenda", title: "Reja", icon: "list", items });
  } else if (ai !== 1) {
    slides.splice(1, 0, slides.splice(ai, 1)[0]);
  }

  // 5) KETMA-KET DUBLIKATLARNI SINDIRISH
  slides = breakConsecutiveDuplicates(slides);

  spec.slides = slides;
  return spec;
}

// Mazmun slaydlari orasida ketma-ket bir xil layoutni oldini olish.
function breakConsecutiveDuplicates(slides) {
  const SKIP = new Set(["title", "agenda", "conclusion", "references"]);
  const result = [...slides];
  let changed = true;
  let pass = 0;
  while (changed && pass < 12) {
    changed = false; pass++;
    for (let i = 0; i < result.length - 1; i++) {
      if (SKIP.has(result[i].layout) || SKIP.has(result[i + 1].layout)) continue;
      if (result[i].layout !== result[i + 1].layout) continue;
      let swapped = false;
      for (let j = i + 2; j < result.length; j++) {
        if (SKIP.has(result[j].layout)) continue;
        if (result[j].layout !== result[i].layout) {
          [result[i + 1], result[j]] = [result[j], result[i + 1]];
          changed = true; swapped = true; break;
        }
      }
      if (!swapped && i > 0 && !SKIP.has(result[i - 1].layout) && result[i - 1].layout !== result[i + 1].layout) {
        [result[i], result[i + 1]] = [result[i + 1], result[i]];
        changed = true;
      }
    }
  }
  let remaining = 0;
  for (let i = 0; i < result.length - 1; i++) {
    if (!SKIP.has(result[i].layout) && result[i].layout === result[i+1].layout) remaining++;
  }
  if (remaining > 0) {
    console.warn("[llm] ensureStructure: " + remaining + " ta ketma-ket dublikat qoldi");
  }
  return result;
}

module.exports = { generateSpec, generateSpecTwoPhase };
