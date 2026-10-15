// src/mustaqil/builder.js
// Mustaqil ish JSON spec в†’ GOST formatli .docx
// Format: rasmlar asosida qayta ishlangan (2-sahifa: REJA, bob yo'q,
// har bo'lim yangi sahifadan, barcha matn qora)

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun,
  Table, TableRow, TableCell, AlignmentType, PageBreak,
  Header, Footer, PageNumber, convertMillimetersToTwip,
  WidthType, BorderStyle, TableLayoutType, VerticalAlign,
  NumberFormat, SectionType, UnderlineType,
} = require("docx");

const mm = (n) => Math.round(n * 56.692);

const FONT = "Times New Roman";
const FONT_SIZE = 28;        // 14pt
const SMALL_SIZE = 24;       // 12pt (muqova uchun)
const LINE_SPACING = { line: 360, lineRule: "auto" };  // 1.5
const INDENT = mm(12.5);     // 1.25 sm
const BLACK = "000000";

// в”Ђв”Ђв”Ђ inline LaTeX tozalash (sarlavha/izoh uchun вЂ” matn qaytaradi) в”Ђв”Ђ
function cleanInlineLatex(text) {
  if (!text) return "";
  let t = String(text);
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$([^$]+?)\$/g, (_, m) => latexToUnicode(m));
  if (/\\[a-zA-Z]+|[_^]\{/.test(t)) t = latexToUnicode(t);
  // Qolgan X_n в†’ Xв‚Ѓ, X_word в†’ Xword (sarlavha uchun yetarli)
  const subMap = {'0':'в‚Ђ','1':'в‚Ѓ','2':'в‚‚','3':'в‚ѓ','4':'в‚„','5':'в‚…','6':'в‚†','7':'в‚‡','8':'в‚€','9':'в‚‰'};
  t = t.replace(/([A-Za-z])_([0-9])/g, (_, b, d) => b + (subMap[d] || d));
  t = t.replace(/([A-Za-z])_([a-zA-Z][a-zA-Z0-9]*)/g, '$1$2');
  return t;
}

// в”Ђв”Ђв”Ђ paragraf uchun: TextRun[] qaytaradi, X_sub в†’ haqiqiy Word subscript в”Ђв”Ђ
function parseTextRuns(rawText) {
  if (!rawText) return [new TextRun({ text: "", font: FONT, size: FONT_SIZE, color: BLACK })];
  let t = String(rawText);

  // 1) LaTeX delimiter'lar в†’ latexToUnicode
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$([^$]+?)\$/g, (_, m) => latexToUnicode(m));
  if (/\\[a-zA-Z]+/.test(t)) t = latexToUnicode(t);

  // 2) X_sub, X_{sub}, X^sup, X^{sup} в†’ Word TextRun with subScript/superScript
  const runs = [];
  // Pattern: base harf + subscript yoki superscript
  const re = /([A-Za-z])(?:_\{([^}]{1,20})\}|_([a-zA-Z][a-zA-Z0-9]{0,15}|[0-9]{1,3})|\^\{([^}]{1,20})\}|\^([a-zA-Z0-9]{1,10}))/g;
  let last = 0, m;
  while ((m = re.exec(t)) !== null) {
    // Mos kelishidan oldingi oddiy matn
    if (m.index > last) {
      runs.push(new TextRun({ text: t.slice(last, m.index), font: FONT, size: FONT_SIZE, color: BLACK }));
    }
    // Asosiy harf
    runs.push(new TextRun({ text: m[1], font: FONT, size: FONT_SIZE, color: BLACK }));
    const sub = m[2] != null ? m[2] : m[3]; // _{ } yoki _x
    const sup = m[4] != null ? m[4] : m[5]; // ^{ } yoki ^x
    if (sub != null) {
      runs.push(new TextRun({ text: sub, font: FONT, size: FONT_SIZE, subScript: true, color: BLACK }));
    } else if (sup != null) {
      runs.push(new TextRun({ text: sup, font: FONT, size: FONT_SIZE, superScript: true, color: BLACK }));
    }
    last = m.index + m[0].length;
  }
  // Qolgan matn
  if (last < t.length) {
    runs.push(new TextRun({ text: t.slice(last), font: FONT, size: FONT_SIZE, color: BLACK }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text: t, font: FONT, size: FONT_SIZE, color: BLACK })];
}

function latexToUnicode(s) {
  let t = String(s);
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, "в€љ($1)");
  t = t.replace(/\\times/g,"Г—").replace(/\\cdot/g,"В·").replace(/\\div/g,"Г·");
  t = t.replace(/\\pm/g,"В±").replace(/\\leq/g,"в‰¤").replace(/\\geq/g,"в‰Ґ")
       .replace(/\\neq/g,"в‰ ").replace(/\\approx/g,"в‰€").replace(/\\infty/g,"в€ћ");
  t = t.replace(/\\sum/g,"ОЈ").replace(/\\prod/g,"в€Џ").replace(/\\int/g,"в€«")
       .replace(/\\partial/g,"в€‚").replace(/\\nabla/g,"в€‡");
  const greek = { alpha:"О±",beta:"ОІ",gamma:"Оі",delta:"Оґ",epsilon:"Оµ",theta:"Оё",
    lambda:"О»",mu:"Ој",pi:"ПЂ",rho:"ПЃ",sigma:"Пѓ",tau:"П„",phi:"П†",omega:"П‰",
    Delta:"О”",Sigma:"ОЈ",Omega:"О©",Pi:"О ",Gamma:"О“",Theta:"О",Lambda:"О›",Phi:"О¦" };
  Object.keys(greek).forEach((k) => { t = t.replace(new RegExp("\\\\"+k+"\\b","g"), greek[k]); });
  const sub = {"0":"в‚Ђ","1":"в‚Ѓ","2":"в‚‚","3":"в‚ѓ","4":"в‚„","5":"в‚…","6":"в‚†","7":"в‚‡","8":"в‚€","9":"в‚‰","+":"в‚Љ","-":"в‚‹","n":"в‚™","i":"бµў","a":"в‚ђ","x":"в‚“"};
  const sup = {"0":"вЃ°","1":"В№","2":"ВІ","3":"Ві","4":"вЃґ","5":"вЃµ","6":"вЃ¶","7":"вЃ·","8":"вЃё","9":"вЃ№","+":"вЃє","-":"вЃ»","n":"вЃї","i":"вЃ±"};
  t = t.replace(/_\{([^{}]+)\}/g,(_,m)=>m.split("").map(c=>sub[c]||c).join(""));
  t = t.replace(/_([a-zA-Z0-9])/g,(_,c)=>sub[c]||("_"+c));
  t = t.replace(/\^\{([^{}]+)\}/g,(_,m)=>m.split("").map(c=>sup[c]||c).join(""));
  t = t.replace(/\^([a-zA-Z0-9])/g,(_,c)=>sup[c]||("^"+c));
  t = t.replace(/[{}]/g,"").replace(/\\([a-zA-Z]+)/g,"$1").replace(/\\/g,"");
  return t.replace(/\s+/g," ").trim();
}

// "1-bob." kabi prefikslarni olib tashlash
function stripBob(title) {
  return String(title || "").replace(/^\d+[\s-]*bob[\s.]*[-.\s]*/i, "").trim();
}

// в”Ђв”Ђв”Ђ paragraph helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function run(text, opts = {}) {
  return new TextRun({ text: cleanInlineLatex(String(text)), font: FONT,
    size: opts.size || FONT_SIZE, bold: opts.bold || false,
    italics: opts.italic || false, color: BLACK, ...opts.extra });
}

function para(text, opts = {}) {
  // parseTextRuns ishlatiladi: X_sub в†’ Word subscript, X^sup в†’ superscript
  const runs = parseTextRuns(String(text || ""));
  // bold/italic opts qo'llash kerak bo'lsa вЂ” barcha runlarga qo'shamiz
  if (opts.bold || opts.italic) {
    runs.forEach(r => { if (opts.bold) r.bold = true; if (opts.italic) r.italics = true; });
  }
  return new Paragraph({
    children: runs,
    spacing: LINE_SPACING,
    alignment: opts.align || AlignmentType.JUSTIFIED,
    indent: opts.noIndent ? undefined : { firstLine: INDENT },
  });
}

function centeredPara(text, opts = {}) {
  return new Paragraph({
    children: [run(text, { ...opts })],
    spacing: opts.spacing || LINE_SPACING,
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

function emptyLine(lines = 1) {
  const arr = [];
  for (let i = 0; i < lines; i++) {
    arr.push(new Paragraph({ children: [new TextRun("")], spacing: { line: 240 } }));
  }
  return arr;
}

function pageBreakPara() {
  return new Paragraph({ children: [new PageBreak()], spacing: { line: 240 } });
}

function heading1(text) {
  return new Paragraph({
    children: [new TextRun({ text: stripBob(text).toUpperCase(), font: FONT, size: FONT_SIZE, bold: true, color: BLACK })],
    spacing: { ...LINE_SPACING, before: mm(4), after: mm(2) },
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

function heading2(text) {
  return new Paragraph({
    children: [new TextRun({ text: stripBob(text), font: FONT, size: FONT_SIZE, bold: true, color: BLACK })],
    spacing: { ...LINE_SPACING, before: mm(3), after: mm(2) },
    alignment: AlignmentType.LEFT,
    indent: { firstLine: INDENT },
  });
}

function captionPara(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SMALL_SIZE, italics: true, color: BLACK })],
    spacing: { line: 240, before: mm(1), after: mm(2) },
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

// в”Ђв”Ђв”Ђ rasm bloki в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function imageBlock(media, caption) {
  const buf = media.buf || media;
  const w = media.width || 440;
  const h = media.height || 200;
  const nodes = [];
  nodes.push(new Paragraph({
    children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: "png" })],
    spacing: { before: mm(3), after: mm(1) },
    alignment: AlignmentType.CENTER,
    indent: undefined,
  }));
  if (caption) nodes.push(captionPara(caption));
  return nodes;
}

// в”Ђв”Ђв”Ђ jadval bloki в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function tableBlock(data, caption) {
  const headers = Array.isArray(data.headers) ? data.headers : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];
  // Jadval bo'sh bo'lsa вЂ” umuman chiqarmaymiz
  if (headers.length === 0 && rows.length === 0) return [];
  const nodes = [];
  if (caption) nodes.push(captionPara(caption));
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: FONT, size: FONT_SIZE, bold: true, color: BLACK })],
        alignment: AlignmentType.CENTER, spacing: { line: 240 }, indent: undefined,
      })],
      shading: { fill: "EAF2F6" }, verticalAlign: VerticalAlign.CENTER,
      margins: { top: mm(1.5), bottom: mm(1.5), left: mm(2), right: mm(2) },
    })),
  });
  const dataRows = rows.filter(row => Array.isArray(row)).map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: cell == null ? "" : String(cell), font: FONT, size: FONT_SIZE, color: BLACK })],
        spacing: { line: 240 }, indent: undefined,
      })],
      margins: { top: mm(1.5), bottom: mm(1.5), left: mm(2), right: mm(2) },
    })),
  }));
  nodes.push(new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top:     { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      bottom:  { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      left:    { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      right:   { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      insideH: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      insideV: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
    },
  }));
  return nodes;
}

// в”Ђв”Ђв”Ђ MUQOVA SAHIFASI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// A4 kontent maydoni: 257mm balandlik
// Bloklar: Vazirlik(top) в†’ Org chiziqlar в†’ [bo'shliq] в†’
//          MUSTAQIL ISH(markazga) в†’ Mavzu 18pt в†’ Talaba(o'ng) в†’ [bo'shliq] в†’ Shahar chiziq(pastda)
function buildCoverPage(meta) {
  const year  = String(new Date().getFullYear());
  const UL28  = "_____________________________";   // 29 belgi в‰€ 65mm (org chiziqlari uchun)
  const UL22  = "_____________________";            // 22 belgi в‰€ 50mm (shahar uchun)
  const SZ14  = FONT_SIZE;                          // 14pt
  const SZ18  = 36;                                 // 18pt = 36 half-point

  // Qator yordamchi: font, o'lcham, qalinlik, rang
  const r = (text, bold = false, size = SZ14) =>
    new TextRun({ text, font: FONT, size, bold, color: BLACK });

  // Markazlangan paragraf
  const cp = (children, spacingOpts = {}) => new Paragraph({
    children,
    alignment: AlignmentType.CENTER,
    indent: undefined,
    spacing: { line: 280, ...spacingOpts },
  });

  // O'ng tomonlama paragraf
  const rp = (children) => new Paragraph({
    children,
    alignment: AlignmentType.RIGHT,
    indent: undefined,
    spacing: { line: 320 },
  });

  // Chiziq + label (markazda): "_____________ UNIVERSITETI"
  const ulLine = (label) => cp([
    r(UL28 + "  "),
    r(label, true, SZ14),
  ]);

  return [
    // в”Ђв”Ђ 1. VAZIRLIK (yuqorida, 14pt qalin) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    cp([r("O'ZBEKISTON RESPUBLIKASI OLIY TA'LIM, FAN VA", true)],
      { before: mm(8) }),
    cp([r("INNOVATSIYALAR VAZIRLIGI", true)], { after: mm(10) }),

    // в”Ђв”Ђ 2. TASHKILOT CHIZIQLARI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    ulLine("UNIVERSITETI"),
    ulLine("FAKULTETI"),
    ulLine("KAFEDRASI"),

    // в”Ђв”Ђ 3. MUSTAQIL ISH вЂ” sahifa markazida (before = katta) в”Ђв”Ђ
    // Yuqori blok в‰€ 55mm в†’ MUSTAQIL ISH в‰€ 120mm dan boshlaydi (markazga yaqin)
    cp([r("MUSTAQIL ISH", true, 36)], { before: mm(44), after: mm(14) }),

    // в”Ђв”Ђ 4. MAVZU вЂ” 18pt в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    cp([r("Mavzu:", false, SZ18)], { before: mm(0) }),
    cp([r('"' + (meta.title || "") + '"', true, SZ18)],
      { before: mm(4), after: mm(18) }),

    // в”Ђв”Ђ 5. TALABA MA'LUMOTLARI (o'ng tomondan) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    rp([r("Bajardi:  "), r(meta.student_name || "____________________", true)]),
    rp([r("Guruh:    "), r(meta.student_group || "____________________", true)]),
    rp([r("Tekshirdi:"), r("  " + (meta.supervisor || "____________________"), true)]),

    // в”Ђв”Ђ 6. SHAHAR + YIL вЂ” sahifa pastida в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    // before = katta qiymat в†’ yil sahifa pastiga siqadi
    // pageBreakPara yo'q вЂ” section2 NEXT_PAGE o'zi sahifa almashtiradi
    cp([r(UL22 + " вЂ” " + year)], { before: mm(70) }),
  ];
}

// в”Ђв”Ђв”Ђ REJA SAHIFASI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// 2-sahifa: "Mavzu: ..." + "REJA" + raqamlangan bo'limlar ro'yxati
function buildReja(chapters, meta) {
  const nodes = [];
  // Mavzu takrorlanadi
  nodes.push(new Paragraph({
    children: [new TextRun({ text: `Mavzu: ${meta.title || ""}`, font: FONT, size: FONT_SIZE, bold: true, color: BLACK })],
    alignment: AlignmentType.CENTER, spacing: { line: 280, after: mm(4) }, indent: undefined,
  }));
  // REJA sarlavhasi
  nodes.push(new Paragraph({
    children: [new TextRun({ text: "REJA", font: FONT, size: FONT_SIZE, bold: true, color: BLACK })],
    alignment: AlignmentType.CENTER, spacing: { line: 280, after: mm(4) }, indent: undefined,
  }));

  // Bo'limlar ro'yxatini shakllantirish
  // Tartib (aynan namuna): Kirish (raqamsiz) -> 1..N asosiy boblar -> Xulosa (raqamsiz) -> Foydalanilgan adabiyotlar (raqamsiz)
  const list = [];
  let mainNum = 1;
  chapters.forEach((ch) => {
    const title = stripBob(ch.title || "");
    if (ch.id === "intro") {
      list.push({ num: "", text: title || "Kirish", level: 1 });
    } else if (ch.id === "conclusion") {
      list.push({ num: "", text: title || "Xulosa", level: 1 });
    } else {
      // faqat asosiy boblar raqamlanadi — ichki 1.1/1.2 bandlar Rejada KO'RINMAYDI (matnda qoladi)
      list.push({ num: String(mainNum++), text: title, level: 1 });
    }
  });
  list.push({ num: "", text: "Foydalanilgan adabiyotlar", level: 1 });

  list.forEach((item) => {
    nodes.push(new Paragraph({
      children: [new TextRun({
        text: item.num ? `${item.num}. ${item.text}` : item.text,
        font: FONT, size: FONT_SIZE, color: BLACK,
        bold: item.level === 1,
      })],
      spacing: { line: 300 },
      indent: item.level === 2 ? { left: mm(10) } : undefined,
    }));
  });

  nodes.push(pageBreakPara());
  return nodes;
}

// в”Ђв”Ђв”Ђ BOB KONTENTI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function buildChapterContent(chapter, pngCache, isFirst) {
  const nodes = [];
  // Har bir bo'lim (kirish, xulosa, asosiy) yangi sahifadan boshlanadi
  // isFirst = true bo'lsa вЂ” REJA'dan keyin birinchi bo'lim, pageBreak allaqachon bor
  if (!isFirst) nodes.push(pageBreakPara());

  // Sarlavha
  const title = stripBob(chapter.title || "");
  if (chapter.level === 1) nodes.push(heading1(title));
  else nodes.push(heading2(title));

  (chapter.content || []).forEach((item) => {
    if (!item || !item.type) return;
    switch (item.type) {
      case "paragraph":
        if (item.text != null && String(item.text).trim()) nodes.push(para(String(item.text).trim()));
        break;
      case "heading":
        nodes.push(item.level === 2 ? heading2(item.text || "") : heading1(item.text || ""));
        break;
      case "formula": {
        const media = pngCache && pngCache.get("f_" + item.number);
        if (media) {
          nodes.push(...imageBlock(media,
            `(${item.number || ""}-formula. ${item.caption || item.display_text || ""})`));
        } else {
          nodes.push(new Paragraph({
            children: [new TextRun({ text: item.display_text || item.latex || "", font: FONT, size: FONT_SIZE, italics: true, color: BLACK })],
            spacing: { ...LINE_SPACING, before: mm(3), after: mm(3) },
            alignment: AlignmentType.CENTER, indent: undefined,
          }));
          if (item.caption) nodes.push(captionPara(`(${item.number||""})-formula. ${item.caption}`));
        }
        break;
      }
      case "chart": {
        const media = pngCache && pngCache.get("c_" + item.number);
        if (media) {
          nodes.push(...imageBlock(media, item.caption || `${item.number||""}-rasm. ${item.title||""}`));
        } else {
          // Render qilinmagan bo'lsa вЂ” ma'lumotni matn ko'rinishida ko'rsatamiz,
          // hech bo'lmaganda grafik ma'lumoti hujjatda yo'qolmaydi
          console.warn(`[mustaqil] chart #${item.number} render qilinmagan вЂ” matn ko'rinishida chiqariladi`);
          const labels = Array.isArray(item.labels) ? item.labels : [];
          const values = Array.isArray(item.values) ? item.values : [];
          const dataStr = labels.map((l, i) => `${l}: ${values[i] != null ? values[i] : "?"}`).join("; ");
          nodes.push(captionPara(item.caption || `${item.number||""}-rasm. ${item.title||""}`));
          nodes.push(new Paragraph({
            children: [new TextRun({ text: `[Grafik: ${item.title || ""} вЂ” ${dataStr}]`, font: FONT, size: FONT_SIZE, italics: true, color: BLACK })],
            spacing: { ...LINE_SPACING, before: mm(2), after: mm(2) },
            alignment: AlignmentType.CENTER, indent: undefined,
          }));
        }
        break;
      }
      case "table":
        nodes.push(...tableBlock(item, item.caption || `${item.number||""}-jadval. ${item.title||""}`));
        break;
    }
  });
  return nodes;
}

// в”Ђв”Ђв”Ђ ADABIYOTLAR RO'YXATI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function buildReferences(refs = []) {
  const nodes = [
    pageBreakPara(),
    heading1("FOYDALANILGAN ADABIYOTLAR RO'YXATI"),
    ...emptyLine(1),
  ];
  refs.forEach((ref, i) => {
    nodes.push(new Paragraph({
      children: [
        new TextRun({ text: `${i + 1}. `, font: FONT, size: FONT_SIZE, bold: true, color: BLACK }),
        new TextRun({ text: cleanInlineLatex(ref), font: FONT, size: FONT_SIZE, color: BLACK }),
      ],
      alignment: AlignmentType.JUSTIFIED,
      spacing: { ...LINE_SPACING, before: mm(1) },
      indent: { left: mm(10), hanging: mm(10) },
    }));
  });
  return nodes;
}

// в”Ђв”Ђв”Ђ ASOSIY BUILDER в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function buildDocument(fullSpec, pngCache) {
  const { meta, chapters = [], references = [] } = fullSpec;

  // Joriy yilni majburiy o'rnatish (LLM eski yil yozishi mumkin)
  if (meta) meta.year = String(new Date().getFullYear());

  const coverNodes = buildCoverPage(meta);
  const rejaNodes  = buildReja(chapters, meta);

  const contentNodes = [];
  chapters.forEach((ch, i) => {
    // Birinchi bo'lim REJA'dan keyin keladi вЂ” pageBreak allaqachon REJA oxirida bor
    const chNodes = buildChapterContent(ch, pngCache, i === 0);
    contentNodes.push(...chNodes);
  });

  const refNodes = buildReferences(references);

  const footerPara = new Paragraph({
    children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24, color: BLACK })],
    alignment: AlignmentType.CENTER, indent: undefined,
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run:       { font: FONT, size: FONT_SIZE, color: BLACK },
          paragraph: { spacing: LINE_SPACING },
        },
      },
    },
    sections: [
      // 1-sahifa: Muqova вЂ” raqamsiz
      {
        properties: {
          page: {
            margin: { left: mm(30), right: mm(15), top: mm(20), bottom: mm(20) },
          },
        },
        footers: { default: new Footer({ children: [] }) },
        children: coverNodes,
      },
      // 2+ sahifa: REJA + kontent вЂ” raqamlash 2-dan
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            margin: { left: mm(30), right: mm(15), top: mm(20), bottom: mm(20) },
            pageNumbers: { start: 2, formatType: NumberFormat.DECIMAL },
          },
        },
        footers: { default: new Footer({ children: [footerPara] }) },
        children: [...rejaNodes, ...contentNodes, ...refNodes],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocument };
