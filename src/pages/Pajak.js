import { listPajak, createPajak, updatePajak, softDeletePajak, listKendaraanOptions } from '../services/transaksiService.js';
import { computeJatuhTempoStatus, JENIS_PAJAK_OPTIONS } from '../validators/transaksiValidator.js';
import { mountBelanjaPicker } from '../components/BelanjaPicker.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog, openFormModal } from '../utils/ui.js';

export async function renderPajak(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }
  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Pajak &amp; Perijinan</div>
        <div class="toolbar__subtitle">Riwayat pajak dan perijinan kendaraan, dengan pengingat jatuh tempo</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add">+ Tambah Transaksi</button>` : ''}
      </div>
    </div>
    <div id="summary-slot" class="kpi-grid" style="margin-bottom:16px;"></div>
    <div class="panel">
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const summarySlot = root.querySelector('#summary-slot');

  let kendaraanOptions = [];
  try { kendaraanOptions = await listKendaraanOptions(tahunAnggaranId); } catch (e) { /* non-fatal */ }

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listPajak(tahunAnggaranId);
      drawSummary(rows);

      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data Pajak/Perijinan</strong>Tambahkan transaksi baru untuk mulai memonitor jatuh tempo.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Nomor Dokumen</th>
              <th>Status Jatuh Tempo</th><th class="num">Nilai</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => {
                const jt = computeJatuhTempoStatus(r.masa_berlaku);
                return `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisLabel(r.jenis)}</td>
                  <td>${escapeHtml(r.nomor_dokumen || '-')}</td>
                  <td><span class="status-badge status-badge--${jt.variant}">${jt.label}</span></td>
                  <td class="num">${formatRupiah(r.nilai)}</td>
                  <td style="white-space:nowrap;">
                    ${canWrite ? `<button class="btn-ghost" data-edit-id="${r.id}">Edit</button>` : ''}
                    ${canDelete ? `<button class="btn-danger-ghost" data-delete-id="${r.id}">Hapus</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;

      tableSlot.querySelectorAll('[data-edit-id]').forEach((el) => {
        const row = rows.find((r) => r.id === el.dataset.editId);
        el.addEventListener('click', () => openForm(row, el.closest('tr')));
      });
      if (canWrite) {
        tableSlot.querySelectorAll('tbody tr').forEach((tr) => {
          tr.style.cursor = 'pointer';
          tr.title = 'Klik dua kali untuk mengedit';
          tr.addEventListener('dblclick', () => {
            const btn = tr.querySelector('[data-edit-id]');
            if (!btn) return;
            openForm(rows.find((r) => r.id === btn.dataset.editId), tr);
          });
        });
      }
      tableSlot.querySelectorAll('[data-delete-id]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Hapus Transaksi?', message: 'Data akan dipindahkan ke arsip.', danger: true });
          if (!ok) return;
          try { await softDeletePajak(el.dataset.deleteId, profile.id); showToast('Transaksi berhasil dihapus.', 'success'); refresh(); }
          catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Pajak/Perijinan.</div>`;
      console.error('[SIMPELBMD] listPajak error:', err.message);
    }
  }

  function drawSummary(rows) {
    const counts = { lewat: 0, kritis: 0, perhatian: 0, perhatian_tinggi: 0, aman: 0 };
    rows.forEach((r) => {
      const jt = computeJatuhTempoStatus(r.masa_berlaku);
      if (counts[jt.status] !== undefined) counts[jt.status] += 1;
    });
    const perhatianTotal = counts.perhatian + counts.perhatian_tinggi;
    summarySlot.innerHTML = `
      <div class="kpi-card"><div class="kpi-card__label">Sudah Jatuh Tempo</div><div class="kpi-card__value" style="color:var(--status-critical);">${counts.lewat}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Jatuh Tempo &le; 7 Hari</div><div class="kpi-card__value" style="color:var(--status-critical);">${counts.kritis}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Jatuh Tempo &le; 30 Hari</div><div class="kpi-card__value" style="color:var(--status-warning);">${perhatianTotal}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Aman</div><div class="kpi-card__value" style="color:var(--status-safe);">${counts.aman}</div></div>
    `;
  }

  async function openForm(existing = null, triggerRow = null) {
    if (!kendaraanOptions.length) {
      showToast('Belum ada data Kendaraan. Tambahkan Kendaraan terlebih dahulu di menu KIB Kendaraan.', 'warning');
      return;
    }
    if (triggerRow) triggerRow.classList.add('is-editing');

    const bodyHtml = `
      <div class="modal-form">
        <div class="field"><label>Tanggal *</label><input id="f-tanggal" type="date" value="${existing?.tanggal || todayStr()}" /></div>
        <div class="field"><label>Kendaraan (Nopol) *</label>
          <select id="f-kendaraan">${kendaraanOptions.map((k) => `<option value="${k.id}" ${existing?.kendaraan?.id === k.id ? 'selected' : ''}>${escapeHtml(k.nopol)} — ${escapeHtml(k.kib?.nama_barang || '')}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Jenis *</label>
          <select id="f-jenis">${JENIS_PAJAK_OPTIONS.map((j) => `<option value="${j.value}" ${existing?.jenis === j.value ? 'selected' : ''}>${j.label}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Nomor Dokumen</label><input id="f-nodok" value="${escapeAttr(existing?.nomor_dokumen)}" /></div>
        <div class="field"><label>Masa Berlaku</label><input id="f-masaberlaku" type="date" value="${existing?.masa_berlaku || ''}" /></div>
        <div class="field"><label>Nilai (Rp) *</label><input id="f-nilai" type="number" min="0" value="${existing?.nilai ?? ''}" /></div>
        <div class="field"><label>Sumber Anggaran</label><input id="f-sumber" value="${escapeAttr(existing?.sumber_anggaran) || 'APBD'}" /></div>
        <div class="field field--wide"><label>Keterangan</label><input id="f-ket" value="${escapeAttr(existing?.keterangan)}" /></div>
        <div class="form-section"><div class="form-section__title">Belanja Terkait</div></div>
        <div id="belanja-picker-slot" class="field--wide" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;"></div>
      </div>
    `;

    const modal = openFormModal({
      title: existing ? 'Edit Pajak / Perijinan' : 'Tambah Transaksi Pajak / Perijinan',
      subtitle: existing
        ? `${escapeHtml(existing.kendaraan?.nopol || '-')} — ${jenisLabel(existing.jenis)}`
        : 'Catat transaksi pajak atau perijinan kendaraan baru.',
      bodyHtml,
      saveLabel: existing ? 'Simpan Perubahan' : 'Simpan',
      onSave: async (body) => {
        const tanggal = body.querySelector('#f-tanggal').value;
        const kendaraan_id = body.querySelector('#f-kendaraan').value;
        const jenis = body.querySelector('#f-jenis').value;
        const nilai = Number(body.querySelector('#f-nilai').value);

        if (!tanggal || !kendaraan_id || !jenis) { showToast('Tanggal, Kendaraan, dan Jenis wajib diisi.', 'warning'); return false; }
        if (!Number.isFinite(nilai) || nilai < 0) { showToast('Nilai harus berupa angka dan tidak boleh negatif.', 'warning'); return false; }

        const payload = {
          tahun_anggaran_id: tahunAnggaranId,
          kendaraan_id,
          belanja_id: picker.getValue(),
          tanggal,
          jenis,
          nomor_dokumen: body.querySelector('#f-nodok').value.trim() || null,
          masa_berlaku: body.querySelector('#f-masaberlaku').value || null,
          nilai,
          sumber_anggaran: body.querySelector('#f-sumber').value.trim() || null,
          keterangan: body.querySelector('#f-ket').value.trim() || null,
        };

        if (existing) { await updatePajak(existing.id, payload); showToast('Perubahan berhasil disimpan.', 'success'); }
        else { await createPajak(payload); showToast('Transaksi baru berhasil ditambahkan.', 'success'); }
        refresh();
      },
      onClose: () => { if (triggerRow) triggerRow.classList.remove('is-editing'); },
    });

    // Picker Belanja dimuat async setelah modal terbuka agar modal langsung
    // tampil tanpa menunggu request selesai.
    const picker = await mountBelanjaPicker(modal.body.querySelector('#belanja-picker-slot'), {
      tahunAnggaranId, kelompok: 'pajak_perijinan', selectedBelanjaId: existing?.belanja?.id || null,
    });
  }

  if (canWrite) root.querySelector('#btn-add').addEventListener('click', () => openForm());

  refresh();
}

function jenisLabel(v) { return (JENIS_PAJAK_OPTIONS.find((j) => j.value === v) || {}).label || v; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
