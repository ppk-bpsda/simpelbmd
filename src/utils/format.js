export function formatRupiah(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPercent(value) {
  const n = Number(value || 0);
  return `${n.toFixed(1)}%`;
}

export function clampPercent(value) {
  const n = Number(value || 0);
  return Math.max(0, Math.min(100, n));
}
