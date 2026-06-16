// src/mustaqil/prompt.js
// Mustaqil ish uchun 2 bosqichli LLM strategiyasi:
//   1) outline — tuzilma + so'z maqsadlari + formula/grafik joylar
//   2) chapter — har bir bob uchun to'liq kontent (usedFormulas/usedCharts ban-list bilan)
//
// TAKRORLANISHNI OLDINI OLISH MEXANIZMI:
//   Outline'da har bob uchun formula_latex[] va chart_titles[] OLDINDAN belgilanadi.
//   Har bir bob promtiga boshqa boblarning formula/chart ro'yxati BAN LIST sifatida uzatiladi.
//   → Parallel generatsiyada ham takrorlanish imkonsiz.

const WORDS_PER_PAGE = 420;
const SERVICE_PAGES  = 5; // muqova + reja + adabiyotlar + ~2 bo'shliq
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

JSON strukturasida qaytargin:
{
  "meta": {
    "title": "ish nomi (mavzu asosida, aniq va qisqa)",
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
      "word_target": <150-250>,
      "formula_count": 0,
      "formula_latex": [],
      "chart_count": 0,
      "chart_type": null,
      "chart_titles": [],
      "table_count": 0,
      "sections": []
    },
    {
      "id": "ch1",
      "title": "<asosiy bo'lim nomi — BOB so'zi ISHLATMA>",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": <0 yoki 1-3>,
      "formula_latex": ["<latex1>", "<latex2>"],
      "chart_count": 1,
      "chart_type": "<bar|line|pie>",
      "chart_titles": ["<grafik sarlavhasi>"],
      "table_count": <0 yoki 1>,
      "sections": [
        {"id":"ch1_1","title":"<kichik bo'lim>","level":2,"word_target":<raqam>}
      ]
    },
    {
      "id": "conclusion",
      "title": "Xulosa",
      "level": 1,
      "word_target": <200-350>,
      "formula_count": 0,
      "formula_latex": [],
      "chart_count": 0,
      "chart_type": null,
      "chart_titles": [],
      "table_count": 0,
      "sections": []
    }
  ],
  "references": [
    "<APA: Muallif, A. A. (yil). Asar nomi. Nashriyot.>",
    ...
  ]
}

TUZILMA QOIDALARI:
- DAIM: 1 ta Kirish (id="intro") → asosiy bo'limlar → 1 ta Xulosa (id="conclusion")
- Asosiy bo'limlar soni: ${pages <= 15 ? "1-2" : pages <= 25 ? "2-3" : "3-4"} ta
- Har asosiy bo'lim BOSHQA JIHATNI yoritsin: nazariy / amaliy / taqqoslov / prognoz
- "bob" so'zi sarlavhada BO'LMASIN
- word_target yig'indisi ≈ ${totalWords}

FORMULALAR (mavzuning tabiatiga qarab):
- ANIQ FANLAR (matematika, fizika, kimyo, muhandislik, iqtisodiyot, CS, biologiya):
  * Har asosiy bob uchun 1-3 ta TURLI formula
  * formula_latex[] da har bob o'ziga xos formulalar — boshqa boblarda TAKRORLANMAYDI
  * Misol ch1: ["k = A·e^{-Ea/RT}"], ch2: ["r = k[A]^m[B]^n"] — har biri boshqa konsept
- GUMANITAR/IJTIMOIY/EKOLOGIK-UMUMIY: formula_count:0, formula_latex:[]

GRAFIKLAR (har asosiy bob uchun 1 ta, tur TAKRORLANMAYDI):
- "line"  → vaqt dinamikasi, o'zgarish tendensiyasi (X=yillar/oylar)
- "bar"   → kategoriyalar taqqoslash, miqdoriy farqlar
- "pie"   → ulush, foiz taqsimot (max 5 bo'lak)
- 2 bob: "line"+"bar" YOKI "line"+"pie" YOKI "bar"+"pie"
- 3 bob: "line","bar","pie" — har biri boshqasi
- chart_titles[] da grafik sarlavhasi — boshqa boblarda TAKRORLANMAYDI

JADVALLAR: kamida 1 ta ixtiyoriy bob uchun

ADABIYOTLAR (references): 8-12 ta, APA 7 formatida. FAQAT HAQIQIY, MAVJUD ASARLAR:
- Kitob: Muallif, A. A. (yil). Asar nomi. Nashriyot.
- Jurnal: Muallif, A. A. (yil). Maqola nomi. Jurnal nomi, jild(son), sahifalar.
- 40% o'zbek tilidagi, 60% xorijiy — 40% so'nggi 5 yilda (2020-2025)
- Mavjudligiga 100% ishonch hosil qilingan manbalar

Faqat JSON qaytar`;
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

  const isIntro      = chapter.id === "intro";
  const isConclusion = chapter.id === "conclusion";
  const isMain       = !isIntro && !isConclusion;

  // BAN LIST: boshqa boblarda allaqachon rejalashtirilgan + generatsiya qilingan
  const formulaBan = usedFormulas.length > 0
    ? `\n\n🚫 TAKRRORLANISHI MUMKIN BO'LMAGAN FORMULALAR (boshqa boblarda ishlatilgan):\n${usedFormulas.map((f,i)=>`  ${i+1}. ${f}`).join("\n")}\nYUQORIDAGI FORMULALARNI ISHLATMA — butunlay boshqa matematikaviy konsept kerak.`
    : "";

  const chartBan = usedCharts.length > 0
    ? `\n\n🚫 TAKRORLANISHI MUMKIN BO'LMAGAN GRAFIKLAR (boshqa boblarda ishlatilgan):\n${usedCharts.map((c,i)=>`  ${i+1}. ${c}`).join("\n")}\nYUQORIDAGI GRAFIK SARLAVHALARINI VA XUDDI SHU MA'LUMOTLARNI ISHLATMA — yangi sarlavha, yangi ma'lumotlar.`
    : "";

  // Chart type from outline
  const chartTypeGuide = chapter.chart_type
    ? `\nGrafik turi: "${chapter.chart_type}" (outline'da belgilangan, o'zgartirma)\n- "line": X=vaqt/davr, Y=o'zgaruvchan miqdor — tendensiya\n- "bar": kategoriyalar taqqoslash — miqdoriy farqlar\n- "pie": ulush/foiz taqsimot, max 5 bo'lak, jami=100%`
    : "";

  // Chapter type instructions
  let typeGuide = "";
  if (isIntro) {
    typeGuide = `\n\n=== BOB TURI: KIRISH ===
Yozish kerak:
- Mavzuning dolzarbligi va ahamiyati (aniq faktlar, statistika bilan)
- Tadqiqot ob'ekti va predmeti
- Maqsad va vazifalar (3-5 ta, ro'yxat shaklida)
- Tadqiqot uslubi
- Ishning tuzilmasi
KIRISH DA BO'LMAYDI: formula, grafik, jadval, xulosa, tavsiya`;
  } else if (isConclusion) {
    typeGuide = `\n\n=== BOB TURI: XULOSA ===
Yozish kerak:
- Asosiy natijalar (3-5 ta, ro'yxat shaklida)
- Tadqiqot xulosasi (qisqa, aniq, isbotlangan)
- Amaliy tavsiyalar
- Kelajakdagi rivojlanish istiqbollari
XULOSA DA BO'LMAYDI: formula, grafik, jadval, yangi nazariy ma'lumotlar, ta'riflar`;
  } else {
    typeGuide = `\n\n=== BOB TURI: ASOSIY BOB ===
Yozish kerak:
- Bu bobning o'ziga xos jihatini chuqur tahlil qilish
- Aniq faktlar, statistika, ilmiy ma'lumotlar
- Formulalar, grafiklar, jadvallar (rejaga ko'ra)
- Boshqa boblardan FARQLI yangi kontent
BO'LMAYDI: "kirishda aytilganidek", boshqa boblar mazmunini takrorlash`;
  }

  // Outline-planned formulas for this chapter
  const plannedFormulas = Array.isArray(chapter.formula_latex) && chapter.formula_latex.length > 0
    ? `\nBu bob uchun rejalashtirilgan formulalar (AYNAN SHULARNI ishlatgin):\n${chapter.formula_latex.map((f,i)=>`  ${i+1}. ${f}`).join("\n")}`
    : "";

  return `Mustaqil ish uchun bob kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
Bob: "${chapter.title}" (${chapterIndex+1}/${totalChapters})
So'z maqsadi: KAMIDA ${wt} so'z
Paragraflar: KAMIDA ${paraCount} ta, har biri 100-140 so'z

Formulalar: ${chapter.formula_count || 0} ta${plannedFormulas}
Grafiklar: ${chapter.chart_count || 0} ta${chartTypeGuide}
Jadvallar: ${chapter.table_count || 0} ta

Umumiy tuzilma:
${allTitles}
${contentNote}${formulaBan}${chartBan}${typeGuide}

JSON qaytargin:
{
  "chapter_id": "${chapter.id}",
  "title": "${chapter.title}",
  "content": [ <content bloklari> ]
}

CONTENT BLOKLARI:
1. Paragraf: {"type":"paragraph","text":"..."}
   - FAKT/STATISTIKA → TAHLIL → XULOSA (har paragraf 3 qism)
   - Misol: "2023-yil NASA ma'lumotiga ko'ra, CO₂ 421 ppm ga yetdi — bu 800 ming yil ichidagi eng yuqori..."
   - Har paragraf YANGI g'oya — avvalgini boshqacha aytib yurish TA'QIQLANGAN

2. Sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}

3. Formula (formula_count > 0, faqat aniq fan mavzusi):
   {"type":"formula","latex":"<yuqorida rejalashtirilgan latex>","display_text":"<inson o'qiydigan>","caption":"<nomi va mazmuni>","number":1}
   - Formuladan OLDIN 2-3 jumla kontekst, KEYIN 2-3 jumla tahlil
   - FAQAT rejalashtirilgan formulalar — o'zboshimchalik bilan boshqa formula qo'shma

4. Grafik (chart_count > 0):
   {"type":"chart","chartType":"${chapter.chart_type || "bar"}","title":"<yangi sarlavha>","labels":["..."],"values":[...],"unit":"","caption":"N-rasm. ...","number":1}
   - Realistik raqamlar — mavzuga aniq aloqador
   - labels: 4-6 ta, qisqa (1-3 so'z)
   - GRAFIKDAN OLDIN 1-2 jumla, KEYIN 1-2 jumla tahlil

5. Jadval (table_count > 0):
   {"type":"table","caption":"N-jadval. ...","number":1,"headers":["..."],"rows":[["..."]]}
   - Kamida 3 ustun, 3-6 qator

SIFAT QOIDALARI:
- ${lang} tilida, rasmiy akademik uslub
- Mavzuning asosiy atamasi HADDAN ORTIQ TAKRORLANMASIN
- TO'LDIRUVCHI IBORALAR minimal: "shuningdek", "shu bilan birga", "muhim rol o'ynaydi", "hisoblanadi" — har biridan max 1 ta
- Muallif ovozi: kuzatuv, taqqoslash, tanqidiy baho
- Paragraf matni: LaTeX VA PASTKI CHIZIQ (_) BO'LMASIN
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
function extractFormulasFromContent(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b.type === "formula" && b.latex).map(b => b.latex);
}

function extractChartTitlesFromContent(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(b => b.type === "chart" && b.title).map(b => b.title);
}

function collectUsedFormulasAndCharts(chapters) {
  const usedFormulas = [], usedCharts = [];
  for (const ch of chapters) {
    usedFormulas.push(...extractFormulasFromContent(ch.content));
    usedCharts.push(...extractChartTitlesFromContent(ch.content));
  }
  return {
    usedFormulas: [...new Set(usedFormulas)],
    usedCharts:   [...new Set(usedCharts)],
  };
}

module.exports = {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  wordsForPages,
  extractFormulasFromContent, extractChartTitlesFromContent, collectUsedFormulasAndCharts,
};
