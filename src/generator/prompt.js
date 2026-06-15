// src/generator/prompt.js
// Umumiy prompt (system + user) va LLM javobini JSON spec ga aylantirish.
// Bu modul provayderdan (Anthropic/OpenAI) mustaqil.
//
// IKKI FAZALI GENERATSIYA:
//   1-faza: outline — faqat slayd sarlavhalari + layout tanlovi
//   2-faza: slide-content — har bir mazmun slaydiga to'liq kontent

const { LAYOUT_NAMES } = require("./layouts");
const { ICON_NAMES } = require("./icons");
const { PALETTES } = require("./theme");

// CONTENT LAYOUTLAR (majburiy bo'lmagan, faqat mazmun uchun)
const CONTENT_LAYOUTS = LAYOUT_NAMES.filter((n) =>
  !["title", "agenda", "conclusion", "references"].includes(n)
);

// =====================================================================
// 1-FAZA: OUTLINE — faqat slayd sarlavhalari + layout tanlovi
// =====================================================================

function buildOutlineSystemPrompt() {
  return `Sen taqdimot tuzilmasini (outline) yaratuvchi mutaxassissan.
Faqat to'g'ri JSON qaytarasan — hech qanday izoh, markdown, backtick yo'q.

MAVJUD LAYOUTLAR (faqat mazmun uchun, title/agenda/conclusion/references biz yaratamiz):
${CONTENT_LAYOUTS.join(", ")}

MAVJUD IKONKALAR: ${ICON_NAMES.join(", ")}
MAVJUD PALITRALAR: ${Object.keys(PALETTES).join(", ")}

QOIDALAR:
- Har bir slayd uchun FAQAT: layout, title, icon (majburiy)
- Layoutlarni XILMA-XIL tanla — takrorlama
- Har bir slaydning sarlavhasi ANIQ va MAVZUGA MOS bo'lsin
- Faqat JSON qaytar.`;
}

function buildOutlineUserPrompt({ topic, slides, sourceContent, studentName, studentGroup }) {
  const contentCount = Math.max(slides - 4, 1); // title + agenda + conclusion + references = 4
  const srcNote = (sourceContent && sourceContent.trim())
    ? `\n\nManba kontent: ${sourceContent.slice(0, 500)}...`
    : "";

  return `Taqdimot outline yarat.
Mavzu: "${topic}"
Jami slaydlar: ${slides} (shundan ${contentCount} ta mazmun slaydi — qolgan 4 tasi title, agenda, conclusion, references)
${studentName ? `Talaba: ${studentName}` : ""}
${studentGroup ? `Guruh: ${studentGroup}` : ""}

Quyidagi JSON qaytargin (FAQAT ${contentCount} ta mazmun slaydi):
{
  "palette": "<palitra nomi>",
  "slides": [
    {"layout": "<layout>", "title": "<slayd sarlavhasi>", "icon": "<ikonka>"}
  ]
}

QOIDALAR:
- ANIQ ${contentCount} ta slayd berilishi SHART
- Har bir slayd: layout, title, icon
- Layoutlarni xilma-xil tanla
- Sarlavhalar mavzuga mos, aniq bo'lsin
- O'zbek tilida${srcNote}
- Faqat JSON qaytar.`;
}

// Outline JSON'ni tahlil qilish
function parseOutline(text) {
  const clean = (text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const s = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (s >= 0 && end > s) return JSON.parse(clean.slice(s, end + 1));
    throw new Error("Outline JSON o'qilmadi: " + clean.slice(0, 200));
  }
}

// =====================================================================
// 2-FAZA: SLIDE CONTENT — bitta slayd uchun to'liq kontent
// =====================================================================

function buildSlideContentSystemPrompt() {
  return `Sen taqdimot slaydi kontentini yaratuvchi mutaxassissan.
Senga slayd layout turi va sarlavha beriladi. Shu layout uchun to'liq kontent JSON qaytarasan.
Hech qanday izoh, markdown, backtick YO'Q. Faqat JSON.

KONTENT HAJMI QOIDALARI (juda muhim):
- Har bir kartochka tavsifi (desc): KAMIDA 8 so'z, ko'pi 16 so'z. Hech qachon 20 so'zdan oshmasin va 8 so'zdan kam bo'lmasin.
- Kartochka sarlavhasi (title): 2-4 so'z.
- Kirish matni (intro): to'liq 1-2 jumla (20-35 so'z).
- Slayd sarlavhasi: 3-6 so'z.
- Raqamlar/statistikalar realistik bo'lsin.

ELEMENT SONLARI (ANIQ rioya qil):
- objectives.items: ANIQ 4 ta
- feature-grid.items: ANIQ 4 ta
- steps.items: 5 yoki 6 ta
- layers.items: ANIQ 3 ta
- metrics.stats: ANIQ 4 ta
- split-list.items: 6 yoki 7 ta
- dual-column.left va right: har birida ANIQ 5 ta
- stat-callout.items: ANIQ 3 ta
- chart.cards: ANIQ 4 ta; chart.labels/values: 4 yoki 5 ta

KAFOLAT: Har bir maydon to'liq to'ldirilgan bo'lishi SHART. Bo'sh yoki yarim qolgan maydon yo'q. Faqat JSON qaytar.`;
}

function buildSlideContentUserPrompt({ slideSkeleton, topic, outlineTitles, studentName, studentGroup, sourceContent }) {
  const layout = slideSkeleton.layout;
  const title = slideSkeleton.title || topic;
  const icon = slideSkeleton.icon || "info";

  const srcNote = (sourceContent && sourceContent.trim())
    ? `\n\nManba matn (asosiy g'oyalar shunga asoslansin):\n---\n${sourceContent.slice(0, 3000)}\n---`
    : "";

  const outlineStr = (outlineTitles || [])
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");

  // Har bir layout uchun JSON shabloni
  const templates = {
    "stat-callout": `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "intro": "<1-2 jumla kirish matni>",
  "highlight": {"icon": "<ikonka>", "label": "<label>", "text": "<matn>"},
  "stat": {"label": "<label>", "value": "<qiymat>", "desc": "<tavsif>"},
  "items": [
    {"icon": "<ikonka>", "title": "<sarlavha>", "desc": "<8-16 so'z tavsif>"},
    {"icon": "<ikonka>", "title": "<sarlavha>", "desc": "<8-16 so'z tavsif>"},
    {"icon": "<ikonka>", "title": "<sarlavha>", "desc": "<8-16 so'z tavsif>"}
  ]
}`,
    objectives: `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "banner": {"icon": "target", "label": "<label>", "text": "<matn>"},
  "items": [
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"}
  ]
}`,
    steps: `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "intro": "<1-2 jumla>",
  "items": [
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<qisqa tavsif>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<qisqa tavsif>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<qisqa tavsif>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<qisqa tavsif>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<qisqa tavsif>"}
  ],
  "note": {"icon": "bolt", "label": "<label>", "text": "<matn>"}
}`,
    "feature-grid": `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "intro": "<1-2 jumla>",
  "items": [
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"}
  ],
  "note": {"label": "<label>", "text": "<matn>"}
}`,
    layers: `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "intro": "<1-2 jumla>",
  "items": [
    {"num": "1", "icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<tavsif>"},
    {"num": "2", "icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<tavsif>"},
    {"num": "3", "icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<tavsif>"}
  ]
}`,
    "split-list": `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "intro": "<1-2 jumla>",
  "listTitle": "<ro'yxat sarlavhasi>",
  "items": [
    {"text": "<check point 1>"},
    {"text": "<check point 2>"},
    {"text": "<check point 3>"},
    {"text": "<check point 4>"},
    {"text": "<check point 5>"},
    {"text": "<check point 6>"}
  ],
  "panel": {"label": "<label>", "lines": ["<qator1>", "<qator2>"], "foot": "<foot>"},
  "highlight": {"icon": "<ikonka>", "label": "<label>", "value": "<qiymat>", "desc": "<tavsif>"}
}`,
    "dual-column": `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "leftTitle": "<chap sarlavha>",
  "left": [
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"},
    {"icon": "<ikonka>", "title": "<2-4 so'z>", "desc": "<8-16 so'z>"}
  ],
  "rightTitle": "<o'ng sarlavha>",
  "right": [
    {"title": "<2-4 so'z>", "desc": "<8-16 so'z>", "color": "primary"},
    {"title": "<2-4 so'z>", "desc": "<8-16 so'z>", "color": "secondary"},
    {"title": "<2-4 so'z>", "desc": "<8-16 so'z>", "color": "accent"},
    {"title": "<2-4 so'z>", "desc": "<8-16 so'z>", "color": "good"},
    {"title": "<2-4 so'z>", "desc": "<8-16 so'z>", "color": "mute"}
  ],
  "strip": [{"value": "<qiymat>", "label": "<label>"}]
}`,
    metrics: `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "intro": "<1-2 jumla>",
  "stats": [
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>", "sub": "<qo'shimcha>", "color": "good"},
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>", "sub": "<qo'shimcha>", "color": "primary"},
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>", "sub": "<qo'shimcha>", "color": "secondary"},
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>", "sub": "<qo'shimcha>", "color": "accent"}
  ],
  "stagesTitle": "<bosqichlar sarlavhasi>",
  "stages": [
    {"title": "<bosqich1>", "desc": "<tavsif>"},
    {"title": "<bosqich2>", "desc": "<tavsif>"},
    {"title": "<bosqich3>", "desc": "<tavsif>"}
  ]
}`,
    chart: `{
  "layout": "${layout}",
  "title": "${title}",
  "icon": "${icon}",
  "cards": [
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>"},
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>"},
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>"},
    {"value": "<raqam>", "unit": "<birlik>", "label": "<label>"}
  ],
  "chart": {
    "title": "<grafik sarlavhasi>",
    "type": "bar",
    "seriesName": "<seriya nomi>",
    "labels": ["<A>", "<B>", "<C>", "<D>", "<E>"],
    "values": [<raqam>, <raqam>, <raqam>, <raqam>, <raqam>]
  },
  "panels": [
    {"label": "<label>", "lines": ["<qator1>", "<qator2>"]},
    {"label": "<label>", "lines": ["<qator1>", "<qator2>"]}
  ]
}`,
  };

  const template = templates[layout] || templates["stat-callout"];

  return `Taqdimot: "${topic}"
Slayd #${slideSkeleton._index || "?"}/${slideSkeleton._total || "?"}
Layout: ${layout}
Sarlavha: ${title}

Taqdimot tuzilmasi (boshqa slaydlar):
${outlineStr}
${srcNote}

Yuqoridagi layout ("${layout}") uchun to'liq kontent JSON qaytar.
Shu shablondan foydalan:
${template}

MUHIM:
- Barcha maydonlarni to'liq to'ldiring
- Element sonlariga rioya qiling (${layout} layout uchun)
- Mavzuga mos realistik ma'lumotlar
- O'zbek tilida
- Faqat JSON qaytar`;
}

// Bitta slayd kontent JSON'ni tahlil qilish
function parseSlideContent(text, layout) {
  const clean = (text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const s = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (s >= 0 && end > s) {
      try { return JSON.parse(clean.slice(s, end + 1)); } catch (_) {}
    }
    // Fallback — skeleton bilan render bo'ladi (defensive layouts)
    console.warn("[prompt] slide content parse xato, skeleton bilan render:", clean.slice(0, 100));
    return null;
  }
}

// =====================================================================
// ESKI PROMPTLAR (1-fazali uchun, saqlanyapti — agar kerak bo'lsa)
// =====================================================================

function buildSystemPrompt() {
  return `Sen taqdimot (slayd) kontentini tuzuvchi mutaxassis muharrirsan. Foydalanuvchi mavzu va sahifa sonini beradi. Sen FAQAT to'g'ri JSON qaytarasan — hech qanday izoh, markdown belgi yoki backtick YO'Q.

QAYTARILADIGAN STRUKTURA:
{
  "palette": "<palitra nomi>",
  "slides": [ { "layout": "<layout nomi>", ... layoutga mos maydonlar } ]
}

PALITRALAR (mavzuga mosini tanla): ${Object.keys(PALETTES).join(", ")}.

MAVJUD LAYOUTLAR va ularning maydonlari (har biri "title" — slayd sarlavhasi va "icon" — ikonka nomini qabul qiladi):

1. "title" (BIRINCHI slayd, FAQAT 1 marta): { title, kicker, subkicker, org, faculty, icon, meta:[{label,value}], footer, date }
2. "agenda" (Reja — IKKINCHI slayd, FAQAT 1 marta): { title:"Reja", icon:"list", intro?, items:[{title,desc?}] (4-7 ta, asosiy bo'lim nomlari) }
2. "stat-callout": { title, icon, intro, stat:{label,value,desc}, highlight:{icon,label,text}, items:[{icon,title,desc}] (max 3) }
3. "objectives": { title, icon, banner:{icon,label,text}, items:[{icon,title,desc}] (aniq 4 ta, 2x2) }
4. "steps": { title, icon, intro, items:[{icon,title,desc}] (4-6 ta gorizontal qadam), note:{icon,label,text} }
5. "feature-grid": { title, icon, intro, items:[{icon,title,desc}] (aniq 4 ta), note:{label,text} }
6. "layers": { title, icon, intro, items:[{num,icon,title,desc}] (aniq 3 ta, ustma-ust) }
7. "split-list": { title, icon, intro, listTitle, items:[{text}] (max 7 check ro'yxat), panel:{label,lines:[],foot}, highlight:{icon,label,value,desc} }
8. "dual-column": { title, icon, leftTitle, left:[{icon,title,desc}] (max 5), rightTitle, right:[{title,desc,color}] (max 5; color: bad/accent/secondary/mute/primary), strip:[{value,label}] }
9. "metrics": { title, icon, intro, stats:[{value,unit,label,sub,color}] (max 4), stagesTitle, stages:[{title,desc}] (max 3) }
10. "chart": { title, icon, cards:[{value,unit,label}] (max 4 ixtiyoriy), chart:{title,type:"bar|line|pie",seriesName,labels:[],values:[]}, panels:[{label,lines:[]}] (max 2) }
11. "conclusion": { title (mas. "XULOSA"), items:[{icon,text}] (max 5) }
12. "references": { title, icon, items:["manba1", ...], note, thanks }

MAVJUD IKONKA NOMLARI (faqat shulardan tanla): ${ICON_NAMES.join(", ")}.

QOIDALAR:
- MAJBURIY STRUKTURA (har bir taqdimotda, slayd sonidan qat'i nazar):
  • 1-slayd: "title" (titul)
  • 2-slayd: "agenda" (Reja) — asosiy bo'limlar ro'yxati; punktlari o'rtadagi mazmun slaydlari sarlavhalariga mos kelsin.
  • OXIRGI slayd: "references" (Foydalanilgan adabiyotlar) — 6-12 ta real, mavzuga mos manba.
  • OXIRGIDAN OLDINGI slayd: "conclusion" (Xulosa).
  • Qolgan o'rtadagi slaydlar — asosiy mazmun.
- Slayd budjeti: foydalanuvchi N ta so'rasa, N ning ichiga title + agenda + conclusion + references KIRADI; demak o'rtadagi mazmun slaydlari = N - 4.
- O'rtadagi slaydlarda layoutlarni XILMA-XIL tanla — bir xil layoutni ketma-ket takrorlama. Kamida 6 xil layout ishlatishga harakat qil.
- Aniq foydalanuvchi so'ragan SLAYD SONIga rioya qil.
- O'zbek tilida yoz (agar mavzu boshqa tilda bo'lsa, o'sha tilda).
- Raqamlar/statistikalar realistik bo'lsin. To'qima aniq faktlar o'rniga umumiy yoki taxminiy ko'rsatkichlardan foydalan.
- Faqat JSON qaytar.

KONTENT HAJMI (juda muhim — dizaynga mukammal sig'ishi uchun shu me'yorlarga AMAL QIL):
- Har bir kartochka tavsifi (desc): KAMIDA 8 so'z, ko'pi 16 so'z (to'liq 1 jumla). Hech qachon 20 so'zdan oshmasin va hech qachon 8 so'zdan kam bo'lmasin.
- Kartochka sarlavhasi (title): 2–4 so'z.
- Kirish matni (intro): to'liq 1–2 jumla (20–35 so'z). Bo'sh yoki yarim jumla qoldirma.
- Slayd sarlavhasi: 3–6 so'z.
- statistika qiymati (stat.value, metrics.value, chart cards value): qisqa — raqam yoki "308 → 3.4" kabi.
- Element SONI bo'yicha (ANIQ shu sonlarga rioya qil, kamaytirma):
  • objectives.items: ANIQ 4 ta
  • feature-grid.items: ANIQ 4 ta
  • steps.items: 5 yoki 6 ta
  • layers.items: ANIQ 3 ta
  • metrics.stats: ANIQ 4 ta
  • split-list.items: 6 yoki 7 ta
  • dual-column.left va right: har birida ANIQ 5 ta
  • stat-callout.items: ANIQ 3 ta
  • conclusion.items: 4 yoki 5 ta
  • references.items: 8–12 ta
  • chart.cards: aniq 4 ta; chart.labels/values: 4 yoki 5 ta

KAFOLAT (eng muhim qoida): Mavzu qisqa yoki tor bo'lsa ham, HECH QACHON kam yoki bo'sh kontent qaytarma. Har bir slayd to'liq to'ldirilgan bo'lishi SHART:
- Agar mavzu bo'yicha to'g'ridan-to'g'ri ma'lumot kam bo'lsa, mavzuni kengaytir: tarix, turlari, afzalliklari, kamchiliklari, qo'llanilishi, kelajagi, misollar, taqqoslash, statistika kabi yondosh jihatlardan foydalanib har bir kartochkani mazmunli to'ldir.
- Bir-ikki so'zli yoki yarim jumlali tavsiflardan QAT'IY saqlan. Har bir desc to'liq, ma'noli jumla bo'lsin.
- Slaydlarni ataylab kam element bilan qoldirma — yuqoridagi element sonlariga to'liq yet.
- O'zbek tilida yoz (agar mavzu boshqa tilda bo'lsa, o'sha tilda).
- Raqamlar/statistikalar realistik bo'lsin.

YAKUNIY TEKSHIRUV (JSON qaytarishdan oldin o'zingni tekshir): har bir slaydda elementlar soni yetarlimi? Har bir desc kamida 8 so'zmi? Bo'sh yoki yarim qolgan maydon yo'qmi? Agar bo'lsa — to'ldir. Faqat shundan keyin JSON qaytar.

- Faqat JSON qaytar (izoh, markdown, backtick YO'Q).`;
}

function buildUserPrompt({ topic, slides, extra, sourceContent, studentName, studentGroup }) {
  let p = `Mavzu: "${topic}"\nSlaydlar soni: ${slides}`;
  if (studentName) p += `\nTalaba: ${studentName}`;
  if (studentGroup) p += `\nGuruh: ${studentGroup}`;
  if (extra) p += `\nQo'shimcha talablar: ${extra}`;
  if (studentName || studentGroup) {
    p += `\n\nMuhim: titul slaydning meta maydonida talaba va guruh ma'lumotlari bo'lsin:\n  meta: [{"label":"Bajardi:","value":"${studentName||'F.I.Sh.'}"},{"label":"Guruh:","value":"${studentGroup||'—'}"}]`;
  }
  if (sourceContent && sourceContent.trim()) {
    const trimmed = sourceContent.length > 12000 ? sourceContent.slice(0, 12000) : sourceContent;
    p += `\n\nFoydalanuvchi quyidagi MANBA MATNINI berdi. Slaydlar AYNAN shu manba mazmuniga asoslansin — uni tahlil qilib, eng muhim fikrlarni slaydlarga ajrat, struktura ber va qisqartir. O'zingdan mavzuga aloqasiz ma'lumot qo'shma:\n--- MANBA BOSHLANISHI ---\n${trimmed}\n--- MANBA TUGASHI ---`;
  }
  p += `\n\nShu mavzu bo'yicha aniq ${slides} ta slaydli professional taqdimot kontentini yuqoridagi JSON strukturada qaytar.`;
  return p;
}

// LLM matnli javobini JSON spec'ga aylantirish
function parseSpec(text) {
  const clean = (text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }
    throw new Error("LLM javobini JSON sifatida o'qib bo'lmadi: " + clean.slice(0, 300));
  }
}

module.exports = {
  // Yangi 2-fazali promptlar
  buildOutlineSystemPrompt,
  buildOutlineUserPrompt,
  parseOutline,
  buildSlideContentSystemPrompt,
  buildSlideContentUserPrompt,
  parseSlideContent,
  CONTENT_LAYOUTS,
  // Eski 1-fazali promptlar (saqlangan)
  buildSystemPrompt,
  buildUserPrompt,
  parseSpec,
};
