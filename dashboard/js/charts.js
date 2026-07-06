/**
 * ChartManager — manages per-agent Chart.js sparkline instances
 */
const ChartManager = (() => {
  const charts = new Map();

  const COLORS = [
    '#00FFB2', '#FF3366', '#8B5CF6', '#F59E0B', '#3B9EFF', '#FF6B35'
  ];

  function getColor(index) {
    return COLORS[index % COLORS.length];
  }

  /**
   * Create a new sparkline chart for an agent
   * @param {string} canvasId
   * @param {number} agentIndex - 0-based index (determines colour)
   * @param {number} initialBalance
   */
  function create(canvasId, agentIndex, initialBalance) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    // Destroy if already exists
    if (charts.has(canvasId)) {
      charts.get(canvasId).destroy();
      charts.delete(canvasId);
    }

    const color = getColor(agentIndex);

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [''],
        datasets: [{
          data: [initialBalance],
          borderColor: color,
          backgroundColor: color + '18',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: true,
          tension: 0.45,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false, grid: { display: false } },
          y: {
            display: false,
            grid: { display: false },
            grace: '8%'
          }
        },
        elements: {
          line: { capBezierPoints: false }
        }
      }
    });

    charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Push a new balance data point to an agent's chart
   * @param {string} canvasId
   * @param {number} newBalance
   */
  function push(canvasId, newBalance) {
    const chart = charts.get(canvasId);
    if (!chart) return;

    chart.data.labels.push('');
    chart.data.datasets[0].data.push(newBalance);

    // Keep max 40 data points
    if (chart.data.labels.length > 40) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }

    chart.update('none');
  }

  function destroy(canvasId) {
    const chart = charts.get(canvasId);
    if (chart) {
      chart.destroy();
      charts.delete(canvasId);
    }
  }

  function destroyAll() {
    charts.forEach(c => c.destroy());
    charts.clear();
  }

  return { create, push, destroy, destroyAll, getColor };
})();
