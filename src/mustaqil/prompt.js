// src/mustaqil/prompt.js
// Mustaqil ish uchun 2 bosqichli LLM strategiyasi:
//   1) outline — tuzilma + so'z maqsadlari + formula/grafik joylar
//   2) chapter — har bir bob uchun to'liq kontent

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
- Kirish: 150-250 so'z, formula_count:0, chart_count:0
- Xulosa: 200-350 so'z, formula_count:0, chart_count:0
- Asosiy bo'limlar: sahifalar soniga mutanosib (${pages <= 15 ? "1-2" : pages <= 25 ? "2-3" : "3-4"} ta asosiy bo'lim), har biri kichik bo'limlari bilan
- MUHIM: chapter title'larda "bob" so'zi ISHLATMA. Faqat bo'lim nomi yoz
- Har asosiy bo'lim BOSHQA JIHATNI yoritsin (nazariy/amaliy/taqqoslov/prognoz) — takrorlanmasin
- word_target'lar yig'indisi ≈ ${totalWords} ga teng bo'lsin
- Formulalar: FAQAT aniq fanlar mavzularida (matematika, fizika, kimyo, muhandislik, iqtisodiyot, kompyuter fanlari, biologiya, kimyoviy texnologiya) — u holda har asosiy bob uchun 1-3 ta mavzuga mos formula. Gumanitar, ijtimoiy, tarixiy, ekologik-umumiy mavzularda formula_count:0 bo'lsin. Mavzuning o'ziga qarab hal qil.
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

function chapterUserPrompt({ chapter, outline, language, sourceContent, chapterIndex, totalChapters }) {
  const lang = language || "o'zbek";
  const wt = chapter.word_target || 400;
  const paraCount = Math.max(4, Math.ceil(wt / 110));
  const contentNote = sourceContent
    ? `\nManba kontent (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0,2000)}\n---`
    : "";
  const allTitles = outline.chapters.map((c,i) => `${i+1}. ${c.title}`).join("\n");

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
${contentNote}

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
   
4. Grafik (agar chart_count > 0):
   {"type":"chart","chartType":"bar|line|pie","title":"...","labels":["..."],"values":[...],"unit":"","caption":"N-rasm. ...","number":1}
   - Haqiqiy, aniq raqamlar (realistik ma'lumotlar)
   
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
