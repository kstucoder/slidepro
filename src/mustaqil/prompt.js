// src/mustaqil/prompt.js
// Mustaqil ish uchun 2 bosqichli LLM strategiyasi:
//   1) outline вЂ” tuzilma + so'z maqsadlari + formula/grafik joylar
//   2) chapter вЂ” har bir bob uchun to'liq kontent (usedFormulas/usedCharts ban-list bilan)
//
// TAKRORLANISHNI OLDINI OLISH MEXANIZMI:
//   Outline'da har bob uchun formula_latex[] va chart_titles[] OLDINDAN belgilanadi.
//   Har bir bob promtiga boshqa boblarning formula/chart ro'yxati BAN LIST sifatida uzatiladi.
//   в†’ Parallel generatsiyada ham takrorlanish imkonsiz.

const WORDS_PER_PAGE = 420;
const SERVICE_PAGES  = 5; // muqova + reja + adabiyotlar + ~2 bo'shliq
function wordsForPages(pages) {
  return Math.round(Math.max(pages - SERVICE_PAGES, 3) * WORDS_PER_PAGE);
}

// ===================== 1-BOSQICH: OUTLINE =====================
function outlineSystemPrompt() {
  return `Sen akademik mustaqil ish tuzilmasini yaratuvchi mutaxassissan. FAQAT to'g'ri JSON qaytarasan вЂ” hech qanday izoh, markdown, backtick yo'q.`;
}

function outlineUserPrompt({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent }) {
  const totalWords = wordsForPages(pages);
  const lang = language || "o'zbek";
  const contentNote = sourceContent
    ? `\n\nFoydalanuvchi quyidagi manba kontentini berdi вЂ” asosiy g'oyalar va faktlar SHUNGA asoslansin:\n---\n${sourceContent.slice(0,3000)}\n---`
    : "";

  return `Akademik mustaqil ish uchun tuzilma (outline) yarat.

Talablar:
- Mavzu: "${topic}"
- Til: ${lang}
- Sahifalar soni: ${pages} (jami в‰€ ${totalWords} so'z asosiy kontent)
- Talaba: ${studentName || "F.I.Sh."}, guruh: ${studentGroup || "вЂ”"}
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
    "student_group": "${studentGroup || "вЂ”"}",
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
      "role": "introduction",
      "level": 1,
      "word_target": <150-250>,
      "formula_count": 0,
      "formula_plans": [],
      "chart_count": 0,
      "chart_type": null,
      "chart_plans": [],
      "table_count": 0,
      "sections": []
    },
    {
      "id": "ch1",
      "title": "<asosiy bo'lim nomi вЂ” BOB so'zi ISHLATMA>",
      "role": "<theory|analysis|application|comparison|methodology>",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": <0 yoki 1-3>,
      "formula_plans": [
        {"latex": "<to\'g\'ri LaTeX>", "concept": "<bu formula nimani ifodalaydi вЂ” boshqa bobda xuddi shu konsept ISHLATILMASIN>"}
      ],
      "chart_count": 1,
      "chart_type": "<bar|line|pie>",
      "chart_plans": [
        {"title": "<grafik sarlavhasi>", "variable": "<qaysi o\'zgaruvchi/ma\'lumot ko\'rsatiladi вЂ” boshqa bobda xuddi shu ma\'lumot ISHLATILMASIN>"}
      ],
      "table_count": <0 yoki 1>,
      "sections": [
        {"id":"ch1_1","title":"<kichik bo'lim>","level":2,"word_target":<raqam>}
      ]
    },
    {
      "id": "conclusion",
      "title": "Xulosa",
      "role": "conclusion",
      "level": 1,
      "word_target": <200-350>,
      "formula_count": 0,
      "formula_plans": [],
      "chart_count": 0,
      "chart_type": null,
      "chart_plans": [],
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
- DAIM: 1 ta Kirish (id="intro") в†’ asosiy bo'limlar в†’ 1 ta Xulosa (id="conclusion")
- Asosiy bo'limlar soni: ${pages <= 15 ? "1-2" : pages <= 25 ? "2-3" : "3-4"} ta
- Har asosiy bo'lim BOSHQA JIHATNI yoritsin: nazariy / amaliy / taqqoslov / prognoz
- "bob" so'zi sarlavhada BO'LMASIN
- word_target yig'indisi в‰€ ${totalWords}

FORMULALAR (mavzuning tabiatiga qarab):
- ANIQ FANLAR (matematika, fizika, kimyo, muhandislik, iqtisodiyot, CS, biologiya):
  * Har asosiy bob uchun 1-3 ta TURLI formula
  * formula_plans[] da har formula uchun "latex" VA "concept" ko'rsatilsin
  * concept: shu formulaning qanday fizikaviy/matematik hodisani ifodalashini aniq yoz

  вљ пёЏ MUHIM вЂ” FORMULALAR MURAKKAB VA MAVZUGA AYNAN MOS BO'LSIN:
  - Maktabdagi sodda formulalar (F=ma, E=mcВІ, s=vt) YETARLI EMAS
  - Mavzu darajasiga mos professional formulalar kerak:
    * Differensial tenglamalar (dy/dt = f(x,y), в€‚ВІu/в€‚tВІ = cВІв€‡ВІu)
    * Integrallar (в€«f(x)dx, в€®FВ·dr)
    * Matritsalar va vektorlar (AВ·x = b, det(A))
    * Transfer funksiyalari (G(s) = K/(Ts+1), PID rostlash uchun)
    * Statistik formulalar (regressiya, dispersiya, korrelyatsiya)
    * Soha-spetsifik (Reynolds, Nusselt, Arrhenius, Bernoulli va h.k.)
  - Faqat mavzuga AYNAN mos formula вЂ” umumiy "klassik" formulalar emas
  - Misol "Texnologik jarayonlarda rostlash qonuni" в†’ PID rostlagich G(s)=Kp+Ki/s+KdВ·s,
    Laplace tenglamasi, transfer funksiyasi вЂ” sodda F=ma EMAS

  * KONSEPT DARAJASIDA TAKRORLANMAYDI вЂ” notation farq qilsa ham, bir xil hodisa BO'LMASIN
  * Misol ch1: concept="PID rostlagichning uzluksiz vaqt domeni transfer funksiyasi"
            ch2: concept="Laplace tenglamasidan diskret raqamli rostlash algoritmiga o'tish"
- GUMANITAR/IJTIMOIY/EKOLOGIK-UMUMIY: formula_count:0, formula_plans:[]

GRAFIKLAR (har asosiy bob uchun 1 ta, tur TAKRORLANMAYDI):
- "line"  в†’ vaqt dinamikasi, o'zgarish tendensiyasi (X=yillar/oylar)
- "bar"   в†’ kategoriyalar taqqoslash, miqdoriy farqlar
- "pie"   в†’ ulush, foiz taqsimot (max 5 bo'lak)
- 2 bob: "line"+"bar" YOKI "line"+"pie" YOKI "bar"+"pie"
- 3 bob: "line","bar","pie" вЂ” har biri boshqasi
- chart_plans[] da har grafik uchun "title" VA "variable" ko\'rsatilsin
  * variable: bu grafikda qaysi ma\'lumot/o\'zgaruvchi tahlil qilinadi
  * VARIABLE DARAJASIDA TAKRORLANMAYDI вЂ” sarlavha farq qilsa ham, bir xil ma\'lumot BO\'LMASIN
  * Misol ch1: variable="yillar bo\'yicha harorat o\'zgarishi (В°C, 1990-2020)"
            ch2: variable="mintaqalar bo\'yicha yog\'ingarchilik miqdori (mm, 2023)"
  * Bu ikki variable hech qachon bir biriga o\'xshamaydi

JADVALLAR: kamida 1 ta ixtiyoriy bob uchun

ADABIYOTLAR (references): 8-12 ta, APA 7 formatida. FAQAT HAQIQIY, MAVJUD ASARLAR:
- Kitob: Muallif, A. A. (yil). Asar nomi. Nashriyot.
- Jurnal: Muallif, A. A. (yil). Maqola nomi. Jurnal nomi, jild(son), sahifalar.
- 40% o'zbek tilidagi, 60% xorijiy вЂ” 40% so'nggi 5 yilda (2020-2025)
- Mavjudligiga 100% ishonch hosil qilingan manbalar

Faqat JSON qaytar`;
}

function repairTruncatedJson(s) {
  // S2-T4: token limitiga urilib kesilgan JSON ni yopish
  let inStr = false, esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = s;
  out = out.replace(/,\s*$/, "").replace(/:\s*$/, ": null");
  if (inStr) out += '"';
  while (stack.length) out += stack.pop();
  return out;
}
function parseOutline(text) {
  const clean = text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  try { return JSON.parse(clean); }
  catch(e) {
    const s=clean.indexOf("{"), end=clean.lastIndexOf("}");
    if(s>=0&&end>s) { try { return JSON.parse(clean.slice(s,end+1)); } catch(_) {} }
    // S2-T4: kesilgan JSON tiklovchi (token limit)
    if (s>=0) { try { return JSON.parse(repairTruncatedJson(clean.slice(s))); } catch(_) {} }
    throw new Error("Outline JSON o'qilmadi: "+clean.slice(0,200));
  }
}

// ===================== 2-BOSQICH: CHAPTER CONTENT =====================
function chapterSystemPrompt() {
  return `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT to'g'ri JSON qaytarasan вЂ” hech qanday izoh, markdown, backtick yo'q. Akademik, rasmiy, chuqur tahliliy uslubda yoz.`;
}

function chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters, usedFormulas = [], usedCharts = [] }) {
  const lang = language || "o'zbek";
  const wt = chapter.word_target || 400;
  const paraCount = Math.max(4, Math.ceil(wt / 110));
  const contentNote = sourceContent
    ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0,2000)}\n---`
    : "";
  const allTitles = outline.chapters.map((c,i) => `${i+1}. ${c.title}`).join("\n");

  const role = chapter.role || (chapter.id === "intro" ? "introduction" : chapter.id === "conclusion" ? "conclusion" : "theory");
  const isIntro      = role === "introduction";
  const isConclusion = role === "conclusion";
  const isMain       = !isIntro && !isConclusion;

  // BAN LIST: boshqa boblarda allaqachon rejalashtirilgan + generatsiya qilingan
  // Ban-list: string + konsept/variable darajasida tekshiruv
  // Bu boshqa notation bilan bir xil konseptni oldini oladi
  const formulaBan = usedFormulas.length > 0
    ? `\n\nрџљ« TAKRORLANISHI MUMKIN BO'LMAGAN FORMULALAR (boshqa boblarda allaqachon qoplangan):\n${usedFormulas.map((f,i)=>`  ${i+1}. ${f}`).join("\n")}\n\nвљ пёЏ MUHIM: Yuqoridagi formulalarni VA shu KONSEPTLARGA YAQIN formulalarni ISHLATMA.\nNotatsiya o'zgartirib ham bo'lmaydi вЂ” matematik ma'no bir xil bo'lsa TAQIQLANADi.`
    : "";

  const chartBan = usedCharts.length > 0
    ? `\n\nрџљ« TAKRORLANISHI MUMKIN BO'LMAGAN GRAFIK MA'LUMOTLAR (boshqa boblarda allaqachon ko'rsatilgan):\n${usedCharts.map((c,i)=>`  ${i+1}. ${c}`).join("\n")}\n\nвљ пёЏ MUHIM: Yuqoridagi VARIABLE/MA'LUMOT TURINI ham ishlatma вЂ” sarlavha o'zgartirib ham bo'lmaydi.\nBIR XIL MA'LUMOTNI boshqa sarlavha bilan ko'rsatish ham TAKROR hisoblanadi.`
    : "";

  // Chart type from outline
  const chartTypeGuide = chapter.chart_type
    ? `\nGrafik turi: "${chapter.chart_type}" (outline'da belgilangan, o'zgartirma)\n- "line": X=vaqt/davr, Y=o'zgaruvchan miqdor вЂ” tendensiya\n- "bar": kategoriyalar taqqoslash вЂ” miqdoriy farqlar\n- "pie": ulush/foiz taqsimot, max 5 bo'lak, jami=100%`
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

рџљ« ASOSIY BOB ICHIDA QAT'IY TA'QIQLANGAN:
- "Kirish", "Xulosa", "Yakun", "Umumlashtirish" kabi kichik bo'limlar BO'LMASIN
- "Kirishda aytilganidek", "xulosa qilib aytganda", "yakunda" iboralar BO'LMASIN
- 1.1., 1.2., 1.3. nomli bo'limlar bevosita MAVZUNI yoritsin вЂ”
  ularda "kirish" yoki "xulosa" so'zi sarlavhada ham, matnda ham ISHLATILMAYDI
- Bu bob alohida hujjat emas вЂ” Kirish va Xulosa alohida boblarda berilgan, takrorlash kerak emas`;
  }

  // Outline-planned formulas + chart_plans for this chapter
  const plans = Array.isArray(chapter.formula_plans) ? chapter.formula_plans
    : (Array.isArray(chapter.formula_latex) ? chapter.formula_latex.map(l=>({latex:l,concept:""})) : []);
  const plannedFormulas = plans.length > 0
    ? `\nBu bob uchun rejalashtirilgan formulalar (AYNAN SHULARNI ishlatgin):\n${plans.map((f,i)=>{const l=typeof f==="string"?f:f.latex; const c=typeof f==="object"&&f.concept?` вЂ” ${f.concept}`:""; return `  ${i+1}. ${l}${c}`;}).join("\n")}`
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
   - FAKT/STATISTIKA в†’ TAHLIL в†’ XULOSA (har paragraf 3 qism)
   - Misol: "2023-yil NASA ma'lumotiga ko'ra, COв‚‚ 421 ppm ga yetdi вЂ” bu 800 ming yil ichidagi eng yuqori..."
   - Har paragraf YANGI g'oya вЂ” avvalgini boshqacha aytib yurish TA'QIQLANGAN

2. Sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}

3. Formula (formula_count > 0, faqat aniq fan mavzusi):
   {"type":"formula","latex":"<yuqorida rejalashtirilgan latex>","display_text":"<inson o'qiydigan>","caption":"<nomi va mazmuni>","number":1}
   - Formuladan OLDIN 2-3 jumla kontekst, KEYIN 2-3 jumla tahlil
   - FAQAT rejalashtirilgan formulalar вЂ” o'zboshimchalik bilan boshqa formula qo'shma

4. Grafik (chart_count > 0):
   {"type":"chart","chartType":"${chapter.chart_type || "bar"}","title":"<yangi sarlavha>","labels":["..."],"values":[...],"unit":"","caption":"N-rasm. ...","number":1}
   - Realistik raqamlar вЂ” mavzuga aniq aloqador
   - labels: 4-6 ta, qisqa (1-3 so'z)
   - GRAFIKDAN OLDIN 1-2 jumla, KEYIN 1-2 jumla tahlil

5. Jadval (table_count > 0):
   {"type":"table","caption":"N-jadval. ...","number":1,"headers":["..."],"rows":[["..."]]}
   - Kamida 3 ustun, 3-6 qator

SIFAT QOIDALARI:
- ${lang} tilida, rasmiy akademik uslub
- Mavzuning asosiy atamasi HADDAN ORTIQ TAKRORLANMASIN
- TO'LDIRUVCHI IBORALAR minimal: "shuningdek", "shu bilan birga", "muhim rol o'ynaydi", "hisoblanadi" вЂ” har biridan max 1 ta
- Muallif ovozi: kuzatuv, taqqoslash, tanqidiy baho
- Paragraf matni: LaTeX VA PASTKI CHIZIQ (_) BO'LMASIN
- Faqat JSON qaytar`;
}

function parseChapter(text) {
  const clean = text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
  try { return JSON.parse(clean); }
  catch(e) {
    const s=clean.indexOf("{"), end=clean.lastIndexOf("}");
    if(s>=0&&end>s) { try { return JSON.parse(clean.slice(s,end+1)); } catch(_) {} }
    // S2-T4: kesilgan JSON tiklovchi (token limit)
    if (s>=0) { try { return JSON.parse(repairTruncatedJson(clean.slice(s))); } catch(_) {} }
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
  // Yangi: normalizatsiya va o'xshashlik tekshiruvi
  normalizeFormula, formulaSignature,
  normalizeChartPurpose,
  normalizeParagraph, paragraphSimilarity,
  detectForbiddenIntroConclusion,
};

// в”Ђв”Ђв”Ђ FORMULA NORMALIZATSIYASI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// LaTeX o'zgaruvchi nomlari va format'idan qat'i nazar bir xil formulani aniqlash
function normalizeFormula(latex) {
  if (!latex) return "";
  let n = String(latex).toLowerCase();
  // LaTeX buyruqlarini olib tashlash
  n = n.replace(/\\(frac|cdot|times|sum|int|partial|nabla|sqrt|left|right|bigl|bigr|mathbf|mathrm|text|operatorname)\b/g, "");
  n = n.replace(/\\[a-z]+/g, "");          // boshqa buyruqlar
  // Unicode matematik operatorlar (В· Г— в‹… Г·)
  n = n.replace(/[В·Г—в‹…Г·в€—]/g, "");
  n = n.replace(/[{}\\,;:\s]/g, "");        // qavslar, bo'shliqlar
  n = n.replace(/[_^]/g, "");                // sub/super indekslar
  return n;
}

// Formula "imzosi" вЂ” konsept tushib qolsa ham operatorlar to'plami
function formulaSignature(latex) {
  if (!latex) return "";
  const n = normalizeFormula(latex);
  // Operatorlar va son turi (= + - * / ^ в€« ОЈ)
  const ops = (n.match(/[=+\-*/^]/g) || []).sort().join("");
  const nums = (n.match(/\d+/g) || []).length;
  return `ops:${ops}|n:${nums}|len:${n.length}`;
}

// в”Ђв”Ђв”Ђ CHART MAQSADI NORMALIZATSIYASI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Grafik MA'NOSI bo'yicha tekshirish вЂ” sarlavhasi farq qilsa ham
function normalizeChartPurpose(chart) {
  if (!chart) return "";
  // Variable + chart type + labels + values diapazoni
  const labels = (chart.labels || []).map(l => String(l).toLowerCase().trim()).sort().join("|");
  const values = chart.values || [];
  const valRange = values.length ? `${Math.min(...values)}-${Math.max(...values)}` : "";
  const title = String(chart.title || "").toLowerCase().replace(/[^a-z0-9Р°-СЏСћТ“Ті\s]/gi, "").trim();
  // 5 ta birinchi muhim so'z
  const titleWords = title.split(/\s+/).filter(w => w.length > 3).slice(0, 5).sort().join("|");
  return `t:${titleWords}|lbl:${labels}|rng:${valRange}|type:${chart.chartType||"bar"}`;
}

// в”Ђв”Ђв”Ђ PARAGRAF O'XSHASHLIGI (mazmun darajasida) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function normalizeParagraph(text) {
  if (!text) return "";
  return String(text).toLowerCase()
    .replace(/[.,;:!?"'`В«В»()\[\]{}вЂ”вЂ“-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Jaccard koeffitsienti (so'z to'plamlari bo'yicha)
function paragraphSimilarity(textA, textB) {
  const a = new Set(normalizeParagraph(textA).split(" ").filter(w => w.length > 4));
  const b = new Set(normalizeParagraph(textB).split(" ").filter(w => w.length > 4));
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const w of a) if (b.has(w)) intersect++;
  const union = a.size + b.size - intersect;
  return union > 0 ? intersect / union : 0;
}

// в”Ђв”Ђв”Ђ ASOSIY BOB ICHIDA KIRISH/XULOSA ANIQLASH в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function detectForbiddenIntroConclusion(content, role) {
  if (role === "introduction" || role === "conclusion") return [];
  if (!Array.isArray(content)) return [];
  const violations = [];
  const forbidden = /^(kirish|xulosa|yakun|umumlashtirish|introduction|conclusion)\b/i;
  content.forEach((item, i) => {
    if (item.type === "heading") {
      const t = String(item.text || "").replace(/^\d+(\.\d+)?\.\s*/, "").trim();
      if (forbidden.test(t)) violations.push({ idx: i, type: "heading", text: item.text });
    }
    if (item.type === "paragraph") {
      const txt = String(item.text || "");
      // Asosiy bob ichida "xulosa qilib aytganda" kabi iboralar
      if (/^(xulosa qilib aytganda|demak,? umuman olganda|umuman olganda|yakunda|xulosa o'rnida)/i.test(txt.trim())) {
        violations.push({ idx: i, type: "paragraph_conclusion_phrase", text: txt.slice(0, 80) });
      }
      // Kirish darajasidagi iboralar asosiy bob boshida
      if (i < 2 && /^(ushbu bo'lim|bu bo'limda biz|mavzuning dolzarbligi|ushbu ishning maqsadi)/i.test(txt.trim())) {
        violations.push({ idx: i, type: "paragraph_intro_phrase", text: txt.slice(0, 80) });
      }
    }
  });
  return violations;
}
