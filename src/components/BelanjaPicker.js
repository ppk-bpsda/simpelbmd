import { listBelanjaByTahun } from '../services/anggaranService.js';

/**
 * Render tiga <select> berjenjang (Kegiatan -> Sub Kegiatan -> Belanja) di
 * dalam `container`, terbatas pada belanja dengan `kelompok` tertentu supaya
 * transaksi selalu terhubung ke rekening yang relevan (§11-13, §26).
 * Mengembalikan { getValue() }.
 */
export async function mountBelanjaPicker(container, { tahunAnggaranId, kelompok, selectedBelanjaId = null }) {
  container.innerHTML = `<div class="skeleton" style="height:38px;"></div>`;

  let allBelanja = [];
  try {
    allBelanja = (await listBelanjaByTahun(tahunAnggaranId)).filter((b) => b.kelompok === kelompok);
  } catch (e) {
    container.innerHTML = `<div class="alert alert--warning">Gagal memuat daftar Belanja. Anda tetap bisa menyimpan transaksi tanpa link Belanja.</div>`;
    return { getValue: () => null };
  }

  if (!allBelanja.length) {
    container.innerHTML = `<div class="alert alert--warning">Belum ada rincian Belanja untuk kelompok ini pada Tahun Anggaran berjalan. Tambahkan di menu Anggaran &gt; Belanja agar realisasi tercatat pada dashboard.</div>`;
    return { getValue: () => null };
  }

  // Kelompokkan: kegiatan -> sub_kegiatan -> [belanja]
  const kegiatanMap = new Map();
  for (const b of allBelanja) {
    const keg = b.sub_kegiatan.kegiatan;
    if (!kegiatanMap.has(keg.id)) kegiatanMap.set(keg.id, { ...keg, subMap: new Map() });
    const kegEntry = kegiatanMap.get(keg.id);
    const sub = b.sub_kegiatan;
    if (!kegEntry.subMap.has(sub.id)) kegEntry.subMap.set(sub.id, { ...sub, belanjaList: [] });
    kegEntry.subMap.get(sub.id).belanjaList.push(b);
  }
  const kegiatanList = [...kegiatanMap.values()];

  let preKegiatanId = '', preSubId = '';
  if (selectedBelanjaId) {
    const found = allBelanja.find((b) => b.id === selectedBelanjaId);
    if (found) { preKegiatanId = found.sub_kegiatan.kegiatan.id; preSubId = found.sub_kegiatan.id; }
  }
  if (!preKegiatanId && kegiatanList.length) preKegiatanId = kegiatanList[0].id;

  container.innerHTML = `
    <div class="field"><label>Kegiatan</label><select id="bp-kegiatan"></select></div>
    <div class="field"><label>Sub Kegiatan</label><select id="bp-sub"></select></div>
    <div class="field"><label>Belanja</label><select id="bp-belanja"></select></div>
  `;
  const kegiatanSelect = container.querySelector('#bp-kegiatan');
  const subSelect = container.querySelector('#bp-sub');
  const belanjaSelect = container.querySelector('#bp-belanja');

  function fillKegiatan() {
    kegiatanSelect.innerHTML = kegiatanList
      .map((k) => `<option value="${k.id}" ${k.id === preKegiatanId ? 'selected' : ''}>${escapeHtml(k.kode_kegiatan)} — ${escapeHtml(k.nama_kegiatan)}</option>`)
      .join('');
  }
  function fillSub() {
    const keg = kegiatanMap.get(kegiatanSelect.value);
    const subs = keg ? [...keg.subMap.values()] : [];
    subSelect.innerHTML = subs
      .map((s) => `<option value="${s.id}" ${s.id === preSubId ? 'selected' : ''}>${escapeHtml(s.kode_sub_kegiatan)} — ${escapeHtml(s.nama_sub_kegiatan)}</option>`)
      .join('');
  }
  function fillBelanja() {
    const keg = kegiatanMap.get(kegiatanSelect.value);
    const sub = keg?.subMap.get(subSelect.value);
    const list = sub ? sub.belanjaList : [];
    belanjaSelect.innerHTML = list
      .map((b) => `<option value="${b.id}" ${b.id === selectedBelanjaId ? 'selected' : ''}>${escapeHtml(b.kode_rekening)} — ${escapeHtml(b.nama_belanja)}</option>`)
      .join('');
  }

  fillKegiatan();
  fillSub();
  fillBelanja();

  kegiatanSelect.addEventListener('change', () => { fillSub(); fillBelanja(); });
  subSelect.addEventListener('change', () => { fillBelanja(); });

  return {
    getValue: () => belanjaSelect.value || null,
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
