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

  // Determine chapter type based on position and ID
  const isIntro = chapter.id === "intro" || chapterIndex === 0;
  const isConclusion = chapter.id === "conclusion" || chapter.id === "xulosa" || chapterIndex === totalChapters - 1;
  const isMainBody = !isIntro && !isConclusion;

  // Collect formulas from other chapters (both planned AND actually generated)
  const plannedFormulas = outline.chapters
    .filter((c, idx) => idx !== chapterIndex && c.formula_latex && c.formula_latex.length > 0)
    .map(c => c.formula_latex)
    .flat();

  // Combine planned and actually used formulas
  const allBannedFormulas = [...new Set([...plannedFormulas, ...usedFormulas])];

  // Collect chart titles/captions from other chapters
  const plannedCharts = outline.chapters
    .filter((c, idx) => idx !== chapterIndex && c.chart_titles && c.chart_titles.length > 0)
    .map(c => c.chart_titles)
    .flat();

  const allBannedCharts = [...new Set([...plannedCharts, ...usedCharts])];

  const formulaBanList = allBannedFormulas.length > 0 
    ? `\n\n🚫 TAKRORLANISHI MUMKIN BO'LMAGAN FORMULALAR (boshqa boblarda ALLAQACHON ishlatilgan):\n${allBannedFormulas.map((f, i) => `  ${i+1}. ${f}`).join("\n")}\n\n⚠️ YUQORIDAGI FORMULALARNI TAKRORLASH MUMKIN EMAS. ALOHIDA, BOSHQA FORMULA ISHLAT.`
    : "";

  const chartBanList = allBannedCharts.length > 0
    ? `\n\n🚫 TAKRORLANISHI MUMKIN BO'LMAGAN GRAFIKLAR (boshqa boblarda ALLAQACHON ishlatilgan):\n${allBannedCharts.map((c, i) => `  ${i+1}. ${c}`).join("\n")}\n\n⚠️ YUQORIDAGI GRAFIKLARNI TAKRORLASH MUMKIN EMAS. BOSHQA MA'LUMOTLAR, BOSHQA NOM bilan yangi grafik ishlat.`
    : "";

  // Chapter-specific content instructions
  let chapterTypeInstructions = "";
  if (isIntro) {
    chapterTypeInstructions = `\n\n=== BU BOB TURI: KIRISH (INTRODUCTION) ===\nBU BOB — KIRISH. Quyidagilarni YOZGIN:\n- Mavzuning dolzarbligi va ahamiyati\n- Tadqiqot ob'ekti va predmeti\n- Asosiy maqsad va vazifalar (RO'YXAT shaklida, 3-5 ta)\n- Tadqiqot uslubi (qanday usulda o'rganildi)\n- Ishning tuzilmasi qanday (qaysi bobda nima bor)\n- KIRISHDA: formula, grafik, jadval BO'LMAYDI\n- KIRISHDA: "xulosa", "natija", "tavsiya" so'zlari ISHLATILMASIN\n- KIRISHDA: boshqa boblarning tahlili yoki xulosasi BO'LMAYDI`;
  } else if (isConclusion) {
    chapterTypeInstructions = `\n\n=== BU BOB TURI: XULOSA (CONCLUSION) ===\nBU BOB — XULOSA. Quyidagilarni YOZGIN:\n- Asosiy natijalar (RO'YXAT shaklida, 3-5 ta)\n- Tadqiqot xulosasi (qisqa, aniq)\n- Amaliy tavsiyalar (agar mavjud bo'lsa)\n- Mavzuning kelajakdagi rivojlanish istiqbollari\n- XULOSADA: yangi formula, grafik, jadval BO'LMAYDI\n- XULOSADA: "kirish", "mavzu tanlash sababi", "maqsad" so'zlari ISHLATILMASIN\n- XULOSADA: mavzuning umumiy ta'rifi yoki tarixi BO'LMAYDI`;
  } else {
    chapterTypeInstructions = `\n\n=== BU BOB TURI: ASOSIY BOB (MAIN BODY) ===\nBU BOB — ASOSIY MAZMUN. Quyidagilarni YOZGIN:\n- Mavzuning ushbu jihatini chuqur tahlil qilish\n- Nazariy asoslar\n- Amaliy misollar, statistika, taqqoslash\n- Formulalar (agar formula_count > 0)\n- Grafiklar (agar chart_count > 0)\n- Jadvallar (agar table_count > 0)\n- ASOSIY BOBDA: "kirishda aytilganidek", "xulosa qilib aytganda", "mavzuning ahamiyati" kiboralar BO'LMAYDI\n- ASOSIY BOBDA: faqat ushbu bobga tegishli kontent bo'lishi kerak`;
  }

  return `Mustaqil ish uchun bob kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
Bob: "${chapter.title}" (${chapterIndex+1}/${totalChapters})
So'z maqsadi: KAMIDA ${wt} so'z
Paragraflar: KAMIDA ${paraCount} ta paragraf, har biri 100–140 so'z

Formulalar: ${chapter.formula_count || 0} ta
Grafiklar: ${chapter.chart_count || 0} ta  
Jadvallar: ${chapter.table_count || 0} ta

Umumiy tuzilma:
${allTitles}
${contentNote}${formulaBanList}${chartBanList}${chapterTypeInstructions}

Quyidagi JSON qaytargin:
{
  "chapter_id": "${chapter.id}",
  "title": "${chapter.title}",
  "content": [ <content bloklari> ]
}

Content bloklari turlari:
1. Paragraf: {"type":"paragraph","text":"..."}
   - Har paragraf: ANIQ FAKT yoki STATISTIKA → TAHLIL → XULOSA (3 qism)
   - Misol: "2023-yil NASA ma'lumotlariga ko'ra, Yer o'rtacha harorat 1.1°C oshdi. Bu ko'rsatkich..."
   - KERAKSIZ TAKROR: bir xil jumlani boshqacha yozma. Har paragraf YANGI g'oya olib kelsin.

2. Kichik sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}

3. Formula (agar formula_count > 0 — faqat aniq fan mavzularida):
   {"type":"formula","latex":"...","display_text":"...","caption":"...","number":1}
   - Formuladan OLDIN (2-3 jumla) va KEYIN (2-3 jumla) MAVZUGA ANIQ ALOQADOR izoh
   - Umumiy "E=mc²" kabi emas — AYNAN shu mavzu uchun zarur formula
   - Gumanitar/ijtimoiy mavzularda formula_count=0 bo'lsa bu blok umuman yo'q
   - HAR BIR BOBDA BOSHQA BOBLARDA ISHLATILMAGAN yangi formula ishlat. Takrorlangan formula qaytarilmasin.
   - Agar 2 ta formula bo'lsa, ular bir-birini to'ldiruvchi, lekin TURli formulalar bo'lishi kerak (masalan, birida asosiy tenglama, ikkinchisida uning tahlili yoki qo'llanishi).
   - TAKRORLANISHI TA'QIQLANGAN: ${allBannedFormulas.join(", ") || "hali ma'lum emas"}
   - AGAR YUQORIDAGI FORMULALARDAN BIRORTASINI ISHLATSANG, JAVOB NOTO'G'RI BO'LADI.

4. Grafik (agar chart_count > 0):
   {"type":"chart","chartType":"bar|line|pie","title":"...","labels":["..."],"values":[...],"unit":"","caption":"N-rasm. ...","number":1}
   - Haqiqiy, aniq raqamlar (realistik ma'lumotlar)
   - HAR BIR BOBDA BOSHQA BOBLARDA ISHLATILMAGAN yangi grafik ishlat
   - Grafik sarlavhasi (title) va caption BOSHQA BOBLARDA ISHLATILMAGAN bo'lishi kerak
   - TAKRORLANISHI TA'QIQLANGAN GRAFIKLAR: ${allBannedCharts.join(", ") || "hali ma'lum emas"}
   - AGAR YUQORIDAGI GRAFIKLARDAN BIRORTASINI ISHLATSANG, JAVOB NOTO'G'RI BO'LADI.

5. Jadval (agar table_count > 0):
   {"type":"table","caption":"N-jadval. ...","number":1,"headers":["..."],"rows":[["..."]]}

SIFAT QOIDALARI (bular muhim!):
- ${lang} tilida, rasmiy akademik uslub
- Mavzuning asosiy atamasi HADDAN ORTIQ TAKRORLANMASIN — jumlaning boshida doim bir xil so'z kelmаsin
- Har bob YANGI JIHAT yoritsin — boshqa boblar mazmunini takrorlamasin
- KERAKSIZ TO'LDIRUVCHI IBORALAR: "shu bilan birga", "shu sababli", "shuningdek", "o'z navbatida", "muhim rol o'ynaydi", "muhim ahamiyatga ega", "hisoblanadi" — bularni MINIMAL ishlat (jumladan bittadan ko'p bo'lmasin)
- Muallif ovozi: shaxsiy kuzatuv, taqqoslash, tanqidiy baho bo'lsin
- Paragraflar birgalikda KAMIDA ${wt} so'z bo'lsin
- LaTeX VA PASTKI CHIZIQ (_) paragraf matnida BO'LMASIN
- TAKRORLASHNI OLDINI OLISH: har bir paragraf avvalgi paragrafdan YANGI ma'lumot olib kelsin. Avvalgi paragrafni qayta yozib, boshqacha so'zlar bilan aytib yuborish TAKRORLASH hisoblanadi va TA'QIQLANADI.
- O'ZGA TEKSHIRUV: JSON qaytarishdan OLDIN, barcha formulalar va grafiklar ro'yxatini tekshir. Avvalgi boblarda ishlatilganlarini almashtir.
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

module.exports = {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  wordsForPages,
  extractFormulasFromContent,
  extractChartTitlesFromContent,
  collectUsedFormulasAndCharts,
};