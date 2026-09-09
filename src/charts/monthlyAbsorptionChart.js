import { Chart } from 'chart.js/auto';

const BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

let chartInstance = null;

export function renderMonthlyAbsorptionChart(canvas, rows) {
  const byMonth = new Array(12).fill(0).map((_, i) => {
    const found = rows.find((r) => Number(r.bulan) === i + 1);
    return {
      pagu: found ? Number(found.pagu) : 0,
      realisasi: found ? Number(found.realisasi) : 0,
    };
  });

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: BULAN,
      datasets: [
        {
          label: 'Pagu',
          data: byMonth.map((m) => m.pagu),
          backgroundColor: 'rgba(148, 163, 184, 0.35)',
          borderRadius: 6,
        },
        {
          label: 'Realisasi',
          data: byMonth.map((m) => m.realisasi),
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderRadius: 6,
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
