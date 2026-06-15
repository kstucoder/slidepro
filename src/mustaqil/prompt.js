// src/mustaqil/prompt.js
// Mustaqil ish uchun generatsiya strategiyasi:
//   1) outline — tuzilma + aniq boblar soni
//   2) subsection — har bir bob/bo'lim uchun parallel kontent

// 1 sahifa ≈ 280 so'z (TNR 14pt, 1.5 interval, GOST, A4)
const WORDS_PER_PAGE = 280;
// Xizmat sahifalari: muqova + mundarija + adabiyotlar
const SERVICE_PAGES = 3;

function wordsForPages(pages) {
  return Math.round(Math.max(pages - SERVICE_PAGES, 3) * WORDS_PER_PAGE);
}

// Aniq boblar soni formulasi (kodda belgilanadi, LLM ga majburiy beriladi)
function chaptersForPages(pages) {
  const contentPages = Math.max(pages - SERVICE_PAGES, 3);
  if (contentPages <= 7) return 2;   // 10-10 bet → 2 bob
  if (contentPages <= 12) return 3;  // 13-15 bet → 3 bob
  if (contentPages <= 20) return 4;  // 16-23 bet → 4 bob
  if (contentPages <= 30) return 5;  // 24-33 bet → 5 bob
  return 6;                          // 34+ bet → 6 bob
}

// ===================== 1-BOSQICH: OUTLINE =====================
function outlineSystemPrompt() {
  return `Sen akademik mustaqil ish tuzilmasini yaratuvchi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q.`;
}

function outlineUserPrompt({ topic, pages, language, studentName, studentGroup, org, supervisor, sourceContent, requiredChapters }) {
  const totalWords = wordsForPages(pages);
  const lang = language || "o'zbek";
  const contentNote = sourceContent
    ? `\n\nFoydalanuvchi quyidagi manba kontentini berdi — asosiy g'oyalar va faktlar SHUNGA asoslansin:\n---\n${sourceContent.slice(0, 3000)}\n---`
    : "";
  const chCount = requiredChapters || chaptersForPages(pages);

  return `Akademik mustaqil ish uchun tuzilma (outline) yarat.

Talablar:
- Mavzu: "${topic}"
- Til: ${lang}
- Sahifalar soni: ${pages} (jami ≈ ${totalWords} so'z asosiy kontent)
- Talaba: ${studentName || "F.I.Sh."}, guruh: ${studentGroup || "—"}
- Muassasa: ${org || "O'quv muassasasi"}
- Rahbar: ${supervisor || "O'qituvchi"}
- MAJBURIY: aynan ${chCount} ta asosiy bo'lim (kirish va xulosa hisoblanmaydi)${contentNote}

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
      "sections": [
        {"id":"ch1_1","title":"<kichik bo'lim nomi>","level":2,"word_target":<raqam>}
      ]
    }
  ],
  "references": [
    "<APA format: Muallif, A. A. (yil). Asar nomi. Nashriyot yoki Jurnal nomi, jild(son), sahifalar.",
    ...
  ]
}

QOIDALAR:
- Kirish: 150-250 so'z
- Xulosa: 200-350 so'z
- ANIQ ${chCount} ta asosiy bo'lim bo'lishi SHART (kirish va xulosa bundan mustasno)
- Har bir asosiy bo'limda kamida 2 ta kichik bo'lim (sections) bo'lsin
- MUHIM: chapter title'larda "bob" so'zi ISHLATMA. Faqat bo'lim nomi yoz (masalan: "Nazariy asoslar", "Amaliy tahlil")
- word_target'lar yig'indisi ≈ ${totalWords} ga teng bo'lsin
- Formulalar: mavzuga mos matematik ifodalar bo'lgan joylarda (kamida 1-2 ta)
- Grafiklar: ma'lumotlarni vizual ko'rsatish kerak bo'lgan joylarda
- references: 8-12 ta manba, APA 7 formatida:
  * Kitob: Muallif, A. A. (yil). Asar nomi. Nashriyot.
  * Jurnal: Muallif, A. A. (yil). Maqola nomi. Jurnal nomi, jild(son), sahifalar. https://doi.org/xxx
  * 40% o'zbek tilidagi manbalar bo'lsin
  * Qolgan 60% xorijiy (ingliz, rus)
- Faqat JSON qaytar`;
}

function parseOutline(text) {
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(clean); }
  catch (e) {
    const s = clean.indexOf("{"), end = clean.lastIndexOf("}");
    if (s >= 0 && end > s) return JSON.parse(clean.slice(s, end + 1));
    throw new Error("Outline JSON o'qilmadi: " + clean.slice(0, 200));
  }
}

// ===================== 2-BOSQICH: SUBSECTION KONTENT =====================
function subsectionSystemPrompt() {
  return `Sen akademik mustaqil ish yozuvchisi mutaxassisan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q. Akademik, rasmiy uslubda yoz.`;
}

function subsectionUserPrompt({ chapter, section, outline, language, sourceContent, chapterIndex, totalChapters }) {
  const lang = language || "o'zbek";
  const wt = section.word_target || chapter.word_target || 400;
  const contentNote = sourceContent
    ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0, 2000)}\n---`
    : "";
  const allTitles = outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");

  // Agar section kichik bo'lim (level 2) bo'lsa, uni alohida yozamiz
  const isSubsection = section.level === 2;
  const sectionLabel = isSubsection
    ? `Kichik bo'lim: "${section.title}" (bob: "${chapter.title}")`
    : `Bob: "${chapter.title}"`;

  return `Mustaqil ish uchun ${isSubsection ? "kichik bo'lim" : "bob"} kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
${sectionLabel} (${chapterIndex + 1}/${totalChapters})
So'z maqsadi: KAMIDA ${wt} so'z (paragraflar birgalikda)
Formulalar: ${(section.formula_count || chapter.formula_count || 0) > 0 ? (section.formula_count || chapter.formula_count) + " ta" : "yo'q"}
Grafiklar: ${(section.chart_count || chapter.chart_count || 0) > 0 ? (section.chart_count || chapter.chart_count) + " ta" : "yo'q"}
Jadvallar: ${(section.table_count || chapter.table_count || 0) > 0 ? (section.table_count || chapter.table_count) + " ta" : "yo'q"}

Umumiy tuzilma:
${allTitles}
${contentNote}

Quyidagi JSON qaytargin:
{
  "chapter_id": "${chapter.id}",
  "section_id": "${section.id || chapter.id}",
  "title": "${section.title || chapter.title}",
  "level": ${section.level || 1},
  "content": [
    <content bloklari>
  ]
}

Content bloklari turlari:
1. Paragraf: {"type":"paragraph","text":"..."}
   - Har bir paragraf kamida 80-150 so'z
   - Akademik uslub: aniq, dalillangan, havola bilan

2. Kichik sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}
   (faqat keyingi kichik bo'lim boshlanishi bo'lsa)

3. Formula (agar formula_count > 0):
   {"type":"formula","latex":"E = mc^2","display_text":"E = mc²","caption":"Energiya-massa munosabati","number":1}

4. Grafik (agar chart_count > 0):
   {"type":"chart","chartType":"bar|line|pie","title":"...","labels":["A","B","C"],"values":[10,25,15],"unit":"","caption":"1-rasm. ...","number":1}

5. Jadval (agar table_count > 0):
   {"type":"table","caption":"1-jadval. ...","number":1,"headers":["Ustun1","Ustun2","Ustun3"],"rows":[["qator1a","qator1b","qator1c"]]}

QOIDALAR:
- Barcha paragraflar birgalikda KAMIDA ${wt} so'z bo'lsin (sanab ko'r!)
- ${lang} tilida, akademik uslubda yoz
- Formulalar, grafiklar, jadvallar mavzu mohiyatini ochishga xizmat qilsin
- MUHIM: paragraf matnida LaTeX ishlatma! Matematik belgilarni oddiy matn bilan yoz
- Faqat JSON qaytar`;
}

function parseSubsection(text) {
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(clean); }
  catch (e) {
    const s = clean.indexOf("{"), end = clean.lastIndexOf("}");
    if (s >= 0 && end > s) return JSON.parse(clean.slice(s, end + 1));
    throw new Error("Subsection JSON o'qilmadi: " + e.message + " | " + clean.slice(0, 200));
  }
}

// ===================== ESKI: CHAPTER KONTENT (saqlangan, subsection yo'q bo'lsa) =====================
function chapterSystemPrompt() {
  return `Sen akademik mustaqil ish yozuvchisi mutaxassisan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q. Akademik, rasmiy uslubda yoz.`;
}

function chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters }) {
  const lang = language || "o'zbek";
  const wt = chapter.word_target || 400;
  const contentNote = sourceContent
    ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0, 2000)}\n---`
    : "";
  const allTitles = outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n");

  return `Mustaqil ish uchun bob kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
Bob: "${chapter.title}" (${chapterIndex + 1}/${totalChapters})
So'z maqsadi: KAMIDA ${wt} so'z (paragraflar birgalikda)
Formulalar: ${chapter.formula_count || 0} ta
Grafiklar: ${chapter.chart_count || 0} ta  
Jadvallar: ${chapter.table_count || 0} ta

Umumiy tuzilma:
${allTitles}
${contentNote}

Quyidagi JSON qaytargin:
{
  "chapter_id": "${chapter.id}",
  "title": "${chapter.title}",
  "content": [
    <content bloklari>
  ]
}

Content bloklari turlari:
1. Paragraf: {"type":"paragraph","text":"..."}
2. Kichik sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}
3. Formula: {"type":"formula","latex":"...","display_text":"...","caption":"...","number":1}
4. Grafik: {"type":"chart","chartType":"bar|line|pie","title":"...","labels":[],"values":[],"caption":"...","number":1}
5. Jadval: {"type":"table","caption":"...","number":1,"headers":[],"rows":[[]]}

QOIDALAR:
- KAMIDA ${wt} so'z
- ${lang} tilida, akademik uslub
- Faqat JSON qaytar`;
}

function parseChapter(text) {
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(clean); }
  catch (e) {
    const s = clean.indexOf("{"), end = clean.lastIndexOf("}");
    if (s >= 0 && end > s) return JSON.parse(clean.slice(s, end + 1));
    throw new Error("Chapter JSON o'qilmadi: " + e.message + " | " + clean.slice(0, 200));
  }
}

module.exports = {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  subsectionSystemPrompt, subsectionUserPrompt, parseSubsection,
  wordsForPages, chaptersForPages,
};
