import { Chart } from 'chart.js/auto';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

let chartInstance = null;

export function renderCumulativeRealisasiChart(canvas, monthlyRows, totalPagu) {
  const byMonth = new Array(12).fill(0).map((_, i) => {
    const found = monthlyRows.find((r) => Number(r.bulan) === i + 1);
    return found ? Number(found.realisasi) : 0;
  });

  let running = 0;
  const cumulative = byMonth.map((v) => { running += v; return running; });
  const paguLine = new Array(12).fill(totalPagu);

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: BULAN,
      datasets: [
        {
          label: 'Pagu',
          data: paguLine,
          borderColor: 'rgba(148, 163, 184, 0.9)',
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Realisasi Kumulatif',
          data: cumulative,
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: {
        y: { ticks: { callback: (v) => formatCompactRupiah(v) }, grid: { color: '#F0F2F5' } },
        x: { grid: { display: false } },
      },
    },
  });

  return chartInstance;
}

function formatCompactRupiah(value) {
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(1)}M`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(0)}jt`;
  return value;
}
