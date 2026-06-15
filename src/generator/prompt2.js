// src/generator/prompt2.js
// Taqdimot uchun 2 bosqichli (parallel) strategiya:
//   Pass 1: outline — AYNAN N ta mazmunli slayd (sarlavha + layout + qisqa tavsif)
//   Pass 2: har bir slayd to'liq kontenti PARALLEL generatsiya qilinadi
// Bu aniq slayd sonini VA har slaydda to'liq sifatli kontentni kafolatlaydi.

const { LAYOUT_NAMES } = require("./layouts");

// Mazmunli (content) layoutlar — titul/reja/xulosa/adabiyotlardan tashqari
const CONTENT_LAYOUTS = [
  "stat-callout", "objectives", "steps", "feature-grid",
  "layers", "split-list", "dual-column", "metrics", "chart",
];

// ===================== 1-BOSQICH: OUTLINE =====================
function outlineSystemPrompt() {
  return `Sen professional taqdimot tuzilmasini yaratuvchi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — izoh, markdown, backtick yo'q.`;
}

function outlineUserPrompt({ topic, contentSlides, sourceContent }) {
  const contentNote = sourceContent
    ? `\n\nFoydalanuvchi MANBA MATNI berdi — slaydlar shunga asoslansin:\n---\n${sourceContent.slice(0, 4000)}\n---`
    : "";

  return `"${topic}" mavzusida professional taqdimot uchun tuzilma (reja) yarat.

Kerak: AYNAN ${contentSlides} ta mazmunli slayd.
Har bir slayd uchun: sarlavha, layout turi, va qisqa mazmun tavsifi (1-2 jumla).${contentNote}

Mavjud layout turlari (har biri turli vizual struktura):
- "stat-callout": katta statistika + yon kartochkalar (raqamlar, foizlar uchun)
- "objectives": banner + 2x2 maqsad kartochkalari (maqsadlar, vazifalar uchun)
- "steps": ketma-ket qadamlar (jarayon, bosqichlar uchun)
- "feature-grid": 2x2 ikonkali kartochkalar (xususiyatlar, turlar uchun)
- "layers": ustma-ust qatlamlar (ierarxiya, darajalar, arxitektura uchun)
- "split-list": chap ro'yxat + o'ng panel (tekshiruv, taqqoslash uchun)
- "dual-column": ikki ustun (afzallik/kamchilik, taqqoslash uchun)
- "metrics": raqamli ko'rsatkichlar paneli (natijalar, statistika uchun)
- "chart": diagramma + kartochkalar (ma'lumotlar dinamikasi uchun)
- "conclusion": xulosa slaydi (asosiy natijalar, FAQAT oxirgi slayd uchun)

Quyidagi JSON qaytar:
{
  "title": "taqdimot nomi (mavzu asosida, qisqa)",
  "palette": "ocean",
  "slides": [
    { "n": 1, "title": "slayd sarlavhasi", "layout": "stat-callout", "brief": "bu slaydda nima ko'rsatiladi (1-2 jumla)" },
    { "n": 2, "title": "...", "layout": "steps", "brief": "..." }
  ]
}

QOIDALAR:
- AYNAN ${contentSlides} ta slayd (na ko'p, na kam)
- OXIRGI slayd "conclusion" layout bilan XULOSA bo'lsin (asosiy natijalar)
- Qolgan layoutlar XILMA-XIL bo'lsin — ketma-ket bir xil layout ISHLATMA
- Mantiqiy ketma-ketlik: muammo/dolzarblik → tahlil → yechim → natija → xulosa
- Har slayd alohida g'oyani yoritadi, takrorlanmasin
- palette: ocean/forest/terracotta/berry/charcoal/teal dan biri (mavzuga mos)
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

// ===================== 2-BOSQICH: SLIDE CONTENT =====================
function slideSystemPrompt() {
  return `Sen professional taqdimot slaydi kontentini yaratuvchi mutaxassissan. FAQAT to'g'ri JSON qaytarasan — izoh, markdown, backtick yo'q. Slayd matnlari qisqa, ta'sirli, akademik bo'lsin.`;
}

// Har bir layout uchun aniq JSON sxema namunasi
function layoutSchema(layout) {
  const schemas = {
    "stat-callout": `{"layout":"stat-callout","title":"...","icon":"chart","intro":"kirish matni (1-2 jumla)","stat":{"label":"ko'rsatkich nomi","value":"73%","desc":"izoh"},"highlight":{"icon":"warning","label":"muhim","text":"e'tibor talab qiladigan fikr"},"items":[{"icon":"check","title":"karta 1","desc":"tavsif"},{"icon":"bolt","title":"karta 2","desc":"tavsif"},{"icon":"star","title":"karta 3","desc":"tavsif"}]}`,
    "objectives": `{"layout":"objectives","title":"...","icon":"target","banner":{"icon":"target","label":"asosiy maqsad","text":"banner matni"},"items":[{"icon":"cogs","title":"maqsad 1","desc":"tavsif"},{"icon":"chart","title":"maqsad 2","desc":"tavsif"},{"icon":"shield","title":"maqsad 3","desc":"tavsif"},{"icon":"users","title":"maqsad 4","desc":"tavsif"}]}`,
    "steps": `{"layout":"steps","title":"...","icon":"tools","intro":"kirish (1 jumla)","items":[{"icon":"search","title":"qadam 1","desc":"tavsif"},{"icon":"target","title":"qadam 2","desc":"tavsif"},{"icon":"cogs","title":"qadam 3","desc":"tavsif"},{"icon":"check","title":"qadam 4","desc":"tavsif"}],"note":{"icon":"lightbulb","label":"eslatma","text":"muhim izoh"}}`,
    "feature-grid": `{"layout":"feature-grid","title":"...","icon":"star","intro":"kirish (1 jumla)","items":[{"icon":"shield","title":"xususiyat 1","desc":"to'liq tavsif"},{"icon":"bolt","title":"xususiyat 2","desc":"to'liq tavsif"},{"icon":"leaf","title":"xususiyat 3","desc":"to'liq tavsif"},{"icon":"globe","title":"xususiyat 4","desc":"to'liq tavsif"}]}`,
    "layers": `{"layout":"layers","title":"...","icon":"layers","intro":"kirish (1 jumla)","items":[{"num":"3","icon":"cloud","title":"yuqori qatlam","desc":"tavsif"},{"num":"2","icon":"server","title":"o'rta qatlam","desc":"tavsif"},{"num":"1","icon":"database","title":"pastki qatlam","desc":"tavsif"}]}`,
    "split-list": `{"layout":"split-list","title":"...","icon":"list","intro":"kirish (1 jumla)","listTitle":"ro'yxat sarlavhasi","items":[{"text":"band 1"},{"text":"band 2"},{"text":"band 3"},{"text":"band 4"},{"text":"band 5"}],"panel":{"label":"panel sarlavhasi","lines":["satr 1","satr 2"],"foot":"izoh"},"highlight":{"icon":"up","label":"natija","value":"+42%","desc":"izoh"}}`,
    "dual-column": `{"layout":"dual-column","title":"...","icon":"users","leftTitle":"chap ustun","left":[{"icon":"check","title":"element 1","desc":"tavsif"},{"icon":"bolt","title":"element 2","desc":"tavsif"},{"icon":"star","title":"element 3","desc":"tavsif"}],"rightTitle":"o'ng ustun","right":[{"title":"element 1","desc":"tavsif","color":"bad"},{"title":"element 2","desc":"tavsif","color":"accent"},{"title":"element 3","desc":"tavsif","color":"secondary"}],"strip":[{"value":"2","label":"ustun"},{"value":"6","label":"element"}]}`,
    "metrics": `{"layout":"metrics","title":"...","icon":"gauge","intro":"kirish (1 jumla)","stats":[{"value":"98","unit":"%","label":"ko'rsatkich 1","sub":"izoh"},{"value":"3.2","unit":"x","label":"ko'rsatkich 2","sub":"izoh"},{"value":"14","unit":"kun","label":"ko'rsatkich 3","sub":"izoh"},{"value":"5","unit":"M","label":"ko'rsatkich 4","sub":"izoh"}],"stagesTitle":"bosqichlar","stages":[{"title":"bosqich 1","desc":"tavsif"},{"title":"bosqich 2","desc":"tavsif"},{"title":"bosqich 3","desc":"tavsif"}]}`,
    "chart": `{"layout":"chart","title":"...","icon":"chart","cards":[{"value":"45K","unit":"ta","label":"karta 1"},{"value":"+28","unit":"%","label":"karta 2"},{"value":"3.8","unit":"x","label":"karta 3"},{"value":"A+","unit":"","label":"karta 4"}],"chart":{"title":"diagramma nomi","type":"bar","seriesName":"ko'rsatkich","labels":["A","B","C","D","E"],"values":[42,68,55,80,95]},"panels":[{"label":"panel 1","lines":["xulosa","matni"]},{"label":"panel 2","lines":["tahlil","matni"]}]}`,
    "conclusion": `{"layout":"conclusion","title":"XULOSA","items":[{"icon":"check","text":"birinchi asosiy xulosa (to'liq jumla)"},{"icon":"star","text":"ikkinchi asosiy xulosa"},{"icon":"rocket","text":"uchinchi asosiy xulosa"},{"icon":"layers","text":"to'rtinchi asosiy xulosa"}]}`,
  };
  return schemas[layout] || schemas["feature-grid"];
}

function slideUserPrompt({ slide, outline, topic, language }) {
  const lang = language || "o'zbek";
  return `"${topic}" taqdimoti uchun BITTA slayd kontentini to'liq yarat.

Slayd: "${slide.title}" (${slide.n}-slayd)
Layout: ${slide.layout}
Mazmun: ${slide.brief}
Til: ${lang}

Quyidagi AYNAN shu strukturada to'liq to'ldirilgan JSON qaytar:
${layoutSchema(slide.layout)}

QOIDALAR:
- BARCHA maydonlarni to'liq to'ldir — bo'sh qoldirma
- Matnlar ${lang} tilida, qisqa va ta'sirli (slayd uchun)
- title: "${slide.title}" ni ishlat
- icon: faqat shu ro'yxatdan — check, bolt, star, shield, cogs, chart, target, users, globe, leaf, cloud, server, database, search, tools, lightbulb, up, warning, rocket, gauge, book, list, layers
- Raqamlar/statistika realistik va mavzuga mos bo'lsin
- LaTeX yoki pastki chiziq (_) ISHLATMA
- Faqat JSON qaytar`;
}

function parseSlide(text) {
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(clean); }
  catch (e) {
    const s = clean.indexOf("{"), end = clean.lastIndexOf("}");
    if (s >= 0 && end > s) return JSON.parse(clean.slice(s, end + 1));
    throw new Error("Slide JSON o'qilmadi: " + e.message);
  }
}

module.exports = {
  outlineSystemPrompt, outlineUserPrompt, parseOutline,
  slideSystemPrompt, slideUserPrompt, parseSlide,
  CONTENT_LAYOUTS,
};
