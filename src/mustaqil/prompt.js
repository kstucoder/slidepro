// src/mustaqil/prompt.js
// Mustaqil ish uchun 2 bosqichli LLM strategiyasi:
//   1) outline — tuzilma + so'z maqsadlari + formula/grafik joylar
//   2) chapter — har bir bob uchun to'liq kontent

// 1 sahifa ≈ 280 so'z (TNR 14pt, 1.5 interval, GOST, A4)
const WORDS_PER_PAGE = 280;
// Xizmat sahifalari: muqova + mundarija + adabiyotlar
const SERVICE_PAGES = 3;

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
    "year": "2025",
    "language": "${lang}"
  },
  "total_words_target": ${totalWords},
  "chapters": [
    {
      "id": "intro",
      "title": "Kirish",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": <0 yoki 1>,
      "chart_count": <0 yoki 1>,
      "table_count": <0 yoki 1>,
      "sections": []
    },
    {
      "id": "ch1",
      "title": "1-bob. <bob nomi>",
      "level": 1,
      "word_target": <raqam>,
      "formula_count": <raqam>,
      "chart_count": <raqam>,
      "table_count": <raqam>,
      "sections": [
        {"id":"ch1_1","title":"1.1. <kichik bob>","level":2,"word_target":<raqam>}
      ]
    }
  ],
  "references": [
    "Muallif. Kitob nomi. Nashriyot, yil.",
    ...
  ]
}

QOIDALAR:
- Kirish: 150-250 so'z
- Xulosa: 200-350 so'z  
- Asosiy boblar: 2-4 ta, har biri kichik bo'limlari bilan
- word_target'lar yig'indisi ≈ ${totalWords} ga teng bo'lsin
- Formulalar: mavzuga mos matematik ifodalar bo'lgan joylarda (kamida 1-2 ta umumiy hisoblash formulasi)
- Grafiklar: ma'lumotlarni vizual ko'rsatish kerak bo'lgan joylarda
- references: 8-12 ta haqiqiy, mavzuga mos manba
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
  return `Sen akademik mustaqil ish yozuvchisi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q. Akademik, rasmiy uslubda yoz.`;
}

function chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters }) {
  const lang = language || "o'zbek";
  const wt = chapter.word_target || 400;
  const contentNote = sourceContent
    ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0,2000)}\n---`
    : "";
  const allTitles = outline.chapters.map((c,i) => `${i+1}. ${c.title}`).join("\n");

  return `Mustaqil ish uchun bob kontentini yarat.

Ish: "${outline.meta?.title || "Mavzu"}" (${lang} tilida)
Bob: "${chapter.title}" (${chapterIndex+1}/${totalChapters})
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
   - Har bir paragraf kamida 80-150 so'z
   - Akademik uslub: aniq, dalillangan, havola bilan
   
2. Kichik sarlavha: {"type":"heading","level":2,"text":"1.1. ..."}
   (faqat sections bo'lsa)
   
3. Formula (agar formula_count > 0):
   {"type":"formula","latex":"E = mc^2","display_text":"E = mc²","caption":"Energiya-massa munosabati","number":1}
   - latex: to'g'ri LaTeX sintaksis
   - Formuladan OLDIN va KEYIN izohlovchi paragraf bo'lsin
   - Mavzuga MOS formula (iqtisod→foiz/o'sish, fizika→harakat, raqamli→n-murakkablik va h.k.)
   
4. Grafik (agar chart_count > 0):
   {"type":"chart","chartType":"bar|line|pie","title":"...","labels":["A","B","C"],"values":[10,25,15],"unit":"","caption":"1-rasm. ...","number":1}
   - Realistik, mavzuga mos ma'lumotlar
   - 4-7 ta nuqta yoki kategoriya
   - Grafikdan OLDIN va KEYIN izohlovchi paragraf bo'lsin
   
5. Jadval (agar table_count > 0):
   {"type":"table","caption":"1-jadval. ...","number":1,"headers":["Ustun1","Ustun2","Ustun3"],"rows":[["qator1a","qator1b","qator1c"]]}
   - Kamida 3 ustun, 3-6 qator
   - Jadvaldan OLDIN va KEYIN izohlovchi paragraf bo'lsin

QOIDALAR:
- Barcha paragraflar birgalikda KAMIDA ${wt} so'z bo'lsin (sanab ko'r!)
- ${lang} tilida, akademik uslubda yoz
- Formulalar, grafiklar, jadvallar mavzu mohiyatini ochishga xizmat qilsin
- MUHIM: paragraf matnida LaTeX ishlatma! \\(...\\), $...$, \\frac kabi belgilar paragrafda BO'LMASIN. Matematik belgilarni oddiy matn bilan yoz (masalan "P_yangi", "r foiz stavkasi", "n - davrlar soni"). Formulalar faqat "formula" bloki ichida latex sifatida beriladi.
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

module.exports = {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  chapterSystemPrompt, chapterUserPrompt, parseChapter,
  wordsForPages,
};
