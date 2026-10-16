const MIN_DIAGRAM_COUNT = 3;

function resolveDiagramQuotas(mainChapterCount, { flowchartCount = 1, chartCount = null } = {}) {
  const chapterLimit = Math.max(0, Math.floor(Number(mainChapterCount) || 0));
  const flowchartValue = Number(flowchartCount);
  const flowcharts = Math.min(chapterLimit, Math.max(0,
    Number.isFinite(flowchartValue) ? Math.floor(flowchartValue) : 1));

  const defaultChartQuota = Math.max(1, Math.ceil(chapterLimit / 2));
  const chartValue = Number(chartCount);
  const requestedCharts = chartCount == null
    ? defaultChartQuota
    : Math.max(0, Number.isFinite(chartValue) ? Math.floor(chartValue) : defaultChartQuota);
  const minimumCharts = Math.max(0, MIN_DIAGRAM_COUNT - flowcharts);
  const charts = Math.min(chapterLimit, Math.max(requestedCharts, minimumCharts));

  return { flowchartCount: flowcharts, chartCount: charts };
}

module.exports = { MIN_DIAGRAM_COUNT, resolveDiagramQuotas };
