const FLOWCHART_TEMPLATES = Object.freeze([
  {
    id: "classic_vertical",
    name: "Klassik vertikal oqim",
    description: "Yuqoridan pastga o‘qiladigan an’anaviy jarayon diagrammasi.",
    guidance: "Jarayonni boshlanishdan yakungacha vertikal tartibda tuz; qaror tugunidan shartga mos, aniq nomlangan kamida ikki yo‘nalish chiqsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=ortho', 'nodesep="0.28"', 'ranksep="0.42"'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#E5F4EA"', end: 'shape=oval, style="filled", fillcolor="#E5F4EA"', process: 'shape=box, style="rounded,filled", fillcolor="#F0F7FA"', decision: 'shape=diamond, style="filled", fillcolor="#FFF3D6", width=2.1', input: 'shape=parallelogram, style="filled", fillcolor="#F5F8FC"', output: 'shape=parallelogram, style="filled", fillcolor="#E5F4EA"' },
    edgeAttrs: ['color="#457B9D"', 'penwidth=1.4', 'arrowsize=0.75'],
  },
  {
    id: "horizontal_pipeline",
    name: "Gorizontal jarayon lentasi",
    description: "Chapdan o‘ngga oqadigan, ketma-ket amallarni ko‘zga tashlanarli qiladigan sxema.",
    guidance: "Ma’lumotning kirishidan asosiy amallar va tekshiruvlar orqali yakuniy natijagacha chapdan o‘ngga ketadigan ketma-ketlikni tuz; zarur qaror shoxlarini qisqa edge yorliqlari bilan belgila.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=LR', 'splines=polyline', 'nodesep="0.34"', 'ranksep="0.62"'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#DCEBFA"', end: 'shape=oval, style="filled", fillcolor="#DCEBFA"', process: 'shape=box, style="filled", fillcolor="#FFFFFF"', decision: 'shape=diamond, style="filled", fillcolor="#FFF0C2", width=2.0', input: 'shape=parallelogram, style="filled", fillcolor="#E8F4FF"', output: 'shape=parallelogram, style="filled", fillcolor="#E8F4FF"' },
    edgeAttrs: ['color="#355C7D"', 'penwidth=1.6', 'arrowsize=0.8'],
  },
  {
    id: "decision_tree",
    name: "Tarmoqlangan qaror daraxti",
    description: "Qaror nuqtalarini va ulardan keladigan alohida natija yo‘llarini ta’kidlaydi.",
    guidance: "Mavzuda muhim mezon yoki tanlov bo‘lsa, uni savol ko‘rinishidagi decision tuguniga aylantir; kamida ikkita mazmunan farqli yo‘lni Ha/Yo‘q yoki mavzuga mos shartlar bilan ko‘rsat, shoxlarni imkon qadar alohida yakunlarga olib bor.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=ortho', 'nodesep="0.58"', 'ranksep="0.72"', 'ordering=out'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#E8F5E9"', end: 'shape=doublecircle, style="filled", fillcolor="#E8F5E9"', process: 'shape=box, style="rounded,filled", fillcolor="#F7F9FC"', decision: 'shape=diamond, style="filled,bold", fillcolor="#FFE5A5", color="#A66B00", width=2.5, height=1.15', input: 'shape=parallelogram, style="filled", fillcolor="#EDF4FF"', output: 'shape=parallelogram, style="filled", fillcolor="#EAF5EA"' },
    edgeAttrs: ['color="#65758B"', 'penwidth=1.25', 'arrowsize=0.8', 'minlen=2'],
  },
  {
    id: "circular_feedback",
    name: "Aylana va teskari aloqa",
    description: "Bosqichlarni markaziy aylana bo‘ylab joylashtiradi va qaytish konturini ajratadi.",
    guidance: "Jarayonda takrorlash, nazorat yoki fikr-mulohaza bo‘lsa, uni haqiqiy mazmuniy qaytish qirrasi bilan ko‘rsat; tekshiruv natijasi keyingi yoki oldingi amallarni qanday o‘zgartirishini mavzuga mos yoz.",
    layoutEngine: "circo",
    graphAttrs: ['splines=true', 'overlap=false', 'mindist="1.0"', 'sep="+12"'],
    nodeAttrs: { start: 'shape=doublecircle, style="filled", fillcolor="#D8F3DC"', end: 'shape=doublecircle, style="filled", fillcolor="#D8F3DC"', process: 'shape=ellipse, style="filled", fillcolor="#EAF2F8"', decision: 'shape=diamond, style="filled", fillcolor="#FFE8A3", width=2.0', input: 'shape=parallelogram, style="filled", fillcolor="#E7F1FF"', output: 'shape=parallelogram, style="filled", fillcolor="#E7F1FF"' },
    edgeAttrs: ['color="#52796F"', 'penwidth=1.5', 'arrowsize=0.72'],
  },
  {
    id: "minimal_text",
    name: "Minimal matnli algoritm",
    description: "Tugun ramkalarini olib tashlab, bosqichlar va strelkalarni sodda algoritmik ko‘rinishda beradi.",
    guidance: "Ixcham algoritm yoz: har bir tugunda bitta aniq amal yoki tekshiruv bo‘lsin, shoxlar faqat qaror uchun ishlatilsin va bog‘lanishlar ortiqcha aylanmasin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=line', 'nodesep="0.30"', 'ranksep="0.58"', 'bgcolor="white"'],
    nodeAttrs: { start: 'shape=plaintext, fontcolor="#111111"', end: 'shape=plaintext, fontcolor="#111111"', process: 'shape=plaintext, fontcolor="#111111"', decision: 'shape=plaintext, fontcolor="#111111", fontname="DejaVu Sans Bold"', input: 'shape=plaintext, fontcolor="#111111"', output: 'shape=plaintext, fontcolor="#111111"' },
    edgeAttrs: ['color="#202020"', 'penwidth=1.2', 'arrowsize=0.72'],
  },
  {
    id: "document_workflow",
    name: "Hujjat va ma’lumotlar oqimi",
    description: "Hujjatga o‘xshash tugunlar va gorizontal yo‘nalish bilan kiruvchi-chiqish ma’lumotlarini ajratadi.",
    guidance: "Mavzudagi kiruvchi hujjat, o‘lchov yoki ma’lumotni input; qayta ishlashni process; hosil bo‘ladigan hujjat, qaror yoki natijani output sifatida mazmunan mos tanla. Faqat mavzuda mavjud bo‘lsa, hujjat turini aniq nomla.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=LR', 'splines=ortho', 'nodesep="0.38"', 'ranksep="0.58"', 'compound=true'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#EAF2F8"', end: 'shape=tab, style="filled", fillcolor="#D9EAD3"', process: 'shape=component, style="filled", fillcolor="#DDEBF7"', decision: 'shape=hexagon, style="filled", fillcolor="#FFF2CC"', input: 'shape=note, style="filled", fillcolor="#FFF2CC"', output: 'shape=folder, style="filled", fillcolor="#E2F0D9"' },
    edgeAttrs: ['color="#5B6573"', 'penwidth=1.35', 'arrowsize=0.78'],
  },
  {
    id: "layered_stages",
    name: "Qatlamlangan bosqichlar",
    description: "Boshlang‘ich ma’lumot, amallar, qarorlar va natijalarni alohida Graphviz guruhlariga ajratadi.",
    guidance: "Tugunlarni mavzuga mos ravishda kirish, qayta ishlash, qaror va natija vazifalariga ajrat; process amallari bir nechta bo‘lsa ularning tartibini, qarordan keyingi natijalarni aniq ifodala. Render ularni vazifa qatlamlari bo‘yicha guruhlaydi.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=ortho', 'nodesep="0.32"', 'ranksep="0.50"', 'compound=true', 'newrank=true'],
    clusters: [
      { id: "entry", label: "KIRISH", kinds: ["start", "input"], attrs: 'style="rounded,filled", color="#8AA6C1", fillcolor="#F0F5FA"' },
      { id: "operations", label: "AMALLAR", kinds: ["process"], attrs: 'style="rounded,filled", color="#85A98F", fillcolor="#F1F7F2"' },
      { id: "decisions", label: "QARORLAR", kinds: ["decision"], attrs: 'style="rounded,filled", color="#C8A65B", fillcolor="#FFF9E9"' },
      { id: "results", label: "NATIJALAR", kinds: ["output", "end"], attrs: 'style="rounded,filled", color="#789A76", fillcolor="#F3F8F1"' },
    ],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#DCEAF7"', end: 'shape=oval, style="filled", fillcolor="#DCEAD8"', process: 'shape=box, style="rounded,filled", fillcolor="white"', decision: 'shape=diamond, style="filled", fillcolor="#FFE7A8", width=2.0', input: 'shape=parallelogram, style="filled", fillcolor="#E8F1FA"', output: 'shape=parallelogram, style="filled", fillcolor="#E5F0E1"' },
    edgeAttrs: ['color="#596B5A"', 'penwidth=1.25', 'arrowsize=0.72'],
  },
  {
    id: "bottom_up",
    name: "Pastdan yuqoriga tahlil",
    description: "Natijadan kirish nuqtasiga qarab pastdan yuqoriga oqim joylashuvi.",
    guidance: "Jarayonni tahlil natijasidan yoki yakuniy maqsaddan boshlab, unga olib keluvchi tekshiruv va amallarni teskari izchil tartibda ko‘rsat; node matnlari mavzudagi sabab-natija aloqasiga mos bo‘lsin.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=BT', 'splines=ortho', 'nodesep="0.32"', 'ranksep="0.48"'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#DDEBF7"', end: 'shape=doublecircle, style="filled", fillcolor="#E2F0D9"', process: 'shape=box3d, style="filled", fillcolor="#F2F2F2"', decision: 'shape=diamond, style="filled", fillcolor="#FCE4D6", width=2.0', input: 'shape=parallelogram, style="filled", fillcolor="#EAF2F8"', output: 'shape=parallelogram, style="filled", fillcolor="#E2F0D9"' },
    edgeAttrs: ['color="#52677A"', 'penwidth=1.5', 'arrowsize=0.76'],
  },
  {
    id: "radial_overview",
    name: "Radial jarayon xaritasi",
    description: "Asosiy boshlang‘ich tugun atrofida tarmoqlanadigan radial ko‘rinish.",
    guidance: "Mavzuni bir markaziy muammo, kirish holati yoki boshlang‘ich omildan kelib chiqadigan bir nechta bosqich va natijalarga ajrat; radial joylashuvda tushunarli bo‘lishi uchun qisqa node matnlari va aniq yo‘nalish qirralaridan foydalan.",
    layoutEngine: "twopi",
    graphAttrs: ['overlap=false', 'splines=true', 'ranksep="1.05"', 'root="__FLOWCHART_ROOT__"'],
    nodeAttrs: { start: 'shape=doublecircle, style="filled", fillcolor="#F4CCCC"', end: 'shape=oval, style="filled", fillcolor="#D9EAD3"', process: 'shape=ellipse, style="filled", fillcolor="#D9EAF7"', decision: 'shape=diamond, style="filled", fillcolor="#FFE599", width=1.9', input: 'shape=parallelogram, style="filled", fillcolor="#CFE2F3"', output: 'shape=parallelogram, style="filled", fillcolor="#D9EAD3"' },
    edgeAttrs: ['color="#6C757D"', 'penwidth=1.3', 'arrowsize=0.72'],
  },
  {
    id: "state_machine",
    name: "Holatlar va o‘tishlar",
    description: "Holat tugunlari va ular orasidagi o‘tishlarni egri qirralar bilan ko‘rsatadi.",
    guidance: "Mavzudagi holatlarni process tugunlarida, ularni o‘zgartiruvchi hodisa yoki shartlarni edge yorliqlarida ifodala; qaytish yoki takrorlanish mavjud bo‘lsa, uni aniq holatga yo‘naltiruvchi qirra bilan ko‘rsat.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=LR', 'splines=curved', 'concentrate=true', 'nodesep="0.42"', 'ranksep="0.62"'],
    nodeAttrs: { start: 'shape=circle, style="filled", fillcolor="#D9EAD3", width=0.78', end: 'shape=doublecircle, style="filled", fillcolor="#D9EAD3", width=0.85', process: 'shape=ellipse, style="filled", fillcolor="#D9EAF7", width=1.25', decision: 'shape=diamond, style="filled", fillcolor="#FFE599", width=2.1', input: 'shape=hexagon, style="filled", fillcolor="#CFE2F3"', output: 'shape=hexagon, style="filled", fillcolor="#D9EAD3"' },
    edgeAttrs: ['color="#3D5A80"', 'penwidth=1.35', 'arrowsize=0.72'],
  },
  {
    id: "dataflow_lanes",
    name: "Ma’lumot oqimi va amallar",
    description: "Ma’lumot shaklidagi parallelogrammalarni amallar va tekshiruvlardan shaklan ajratadi.",
    guidance: "Input va output tugunlariga mavzuga mos ma’lumot yoki natijalarni, process tugunlariga ular ustida bajariladigan amallarni yoz; qaror tugunini faqat haqiqiy tekshiruv yoki tanlov bo‘lsa ishlat.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=LR', 'splines=ortho', 'outputorder=edgesfirst', 'nodesep="0.40"', 'ranksep="0.66"'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#E2F0D9"', end: 'shape=doublecircle, style="filled", fillcolor="#E2F0D9"', process: 'shape=trapezium, style="filled", fillcolor="#DDEBF7"', decision: 'shape=diamond, style="filled", fillcolor="#FFF2CC", width=2.0', input: 'shape=parallelogram, style="filled", fillcolor="#CFE2F3"', output: 'shape=parallelogram, style="filled", fillcolor="#D9EAD3"' },
    edgeAttrs: ['color="#4F6D7A"', 'penwidth=1.6', 'arrowsize=0.8'],
  },
  {
    id: "compact_algorithm",
    name: "Ixcham algoritm bloklari",
    description: "Yaqin joylashtirilgan bloklar va to‘g‘ri chiziqli strelkalar bilan qisqa algoritm ko‘rinishi.",
    guidance: "Har bir node’da bitta qisqa amal bo‘ladigan ixcham algoritm tuz; faqat mavzu talab qiladigan tekshiruv va qaytish yo‘llarini qo‘sh, ortiqcha parallel bosqichlar yaratma.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=polyline', 'nodesep="0.14"', 'ranksep="0.22"', 'margin="0.04"'],
    nodeAttrs: { start: 'shape=oval, style="filled", fillcolor="#E2F0D9", height=0.32, margin="0.08,0.04"', end: 'shape=oval, style="filled", fillcolor="#E2F0D9", height=0.32, margin="0.08,0.04"', process: 'shape=box, style="filled", fillcolor="#F3F6FA", margin="0.10,0.05"', decision: 'shape=diamond, style="filled", fillcolor="#FFF2CC", width=1.7, height=0.72, margin="0.06,0.03"', input: 'shape=parallelogram, style="filled", fillcolor="#EAF2F8", margin="0.08,0.04"', output: 'shape=parallelogram, style="filled", fillcolor="#E2F0D9", margin="0.08,0.04"' },
    edgeAttrs: ['color="#6A7785"', 'penwidth=1.05', 'arrowsize=0.62'],
  },
  {
    id: "emphasis_terminals",
    name: "Kuchli boshlanish va yakun",
    description: "Boshlanish/yakun nuqtalarini qalin ikki chiziqli terminal shakllar, amallarni hajmli bloklar bilan belgilaydi.",
    guidance: "Boshlanish, asosiy amal, tekshiruv va yakunni mantiqiy ketma-ketlikda ifodala; yakuniy natijani mavzuga xos qilib yoz, generic ‘Yakun’ bilan cheklanma.",
    layoutEngine: "dot",
    graphAttrs: ['rankdir=TB', 'splines=ortho', 'nodesep="0.34"', 'ranksep="0.46"'],
    nodeAttrs: { start: 'shape=doublecircle, style="filled", fillcolor="#D9EAD3", penwidth=2.2', end: 'shape=doublecircle, style="filled", fillcolor="#D9EAD3", penwidth=2.2', process: 'shape=box3d, style="filled", fillcolor="#DDEBF7", penwidth=1.6', decision: 'shape=diamond, style="filled", fillcolor="#FFE599", penwidth=1.6, width=2.1', input: 'shape=parallelogram, style="filled", fillcolor="#CFE2F3"', output: 'shape=folder, style="filled", fillcolor="#D9EAD3"' },
    edgeAttrs: ['color="#3F5D45"', 'penwidth=1.8', 'arrowsize=0.84'],
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
