// src/mustaqil/builder.js
// Mustaqil ish JSON spec → GOST formatli .docx
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

// ─── inline LaTeX tozalash ─────────────────────────────────
function cleanInlineLatex(text) {
  if (!text) return "";
  let t = String(text);
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => latexToUnicode(m));
  t = t.replace(/\$([^$]+?)\$/g, (_, m) => latexToUnicode(m));
  if (/\\[a-zA-Z]+|[_^]\{/.test(t)) t = latexToUnicode(t);
  return t;
}

function latexToUnicode(s) {
  let t = String(s);
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, "√($1)");
  t = t.replace(/\\times/g,"×").replace(/\\cdot/g,"·").replace(/\\div/g,"÷");
  t = t.replace(/\\pm/g,"±").replace(/\\leq/g,"≤").replace(/\\geq/g,"≥")
       .replace(/\\neq/g,"≠").replace(/\\approx/g,"≈").replace(/\\infty/g,"∞");
  t = t.replace(/\\sum/g,"Σ").replace(/\\prod/g,"∏").replace(/\\int/g,"∫")
       .replace(/\\partial/g,"∂").replace(/\\nabla/g,"∇");
  const greek = { alpha:"α",beta:"β",gamma:"γ",delta:"δ",epsilon:"ε",theta:"θ",
    lambda:"λ",mu:"μ",pi:"π",rho:"ρ",sigma:"σ",tau:"τ",phi:"φ",omega:"ω",
    Delta:"Δ",Sigma:"Σ",Omega:"Ω",Pi:"Π",Gamma:"Γ",Theta:"Θ",Lambda:"Λ",Phi:"Φ" };
  Object.keys(greek).forEach((k) => { t = t.replace(new RegExp("\\\\"+k+"\\b","g"), greek[k]); });
  const sub = {"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","+":"₊","-":"₋","n":"ₙ","i":"ᵢ","a":"ₐ","x":"ₓ"};
  const sup = {"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","+":"⁺","-":"⁻","n":"ⁿ","i":"ⁱ"};
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

// ─── paragraph helpers ─────────────────────────────────────
function run(text, opts = {}) {
  return new TextRun({ text: cleanInlineLatex(String(text)), font: FONT,
    size: opts.size || FONT_SIZE, bold: opts.bold || false,
    italics: opts.italic || false, color: BLACK, ...opts.extra });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [run(text, opts)],
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

// ─── rasm bloki ────────────────────────────────────────────
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

// ─── jadval bloki ──────────────────────────────────────────
function tableBlock(data, caption) {
  const { headers = [], rows = [] } = data;
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
  const dataRows = rows.map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: String(cell), font: FONT, size: FONT_SIZE, color: BLACK })],
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

// ─── MUQOVA SAHIFASI ────────────────────────────────────────
// Rasmlar asosida: Vazirlik → chiziqli bo'sh joylar → MUSTAQIL ISH → Mavzu (qora) → yil
function buildCoverPage(meta) {
  const year = meta.year || String(new Date().getFullYear());
  const orgLine = (text, label) => new Paragraph({
    children: [
      new TextRun({ text: text ? (text + " ") : "", font: FONT, size: SMALL_SIZE, color: BLACK }),
      new TextRun({ text: label, font: FONT, size: SMALL_SIZE, bold: true, color: BLACK }),
    ],
    alignment: AlignmentType.CENTER, spacing: { line: 280 }, indent: undefined,
  });

  return [
    ...emptyLine(2),
    // Vazirlik nomi
    new Paragraph({
      children: [new TextRun({
        text: "O'ZBEKISTON RESPUBLIKASI OLIY TA'LIM, FAN VA",
        font: FONT, size: SMALL_SIZE, bold: true, color: BLACK,
      })],
      alignment: AlignmentType.CENTER, spacing: { line: 280 }, indent: undefined,
    }),
    new Paragraph({
      children: [new TextRun({
        text: "INNOVATSIYALAR VAZIRLIGI",
        font: FONT, size: SMALL_SIZE, bold: true, color: BLACK,
      })],
      alignment: AlignmentType.CENTER, spacing: { line: 280, after: mm(4) }, indent: undefined,
    }),
    // Universiteti / Fakulteti / Kafedrasi
    orgLine(meta.org || "", "UNIVERSITETI"),
    new Paragraph({
      children: [new TextRun({
        text: "_____________________________ FAKULTETI",
        font: FONT, size: SMALL_SIZE, color: BLACK,
      })],
      alignment: AlignmentType.CENTER, spacing: { line: 280 }, indent: undefined,
    }),
    orgLine(meta.department || "", "KAFEDRASI"),
    ...emptyLine(3),
    // MUSTAQIL ISH
    new Paragraph({
      children: [new TextRun({ text: "MUSTAQIL ISH", font: FONT, size: 36, bold: true, color: BLACK })],
      alignment: AlignmentType.CENTER, spacing: { line: 280, after: mm(6) }, indent: undefined,
    }),
    ...emptyLine(2),
    // Mavzu — qora rangda
    new Paragraph({
      children: [new TextRun({ text: "Mavzu: ", font: FONT, size: FONT_SIZE, color: BLACK })],
      alignment: AlignmentType.CENTER, spacing: { line: 280 }, indent: undefined,
    }),
    new Paragraph({
      children: [new TextRun({ text: `"${meta.title || ""}"`, font: FONT, size: FONT_SIZE, bold: true, color: BLACK })],
      alignment: AlignmentType.CENTER, spacing: { line: 280 }, indent: undefined,
    }),
    ...emptyLine(2),
    // Talaba ma'lumotlari (o'ng tomondan)
    ...(meta.student_name ? [
      new Paragraph({
        children: [
          new TextRun({ text: "Bajardi: ", font: FONT, size: FONT_SIZE, color: BLACK }),
          new TextRun({ text: meta.student_name, font: FONT, size: FONT_SIZE, bold: true, color: BLACK }),
        ],
        alignment: AlignmentType.RIGHT, spacing: LINE_SPACING, indent: undefined,
      }),
    ] : []),
    ...(meta.student_group ? [
      new Paragraph({
        children: [
          new TextRun({ text: "Guruh: ", font: FONT, size: FONT_SIZE, color: BLACK }),
          new TextRun({ text: meta.student_group, font: FONT, size: FONT_SIZE, bold: true, color: BLACK }),
        ],
        alignment: AlignmentType.RIGHT, spacing: LINE_SPACING, indent: undefined,
      }),
    ] : []),
    ...(meta.supervisor ? [
      new Paragraph({
        children: [
          new TextRun({ text: "Tekshirdi: ", font: FONT, size: FONT_SIZE, color: BLACK }),
          new TextRun({ text: meta.supervisor, font: FONT, size: FONT_SIZE, bold: true, color: BLACK }),
        ],
        alignment: AlignmentType.RIGHT, spacing: LINE_SPACING, indent: undefined,
      }),
    ] : []),
    ...emptyLine(4),
    // Yil
    new Paragraph({
      children: [new TextRun({ text: `${meta.city || "Toshkent"} — ${year}`, font: FONT, size: FONT_SIZE, color: BLACK })],
      alignment: AlignmentType.CENTER, spacing: { line: 280 }, indent: undefined,
    }),
    pageBreakPara(),
  ];
}

// ─── REJA SAHIFASI ──────────────────────────────────────────
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
  // Tartib: 1. Kirish → asosiy boblar → 3. Xulosa → 4. Adabiyotlar
  const list = [];
  let mainNum = 1;
  chapters.forEach((ch) => {
    const title = stripBob(ch.title || "");
    if (ch.id === "intro") {
      list.push({ num: String(mainNum++), text: title || "Kirish", level: 1 });
    } else if (ch.id === "conclusion") {
      list.push({ num: String(mainNum++), text: title || "Xulosa", level: 1 });
    } else {
      // asosiy bo'lim
      list.push({ num: String(mainNum), text: title, level: 1 });
      // kichik bo'limlar
      if (ch.sections && ch.sections.length) {
        ch.sections.forEach((s, si) => {
          list.push({ num: `${mainNum}.${si + 1}`, text: stripBob(s.title || ""), level: 2 });
        });
      } else if (ch.content) {
        // contentdan headinglarni topamiz
        ch.content.filter(c => c.type === "heading" && c.level === 2).forEach((h, hi) => {
          list.push({ num: `${mainNum}.${hi + 1}`, text: stripBob(h.text || ""), level: 2 });
        });
      }
      mainNum++;
    }
  });
  // Adabiyotlar
  list.push({ num: String(mainNum), text: "Foydalanilgan adabiyotlar", level: 1 });

  list.forEach((item) => {
    nodes.push(new Paragraph({
      children: [new TextRun({
        text: `${item.num}. ${item.text}`,
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

// ─── BOB KONTENTI ──────────────────────────────────────────
function buildChapterContent(chapter, pngCache, isFirst) {
  const nodes = [];
  // Har bir bo'lim (kirish, xulosa, asosiy) yangi sahifadan boshlanadi
  // isFirst = true bo'lsa — REJA'dan keyin birinchi bo'lim, pageBreak allaqachon bor
  if (!isFirst) nodes.push(pageBreakPara());

  // Sarlavha
  const title = stripBob(chapter.title || "");
  if (chapter.level === 1) nodes.push(heading1(title));
  else nodes.push(heading2(title));

  (chapter.content || []).forEach((item) => {
    if (!item || !item.type) return;
    switch (item.type) {
      case "paragraph":
        if (item.text && item.text.trim()) nodes.push(para(item.text.trim()));
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
        if (media) nodes.push(...imageBlock(media, item.caption || `${item.number||""}-rasm. ${item.title||""}`));
        break;
      }
      case "table":
        nodes.push(...tableBlock(item, item.caption || `${item.number||""}-jadval. ${item.title||""}`));
        break;
    }
  });
  return nodes;
}

// ─── ADABIYOTLAR RO'YXATI ──────────────────────────────────
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
      spacing: { ...LINE_SPACING, before: mm(1) },
      indent: { left: mm(10), hanging: mm(10) },
    }));
  });
  return nodes;
}

// ─── ASOSIY BUILDER ────────────────────────────────────────
async function buildDocument(fullSpec, pngCache) {
  const { meta, chapters = [], references = [] } = fullSpec;

  // Joriy yilni majburiy o'rnatish (LLM eski yil yozishi mumkin)
  if (meta) meta.year = String(new Date().getFullYear());

  const coverNodes = buildCoverPage(meta);
  const rejaNodes  = buildReja(chapters, meta);

  const contentNodes = [];
  chapters.forEach((ch, i) => {
    // Birinchi bo'lim REJA'dan keyin keladi — pageBreak allaqachon REJA oxirida bor
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
      // 1-sahifa: Muqova — raqamsiz
      {
        properties: {
          page: {
            margin: { left: mm(30), right: mm(15), top: mm(20), bottom: mm(20) },
          },
        },
        footers: { default: new Footer({ children: [] }) },
        children: coverNodes,
      },
      // 2+ sahifa: REJA + kontent — raqamlash 2-dan
      {
        properties: {
          type: SectionType.CONTINUOUS,
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
