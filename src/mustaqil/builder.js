// src/mustaqil/builder.js
// Mustaqil ish JSON spec → GOST formatli .docx
// GOST talablari: TNR 14pt, 1.5 interval, A4,
// chap 30mm, o'ng 15mm, yuqori 20mm, pastki 20mm

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun,
  Table, TableRow, TableCell, AlignmentType, PageBreak,
  Header, Footer, PageNumber, convertMillimetersToTwip,
  WidthType, BorderStyle, TableLayoutType, VerticalAlign,
  NumberFormat, SectionType,
} = require("docx");

// GOST o'lchamlari twip'da (1mm = 56.692 twip)
const mm = (n) => Math.round(n * 56.692);

const FONT = "Times New Roman";
const FONT_SIZE = 28; // 14pt = 28 half-points
const LINE_SPACING = { line: 360, lineRule: "auto" }; // 1.5 = 360/240
const INDENT = mm(12.5); // 1.25 sm paragraf ichki chekkasi

// ─── helpers ───────────────────────────────────────────────
// Matn ichidagi inline LaTeX ( \(...\), \[...\], $...$ ) ni Unicode'ga aylantirish.
// Word'da xom LaTeX ko'rinmasligi uchun.
function cleanInlineLatex(text) {
  if (!text) return "";
  let t = String(text);

  // inline delimiterlarни olib tashlash, ichidagini saqlash
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$([^$]+?)\$/g, (_, m) => latexToUnicode(m));

  // agar hali ham LaTeX buyruqlari qolgan bo'lsa (delimiter'siz)
  if (/\\[a-zA-Z]+|[_^]\{/.test(t)) {
    t = latexToUnicode(t);
  }
  return t;
}

// LaTeX ifodasini Unicode matnga aylantirish (oddiy holatlar uchun)
function latexToUnicode(s) {
  let t = String(s);
  // kasr
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, "√($1)");
  t = t.replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\div/g, "÷");
  t = t.replace(/\\pm/g, "±").replace(/\\leq/g, "≤").replace(/\\geq/g, "≥")
       .replace(/\\neq/g, "≠").replace(/\\approx/g, "≈").replace(/\\infty/g, "∞");
  t = t.replace(/\\sum/g, "Σ").replace(/\\prod/g, "∏").replace(/\\int/g, "∫")
       .replace(/\\partial/g, "∂").replace(/\\nabla/g, "∇");
  // yunon harflari
  const greek = { alpha:"α", beta:"β", gamma:"γ", delta:"δ", epsilon:"ε", theta:"θ",
    lambda:"λ", mu:"μ", pi:"π", rho:"ρ", sigma:"σ", tau:"τ", phi:"φ", omega:"ω",
    Delta:"Δ", Sigma:"Σ", Omega:"Ω", Pi:"Π", Gamma:"Γ", Theta:"Θ", Lambda:"Λ", Phi:"Φ" };
  Object.keys(greek).forEach((k) => { t = t.replace(new RegExp("\\\\" + k + "\\b", "g"), greek[k]); });
  // pastki indeks _{...} yoki _x
  const subMap = { "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
    "+":"₊","-":"₋","n":"ₙ","i":"ᵢ","j":"ⱼ","a":"ₐ","x":"ₓ" };
  const supMap = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
    "+":"⁺","-":"⁻","n":"ⁿ","i":"ⁱ" };
  t = t.replace(/_\{([^{}]+)\}/g, (_, m) => m.split("").map((c) => subMap[c] || c).join(""));
  t = t.replace(/_([a-zA-Z0-9])/g, (_, c) => subMap[c] || ("_" + c));
  t = t.replace(/\^\{([^{}]+)\}/g, (_, m) => m.split("").map((c) => supMap[c] || c).join(""));
  t = t.replace(/\^([a-zA-Z0-9])/g, (_, c) => supMap[c] || ("^" + c));
  // qolgan figurali qavslar va backslashlar
  t = t.replace(/[{}]/g, "").replace(/\\([a-zA-Z]+)/g, "$1").replace(/\\/g, "");
  return t.replace(/\s+/g, " ").trim();
}

function para(text, opts = {}) {
  const runs = typeof text === "string" ? [cleanInlineLatex(text)] : text;
  const runList = runs.map((r) => {
    if (typeof r === "string") {
      return new TextRun({ text: r, font: FONT, size: FONT_SIZE, ...opts.runOpts });
    }
    return r;
  });
  return new Paragraph({
    children: runList,
    spacing: LINE_SPACING,
    alignment: opts.align || AlignmentType.JUSTIFIED,
    indent: opts.noIndent ? undefined : { firstLine: INDENT },
    ...opts.paraOpts,
  });
}

function bold(text, opts = {}) {
  return para(text, { ...opts, runOpts: { bold: true, ...opts.runOpts } });
}

function heading1(text) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: FONT_SIZE, bold: true })],
    heading: HeadingLevel.HEADING_1,
    spacing: { ...LINE_SPACING, before: mm(6), after: mm(3) },
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

function heading2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: true })],
    heading: HeadingLevel.HEADING_2,
    spacing: { ...LINE_SPACING, before: mm(4), after: mm(2) },
    alignment: AlignmentType.LEFT,
    indent: { firstLine: INDENT },
  });
}

function emptyLine() {
  return new Paragraph({ children: [new TextRun("")], spacing: { line: 240 } });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()], spacing: { line: 240 } });
}

function centeredBold(text, size) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: size || FONT_SIZE, bold: true })],
    spacing: LINE_SPACING,
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

function centered(text, size, italic) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: size || FONT_SIZE, bold: false, italics: italic })],
    spacing: LINE_SPACING,
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

function captionPara(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 24, italics: true })],
    spacing: { line: 240, before: mm(2), after: mm(2) },
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });
}

function imageBlock(media, caption) {
  // media = { buf, width, height }  yoki eski format (buffer)
  const buf = media.buf || media;
  const w = media.width || 440;
  const h = media.height || 200;
  const blocks = [];
  blocks.push(new Paragraph({
    children: [new ImageRun({
      data: buf,
      transformation: { width: w, height: h },
      type: "png",
    })],
    spacing: { before: mm(3), after: mm(1) },
    alignment: AlignmentType.CENTER,
    indent: undefined,
  }));
  if (caption) blocks.push(captionPara(caption));
  return blocks;
}

function tableBlock(data, caption) {
  const { headers = [], rows = [] } = data;
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: FONT, size: FONT_SIZE, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { line: 240 },
        indent: undefined,
      })],
      shading: { fill: "EAF2F6" },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: mm(1.5), bottom: mm(1.5), left: mm(2), right: mm(2) },
    })),
  });
  const dataRows = rows.map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(cell), font: FONT, size: FONT_SIZE })],
        spacing: { line: 240 },
        indent: undefined,
      })],
      margins: { top: mm(1.5), bottom: mm(1.5), left: mm(2), right: mm(2) },
    })),
  }));
  const blocks = [];
  if (caption) blocks.push(captionPara(caption));
  blocks.push(new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      left:   { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      right:  { style: BorderStyle.SINGLE, size: 6, color: "999999" },
      insideH:{ style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      insideV:{ style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
    },
  }));
  return blocks;
}

// ─── muqova sahifasi ────────────────────────────────────────
function buildCoverPage(meta) {
  return [
    emptyLine(), emptyLine(),
    centeredBold((meta.org || "O'QUV MUASSASASI").toUpperCase(), 26),
    emptyLine(),
    centered((meta.department || "Kafedra"), FONT_SIZE),
    emptyLine(), emptyLine(), emptyLine(),
    centeredBold(meta.type || "MUSTAQIL ISH", 32),
    emptyLine(),
    centered("Mavzu:", FONT_SIZE),
    centeredBold(`"${meta.title || ""}"`, 28),
    emptyLine(), emptyLine(), emptyLine(),
    // o'ng tomondan
    new Paragraph({
      children: [
        new TextRun({ text: "Bajardi: ", font: FONT, size: FONT_SIZE }),
        new TextRun({ text: meta.student_name || "F.I.Sh.", font: FONT, size: FONT_SIZE, bold: true }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: LINE_SPACING,
      indent: undefined,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Guruh: ", font: FONT, size: FONT_SIZE }),
        new TextRun({ text: meta.student_group || "—", font: FONT, size: FONT_SIZE, bold: true }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: LINE_SPACING,
      indent: undefined,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Tekshirdi: ", font: FONT, size: FONT_SIZE }),
        new TextRun({ text: meta.supervisor || "O'qituvchi", font: FONT, size: FONT_SIZE, bold: true }),
      ],
      alignment: AlignmentType.RIGHT,
      spacing: LINE_SPACING,
      indent: undefined,
    }),
    emptyLine(), emptyLine(), emptyLine(), emptyLine(),
    centered(`${meta.city || "Toshkent"} — ${meta.year || "2025"}`, FONT_SIZE),
    pageBreak(),
  ];
}

// ─── mundarija (manual) ─────────────────────────────────────
function buildTOC(chapters, pageOffsets) {
  const items = [
    { title: "Kirish", page: pageOffsets.intro || 3 },
  ];
  let p = (pageOffsets.intro || 3) + 1;
  chapters.forEach((ch) => {
    if (ch.id === "intro" || ch.id === "conclusion" || ch.id === "references") return;
    items.push({ title: ch.title, page: p, level: ch.level || 1 });
    p += Math.round((ch.word_target || 300) / WORDS_PER_PAGE_BUILDER) + (ch.formula_count||0) + (ch.chart_count||0);
    if (ch.sections) {
      ch.sections.forEach((s) => {
        items.push({ title: s.title, page: p, level: 2 });
        p += Math.round((s.word_target || 150) / WORDS_PER_PAGE_BUILDER);
      });
    }
  });
  items.push({ title: "Xulosa", page: p });
  items.push({ title: "Foydalanilgan adabiyotlar ro'yxati", page: p + 2 });

  const nodes = [heading1("MUNDARIJA"), emptyLine()];
  items.forEach((item) => {
    const indent = item.level === 2 ? { left: mm(10) } : undefined;
    const dots = ".".repeat(Math.max(3, 55 - (item.title||"").length - String(item.page).length));
    nodes.push(new Paragraph({
      children: [
        new TextRun({ text: (item.title || "") + " " + dots + " " + item.page, font: FONT, size: FONT_SIZE, bold: item.level !== 2 }),
      ],
      spacing: { line: 280 },
      indent,
    }));
  });
  nodes.push(pageBreak());
  return nodes;
}

const WORDS_PER_PAGE_BUILDER = 280;

// ─── bob kontentini render qilish ──────────────────────────
function buildChapterContent(chapter, pngCache) {
  const nodes = [];
  // sarlavha
  if (chapter.level === 1) nodes.push(heading1(chapter.title || ""));
  else nodes.push(heading2(chapter.title || ""));

  (chapter.content || []).forEach((item) => {
    if (!item || !item.type) return;
    switch (item.type) {
      case "paragraph":
        if (item.text && item.text.trim()) {
          nodes.push(para(item.text.trim()));
        }
        break;
      case "heading":
        nodes.push(item.level === 2 ? heading2(item.text || "") : heading1(item.text || ""));
        break;
      case "formula": {
        const key = "f_" + item.number;
        const media = pngCache && pngCache.get(key);
        if (media) {
          nodes.push(...imageBlock(media,
            item.caption ? `(${item.number || ""}-formula. ${item.caption})` : `(${item.number || ""}-formula)`));
        } else {
          // zaxira: matn sifatida
          nodes.push(new Paragraph({
            children: [new TextRun({ text: item.display_text || item.latex || "", font: FONT, size: FONT_SIZE, italics: true })],
            spacing: { ...LINE_SPACING, before: mm(3), after: mm(3) },
            alignment: AlignmentType.CENTER,
            indent: undefined,
          }));
          if (item.caption) nodes.push(captionPara(`(${item.number||""})-formula. ${item.caption}`));
        }
        break;
      }
      case "chart": {
        const key = "c_" + item.number;
        const media = pngCache && pngCache.get(key);
        if (media) {
          nodes.push(...imageBlock(media,
            item.caption || `${item.number || ""}-rasm. ${item.title || ""}`));
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

// ─── adabiyotlar ro'yxati ──────────────────────────────────
function buildReferences(refs = []) {
  const nodes = [heading1("FOYDALANILGAN ADABIYOTLAR RO'YXATI"), emptyLine()];
  refs.forEach((ref, i) => {
    nodes.push(new Paragraph({
      children: [
        new TextRun({ text: `${i + 1}. `, font: FONT, size: FONT_SIZE, bold: true }),
        new TextRun({ text: ref, font: FONT, size: FONT_SIZE }),
      ],
      spacing: { ...LINE_SPACING, before: mm(1) },
      indent: { left: mm(10), hanging: mm(10) },
    }));
  });
  return nodes;
}

// ─── asosiy builder ────────────────────────────────────────
async function buildDocument(fullSpec, pngCache) {
  const { meta, chapters = [], references = [] } = fullSpec;

  const coverNodes = buildCoverPage(meta);
  const tocNodes = buildTOC(chapters, {});

  const contentNodes = [];
  chapters.forEach((ch) => {
    const chNodes = buildChapterContent(ch, pngCache);
    contentNodes.push(...chNodes, emptyLine());
  });

  const refNodes = [pageBreak(), ...buildReferences(references)];

  const footerPara = new Paragraph({
    children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 24 })],
    alignment: AlignmentType.CENTER,
    indent: undefined,
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: FONT_SIZE },
          paragraph: { spacing: LINE_SPACING },
        },
      },
    },
    sections: [
      // Muqova — sahifa raqamsiz
      {
        properties: {
          page: {
            margin: {
              left: mm(30), right: mm(15),
              top: mm(20), bottom: mm(20),
            },
          },
          titlePage: false,
        },
        footers: { default: new Footer({ children: [] }) },
        children: coverNodes,
      },
      // Qolgan sahifalar — raqamlash 2 dan
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: {
              left: mm(30), right: mm(15),
              top: mm(20), bottom: mm(20),
            },
            pageNumbers: { start: 2, formatType: NumberFormat.DECIMAL },
          },
        },
        footers: { default: new Footer({ children: [footerPara] }) },
        children: [
          ...tocNodes,
          ...contentNodes,
          ...refNodes,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocument };
