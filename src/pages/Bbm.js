import { listBbm, createBbm, updateBbm, softDeleteBbm, listKendaraanOptions, resolveBbmBelanja } from '../services/transaksiService.js';
import { resolveNilaiPerKupon } from '../services/kuponBbmService.js';
import { JENIS_BBM_OPTIONS, RODA_LABEL } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog, openFormModal } from '../utils/ui.js';

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
        <div class="toolbar__subtitle">Riwayat penggunaan Kupon BBM (nominal tetap sesuai jenis roda kendaraan)</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add">+ Tambah Transaksi</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');

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
              <th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Roda</th>
              <th class="num">Jml Kupon</th><th class="num">Nilai/Kupon</th><th class="num">Nilai</th>
              <th class="num">Jarak (km)</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisLabel(r.jenis_bbm)}</td>
                  <td>${escapeHtml(RODA_LABEL[r.roda_kendaraan] || '-')}</td>
                  <td class="num">${r.jumlah_kupon}</td>
                  <td class="num">${formatRupiah(r.nilai_per_kupon)}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(r.nilai)}</td>
                  <td class="num">${r.jarak_tempuh ?? '-'}</td>
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
          try { await softDeleteBbm(el.dataset.deleteId, profile.id); showToast('Transaksi berhasil dihapus.', 'success'); refresh(); }
          catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data BBM.</div>`;
    }
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
        <div class="field"><label>Jenis BBM *</label>
          <select id="f-jenis">${JENIS_BBM_OPTIONS.map((j) => `<option value="${j.value}" ${existing?.jenis_bbm === j.value ? 'selected' : ''}>${j.label}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Jumlah Kupon *</label><input id="f-jumlah-kupon" type="number" min="1" step="1" value="${existing?.jumlah_kupon ?? ''}" /></div>
        <div class="field"><label>Nilai per Kupon (otomatis)</label><input id="f-nilai-kupon-preview" disabled style="background:var(--gray-100);" /></div>
        <div class="field"><label>Nilai (otomatis)</label><input id="f-nilai-preview" disabled style="background:var(--gray-100);font-weight:700;" /></div>
        <div class="field"><label>Kilometer Awal</label><input id="f-kmawal" type="number" min="0" value="${existing?.kilometer_awal ?? ''}" /></div>
        <div class="field"><label>Kilometer Akhir</label><input id="f-kmakhir" type="number" min="0" value="${existing?.kilometer_akhir ?? ''}" /></div>
        <div class="field"><label>Jarak Tempuh (otomatis)</label><input id="f-jarak-preview" value="${existing?.jarak_tempuh ?? '-'}" disabled style="background:var(--gray-100);" /></div>
        <div class="field"><label>Pengemudi</label><input id="f-pengemudi" value="${escapeAttr(existing?.pengemudi)}" /></div>
        <div class="field field--wide"><label>Keterangan</label><input id="f-ket" value="${escapeAttr(existing?.keterangan)}" /></div>
        <div id="belanja-info-slot" class="field--wide"></div>
      </div>
      <div id="form-alert" style="margin-top:12px;"></div>
    `;

    const modal = openFormModal({
      title: existing ? 'Edit Transaksi BBM' : 'Tambah Transaksi BBM',
      subtitle: existing
        ? `${escapeHtml(existing.kendaraan?.nopol || '-')} — ${jenisLabel(existing.jenis_bbm)}`
        : 'Catat pemakaian Kupon BBM kendaraan.',
      bodyHtml,
      saveLabel: existing ? 'Simpan Perubahan' : 'Simpan',
      onSave: async (body) => {
        const alertSlot = body.querySelector('#form-alert');
        alertSlot.innerHTML = '';
        const tanggal = body.querySelector('#f-tanggal').value;
        const kendaraan_id = kendaraanSelect.value;
        const jenis_bbm = body.querySelector('#f-jenis').value;
        const jumlah_kupon = Number(jumlahKuponInput.value);
        const kilometer_awal = kmAwalInput.value ? Number(kmAwalInput.value) : null;
        const kilometer_akhir = kmAkhirInput.value ? Number(kmAkhirInput.value) : null;

        if (!tanggal || !kendaraan_id || !jenis_bbm) { showToast('Tanggal, Kendaraan, dan Jenis BBM wajib diisi.', 'warning'); return false; }
        if (!currentRoda) { showToast('Kendaraan belum memiliki data Jenis Roda. Lengkapi di menu KIB Kendaraan terlebih dahulu.', 'warning'); return false; }
        if (currentNilaiPerKupon === null) { showToast('Belum ada Pengadaan Kupon BBM (nominal per kupon) untuk roda ini pada Tahun Anggaran berjalan. Input dulu di menu Pengadaan Kupon BBM.', 'warning'); return false; }
        if (!Number.isInteger(jumlah_kupon) || jumlah_kupon <= 0) { showToast('Jumlah Kupon harus bilangan bulat lebih dari 0.', 'warning'); return false; }
        if (kilometer_awal !== null && kilometer_akhir !== null && kilometer_akhir < kilometer_awal) {
          alertSlot.innerHTML = `<div class="alert alert--error">Kilometer Akhir tidak boleh lebih kecil dari Kilometer Awal. Periksa kembali odometer kendaraan.</div>`;
          return false;
        }

        const payload = {
          tahun_anggaran_id: tahunAnggaranId,
          kendaraan_id,
          belanja_id: resolvedBelanja?.id || null,
          tanggal, jenis_bbm,
          roda_kendaraan: currentRoda,
          jumlah_kupon,
          nilai_per_kupon: currentNilaiPerKupon,
          kilometer_awal, kilometer_akhir,
          pengemudi: body.querySelector('#f-pengemudi').value.trim() || null,
          keterangan: body.querySelector('#f-ket').value.trim() || null,
        };

        if (existing) { await updateBbm(existing.id, payload); showToast('Perubahan berhasil disimpan.', 'success'); }
        else { await createBbm(payload); showToast('Transaksi baru berhasil ditambahkan.', 'success'); }
        refresh();
      },
      onClose: () => { if (triggerRow) triggerRow.classList.remove('is-editing'); },
    });

    const kendaraanSelect = modal.body.querySelector('#f-kendaraan');
    const jumlahKuponInput = modal.body.querySelector('#f-jumlah-kupon');
    const nilaiKuponPreview = modal.body.querySelector('#f-nilai-kupon-preview');
    const nilaiPreview = modal.body.querySelector('#f-nilai-preview');
    const kmAwalInput = modal.body.querySelector('#f-kmawal');
    const kmAkhirInput = modal.body.querySelector('#f-kmakhir');
    const jarakPreview = modal.body.querySelector('#f-jarak-preview');
    const belanjaInfoSlot = modal.body.querySelector('#belanja-info-slot');

    let resolvedBelanja = null; // { id, kode_rekening, nama_belanja } | null
    let currentRoda = null;
    let currentNilaiPerKupon = null; // nominal aktif dari Pengadaan Kupon BBM (bisa berubah per Tahun Anggaran)

    function findKendaraan(id) { return kendaraanOptions.find((k) => k.id === id) || null; }

    async function onKendaraanChange() {
      const k = findKendaraan(kendaraanSelect.value);
      currentRoda = k?.roda || null;
      const opdId = k?.kib?.opd_id || null;

      if (!currentRoda) {
        nilaiKuponPreview.value = '-';
        currentNilaiPerKupon = null;
        belanjaInfoSlot.innerHTML = `<div class="alert alert--error">Kendaraan ini belum memiliki data Jenis Roda. Lengkapi terlebih dahulu di menu KIB Kendaraan sebelum mencatat BBM.</div>`;
        resolvedBelanja = null;
        updatePreview();
        return;
      }

      nilaiKuponPreview.value = 'Memuat...';
      try {
        currentNilaiPerKupon = await resolveNilaiPerKupon(tahunAnggaranId, opdId, currentRoda);
      } catch (e) {
        currentNilaiPerKupon = null;
      }
      nilaiKuponPreview.value = currentNilaiPerKupon !== null ? formatRupiah(currentNilaiPerKupon) : 'Belum diatur';

      belanjaInfoSlot.innerHTML = `<div class="skeleton" style="height:38px;"></div>`;
      try {
        resolvedBelanja = await resolveBbmBelanja(tahunAnggaranId, currentRoda);
        if (resolvedBelanja) {
          belanjaInfoSlot.innerHTML = `
            <div class="field"><label>Belanja (otomatis berdasarkan Roda)</label>
              <input disabled style="background:var(--gray-100);" value="${escapeAttr(resolvedBelanja.kode_rekening)} — ${escapeAttr(resolvedBelanja.nama_belanja)}" />
            </div>`;
        } else {
          belanjaInfoSlot.innerHTML = `<div class="alert alert--warning">Belum ada rincian Belanja BBM untuk ${escapeHtml(RODA_LABEL[currentRoda])} pada Tahun Anggaran berjalan. Tambahkan di menu Anggaran &gt; Belanja agar realisasi tercatat pada dashboard.</div>`;
        }
      } catch (e) {
        resolvedBelanja = null;
        belanjaInfoSlot.innerHTML = `<div class="alert alert--warning">Gagal memuat data Belanja. Anda tetap bisa menyimpan transaksi tanpa link Belanja.</div>`;
      }
      if (currentNilaiPerKupon === null) {
        belanjaInfoSlot.innerHTML += `<div class="alert alert--error">Belum ada Pengadaan Kupon BBM untuk ${escapeHtml(RODA_LABEL[currentRoda])} pada Tahun Anggaran berjalan. Input dulu nominal &amp; kuotanya di menu Kendaraan &gt; Pengadaan Kupon BBM sebelum mencatat transaksi ini.</div>`;
      }
      updatePreview();
    }

    function updatePreview() {
      const jumlah = Number(jumlahKuponInput.value) || 0;
      const nominal = currentNilaiPerKupon || 0;
      nilaiPreview.value = formatRupiah(jumlah * nominal);
      const kmA = Number(kmAwalInput.value);
      const kmB = Number(kmAkhirInput.value);
      jarakPreview.value = (kmAwalInput.value && kmAkhirInput.value && kmB >= kmA) ? `${kmB - kmA} km` : '-';
    }

    kendaraanSelect.addEventListener('change', onKendaraanChange);
    [jumlahKuponInput, kmAwalInput, kmAkhirInput].forEach((el) => el.addEventListener('input', updatePreview));

    await onKendaraanChange();
    if (existing) {
      // Saat edit, pertahankan Belanja yang sudah tersimpan bila resolver
      // tidak menemukan kecocokan (mis. kode rekening berubah setelahnya).
      if (!resolvedBelanja && existing.belanja?.id) {
        resolvedBelanja = { id: existing.belanja.id, kode_rekening: '(tersimpan)', nama_belanja: existing.belanja.nama_belanja };
      }
      // Nilai per kupon adalah SNAPSHOT historis transaksi ini — selama
      // kendaraan yang dipilih belum diganti, jangan timpa dengan nominal
      // Pengadaan Kupon BBM yang berlaku SEKARANG (bisa saja sudah berubah
      // karena fluktuasi harga BBM sejak transaksi ini dicatat).
      if (kendaraanSelect.value === existing.kendaraan?.id && existing.nilai_per_kupon != null) {
        currentNilaiPerKupon = Number(existing.nilai_per_kupon);
        nilaiKuponPreview.value = `${formatRupiah(currentNilaiPerKupon)} (tersimpan saat transaksi)`;
        updatePreview();
      }
    }
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
