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

function computeMustaqilStructure(pages) {
  const p = Math.max(0, Number(pages) || 0);
  const main = 3 + Math.floor(Math.max(0, p - 10) / 5);
  const availableForInner = Math.max(0, p - 3);
  const inner = Math.floor(availableForInner / 1.5);

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

// ===================== 1-BOSQICH: OUTLINE =====================
function outlineSystemPrompt() {
  return `Sen akademik mustaqil ish tuzilmasini yaratuvchi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q.`;
}

function outlineUserPrompt({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent }) {
  const totalWords = wordsForPages(pages);
  const struct = computeMustaqilStructure(pages);
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

QAT'IY SAHIFA/BO'LIM QOIDALARI:
- Kirish har doim 1 sahifa bo'ladi (id="intro").
- Xulosa har doim 1 sahifa bo'ladi (id="conclusion").
- Foydalanilgan adabiyotlar har doim 1 sahifa bo'ladi (references).
- Asosiy bo'limlar soni quyidagicha hisoblanadi:
  main = 3 + floor(max(0, pages - 10) / 5)
  => pages=${pages} => main=${struct.main}
- Ichki rejalar uchun formula:
  available_for_inner = max(0, pages - 3)
  inner = floor(available_for_inner / 1.5)
  => pages=${pages} => inner=${struct.inner}, subCounts=${JSON.stringify(struct.subCounts)}
- Har bir ichki reja 1.5 sahifaga teng.
- Ichki rejalar asosiy bo'limlarga teng taqsimlanadi; qoldiq birinchi bo'limlarga beriladi.
- REJA sahifasida faqat asosiy bo'limlar ko'rinadi, ichki bo'limlar faqat asosiy bo'lim ichida yotadi.

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
      "title": "<asosiy bo'lim nomi — BOB so'zi ISHLATMA>",
      "role": "<theory|analysis|application|comparison|methodology>",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": <0 yoki 1-3>,
      "formula_plans": [
        {"latex": "<to'g'ri LaTeX>", "concept": "<bu formula nimani ifodalaydi — boshqa bobda xuddi shu konsept ISHLATILMASIN>"}
      ],
      "chart_count": 1,
      "chart_type": "<bar|line|pie>",
      "chart_plans": [
        {"title": "<grafik sarlavhasi>", "variable": "<qaysi o'zgaruvchi/ma'lumot ko'rsatiladi — boshqa bobda xuddi shu ma'lumot ISHLATILMASIN>"}
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
- DAIM: 1 ta Kirish (id="intro") → asosiy bo'limlar → 1 ta Xulosa (id="conclusion")
- Asosiy bo'limlar soni: ${struct.main} ta (formula bo'yicha hisoblangan)
- Har asosiy bo'lim BOSHQA JIHATNI yoritsin: nazariy / amaliy / taqqoslov / prognoz
- "bob" so'zi sarlavhada BO'LMASIN
- word_target yig'indisi ≈ ${totalWords}
- Ichki bo'limlar (sections) faqat o'sha asosiy bob ichida bo'lishi kerak; REJA sahifasida ularni ko'rsatish shart emas

FORMULALAR (mavzuning tabiatiga qarab):
- Har asosiy bob uchun 1-3 ta formula, agar mavzu formula talab qilmasa — 0 bo'ladi.
- formula_plans[] da har formula uchun "latex" VA "concept" ko'rsatilsin.
- KONSEPT DARAJASIDA TAKRORLANMAYDI.
- GUMANITAR/IJTIMOIY/EKOLOGIK-UMUMIY: formula_count:0, formula_plans:[]

GRAFIKLAR (har asosiy bob uchun 1 ta, tur TAKRORLANMAYDI):
- "line" → vaqt dinamikasi
- "bar" → kategoriyalar taqqoslash
- "pie" → ulush, foiz taqsimot
- chart_plans[] da har grafik uchun "title" VA "variable" ko'rsatilsin
- VARIABLE DARAJASIDA TAKRORLANMAYDI

JADVALLAR: kamida 1 ta ixtiyoriy bob uchun

ADABIYOTLAR (references): 8-12 ta, APA 7 formatida. FAQAT HAQIQIY, MAVJUD ASARLAR:
- Kitob: Muallif, A. A. (yil). Asar nomi. Nashriyot.
- Jurnal: Muallif, A. A. (yil). Maqola nomi. Jurnal nomi, jild(son), sahifalar.
- 40% o'zbek tilidagi, 60% xorijiy — 40% so'nggi 5 yilda (2020-2025)
- Mavjudligiga 100% ishonch hosil qilingan manbalar

Fag at JSON qaytar`;
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
    if (s>=0) { try { return JSON.parse(repairTruncatedJson(clean.slice(s))); } catch(_) {} }
    throw new Error("Outline JSON o'qilmadi: "+clean.slice(0,200));
  }
}

// ===================== 2-BOSQICH: CHAPTER CONTENT =====================
function chapterSystemPrompt() {
  return `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q. Akademik, rasmiy, chuqur tahliliy uslubda yoz.`;
}

function chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters, mainNum, usedFormulas = [], usedCharts = [] }) {
  const lang = language || "o'zbek";
  const wt = chapter.word_target || 400;
  const paraCount = Math.max(4, Math.ceil(wt / 110));
  const contentNote = sourceContent ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0,2000)}\n---` : "";
  const allTitles = outline.chapters.map((c,i) => `${i+1}. ${c.title}`).join("\n");

  const role = chapter.role || (chapter.id === "intro" ? "introduction" : chapter.id === "conclusion" ? "conclusion" : "theory");
  const isIntro      = role === "introduction";
  const isConclusion = role === "conclusion";
  const isMain       = !isIntro && !isConclusion;

  const formulaBan = usedFormulas.length > 0
    ? `\n\n⚠️ TAKRORLANISHI MUMKIN BO'LMAGAN FORMULALAR (boshqa boblarda allaqachon qoplangan):\n${usedFormulas.map((f,i)=>`  ${i+1}. ${f}`).join("\n")}\n\n👉 MUHIM: Yuqoridagi formulalardan hech biri shu bobda takrorlanmasin.`
    : "";

  const chartBan = usedCharts.length > 0
    ? `\n\n⚠️ TAKRORLANISHI MUMKIN BO'LMAGAN GRAFIK MA'LUMOTLAR (boshqa boblarda allaqachon ko'rsatilgan):\n${usedCharts.map((c,i)=>`  ${i+1}. ${c}`).join("\n")}\n\n👉 MUHIM: Yuqoridagi grafik ma'lumotlardan hech biri bu bobda takrorlanmasin.`
    : "";

  const chartTypeGuide = chapter.chart_type
    ? `\nGrafik turi: "${chapter.chart_type}" (outline'da belgilangan, o'zgartirma)\n- "line": X=vaqt/davr, Y=o'zgaruvchan miqdor — tendensiya\n- "bar": kategoriyalar taqqoslash — miqdoriy farqlar\n- "pie": ulush, foiz taqsimot\n` : "";

  let typeGuide = "";
  if (isIntro) {
    typeGuide = `\n\n=== BOB TURI: KIRISH ===\nYozish kerak:\n- Mavzuning dolzarbligi va ahamiyati (aniq faktlar, statistika bilan)\n- Tadqiqot ob'ekti va predmeti\n- Maqsad va vazifalar (3-5 ta, ro'yxat shaklida)\n- Tadqiqot uslubi\n- Ishning tuzilmasi\nKIRISH DA BO'LMAYDI: formula, grafik, jadval, xulosa, tavsiya`;
  } else if (isConclusion) {
    typeGuide = `\n\n=== BOB TURI: XULOSA ===\nYozish kerak:\n- Asosiy natijalar (3-5 ta, ro'yxat shaklida)\n- Tadqiqot xulosasi (qisqa, aniq, isbotlangan)\n- Amaliy tavsiyalar\n- Kelajakdagi rivojlanish istiqbollari\nXULOSA DA BO'LMAYDI: formula, grafik, jadval, yangi nazariy ma'lumotlar, ta'riflar`;
  } else {
    typeGuide = `\n\n=== BOB TURI: ASOSIY BOB ===\nYozish kerak:\n- Bu bobning o'ziga xos jihatini chuqur tahlil qilish\n- Aniq faktlar, statistika, ilmiy ma'lumotlar\n- Formulalar, grafiklar, jadvallar (rejaga ko'ra)\n- Boshqa boblardan FARQLI yangi kontent\n\n⚠️ ASOSIY BOB ICHIDA QAT'IY TA'QIQLANGAN:\n- "Kirish", "Xulosa", "Yakun", "Umumlashtirish" kabi kichik bo'limlar BO'LMASIN\n- "Kirishda aytilganidek", "xulosa qilib aytganda", "yakunda" iboralar BO'LMASIN\n- Ichki bo'limlar (sections) faqat bu bob ichida bo'lsin, REJA sahifasiga kirmasin\n- Kichik bo'lim raqamlari ANIQ shu formatda: <bob_raqami>.<tartib>. (masalan bob 2 bo'lsa: "2.1.", "2.2.") — Kirish va Xulosa ichida raqamli bo'lim BO'LMAYDI\n- Bu bob alohida hujjat emas — Kirish va Xulosa alohida boblarda berilgan, takrorlash kerak emas`;
  }

  const plans = Array.isArray(chapter.formula_plans) ? chapter.formula_plans
    : (Array.isArray(chapter.formula_latex) ? chapter.formula_latex.map(l=>({latex:l,concept:""})) : []);
  const plannedFormulas = plans.length > 0
    ? `\nBu bob uchun rejalashtirilgan formulalar (AYNAN SHULARNI ishlatgin):\n${plans.map((f,i)=>{const l=typeof f==="string"?f:f.latex; const c=typeof f==="object"&&f.concept?` — ${f.concept}`:""; return `  ${i+1}. ${l}${c}`;}).join("\n")}`
    : "";

  return `Mustaqil ish uchun bob kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
Bob: "${chapter.title}" (${chapterIndex+1}/${totalChapters})
Bob raqami (hujjatda va kichik bo'lim raqamlarida SHU ishlatiladi): ${mainNum || (chapterIndex+1)}
So'z maqsadi: KAMIDA ${wt} so'z
Paragraflar: KAMIDA ${paraCount} ta, har biri 100-140 so'z

Formulalar: ${chapter.formula_count || 0} ta${plannedFormulas}
Grafiklar: ${chapter.chart_count || 0} ta${chartTypeGuide}
Jadvallar: ${chapter.table_count || 0} ta

Umumiy tuzilma:
${allTitles}
${contentNote}${formulaBan}${chartBan}${typeGuide}

QAT'IY QOIDA:
- Kirish, Xulosa va Foydalanilgan adabiyotlar HAR DOIM 1 sahifa bo'lib, ichki bo'limlarga ega BO'LMASIN.
- Asosiy boblar soni va ichki bo'limlar soni oldindan hisoblangan bo'lib, bu bobning sub_count qiymati ${chapter.sub_count || 0} ga mos kelishi kerak.
- REJA sahifasi faqat asosiy boblar nomlarini ko'rsatadi; ichki bo'limlarni REJAga kiritmang.

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

2. Sarlavha: {"type":"heading","level":2,"text":"<bob_raqami>.<tartib>. ..."}

3. Formula (formula_count > 0):
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
    if(s>=0&&end>s) { try { return JSON.parse(clean.slice(s,end+1)); } catch(_) {} }
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
  computeMustaqilStructure,
  extractFormulasFromContent, extractChartTitlesFromContent, collectUsedFormulasAndCharts,
  normalizeFormula, formulaSignature,
  normalizeChartPurpose,
  normalizeParagraph, paragraphSimilarity,
  detectForbiddenIntroConclusion,
};

function normalizeFormula(latex) {
  if (!latex) return "";
  let n = String(latex).toLowerCase();
  n = n.replace(/\\(frac|cdot|times|sum|int|partial|nabla|sqrt|left|right|bigl|bigr|mathbf|mathrm|text|operatorname)\b/g, "");
  n = n.replace(/\\[a-z]+/g, "");
  n = n.replace(/[·×…·]/g, "");
  n = n.replace(/[{}\\,;:\s]/g, "");
  n = n.replace(/[_^]/g, "");
  return n;
}

function formulaSignature(latex) {
  if (!latex) return "";
  const n = normalizeFormula(latex);
  const ops = (n.match(/[=+\-*/^]/g) || []).sort().join("");
  const nums = (n.match(/\d+/g) || []).length;
  return `ops:${ops}|n:${nums}|len:${n.length}`;
}

function normalizeChartPurpose(chart) {
  if (!chart) return "";
  const labels = (chart.labels || []).map(l => String(l).toLowerCase().trim()).sort().join("|");
  const values = chart.values || [];
  const valRange = values.length ? `${Math.min(...values)}-${Math.max(...values)}` : "";
  const title = String(chart.title || "").toLowerCase().replace(/[^a-z0-9а-яёўқўғҳӛçşğüöıёїеѕтдмлксцвбнпрзйтчщъыьэюя\s]/gi, "").trim();
  const titleWords = title.split(/\s+/).filter(w => w.length > 3).slice(0, 5).sort().join("|");
  return `t:${titleWords}|lbl:${labels}|rng:${valRange}|type:${chart.chartType||"bar"}`;
}

function normalizeParagraph(text) {
  if (!text) return "";
  return String(text).toLowerCase()
    .replace(/[.,;:!?"'`«»()\[\]{}—–“-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphSimilarity(textA, textB) {
  const a = new Set(normalizeParagraph(textA).split(" ").filter(w => w.length > 4));
  const b = new Set(normalizeParagraph(textB).split(" ").filter(w => w.length > 4));
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const w of a) if (b.has(w)) intersect++;
  const union = a.size + b.size - intersect;
  return union > 0 ? intersect / union : 0;
}

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
      if (/^(xulosa qilib aytganda|demak,? umuman olganda|umuman olganda|yakunda|xulosa o'rnida)/i.test(txt.trim())) {
        violations.push({ idx: i, type: "paragraph_conclusion_phrase", text: txt.slice(0, 80) });
      }
      if (i < 2 && /^(ushbu bo'lim|bu bo'limda biz|mavzuning dolzarbligi|ushbu ishning maqsadi)/i.test(txt.trim())) {
        violations.push({ idx: i, type: "paragraph_intro_phrase", text: txt.slice(0, 80) });
      }
    }
  });
  return violations;
}





















































































































































































































































































































