const FLOWCHART_KINDS = new Set(["start", "end", "process", "decision", "input", "output"]);
const FLOWCHART_MIN_NODES = 4;
const FLOWCHART_MAX_NODES = 12;
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const UZBEK_TRANSLATIONS = [
  ["transfer funksiyani", "uzatish funksiyasini"],
  ["transfer function", "uzatish funksiyasi"],
  ["transfer funksiya", "uzatish funksiyasi"],
  ["overshootni", "ortiqcha o‘tishni"],
  ["overshoot", "ortiqcha o‘tish"],
  ["domenida", "sohasida"],
  ["dizaynni", "loyihani"],
  ["design", "loyiha"],
  ["dizayn", "loyiha"],
  ["transfer", "uzatish"],
  ["domen", "soha"],
  ["frequency-domain", "chastota sohasi"],
  ["time-domain", "vaqt sohasi"],
  ["time domain", "vaqt sohasi"],
  ["anti-windupni", "integral yig'ilishdan himoya vositasini"],
  ["antiwindupni", "integral yig'ilishdan himoya vositasini"],
  ["anti-windup", "integral yig'ilishdan himoya vositasi"],
  ["antiwindup", "integral yig'ilishdan himoya vositasi"],
  ["vaqt-domain", "vaqt sohasi"],
  ["domain", "soha"],
  ["response", "javob"],
  ["closed-loop control system", "yopiq konturli boshqaruv tizimi"],
  ["feedback control system", "teskari aloqali boshqaruv tizimi"],
  ["control signal", "boshqaruv signali"],
  ["set point", "topshiriq qiymati"],
  ["setpoint", "topshiriq qiymati"],
  ["measurement", "o'lchov"],
  ["controller", "rostlagich"],
  ["kontroller", "rostlagich"],
  ["actuator", "ijro mexanizmi"],
  ["feedback", "teskari aloqa"],
  ["reference", "topshiriq"],
  ["sensor", "datchik"],
  ["decision", "qaror"],
  ["process", "jarayon"],
  ["algorithm", "algoritm"],
  ["flowchart", "oqim sxemasi"],
  ["calculate", "hisoblash"],
  ["compute", "hisoblash"],
  ["compare", "taqqoslash"],
  ["measure", "o'lchash"],
  ["control", "boshqaruv"],
  ["signal", "signal"],
  ["system", "tizim"],
  ["output", "chiqish"],
  ["input", "kirish"],
  ["unstable", "beqaror"],
  ["stable", "barqaror"],
  ["adjust", "sozlash"],
  ["evaluate", "baholash"],
  ["continue", "davom etish"],
  ["increase", "oshirish"],
  ["decrease", "kamaytirish"],
  ["threshold", "chegara qiymati"],
  ["restart", "qayta boshlash"],
  ["reset", "qayta o'rnatish"],
  ["desired", "berilgan"],
  ["actual", "haqiqiy"],
  ["target", "maqsad"],
  ["plant", "boshqaruv obyekti"],
  ["result", "natija"],
  ["value", "qiymat"],
  ["check", "tekshirish"],
  ["return", "qaytish"],
  ["repeat", "takrorlash"],
  ["output", "chiqish"],
  ["start", "Boshlash"],
  ["begin", "Boshlash"],
  ["finish", "Yakunlash"],
  ["end", "Yakunlash"],
  ["stop", "To'xtatish"],
  ["yes", "Ha"],
  ["no", "Yo'q"],
  ["true", "Rost"],
  ["false", "Yolg'on"],
  ["if", "agar"],
  ["then", "unda"],
  ["else", "aks holda"],
  ["step", "bosqich"],
  ["time", "vaqt"],
  ["loop", "kontur"],
  ["function", "funksiya"],
  ["open", "ochiq"],
  ["closed", "yopiq"],
  ["wait", "kutish"],
  ["error", "xatolik"],
];
const UZBEK_ENGLISH_WORDS = [...new Set(UZBEK_TRANSLATIONS.map(([word]) => word.split(/\s+/)).flat())].filter(word => word !== "signal");

function isUzbek(language) {
  return /^(?:uz\b|uzbek\b|o['’]zbek\b)/i.test(String(language || "").trim());
}
function isRussian(language) {
  return /^(?:ru\b|rus\b|рус)/i.test(String(language || "").trim());
}

function localizeUzbekText(value, language) {
  if (!isUzbek(language)) return value;
  let text = value;
  for (const [english, uzbek] of [...UZBEK_TRANSLATIONS].sort((left, right) => right[0].length - left[0].length)) {
    const escaped = english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), uzbek);
  }
  const remaining = UZBEK_ENGLISH_WORDS.find(word => new RegExp(`\\b${word}\\b`, "i").test(text));
  if (remaining) throw new Error(`flowchart: yorliqda inglizcha atama qoldi (${remaining})`);
  return text;
}

function requiredUzbekTranslations(flowchart) {
  const sourceTexts = [
    flowchart?.title,
    ...(Array.isArray(flowchart?.nodes) ? flowchart.nodes.map(node => node?.label) : []),
    ...(Array.isArray(flowchart?.edges) ? flowchart.edges.map(edge => edge?.label) : []),
  ].filter(value => typeof value === "string");
  const matches = new Map();
  const translations = [...UZBEK_TRANSLATIONS].sort((left, right) => right[0].length - left[0].length);
  for (const source of sourceTexts) {
    for (const [english, uzbek] of translations) {
      const escaped = english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(source)) matches.set(english.toLocaleLowerCase(), { english, uzbek });
    }
  }
  return [...matches.values()];
}

function buildFlowchartCaption(flowchart, purpose = "", language = "o'zbek") {
  const title = String(flowchart?.title || "Oqim sxemasi").trim();
  const description = String(purpose || "jarayon bosqichlari va qarorlar ketma-ketligini ko'rsatadi").trim();
  if (isUzbek(language)) {
    const terms = requiredUzbekTranslations(flowchart)
      .map(({ english, uzbek }) => `${english} — ${uzbek}`);
    const localizedTitle = localizeUzbekText(title, language);
    const localizedDescription = localizeUzbekText(description, language);
    const glossary = terms.length ? `Atamalar: ${terms.join("; ")}. ` : "";
    return `${glossary}Izoh: ${localizedTitle} sxemada ${localizedDescription}.`;
  }
  if (isRussian(language)) return `${title}. Пояснение: ${description}.`;
  return `${title}. Explanation: ${description}.`;
}

function captionContainsUzbekEquivalent(caption, equivalent) {
  const normalize = value => String(value || "")
    .toLocaleLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
  const captionWords = normalize(caption).split(/\s+/).filter(Boolean);
  const equivalentWords = normalize(equivalent).split(/\s+/).filter(Boolean);
  return equivalentWords.length > 0 && equivalentWords.every(word => {
    const root = word.length > 5 ? word.slice(0, word.length - 2) : word;
    return captionWords.some(captionWord => captionWord.startsWith(root));
  });
}

function textField(value, field, maxLength, required = true) {
  if (value == null && !required) return "";
  if (typeof value !== "string") throw new Error(`flowchart: ${field} matn bo'lishi kerak`);
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (required && !text) throw new Error(`flowchart: ${field} bo'sh bo'lmasin`);
  if (text.length > maxLength) throw new Error(`flowchart: ${field} ${maxLength} belgidan oshmasin`);
  return text;
}

function normalizeFlowchartData(flowchart, { language = flowchart?.language } = {}) {
  if (!flowchart || typeof flowchart !== "object" || Array.isArray(flowchart)) {
    throw new Error("flowchart: ma'lumot obyekt bo'lishi kerak");
  }
  const title = textField(flowchart.title, "title", 180);
  if (!Array.isArray(flowchart.nodes) || flowchart.nodes.length < FLOWCHART_MIN_NODES || flowchart.nodes.length > FLOWCHART_MAX_NODES) {
    throw new Error(`flowchart: nodes ${FLOWCHART_MIN_NODES}–${FLOWCHART_MAX_NODES} ta bo'lishi kerak`);
  }
  if (!Array.isArray(flowchart.edges) || flowchart.edges.length < 1 || flowchart.edges.length > 28) {
    throw new Error("flowchart: edges 1–28 ta bo'lishi kerak");
  }

  const ids = new Set();
  const nodes = flowchart.nodes.map((node, index) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new Error(`flowchart: node ${index + 1} obyekt bo'lishi kerak`);
    }
    const id = textField(node.id, `node ${index + 1} id`, 32);
    if (!ID_PATTERN.test(id)) throw new Error(`flowchart: node ${index + 1} id xavfsiz formatda emas`);
    if (ids.has(id)) throw new Error(`flowchart: takrorlangan node id (${id})`);
    ids.add(id);
    const label = textField(node.label, `node ${index + 1} label`, 140);
    const kind = String(node.kind || "process").trim().toLowerCase();
    if (!FLOWCHART_KINDS.has(kind)) throw new Error(`flowchart: noma'lum node turi (${kind || "bo'sh"})`);
    return { id, label, kind };
  });

  const edges = flowchart.edges.map((edge, index) => {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      throw new Error(`flowchart: edge ${index + 1} obyekt bo'lishi kerak`);
    }
    const from = textField(edge.from, `edge ${index + 1} from`, 32);
    const to = textField(edge.to, `edge ${index + 1} to`, 32);
    if (!ids.has(from) || !ids.has(to)) throw new Error(`flowchart: edge ${index + 1} mavjud bo'lmagan nodega ulanadi`);
    const label = textField(edge.label == null ? "" : edge.label, `edge ${index + 1} label`, 64, false);
    return { from, to, label };
  });

  const totalTextLength = title.length + nodes.reduce((sum, node) => sum + node.label.length, 0)
    + edges.reduce((sum, edge) => sum + edge.label.length, 0);
  if (totalTextLength > 2400) throw new Error("flowchart: umumiy matn 2400 belgidan oshmasin");

  return { title, nodes, edges };
}

module.exports = {
  FLOWCHART_KINDS,
  FLOWCHART_MIN_NODES,
  FLOWCHART_MAX_NODES,
  normalizeFlowchartData,
  isUzbek,
  isRussian,
  localizeUzbekText,
  requiredUzbekTranslations,
  buildFlowchartCaption,
  captionContainsUzbekEquivalent,
};
