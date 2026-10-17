// src/mustaqil/chart.js
// Grafik ma'lumotlardan SVG → sharp → PNG.
// Native dep yo'q — to'liq custom SVG renderer.

const sharp = require("sharp");

const COLORS = ["#2E8AA8","#E0A444","#1FA35A","#C44536","#73304A","#16B0A0","#5E7079","#B5513F"];

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// --- Bar chart ---
function barSVG({ labels=[], values=[], title="", unit="" }) {
  const W=600, H=360, PL=65, PR=20, PT=50, PB=70;
  const cW=W-PL-PR, cH=H-PT-PB;
  const n=labels.length||1;
  const max=Math.max(...values,1)*1.15;
  const bw=cW/n*0.6;
  const step=cW/n;
  let bars="", xLabels="";
  values.forEach((v,i)=>{
    const x=PL+i*step+step*0.2;
    const bh=(v/max)*cH;
    const y=PT+cH-bh;
    const col=COLORS[i%COLORS.length];
    bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" rx="3"/>`;
    bars+=`<text x="${(x+bw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle" font-size="11" fill="#333">${esc(String(v))}</text>`;
    const lbl=String(labels[i]||"");
    const x0=(x+bw/2).toFixed(1);
    xLabels+=lbl.length>10
      ? `<text x="${x0}" y="${(H-PB+18).toFixed(1)}" text-anchor="middle" font-size="9" fill="#555">${esc(lbl.slice(0,12))}</text><text x="${x0}" y="${(H-PB+30).toFixed(1)}" text-anchor="middle" font-size="9" fill="#555">${esc(lbl.slice(12))}</text>`
      : `<text x="${x0}" y="${(H-PB+18).toFixed(1)}" text-anchor="middle" font-size="10" fill="#555">${esc(lbl)}</text>`;
  });
  let ticks="";
  for(let i=0;i<=5;i++){
    const v=(max*i/5), y=(PT+cH-(cH*i/5)).toFixed(1);
    ticks+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#e8e8e8" stroke-width="0.8"/>`;
    ticks+=`<text x="${(PL-8).toFixed(1)}" y="${y}" dy="4" text-anchor="end" font-size="10" fill="#777">${v%1?v.toFixed(1):v.toFixed(0)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:white" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">
  <text x="${W/2}" y="28" text-anchor="middle" font-size="15" font-weight="bold" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111">${esc(title)}</text>
  ${unit?`<text x="${PL-10}" y="${PT-8}" text-anchor="middle" font-size="10" fill="#999">${esc(unit)}</text>`:""}
  <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="#999" stroke-width="1.2"/>
  <line x1="${PL}" y1="${PT+cH}" x2="${W-PR}" y2="${PT+cH}" stroke="#999" stroke-width="1.2"/>
  ${ticks}${bars}${xLabels}
</svg>`;
}

// --- Line chart ---
function lineSVG({ labels=[], values=[], title="", unit="" }) {
  const W=600, H=320, PL=65, PR=30, PT=50, PB=55;
  const cW=W-PL-PR, cH=H-PT-PB;
  const n=labels.length||1;
  const max=Math.max(...values,1)*1.15;
  const xStep=cW/(n-1||1);
  const pts=values.map((v,i)=>[(PL+i*xStep).toFixed(1),(PT+cH-(v/max)*cH).toFixed(1)]);
  const polyline=pts.map(p=>p.join(",")).join(" ");
  let dots="", xLbls="";
  pts.forEach(([x,y],i)=>{
    dots+=`<circle cx="${x}" cy="${y}" r="4" fill="${COLORS[0]}" stroke="white" stroke-width="1.5"/>`;
    dots+=`<text x="${x}" y="${(parseFloat(y)-10).toFixed(1)}" text-anchor="middle" font-size="10" fill="#333">${esc(String(values[i]))}</text>`;
    xLbls+=`<text x="${x}" y="${(H-PB+18).toFixed(1)}" text-anchor="middle" font-size="10" fill="#555">${esc(String(labels[i]||""))}</text>`;
  });
  let ticks="";
  for(let i=0;i<=4;i++){
    const v=(max*i/4), y=(PT+cH-(cH*i/4)).toFixed(1);
    ticks+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="#e8e8e8" stroke-width="0.8"/>`;
    ticks+=`<text x="${(PL-8)}" y="${y}" dy="4" text-anchor="end" font-size="10" fill="#777">${v%1?v.toFixed(1):v.toFixed(0)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:white" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">
  <text x="${W/2}" y="28" text-anchor="middle" font-size="15" font-weight="bold" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111">${esc(title)}</text>
  <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT+cH}" stroke="#999" stroke-width="1.2"/>
  <line x1="${PL}" y1="${PT+cH}" x2="${W-PR}" y2="${PT+cH}" stroke="#999" stroke-width="1.2"/>
  ${ticks}
  <polyline points="${polyline}" fill="none" stroke="${COLORS[0]}" stroke-width="2.5" stroke-linejoin="round"/>
  ${dots}${xLbls}
</svg>`;
}

// --- Pie chart ---
function pieSVG({ labels=[], values=[], title="" }) {
  const W=580, H=300, cx=180, cy=150, r=120;
  const total=values.reduce((a,b)=>a+b,0)||1;
  let angle=-Math.PI/2, slices="", legend="";
  values.forEach((v,i)=>{
    const a=(v/total)*Math.PI*2;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    const x2=cx+r*Math.cos(angle+a), y2=cy+r*Math.sin(angle+a);
    const big=a>Math.PI?1:0;
    const col=COLORS[i%COLORS.length];
    slices+=`<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r},0,${big},1,${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${col}" stroke="white" stroke-width="1.5"/>`;
    const ma=angle+a/2, lx=cx+r*0.65*Math.cos(ma), ly=cy+r*0.65*Math.sin(ma);
    const pct=((v/total)*100).toFixed(0);
    slices+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="12" fill="white" font-weight="bold">${pct}%</text>`;
    const ly2=50+i*26;
    legend+=`<rect x="320" y="${ly2-10}" width="16" height="16" fill="${col}" rx="2"/>`;
    legend+=`<text x="343" y="${ly2+2}" font-size="12" fill="#333">${esc(String(labels[i]||""))} (${pct}%)</text>`;
    angle+=a;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:white" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">
  <text x="${W/2}" y="24" text-anchor="middle" font-size="15" font-weight="bold" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" fill="#111">${esc(title)}</text>
  ${slices}${legend}
</svg>`;
}

// Universal chart renderer
async function renderChart({ chartType, labels, values, title, unit, caption }) {
  // Himoya: LLM ba'zan values/labels ni undefined yoki noto'g'ri tipda qaytaradi
  const safeValues = Array.isArray(values) ? values.map(v => Number(v) || 0) : [];
  const safeLabels = Array.isArray(labels) ? labels.map(l => String(l == null ? "" : l)) : [];
  // Bo'sh ma'lumot bilan render qilishning ma'nosi yo'q — xato qaytaramiz
  if (safeValues.length === 0) {
    throw new Error("chart: values bo'sh — render qilib bo'lmaydi");
  }

  const type = (chartType || "bar").toLowerCase();
  let svg, w, h;
  if (type === "line") { svg = lineSVG({ labels: safeLabels, values: safeValues, title: title || caption || "", unit }); w = 600; h = 320; }
  else if (type === "pie") { svg = pieSVG({ labels: safeLabels, values: safeValues, title: title || caption || "" }); w = 580; h = 300; }
  else { svg = barSVG({ labels: safeLabels, values: safeValues, title: title || caption || "", unit }); w = 600; h = 360; }

  const buf = await sharp(Buffer.from(svg))
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer();
  // docx uchun ko'rsatish o'lchami: kenglik 440px, balandlik nisbatga qarab
  const dispW = 440;
  const dispH = Math.round(dispW * h / w);
  return { buf, width: dispW, height: dispH };
}

module.exports = { renderChart };
