const FLOWCHART_TEMPLATES = Object.freeze([
  {
    id: "classic_grid",
    name: "Klassik ikki qatorli sxema",
    description: "Yumaloq burchakli bloklar, mayin ko‘k-yashil to‘ldirish va tekis chiziqlar.",
    guidance: "Faqat blok shakli, rang va chiziq uslubini belgilaydi; tugun va aloqalar mazmuni mavzu hamda bobdan olinadi.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.25"', 'ranksep="0.34"', 'margin="0.05"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#F0F7FA"',
      input: 'shape=parallelogram, style="filled", fillcolor="#F5F8FC"',
      output: 'shape=parallelogram, style="filled", fillcolor="#E5F4EA"',
    },
    edgeAttrs: ['color="#457B9D"', 'penwidth=1.25', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "clean_outline",
    name: "Toza konturli ko‘rinish",
    description: "Oq fon, toza konturli kartalar va salqin ko‘k chiziqlar.",
    guidance: "Faqat shakl, rang va chiziqlar uslubi; mavzu mazmunini almashtirma yoki qo‘shimcha unsur kiritma.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.30"', 'ranksep="0.36"', 'bgcolor="white"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#FFFFFF", penwidth=1.2',
      input: 'shape=box, style="rounded,filled", fillcolor="#E8F4FF"',
      output: 'shape=box, style="rounded,filled", fillcolor="#EAF5F5"',
    },
    edgeAttrs: ['color="#355C7D"', 'penwidth=1.35', 'arrowsize=0.7', 'constraint=false'],
  },
  {
    id: "round_nodes",
    name: "Yumaloq tugunlar",
    description: "Oval tugunlar, sokin kulrang-ko‘k ranglar va ravon oralatish.",
    guidance: "Faqat oval shakl hamda vizual uslubni belgilaydi; sxema mazmuni joriy mavzuga tegishli bo‘lsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.28"', 'ranksep="0.38"', 'ordering=out'],
    nodeAttrs: {
      process: 'shape=ellipse, style="filled", fillcolor="#F7F9FC"',
      input: 'shape=ellipse, style="filled", fillcolor="#EDF4FF"',
      output: 'shape=ellipse, style="filled", fillcolor="#EAF5EA"',
    },
    edgeAttrs: ['color="#65758B"', 'penwidth=1.2', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "curved_edges",
    name: "Yumshoq egri bog‘lanishlar",
    description: "Yumaloq shakllar va nafis egri chiziqli aloqalar.",
    guidance: "Faqat egri chiziq va rang uslubi; mazmuniy bog‘lanishlar aynan mavzu hamda bobga asoslangan bo‘lsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=curved', 'nodesep="0.28"', 'ranksep="0.38"', 'overlap=false'],
    nodeAttrs: {
      process: 'shape=ellipse, style="filled", fillcolor="#EAF2F8"',
      input: 'shape=ellipse, style="filled", fillcolor="#E7F1FF"',
      output: 'shape=ellipse, style="filled", fillcolor="#D8F3DC"',
    },
    edgeAttrs: ['color="#52796F"', 'penwidth=1.35', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "minimal_boxes",
    name: "Yengil konturli bloklar",
    description: "Oq fonli, nozik konturli sodda to‘rtburchaklar.",
    guidance: "Faqat kontur, fon va chiziq qalinligi; mazmunli label va aloqalarni mavzuga qarab saqla.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=line', 'nodesep="0.28"', 'ranksep="0.34"', 'bgcolor="white"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded", color="#607D8B"',
      input: 'shape=box, style="rounded", color="#607D8B"',
      output: 'shape=box, style="rounded", color="#607D8B"',
    },
    edgeAttrs: ['color="#202020"', 'penwidth=1.1', 'arrowsize=0.65', 'constraint=false'],
  },
  {
    id: "rounded_cards",
    name: "Yumaloq burchakli kartalar",
    description: "Yirikroq yumaloq kartalar, yengil ko‘k-yashil fon va silliq kontur.",
    guidance: "Faqat karta shakli va vizual palitra; tugunlar mavzuga oid haqiqiy atama va tushunchalardan bo‘lsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.30"', 'ranksep="0.36"', 'bgcolor="#FFFFFF"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#DDEBF7"',
      input: 'shape=box, style="rounded,filled", fillcolor="#FFF2CC"',
      output: 'shape=box, style="rounded,filled", fillcolor="#E2F0D9"',
    },
    edgeAttrs: ['color="#5B6573"', 'penwidth=1.25', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "two_row_color",
    name: "Ikki qatorli rangli bloklar",
    description: "Ixcham ikki qator, yumshoq rangli bloklar va muvozanatli masofa.",
    guidance: "Faqat qator-makon va rang palitrasi; aniq besh tugun hamda aloqalar mavzu va bobga mos bo‘lsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.27"', 'ranksep="0.35"', 'bgcolor="white"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#F1F7F2"',
      input: 'shape=box, style="rounded,filled", fillcolor="#E8F1FA"',
      output: 'shape=box, style="rounded,filled", fillcolor="#E5F0E1"',
    },
    edgeAttrs: ['color="#596B5A"', 'penwidth=1.2', 'arrowsize=0.66', 'constraint=false'],
  },
  {
    id: "pastel_ovals",
    name: "Pastel oval shakllar",
    description: "Oval shakllar, pastel palitra va ochiq ikki qatorli joylashuv.",
    guidance: "Faqat oval geometriya va rang; label hamda aloqalar bobdagi mazmunni aniq ifodalasin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.30"', 'ranksep="0.36"', 'bgcolor="white"'],
    nodeAttrs: {
      process: 'shape=ellipse, style="filled", fillcolor="#F2F2F2"',
      input: 'shape=ellipse, style="filled", fillcolor="#EAF2F8"',
      output: 'shape=ellipse, style="filled", fillcolor="#E2F0D9"',
    },
    edgeAttrs: ['color="#52677A"', 'penwidth=1.3', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "wide_hexagons",
    name: "Keng olti burchakli bloklar",
    description: "Olti burchakli tugunlar, keng yorliq maydoni va sokin ko‘k-yashil palitra.",
    guidance: "Faqat olti burchak geometriyasi, kenglik va rang; tugun mazmuni mavzu va bobdan olinadi.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.32"', 'ranksep="0.38"', 'overlap=false'],
    nodeAttrs: {
      process: 'shape=hexagon, style="filled", fillcolor="#D9EAF7", width=1.45',
      input: 'shape=box, style="rounded,filled", fillcolor="#CFE2F3", width=1.45',
      output: 'shape=box, style="rounded,filled", fillcolor="#D9EAD3", width=1.45',
    },
    edgeAttrs: ['color="#6C757D"', 'penwidth=1.25', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "circle_outline",
    name: "Aniq doirali konturlar",
    description: "Dumaloq oval shakllar, ravshan ramka va to‘q ko‘kimtir chiziqlar.",
    guidance: "Faqat geometriya, kontur va rang; mazmun va mantiqiy aloqalarni mavzudan ol.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.30"', 'ranksep="0.37"', 'concentrate=false'],
    nodeAttrs: {
      process: 'shape=circle, style="filled", fillcolor="#D9EAF7", width=1.35, height=1.35',
      input: 'shape=ellipse, style="filled", fillcolor="#CFE2F3"',
      output: 'shape=ellipse, style="filled", fillcolor="#D9EAD3"',
    },
    edgeAttrs: ['color="#3D5A80"', 'penwidth=1.25', 'arrowsize=0.68', 'constraint=false'],
  },
  {
    id: "parallelogram_accent",
    name: "Parallelogram aksentlari",
    description: "Ayrim kartalarda parallelogram aksenti, qolganlarida yumaloq bloklar.",
    guidance: "Faqat ikki shaklni uyg‘unlashtirish va rang; label hamda munosabatlar haqiqiy mavzuga mos bo‘lsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.29"', 'ranksep="0.35"', 'outputorder=edgesfirst'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#DDEBF7"',
      input: 'shape=parallelogram, style="filled", fillcolor="#CFE2F3"',
      output: 'shape=parallelogram, style="filled", fillcolor="#D9EAD3"',
    },
    edgeAttrs: ['color="#4F6D7A"', 'penwidth=1.35', 'arrowsize=0.7', 'constraint=false'],
  },
  {
    id: "compact_boxes",
    name: "Kichik, yumaloq bloklar",
    description: "Kichik o‘lchamli yumaloq bloklar, tor bo‘shliqlar va ingichka strelkalar.",
    guidance: "Faqat ixcham vizual o‘lcham; besh mavzuga oid tugun hamda sodda aloqalar saqlansin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.22"', 'ranksep="0.30"', 'margin="0.04"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#F3F6FA", margin="0.10,0.05"',
      input: 'shape=box, style="rounded,filled", fillcolor="#EAF2F8", margin="0.10,0.05"',
      output: 'shape=box, style="rounded,filled", fillcolor="#E2F0D9", margin="0.10,0.05"',
    },
    edgeAttrs: ['color="#6A7785"', 'penwidth=1.05', 'arrowsize=0.62', 'constraint=false'],
  },
  {
    id: "bold_outline",
    name: "Qalin chiziqli bloklar",
    description: "Aniq ko‘rinadigan qalin kontur, to‘q chiziqlar va mayin to‘ldirish.",
    guidance: "Faqat ramka qalinligi va rang uslubi; mavzu mazmuniga yangi tugun qo‘shma.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.29"', 'ranksep="0.36"', 'bgcolor="white"'],
    nodeAttrs: {
      process: 'shape=box, style="rounded,filled", fillcolor="#DDEBF7", penwidth=1.45',
      input: 'shape=parallelogram, style="filled", fillcolor="#CFE2F3", penwidth=1.45',
      output: 'shape=parallelogram, style="filled", fillcolor="#D9EAD3", penwidth=1.8',
    },
    edgeAttrs: ['color="#3F5D45"', 'penwidth=1.5', 'arrowsize=0.72', 'constraint=false'],
  },
]);

const FLOWCHART_TEMPLATE_BY_ID = new Map(FLOWCHART_TEMPLATES.map(template => [template.id, template]));

function getFlowchartTemplate(templateId) {
  return FLOWCHART_TEMPLATE_BY_ID.get(String(templateId || "")) || FLOWCHART_TEMPLATES[0];
}

function selectFlowchartTemplates(count, random = Math.random) {
  const requested = Math.max(0, Math.floor(Number(count) || 0));
  if (requested > FLOWCHART_TEMPLATES.length) {
    throw new Error(`Bir hujjatdagi oqim sxemalari soni ${FLOWCHART_TEMPLATES.length} xil shablondan oshmasligi kerak.`);
  }
  const pool = [...FLOWCHART_TEMPLATES];
  const selected = [];
  for (let index = 0; index < requested; index++) {
    const remaining = pool.length - index;
    const sample = Number(random());
    const unit = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999999, sample)) : 0;
    const swapIndex = index + Math.floor(unit * remaining);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    selected.push(pool[index]);
  }
  return selected;
}

module.exports = {
  FLOWCHART_TEMPLATES,
  getFlowchartTemplate,
  selectFlowchartTemplates,
};
