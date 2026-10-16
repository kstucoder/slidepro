const CHART_TYPES = new Set(["bar", "line", "pie"]);

function normalizeChartData(chart) {
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
    throw new Error("chart: ma'lumot obyekt bo'lishi kerak");
  }
  const chartType = String(chart.chartType || "").trim().toLowerCase();
  if (!CHART_TYPES.has(chartType)) throw new Error(`chart: noma'lum tur (${chart.chartType || "bo'sh"})`);
  if (!Array.isArray(chart.labels) || !Array.isArray(chart.values)) {
    throw new Error("chart: labels va values massiv bo'lishi kerak");
  }
  if (chart.labels.length < 2 || chart.labels.length > 8) {
    throw new Error("chart: 2–8 ta label talab qilinadi");
  }
  if (chart.labels.length !== chart.values.length) {
    throw new Error("chart: labels va values uzunligi teng emas");
  }

  const labels = chart.labels.map((label, index) => {
    const normalized = String(label == null ? "" : label).trim();
    if (!normalized) throw new Error(`chart: ${index + 1}-label bo'sh`);
    return normalized;
  });
  if (new Set(labels.map(label => label.toLocaleLowerCase())).size !== labels.length) {
    throw new Error("chart: takrorlangan label bor");
  }
  const values = chart.values.map((value, index) => {
    const number = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
    if (!Number.isFinite(number)) throw new Error(`chart: ${index + 1}-qiymat son emas yoki finite emas`);
    return number;
  });
  const valueRange = Math.max(...values) - Math.min(...values);
  if (!Number.isFinite(valueRange)) throw new Error("chart: qiymatlar oralig'i son diapazonidan oshib ketdi");

  if (chartType === "pie") {
    if (labels.length > 5) throw new Error("chart: pie grafik ko'pi bilan 5 bo'lakka ega bo'lishi mumkin");
    if (values.some(value => value < 0)) throw new Error("chart: pie grafikda manfiy qiymat mumkin emas");
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(total)) throw new Error("chart: pie grafik qiymatlari yig'indisi son diapazonidan oshib ketdi");
    if (total <= 0) {
      throw new Error("chart: pie grafik qiymatlari yig'indisi noldan katta bo'lishi kerak");
    }
  }

  return {
    ...chart,
    chartType,
    labels,
    values,
    title: String(chart.title || chart.caption || "").trim(),
    unit: String(chart.unit || "").trim(),
  };
}

module.exports = { normalizeChartData };
