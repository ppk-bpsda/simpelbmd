import { listBbm, createBbm, updateBbm, softDeleteBbm, listKendaraanOptions } from '../services/transaksiService.js';
import { JENIS_BBM_OPTIONS } from '../validators/transaksiValidator.js';
import { mountBelanjaPicker } from '../components/BelanjaPicker.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderBbm(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }
  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">BBM / Kupon BBM</div>
        <div class="toolbar__subtitle">Riwayat penggunaan BBM, nilai dan efisiensi kendaraan dihitung otomatis</div>
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
      const rows = await listBbm(tahunAnggaranId);
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data BBM</strong>Tambahkan transaksi baru untuk mulai memonitor pemakaian BBM.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>No. Kupon</th>
              <th class="num">Liter</th><th class="num">Harga/Liter</th><th class="num">Nilai</th>
              <th class="num">Jarak (km)</th><th class="num">Efisiensi</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => {
                const efisiensi = r.jarak_tempuh && r.liter ? (r.jarak_tempuh / r.liter).toFixed(1) : '-';
                return `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisLabel(r.jenis_bbm)}</td>
                  <td>${escapeHtml(r.nomor_kupon || '-')}</td>
                  <td class="num">${Number(r.liter).toFixed(1)} L</td>
                  <td class="num">${formatRupiah(r.harga_per_liter)}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(r.nilai)}</td>
                  <td class="num">${r.jarak_tempuh ?? '-'}</td>
                  <td class="num">${efisiensi !== '-' ? efisiensi + ' km/L' : '-'}</td>
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
        el.addEventListener('click', () => openForm(row));
      });
      tableSlot.querySelectorAll('[data-delete-id]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Hapus Transaksi?', message: 'Data akan dipindahkan ke arsip.', danger: true });
          if (!ok) return;
          try { await softDeleteBbm(el.dataset.deleteId, profile.id); showToast('Transaksi berhasil dihapus.', 'success'); refresh(); }
          catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data BBM.</div>`;
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
        <div class="field"><label>Jenis BBM *</label>
          <select id="f-jenis">${JENIS_BBM_OPTIONS.map((j) => `<option value="${j.value}" ${existing?.jenis_bbm === j.value ? 'selected' : ''}>${j.label}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Nomor Kupon</label><input id="f-kupon" value="${escapeAttr(existing?.nomor_kupon)}" /></div>
        <div class="field"><label>Jumlah Liter *</label><input id="f-liter" type="number" min="0" step="0.1" value="${existing?.liter ?? ''}" /></div>
        <div class="field"><label>Harga per Liter (Rp) *</label><input id="f-harga" type="number" min="0" value="${existing?.harga_per_liter ?? ''}" /></div>
        <div class="field"><label>Nilai (otomatis)</label><input id="f-nilai-preview" value="${formatRupiah((existing?.liter || 0) * (existing?.harga_per_liter || 0))}" disabled style="background:var(--gray-100);font-weight:700;" /></div>
        <div class="field"><label>Kilometer Awal</label><input id="f-kmawal" type="number" min="0" value="${existing?.kilometer_awal ?? ''}" /></div>
        <div class="field"><label>Kilometer Akhir</label><input id="f-kmakhir" type="number" min="0" value="${existing?.kilometer_akhir ?? ''}" /></div>
        <div class="field"><label>Jarak Tempuh (otomatis)</label><input id="f-jarak-preview" value="${existing?.jarak_tempuh ?? '-'}" disabled style="background:var(--gray-100);" /></div>
        <div class="field"><label>Pengemudi</label><input id="f-pengemudi" value="${escapeAttr(existing?.pengemudi)}" /></div>
        <div id="belanja-picker-slot" style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;"></div>
        <div class="field" style="grid-column:1/-1;"><label>Keterangan</label><input id="f-ket" value="${escapeAttr(existing?.keterangan)}" /></div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">${existing ? 'Simpan Perubahan' : 'Simpan'}</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
      <div id="form-alert"></div>
    `;

    const picker = await mountBelanjaPicker(formSlot.querySelector('#belanja-picker-slot'), {
      tahunAnggaranId, kelompok: 'bbm', selectedBelanjaId: existing?.belanja?.id || null,
    });

    const literInput = formSlot.querySelector('#f-liter');
    const hargaInput = formSlot.querySelector('#f-harga');
    const nilaiPreview = formSlot.querySelector('#f-nilai-preview');
    const kmAwalInput = formSlot.querySelector('#f-kmawal');
    const kmAkhirInput = formSlot.querySelector('#f-kmakhir');
    const jarakPreview = formSlot.querySelector('#f-jarak-preview');

    function updatePreview() {
      const nilai = (Number(literInput.value) || 0) * (Number(hargaInput.value) || 0);
      nilaiPreview.value = formatRupiah(nilai);
      const kmA = Number(kmAwalInput.value);
      const kmB = Number(kmAkhirInput.value);
      jarakPreview.value = (kmAwalInput.value && kmAkhirInput.value && kmB >= kmA) ? `${kmB - kmA} km` : '-';
    }
    [literInput, hargaInput, kmAwalInput, kmAkhirInput].forEach((el) => el.addEventListener('input', updatePreview));

    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const alertSlot = formSlot.querySelector('#form-alert');
      alertSlot.innerHTML = '';
      const tanggal = formSlot.querySelector('#f-tanggal').value;
      const kendaraan_id = formSlot.querySelector('#f-kendaraan').value;
      const jenis_bbm = formSlot.querySelector('#f-jenis').value;
      const liter = Number(literInput.value);
      const harga_per_liter = Number(hargaInput.value);
      const kilometer_awal = kmAwalInput.value ? Number(kmAwalInput.value) : null;
      const kilometer_akhir = kmAkhirInput.value ? Number(kmAkhirInput.value) : null;

      if (!tanggal || !kendaraan_id || !jenis_bbm) { showToast('Tanggal, Kendaraan, dan Jenis BBM wajib diisi.', 'warning'); return; }
      if (!Number.isFinite(liter) || liter <= 0) { showToast('Jumlah Liter harus lebih dari 0.', 'warning'); return; }
      if (!Number.isFinite(harga_per_liter) || harga_per_liter < 0) { showToast('Harga per Liter tidak valid.', 'warning'); return; }
      if (kilometer_awal !== null && kilometer_akhir !== null && kilometer_akhir < kilometer_awal) {
        alertSlot.innerHTML = `<div class="alert alert--error">Kilometer Akhir tidak boleh lebih kecil dari Kilometer Awal. Periksa kembali odometer kendaraan.</div>`;
        return;
      }

      const payload = {
        tahun_anggaran_id: tahunAnggaranId,
        kendaraan_id,
        belanja_id: picker.getValue(),
        tanggal, jenis_bbm,
        nomor_kupon: formSlot.querySelector('#f-kupon').value.trim() || null,
        liter, harga_per_liter,
        kilometer_awal, kilometer_akhir,
        pengemudi: formSlot.querySelector('#f-pengemudi').value.trim() || null,
        keterangan: formSlot.querySelector('#f-ket').value.trim() || null,
      };

      try {
        if (existing) { await updateBbm(existing.id, payload); showToast('Perubahan berhasil disimpan.', 'success'); }
        else { await createBbm(payload); showToast('Transaksi baru berhasil ditambahkan.', 'success'); }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        if (err.message.includes('sudah ada') || err.message.toLowerCase().includes('duplicate')) {
          alertSlot.innerHTML = `<div class="alert alert--error">Nomor Kupon ini sudah pernah digunakan pada transaksi lain.</div>`;
        } else {
          showToast(err.message, 'error');
        }
      }
    });
  }

  if (canWrite) root.querySelector('#btn-add').addEventListener('click', () => openForm());

  refresh();
}

function jenisLabel(v) { return (JENIS_BBM_OPTIONS.find((j) => j.value === v) || {}).label || v; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
