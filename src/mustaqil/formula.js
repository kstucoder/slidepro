// src/mustaqil/formula.js
// LaTeX formulani PNG rasmga aylantirish.
// MathJax v3 (pure JS) → SVG → sharp → PNG

const sharp = require("sharp");

let _mj = null; // singleton

async function initMathJax() {
  if (_mj) return _mj;
  const { mathjax } = require("mathjax-full/js/mathjax.js");
  const { TeX } = require("mathjax-full/js/input/tex.js");
  const { SVG } = require("mathjax-full/js/output/svg.js");
  const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
  const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages }),
    OutputJax: new SVG({ fontCache: "local" }),
  });
  _mj = { doc, adaptor };
  return _mj;
}

// LaTeX → PNG Buffer
async function renderFormula(latex, display = true) {
  try {
    const { doc, adaptor } = await initMathJax();
    const node = doc.convert(latex, { display, em: 18, ex: 9, containerWidth: 800 });
    let svg = adaptor.outerHTML(node);

    // sharp uchun to'g'ri o'lchamlar
    if (!svg.includes('xmlns=')) {
      svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    // oq fon
    svg = svg.replace("<svg", '<svg style="background:white"');

    const buf = await sharp(Buffer.from(svg))
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer();
    return buf;
  } catch (e) {
    console.error("[formula] MathJax xato:", e.message, "| latex:", latex.slice(0, 50));
    return fallbackFormula(latex);
  }
}

// Zaxira: oddiy SVG matn sifatida
async function fallbackFormula(latex) {
  // LaTeX buyruqlarini o'qiladigan matnga aylantirish
  const text = latex
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\sum/g, "Σ")
    .replace(/\\int/g, "∫")
    .replace(/\\pi/g, "π")
    .replace(/\\alpha/g, "α").replace(/\\beta/g, "β").replace(/\\gamma/g, "γ")
    .replace(/\\Delta/g, "Δ").replace(/\\delta/g, "δ")
    .replace(/\\infty/g, "∞").replace(/\\pm/g, "±").replace(/\\cdot/g, "·")
    .replace(/\^(\{[^}]+\}|[^\s}]+)/g, (_, e) => "^" + e.replace(/[{}]/g, ""))
    .replace(/_(\{[^}]+\}|[^\s}]+)/g, (_, e) => "_" + e.replace(/[{}]/g, ""))
    .replace(/[{}\\]/g, "")
    .trim();

  const W = Math.max(300, text.length * 12 + 40);
  const H = 60;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="white"/>
    <text x="${W/2}" y="${H/2+6}" text-anchor="middle" font-family="Times New Roman,serif"
          font-size="22" font-style="italic" fill="#111">${escSvg(text)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escSvg(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

module.exports = { renderFormula };
