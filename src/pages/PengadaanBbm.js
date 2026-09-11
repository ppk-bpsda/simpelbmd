import { listOpd } from '../services/opdService.js';
import { getPengadaanKupon, upsertPengadaanKupon, listPenyerapanKupon } from '../services/kuponBbmService.js';
import { KUPON_NOMINAL, RODA_LABEL } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast } from '../utils/ui.js';

const RODA_ORDER = ['roda4', 'roda2'];

export async function renderPengadaanBbm(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const canWrite = ['super_admin', 'admin_opd'].includes(profile.role);

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Pengadaan Kupon BBM</div>
        <div class="toolbar__subtitle">Kuota lembar Kupon BBM per Tahun Anggaran (Roda 4 &amp; Roda 2), beserta penyerapan dan sisa kupon secara transparan</div>
      </div>
    </div>
    <div class="panel">
      ${profile.role === 'super_admin' ? `
        <div class="field" style="max-width:420px;margin-bottom:16px;">
          <label>OPD</label>
          <select id="opd-select"><option value="">Memuat...</option></select>
        </div>
      ` : ''}
      <div id="form-slot">${loadingCards()}</div>
    </div>
  `;

  const formSlot = root.querySelector('#form-slot');
  const opdSelect = root.querySelector('#opd-select');

  let currentOpdId = profile.opd_id || '';

  if (profile.role === 'super_admin') {
    let opdOptions = [];
    try { opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
    if (!opdOptions.length) {
      opdSelect.innerHTML = `<option value="">Belum ada OPD</option>`;
      formSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data OPD</strong>Tambahkan OPD terlebih dahulu di menu Administrasi &gt; OPD.</div>`;
      return;
    }
    opdSelect.innerHTML = opdOptions.map((o) => `<option value="${o.id}">${escapeHtml(o.nama_opd)}</option>`).join('');
    currentOpdId = opdOptions[0].id;
    opdSelect.value = currentOpdId;
    opdSelect.addEventListener('change', () => { currentOpdId = opdSelect.value; refresh(); });
  }

  if (!currentOpdId) {
    formSlot.innerHTML = `<div class="empty-state"><strong>Akun Anda belum ditautkan ke OPD</strong>Hubungi Super Admin untuk mengatur OPD pada profil Anda.</div>`;
    return;
  }

  async function refresh() {
    formSlot.innerHTML = loadingCards();
    let pengadaan = [];
    let penyerapan = [];
    try {
      [pengadaan, penyerapan] = await Promise.all([
        getPengadaanKupon(tahunAnggaranId, currentOpdId),
        listPenyerapanKupon(tahunAnggaranId, currentOpdId),
      ]);
    } catch (err) {
      formSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Pengadaan Kupon BBM.</div>`;
      return;
    }

    const byRoda = Object.fromEntries(pengadaan.map((p) => [p.roda, p]));
    const penyerapanByRoda = Object.fromEntries(penyerapan.map((p) => [p.roda, p]));

    formSlot.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:20px;">
        ${RODA_ORDER.map((roda) => rodaCardHtml(roda, byRoda[roda], penyerapanByRoda[roda], canWrite)).join('')}
      </div>
    `;

    RODA_ORDER.forEach((roda) => {
      const input = formSlot.querySelector(`#f-jumlah-${roda}`);
      const ket = formSlot.querySelector(`#f-ket-${roda}`);
      const btn = formSlot.querySelector(`#f-save-${roda}`);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const jumlahKupon = Number(input.value);
        if (!Number.isFinite(jumlahKupon) || jumlahKupon < 0 || !Number.isInteger(jumlahKupon)) {
          showToast('Jumlah Kupon harus berupa bilangan bulat dan tidak boleh negatif.', 'warning');
          return;
        }
        try {
          await upsertPengadaanKupon({
            id: byRoda[roda]?.id || null,
            tahunAnggaranId,
            opdId: currentOpdId,
            roda,
            jumlahKupon,
            keterangan: ket.value.trim(),
          });
          showToast('Pengadaan Kupon BBM berhasil disimpan.', 'success');
          refresh();
        } catch (err) { showToast(err.message, 'error'); }
      });
    });
  }

  refresh();
}

function rodaCardHtml(roda, existing, ringkasan, canWrite) {
  const nominal = KUPON_NOMINAL[roda];
  const label = RODA_LABEL[roda];
  const pengadaan = ringkasan?.kupon_pengadaan ?? existing?.jumlah_kupon ?? 0;
  const terpakai = ringkasan?.kupon_terpakai ?? 0;
  const sisa = ringkasan?.kupon_sisa ?? (pengadaan - terpakai);
  const persentase = ringkasan?.persentase_terpakai ?? (pengadaan ? Math.round((terpakai / pengadaan) * 10000) / 100 : 0);
  const nilaiPengadaan = ringkasan?.nilai_pengadaan ?? (pengadaan * nominal);
  const nilaiTerpakai = ringkasan?.nilai_terpakai ?? 0;
  const nilaiSisa = ringkasan?.nilai_sisa ?? (nilaiPengadaan - nilaiTerpakai);
  const barColor = persentase >= 100 ? 'var(--danger, #dc2626)' : persentase >= 80 ? 'var(--warning, #d97706)' : 'var(--accent, #0ea5e9)';

  return `
    <div class="kpi-card" style="grid-column: span 2; min-width:320px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <div class="kpi-card__label" style="font-size:14px;font-weight:700;">Kupon BBM ${label}</div>
        <div style="font-size:12px;color:var(--gray-500);">${formatRupiah(nominal)}/lembar</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
        <div>
          <div style="font-size:11px;color:var(--gray-500);">Pengadaan</div>
          <div style="font-weight:700;">${pengadaan} lembar</div>
          <div style="font-size:11.5px;color:var(--gray-500);">${formatRupiah(nilaiPengadaan)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--gray-500);">Terpakai</div>
          <div style="font-weight:700;">${terpakai} lembar</div>
          <div style="font-size:11.5px;color:var(--gray-500);">${formatRupiah(nilaiTerpakai)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--gray-500);">Sisa</div>
          <div style="font-weight:700;color:${sisa < 0 ? 'var(--danger,#dc2626)' : 'inherit'};">${sisa} lembar</div>
          <div style="font-size:11.5px;color:var(--gray-500);">${formatRupiah(nilaiSisa)}</div>
        </div>
      </div>

      <div style="height:8px;border-radius:4px;background:var(--gray-100);overflow:hidden;margin-bottom:4px;">
        <div style="height:100%;width:${Math.min(persentase, 100)}%;background:${barColor};"></div>
      </div>
      <div style="font-size:11.5px;color:var(--gray-500);margin-bottom:14px;">${persentase}% terserap</div>

      ${canWrite ? `
        <div class="inline-form" style="grid-template-columns:1fr 1fr;gap:8px;">
          <div class="field"><label>Ubah Jumlah Kupon Diadakan</label><input id="f-jumlah-${roda}" type="number" min="0" step="1" value="${existing?.jumlah_kupon ?? pengadaan}" /></div>
          <div class="field"><label>Keterangan</label><input id="f-ket-${roda}" value="${escapeAttr(existing?.keterangan)}" /></div>
          <div class="field-actions" style="grid-column:1/-1;">
            <button class="btn btn-solid" id="f-save-${roda}">Simpan</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function loadingCards() {
  return `<div class="kpi-grid">${RODA_ORDER.map(() => `<div class="kpi-card" style="grid-column: span 2;"><div class="skeleton" style="height:12px;width:40%;margin-bottom:10px;"></div><div class="skeleton" style="height:60px;"></div></div>`).join('')}</div>`;
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
