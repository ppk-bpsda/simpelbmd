import { listPemeliharaan, createPemeliharaan, updatePemeliharaan, softDeletePemeliharaan, listKendaraanOptions } from '../services/transaksiService.js';
import { JENIS_PEMELIHARAAN_OPTIONS } from '../validators/transaksiValidator.js';
import { mountBelanjaPicker } from '../components/BelanjaPicker.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderPemeliharaan(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }
  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Pemeliharaan Kendaraan</div>
        <div class="toolbar__subtitle">Riwayat servis, sparepart, dan jasa perbaikan kendaraan</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add">+ Tambah Transaksi</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div id="form-slot"></div>
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');

  let kendaraanOptions = [];
  try { kendaraanOptions = await listKendaraanOptions(tahunAnggaranId); } catch (e) { /* non-fatal */ }

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listPemeliharaan(tahunAnggaranId);
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data Pemeliharaan</strong>Tambahkan transaksi baru untuk mulai mencatat riwayat servis.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Bengkel</th>
              <th class="num">Sparepart</th><th class="num">Jasa</th><th class="num">Total</th><th class="num">KM</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisBadge(r.jenis)}</td>
                  <td>${escapeHtml(r.bengkel || '-')}</td>
                  <td class="num">${formatRupiah(r.sparepart)}</td>
                  <td class="num">${formatRupiah(r.jasa)}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(r.nilai)}</td>
                  <td class="num">${r.kilometer ?? '-'}</td>
                  <td style="white-space:nowrap;">
                    ${canWrite ? `<button class="btn-ghost" data-edit-id="${r.id}">Edit</button>` : ''}
                    ${canDelete ? `<button class="btn-danger-ghost" data-delete-id="${r.id}">Hapus</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      tableSlot.querySelectorAll('[data-edit-id]').forEach((el) => {
        const row = rows.find((r) => r.id === el.dataset.editId);
        el.addEventListener('click', () => openForm(row));
      });
      tableSlot.querySelectorAll('[data-delete-id]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Hapus Transaksi?', message: 'Data akan dipindahkan ke arsip.', danger: true });
          if (!ok) return;
          try { await softDeletePemeliharaan(el.dataset.deleteId, profile.id); showToast('Transaksi berhasil dihapus.', 'success'); refresh(); }
          catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Pemeliharaan.</div>`;
    }
  }

  async function openForm(existing = null) {
    if (!kendaraanOptions.length) {
      showToast('Belum ada data Kendaraan. Tambahkan Kendaraan terlebih dahulu di menu KIB Kendaraan.', 'warning');
      return;
    }
    formSlot.innerHTML = `
      <div class="inline-form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
        <div class="field"><label>Tanggal *</label><input id="f-tanggal" type="date" value="${existing?.tanggal || todayStr()}" /></div>
        <div class="field"><label>Kendaraan (Nopol) *</label>
          <select id="f-kendaraan">${kendaraanOptions.map((k) => `<option value="${k.id}" ${existing?.kendaraan?.id === k.id ? 'selected' : ''}>${escapeHtml(k.nopol)} — ${escapeHtml(k.kib?.nama_barang || '')}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Jenis *</label>
          <select id="f-jenis">${JENIS_PEMELIHARAAN_OPTIONS.map((j) => `<option value="${j.value}" ${existing?.jenis === j.value ? 'selected' : ''}>${j.label}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Bengkel/Penyedia</label><input id="f-bengkel" value="${escapeAttr(existing?.bengkel)}" /></div>
        <div class="field"><label>Nomor Dokumen</label><input id="f-nodok" value="${escapeAttr(existing?.nomor_dokumen)}" /></div>
        <div class="field"><label>Kilometer</label><input id="f-km" type="number" min="0" value="${existing?.kilometer ?? ''}" /></div>
        <div class="field"><label>Biaya Sparepart (Rp)</label><input id="f-sparepart" type="number" min="0" value="${existing?.sparepart ?? 0}" /></div>
        <div class="field"><label>Biaya Jasa (Rp)</label><input id="f-jasa" type="number" min="0" value="${existing?.jasa ?? 0}" /></div>
        <div class="field">
          <label>Total (otomatis)</label>
          <input id="f-total-preview" value="${formatRupiah((existing?.sparepart || 0) + (existing?.jasa || 0))}" disabled style="background:var(--gray-100);font-weight:700;" />
        </div>
        <div class="field" style="grid-column:1/-1;"><label>Uraian</label><input id="f-uraian" value="${escapeAttr(existing?.uraian)}" /></div>
        <div id="belanja-picker-slot" style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;"></div>
        <div class="field" style="grid-column:1/-1;"><label>Keterangan</label><input id="f-ket" value="${escapeAttr(existing?.keterangan)}" /></div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">${existing ? 'Simpan Perubahan' : 'Simpan'}</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;

    const picker = await mountBelanjaPicker(formSlot.querySelector('#belanja-picker-slot'), {
      tahunAnggaranId, kelompok: 'pemeliharaan', selectedBelanjaId: existing?.belanja?.id || null,
    });

    const sparepartInput = formSlot.querySelector('#f-sparepart');
    const jasaInput = formSlot.querySelector('#f-jasa');
    const totalPreview = formSlot.querySelector('#f-total-preview');
    function updateTotalPreview() {
      const total = (Number(sparepartInput.value) || 0) + (Number(jasaInput.value) || 0);
      totalPreview.value = formatRupiah(total);
    }
    sparepartInput.addEventListener('input', updateTotalPreview);
    jasaInput.addEventListener('input', updateTotalPreview);

    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const tanggal = formSlot.querySelector('#f-tanggal').value;
      const kendaraan_id = formSlot.querySelector('#f-kendaraan').value;
      const jenis = formSlot.querySelector('#f-jenis').value;
      const sparepart = Number(sparepartInput.value) || 0;
      const jasa = Number(jasaInput.value) || 0;

      if (!tanggal || !kendaraan_id || !jenis) { showToast('Tanggal, Kendaraan, dan Jenis wajib diisi.', 'warning'); return; }
      if (sparepart < 0 || jasa < 0) { showToast('Biaya tidak boleh negatif.', 'warning'); return; }

      const payload = {
        tahun_anggaran_id: tahunAnggaranId,
        kendaraan_id,
        belanja_id: picker.getValue(),
        tanggal,
        jenis,
        bengkel: formSlot.querySelector('#f-bengkel').value.trim() || null,
        nomor_dokumen: formSlot.querySelector('#f-nodok').value.trim() || null,
        uraian: formSlot.querySelector('#f-uraian').value.trim() || null,
        sparepart, jasa,
        kilometer: formSlot.querySelector('#f-km').value ? Number(formSlot.querySelector('#f-km').value) : null,
        keterangan: formSlot.querySelector('#f-ket').value.trim() || null,
      };

      try {
        if (existing) { await updatePemeliharaan(existing.id, payload); showToast('Perubahan berhasil disimpan.', 'success'); }
        else { await createPemeliharaan(payload); showToast('Transaksi baru berhasil ditambahkan.', 'success'); }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  if (canWrite) root.querySelector('#btn-add').addEventListener('click', () => openForm());

  refresh();
}

function jenisBadge(v) {
  const label = (JENIS_PEMELIHARAAN_OPTIONS.find((j) => j.value === v) || {}).label || v;
  return `<span class="status-badge status-badge--info">${label}</span>`;
}
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
