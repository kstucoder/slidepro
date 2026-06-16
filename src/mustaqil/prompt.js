// src/mustaqil/prompt.js
// Mustaqil ish uchun 2 bosqichli LLM strategiyasi:
//   1) outline — tuzilma + so'z maqsadlari + formula/grafik joylar
//   2) chapter — har bir bob uchun to'liq kontent
//
// TAVSIYA ETILGAN API PARAMETRLAR (takrorlashni oldini olish uchun):
//   - temperature: 0.7-0.9 (xilma-xillik uchun)
//   - frequency_penalty: 0.3-0.5 (so'z takrorlanishini kamaytirish)
//   - presence_penalty: 0.3-0.5 (yangi g'oyalar kiritishni rag'batlantirish)
//
// ISHLATISH TARTIBI:
//   1. outlineUserPrompt() → outline generatsiya
//   2. Har bir bob uchun chapterUserPrompt() → bob generatsiya
//      - usedFormulas va usedCharts parametrlarini TO'G'RI uzatish shart!
//   3. collectUsedFormulasAndCharts() → barcha boblardan formula/grafik yig'ish

// Haqiqiy kalibratsiya:
// - 1 sahifa ≈ 280 so'z (TNR 14pt, 1.5, GOST)
// - LLM odatda so'ralgan so'zning 65-70% ini yozadi
// - Sahifa bo'shiqlari va xizmat sahifalari ham yo'q qiladi
// → Kompensatsiya: 420 so'z/sahifa so'raymiz, 5 xizmat sahifa hisoblaymiz
// Natija: 15 sahifa so'rasak → ~15 sahifa chiqadi (±1)
const WORDS_PER_PAGE = 420;
const SERVICE_PAGES  = 5;  // muqova + reja + adabiyotlar + ~2 sahifa bo'shliq

function wordsForPages(pages) {
  return Math.round(Math.max(pages - SERVICE_PAGES, 3) * WORDS_PER_PAGE);
}

// ===================== 1-BOSQICH: OUTLINE =====================
function outlineSystemPrompt() {
  return `Sen akademik mustaqil ish tuzilmasini yaratuvchi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q.`;
}

function outlineUserPrompt({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent }) {
  const totalWords = wordsForPages(pages);
  const lang = language || "o'zbek";
  const contentNote = sourceContent
    ? `\n\nFoydalanuvchi quyidagi manba kontentini berdi — asosiy g'oyalar va faktlar SHUNGA asoslansin:\n---\n${sourceContent.slice(0,3000)}\n---`
    : "";

  return `Akademik mustaqil ish uchun tuzilma (outline) yarat.

Talablar:
- Mavzu: "${topic}"
- Til: ${lang}
- Sahifalar soni: ${pages} (jami ≈ ${totalWords} so'z asosiy kontent)
- Talaba: ${studentName || "F.I.Sh."}, guruh: ${studentGroup || "—"}
- Muassasa: ${org || "O'quv muassasasi"}
- Rahbar: ${supervisor || "O'qituvchi"}${contentNote}

Quyidagi JSON strukturasida qaytargin:
{
  "meta": {
    "title": "ish nomi (mavzu asosida)",
    "type": "MUSTAQIL ISH",
    "org": "${org || "O'quv muassasasi"}",
    "department": "tegishli kafedra yoki bo'lim",
    "student_name": "${studentName || "F.I.Sh."}",
    "student_group": "${studentGroup || "—"}",
    "supervisor": "${supervisor || "O'qituvchi"}",
    "city": "shahar",
    "year": "${new Date().getFullYear()}",
    "language": "${lang}"
  },
  "total_words_target": ${totalWords},
  "chapters": [
    {
      "id": "intro",
      "title": "Kirish",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": 0,
      "chart_count": 0,
      "table_count": 0,
      "formula_latex": [],
      "sections": []
    },
    {
      "id": "ch1",
      "title": "<asosiy bo'lim nomi, BOB so'zi ISHLATMA>",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": <raqam>,
      "chart_count": <raqam>,
      "table_count": <raqam>,
      "formula_latex": [<formula ro'yxati>],
      "chart_titles": [<grafik sarlavhalari>],
      "sections": [
        {"id":"ch1_1","title":"<kichik bo'lim nomi>","level":2,"word_target":<raqam>}
      ]
    },
    {
      "id": "conclusion",
      "title": "Xulosa",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": 0,
      "chart_count": 0,
      "table_count": 0,
      "formula_latex": [],
      "sections": []
    }
  ],
  "references": [
    "<APA format: Muallif, A. A. (yil). Asar nomi. Nashriyot yoki Jurnal nomi, jild(son), sahifalar.",
    ...
  ]
}

QOIDALAR:
- Kirish (id="intro"): 150-250 so'z, formula_count:0, chart_count:0, table_count:0. Faqat mavzuning dolzarbligi, maqsad, vazifalar, uslub, tuzilma haqida.
- Xulosa (id="conclusion"): 200-350 so'z, formula_count:0, chart_count:0, table_count:0. Faqat natijalar, xulosa, tavsiyalar, istiqbol. YANGI nazariy ma'lumotlar, tariflar BO'LMAYDI.
- Asosiy bo'limlar (id="ch1", "ch2", ...): sahifalar soniga mutanosib (${pages <= 15 ? "1-2" : pages <= 25 ? "2-3" : "3-4"} ta asosiy bo'lim), har biri kichik bo'limlari bilan
- MUHIM: Tuzilma DAIM Kirish → Asosiy bo'limlar → Xulosa tartibida bo'lishi kerak. Faqat 1 ta Kirish, faqat 1 ta Xulosa.
- MUHIM: chapter title'larda "bob" so'zi ISHLATMA. Faqat bo'lim nomi yoz
- Har asosiy bo'lim BOSHQA JIHATNI yoritsin (nazariy/amaliy/taqqoslov/prognoz) — takrorlanmasin
- word_target'lar yig'indisi ≈ ${totalWords} ga teng bo'lsin
- Formulalar: FAQAT aniq fanlar mavzularida (matematika, fizika, kimyo, muhandislik, iqtisodiyot, kompyuter fanlari, biologiya, kimyoviy texnologiya) — u holda har asosiy bob uchun 1-3 ta mavzuga mos formula. Gumanitar, ijtimoiy, tarixiy, ekologik-umumiy mavzularda formula_count:0 bo'lsin. Mavzuning o'ziga qarab hal qil. MUHIM: Har bir bobning formulalari BOSHQA BOBLARDA ISHLATILMAGAN va takrorlanmagan formula bo'lishi kerak. Har bir bob uchun formula_latex maydoni qo'shing — bu yerda bobda ishlatiladigan formulalar ro'yxati ko'rsatiladi (masalan, ["E = mc^2", "F = ma"]).
- Grafiklar: har asosiy bob uchun kamida 1 ta grafik (bar/line/pie) — realistik ma'lumotlar bilan
- Jadvallar: kamida 1 ta ixtiyoriy bob uchun
- references: 8-12 ta manba, APA 7 formatida. FAQAT HAQIQIY, MAVJUD ASARLAR:
  * Kitob: Muallif, A. A. (yil). Asar nomi. Nashriyot.
  * Jurnal: Muallif, A. A. (yil). Maqola nomi. Jurnal nomi, jild(son), sahifalar.
  * O'ZBEK (40%): O'zbekiston olimlarining haqiqiy nashr etilgan asarlari
  * XORIJIY (60%): Dunyo bo'yicha tan olingan darsliklar va maqolalar
  * MUHIM: Faqat mavjudligiga 100% ishonch hosil qilgan manbalarni yozing.
  * 40% — 2018-2024 yillarda nashr etilgan yangi manbalar
- Faqat JSON qaytar`;
}

function parseOutline(text) {
  const clean = text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  try { return JSON.parse(clean); }
  catch(e) {
    const s=clean.indexOf("{"), end=clean.lastIndexOf("}");
    if(s>=0&&end>s) return JSON.parse(clean.slice(s,end+1));
    throw new Error("Outline JSON o'qilmadi: "+clean.slice(0,200));
  }
}

// ===================== 2-BOSQICH: CHAPTER CONTENT =====================
function chapterSystemPrompt() {
  return `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q. Akademik, rasmiy, chuqur tahliliy uslubda yoz.`;
}

function chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters, usedFormulas = [], usedCharts = [] }) {
  const lang = language || "o'zbek";
  const wt = chapter.word_target || 400;
  const paraCount = Math.max(4, Math.ceil(wt / 110));
  const contentNote = sourceContent
    ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0,2000)}\n---`
    : "";
  const allTitles = outline.chapters.map((c,i) => `${i+1}. ${c.title}`).join("\n");

  // Determine chapter type
  const isIntro = chapter.id === "intro" || chapterIndex === 0;
  const isConclusion = chapter.id === "conclusion" || chapter.id === "xulosa" || chapterIndex === totalChapters - 1;
  const isMainBody = !isIntro && !isConclusion;

  // Collect banned formulas and charts
  const plannedFormulas = outline.chapters
    .filter((c, idx) => idx !== chapterIndex && c.formula_latex && c.formula_latex.length > 0)
    .map(c => c.formula_latex)
    .flat();
  const allBannedFormulas = [...new Set([...plannedFormulas, ...usedFormulas])];

  const plannedCharts = outline.chapters
    .filter((c, idx) => idx !== chapterIndex && c.chart_titles && c.chart_titles.length > 0)
    .map(c => c.chart_titles)
    .flat();
  const allBannedCharts = [...new Set([...plannedCharts, ...usedCharts])];

  // Build ban lists
  const formulaBan = allBannedFormulas.length > 0 
    ? `\n🚫 TAKRORLANISHI MUMKIN EMAS FORMULALAR: ${allBannedFormulas.join(", ")}`
    : "";
  const chartBan = allBannedCharts.length > 0
    ? `\n🚫 TAKRORLANISHI MUMKIN EMAS GRAFIKLAR: ${allBannedCharts.join(", ")}`
    : "";

  // Chapter type instructions
  let typeInstructions = "";
  if (isIntro) {
    typeInstructions = `\nBU BOB: KIRISH. Formula, grafik, jadval YO'Q. Faqat dolzarblik, maqsad, vazifalar.`;
  } else if (isConclusion) {
    typeInstructions = `\nBU BOB: XULOSA. Formula, grafik, jadval YO'Q. Faqat natijalar, tavsiyalar.`;
  } else {
    typeInstructions = `\nBU BOB: ASOSIY MAZMUN. Formula, grafik, jadval mumkin.`;
  }

  return `🚨 MUHIM QOIDALAR (bularni BOSHIDA o'qing):
1. YUQORIDAGI TAKRORLANISHI MUMKIN EMAS ro'yxatidagi formulalar va grafiklarni ISHLATMAYMAN.
2. Har bir formula va grafik BOSHQA BOBLARDA ISHLATILMAGAN bo'lishi SHART.
3. Formula faqat mavzuga to'g'ri keladigan, ANIQ va FOYDALI bo'lishi kerak.
4. Grafik haqiqiy, aniq raqamlar bilan bo'lishi kerak. Sifatsiz, umumiy grafiklar YO'Q.
5. JSON qaytarishdan OLDIN, barcha formulalar va grafiklarni tekshiraman. Takrorlangan bo'lsa, almashtiraman.${formulaBan}${chartBan}

Mustaqil ish uchun bob kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
Bob: "${chapter.title}" (${chapterIndex+1}/${totalChapters})
So'z maqsadi: KAMIDA ${wt} so'z
Paragraflar: KAMIDA ${paraCount} ta${typeInstructions}

Umumiy tuzilma:
${allTitles}
${contentNote}

Quyidagi JSON qaytargin:
{
  "chapter_id": "${chapter.id}",
  "title": "${chapter.title}",
  "content": [ <content bloklari> ]
}

Content bloklari:
1. Paragraf: {"type":"paragraph","text":"..."}
   - Har paragraf: FAKT → TAHLIL → XULOSA

2. Kichik sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}

3. Formula (agar formula_count > 0):
   {"type":"formula","latex":"...","display_text":"...","caption":"...","number":1}
   - Mavzuga ANIQ mos formula
   - Yuqoridagi TAKRORLANISHI MUMKIN EMAS ro'yxatidagi formulalar ISHLATILMASIN

4. Grafik (agar chart_count > 0):
   {"type":"chart","chartType":"bar|line|pie","title":"...","labels":["..."],"values":[...],"unit":"","caption":"N-rasm. ...","number":1}
   - Haqiqiy, aniq raqamlar
   - Yuqoridagi TAKRORLANISHI MUMKIN EMAS ro'yxatidagi grafiklar ISHLATILMASIN
   - Sifatsiz, umumiy grafiklar YO'Q (masalan, faqat "Diagramma" deb nomlangan)

5. Jadval (agar table_count > 0):
   {"type":"table","caption":"N-jadval. ...","number":1,"headers":["..."],"rows":[["..."]]}

SIFAT QOIDALARI:
- ${lang} tilida, akademik uslub
- Mavzuning asosiy atamasi HADDAN ORTIQ TAKRORLANMASIN
- Har bob YANGI JIHAT yoritsin
- "shu bilan birga", "shuningdek" kabi to'ldiruvchi iboralar MINIMAL
- Paragraflar birgalikda KAMIDA ${wt} so'z
- LaTeX va pastki chiziq (_) paragraf matnida BO'LMASIN

🚨 YANA BIR MARTA ESKLATMA:
- TAKRORLANISHI MUMKIN EMAS formulalar: ${allBannedFormulas.join(", ") || "yo'q"}
- TAKRORLANISHI MUMKIN EMAS grafiklar: ${allBannedCharts.join(", ") || "yo'q"}
- BU FORMULA VA GRAFIKLARNI ISHLATMAYMAN.
- JSON qaytarishdan OLDIN tekshiraman.
- Faqat JSON qaytar`;
}

function parseChapter(text) {
  const clean = text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  try { return JSON.parse(clean); }
  catch(e) {
    const s=clean.indexOf("{"), end=clean.lastIndexOf("}");
    if(s>=0&&end>s) return JSON.parse(clean.slice(s,end+1));
    throw new Error("Chapter JSON o'qilmadi: "+e.message+" | "+clean.slice(0,200));
  }
}


// ===================== YORDAMCHI FUNKSIYALAR =====================

/**
 * Bob kontentidan formulalar ro'yxatini ajratib oladi
 * @param {Array} contentBlocks - bob.content massivi
 * @returns {Array} - formulalar latex ro'yxati
 */
function extractFormulasFromContent(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return [];
  return contentBlocks
    .filter(block => block.type === "formula" && block.latex)
    .map(block => block.latex);
}

/**
 * Bob kontentidan grafik sarlavhalarini ajratib oladi
 * @param {Array} contentBlocks - bob.content massivi
 * @returns {Array} - grafik sarlavhalari ro'yxati
 */
function extractChartTitlesFromContent(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return [];
  return contentBlocks
    .filter(block => block.type === "chart" && block.title)
    .map(block => block.title);
}

/**
 * Barcha boblardan formulalar va grafiklarni yig'ib, keyingi bobga uzatish uchun
 * @param {Array} allChapters - barcha generatsiya qilingan boblarning kontenti
 * @returns {Object} - { usedFormulas, usedCharts }
 */
function collectUsedFormulasAndCharts(allChapters) {
  const usedFormulas = [];
  const usedCharts = [];

  for (const chapter of allChapters) {
    if (chapter.content && Array.isArray(chapter.content)) {
      const formulas = extractFormulasFromContent(chapter.content);
      const charts = extractChartTitlesFromContent(chapter.content);
      usedFormulas.push(...formulas);
      usedCharts.push(...charts);
    }
  }

  return {
    usedFormulas: [...new Set(usedFormulas)],
    usedCharts: [...new Set(usedCharts)]
  };
}


// ===================== VALIDATSIYA FUNKSIYASI =====================

/**
 * Generatsiya qilingan barcha boblarni tekshiradi.
 * Takrorlangan formulalar va grafiklarni topib, xatolarni qaytaradi.
 * @param {Array} allChapters - barcha generatsiya qilingan boblarning kontenti
 * @returns {Object} - { hasErrors, errors, duplicates }
 */
function validateNoDuplicates(allChapters) {
  const errors = [];
  const formulaMap = new Map(); // formula -> [chapterIndex]
  const chartMap = new Map();   // chartTitle -> [chapterIndex]

  for (let i = 0; i < allChapters.length; i++) {
    const chapter = allChapters[i];
    if (!chapter.content || !Array.isArray(chapter.content)) continue;

    for (const block of chapter.content) {
      if (block.type === "formula" && block.latex) {
        const normalized = block.latex.trim().toLowerCase().replace(/\s+/g, " ");
        if (!formulaMap.has(normalized)) {
          formulaMap.set(normalized, []);
        }
        formulaMap.get(normalized).push(i);
      }

      if (block.type === "chart" && block.title) {
        const normalized = block.title.trim().toLowerCase();
        if (!chartMap.has(normalized)) {
          chartMap.set(normalized, []);
        }
        chartMap.get(normalized).push(i);
      }
    }
  }

  // Check for duplicates
  const duplicateFormulas = [];
  const duplicateCharts = [];

  for (const [formula, indices] of formulaMap) {
    if (indices.length > 1) {
      duplicateFormulas.push({ formula, chapters: indices });
      errors.push(`TAKRORLANISH: Formula "${formula}" ${indices.length} ta bobda ishlatilgan: ${indices.map(i => i+1).join(", ")}`);
    }
  }

  for (const [chart, indices] of chartMap) {
    if (indices.length > 1) {
      duplicateCharts.push({ chart, chapters: indices });
      errors.push(`TAKRORLANISH: Grafik "${chart}" ${indices.length} ta bobda ishlatilgan: ${indices.map(i => i+1).join(", ")}`);
    }
  }

  return {
    hasErrors: errors.length > 0,
    errors,
    duplicates: {
      formulas: duplicateFormulas,
      charts: duplicateCharts
    }
  };
}

module.exports = {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  wordsForPages,
  extractFormulasFromContent,
  extractChartTitlesFromContent,
  collectUsedFormulasAndCharts,
  validateNoDuplicates,
};