import { listPeralatan, createPeralatan, updatePeralatan, softDeletePeralatan } from '../services/kibService.js';
import { listOpd } from '../services/opdService.js';
import { KATEGORI_OPTIONS, KONDISI_OPTIONS } from '../validators/kibValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderKibPeralatan(root, { tahunAnggaranId, profile, defaultKategori = 'peralatan' }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);
  let activeTab = defaultKategori;

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">KIB Peralatan / Aset</div>
        <div class="toolbar__subtitle">Data induk peralatan kantor dan aset lain di luar kendaraan</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add">+ Tambah Aset</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="stepper-nav" style="max-width:420px;margin-bottom:18px;">
        <div class="stepper-nav__item tab-item ${activeTab === 'peralatan' ? 'is-active' : ''}" data-tab="peralatan">Peralatan</div>
        <div class="stepper-nav__item tab-item ${activeTab === 'aset_lainnya' ? 'is-active' : ''}" data-tab="aset_lainnya">Aset Lainnya</div>
      </div>
      <div id="form-slot"></div>
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');

  let opdOptions = [];
  if (profile.role === 'super_admin') {
    try { opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  root.querySelectorAll('.tab-item').forEach((el) => {
    el.addEventListener('click', () => {
      activeTab = el.dataset.tab;
      root.querySelectorAll('.tab-item').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === activeTab));
      formSlot.innerHTML = '';
      refresh();
    });
  });

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listPeralatan(tahunAnggaranId, activeTab);
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data</strong>Tambahkan data baru atau gunakan Import KIB.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Register</th><th>Nama Barang</th><th>Merk / Type</th><th>Kondisi</th>
              <th class="num">Jumlah</th><th class="num">Nilai Perolehan</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(r.register || '-')}</td>
                  <td>${escapeHtml(r.nama_barang)}</td>
                  <td>${escapeHtml(r.merk || '-')} ${escapeHtml(r.type || '')}</td>
                  <td>${kondisiBadge(r.kondisi)}</td>
                  <td class="num">${r.jumlah || 1} ${escapeHtml(r.satuan || '')}</td>
                  <td class="num">${formatRupiah(r.nilai_perolehan || 0)}</td>
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
          const ok = await confirmDialog({ title: 'Hapus Aset?', message: 'Data akan dipindahkan ke arsip.', danger: true });
          if (!ok) return;
          try {
            await softDeletePeralatan(el.dataset.deleteId, profile.id);
            showToast('Data berhasil dihapus.', 'success');
            refresh();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data.</div>`;
    }
  }

  function openForm(existing = null) {
    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field"><label>OPD</label><select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}" ${o.id === existing?.opd_id ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}</select></div>`
      : '';
    formSlot.innerHTML = `
      <div class="inline-form" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
        ${opdFieldHtml}
        <div class="field">
          <label>Kategori</label>
          <select id="f-kategori">
            ${KATEGORI_OPTIONS.filter((k) => k.value !== 'kendaraan').map((k) => `<option value="${k.value}" ${(existing?.kategori || activeTab) === k.value ? 'selected' : ''}>${k.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Nama Barang *</label><input id="f-nama" value="${escapeAttr(existing?.nama_barang)}" /></div>
        <div class="field"><label>Kode Barang</label><input id="f-kodebarang" value="${escapeAttr(existing?.kode_barang)}" /></div>
        <div class="field"><label>Register</label><input id="f-register" value="${escapeAttr(existing?.register)}" /></div>
        <div class="field"><label>Merk</label><input id="f-merk" value="${escapeAttr(existing?.merk)}" /></div>
        <div class="field"><label>Type</label><input id="f-type" value="${escapeAttr(existing?.type)}" /></div>
        <div class="field" style="grid-column:span 2;"><label>Spesifikasi</label><input id="f-spek" value="${escapeAttr(existing?.spesifikasi)}" /></div>
        <div class="field"><label>Tahun Perolehan</label><input id="f-tahun" type="number" value="${existing?.tahun_perolehan || ''}" /></div>
        <div class="field"><label>Jumlah</label><input id="f-jumlah" type="number" min="0" value="${existing?.jumlah || 1}" /></div>
        <div class="field"><label>Satuan</label><input id="f-satuan" value="${escapeAttr(existing?.satuan)}" /></div>
        <div class="field"><label>Harga Satuan (Rp)</label><input id="f-hargasatuan" type="number" min="0" value="${existing?.harga_satuan || ''}" /></div>
        <div class="field"><label>Nilai Perolehan (Rp)</label><input id="f-nilai" type="number" min="0" value="${existing?.nilai_perolehan || ''}" /></div>
        <div class="field"><label>Kondisi</label>
          <select id="f-kondisi">
            <option value="">—</option>
            ${KONDISI_OPTIONS.map((o) => `<option value="${o.value}" ${existing?.kondisi === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Lokasi</label><input id="f-lokasi" value="${escapeAttr(existing?.lokasi)}" /></div>
        <div class="field"><label>Pengguna</label><input id="f-pengguna" value="${escapeAttr(existing?.pengguna)}" /></div>
        <div class="field" style="grid-column:span 2;"><label>Keterangan</label><input id="f-ket" value="${escapeAttr(existing?.keterangan)}" /></div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">${existing ? 'Simpan Perubahan' : 'Simpan'}</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;

    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const nama_barang = formSlot.querySelector('#f-nama').value.trim();
      if (!nama_barang) { showToast('Nama Barang wajib diisi.', 'warning'); return; }
      const kategori = formSlot.querySelector('#f-kategori').value;
      const opdSelect = formSlot.querySelector('#f-opd');
      const opdId = opdSelect ? opdSelect.value : profile.opd_id;
      const form = {
        nama_barang,
        kode_barang: formSlot.querySelector('#f-kodebarang').value.trim(),
        register: formSlot.querySelector('#f-register').value.trim(),
        merk: formSlot.querySelector('#f-merk').value.trim(),
        type: formSlot.querySelector('#f-type').value.trim(),
        spesifikasi: formSlot.querySelector('#f-spek').value.trim(),
        tahun_perolehan: Number(formSlot.querySelector('#f-tahun').value) || null,
        jumlah: Number(formSlot.querySelector('#f-jumlah').value) || 1,
        satuan: formSlot.querySelector('#f-satuan').value.trim(),
        harga_satuan: Number(formSlot.querySelector('#f-hargasatuan').value) || null,
        nilai_perolehan: Number(formSlot.querySelector('#f-nilai').value) || null,
        kondisi: formSlot.querySelector('#f-kondisi').value || null,
        lokasi: formSlot.querySelector('#f-lokasi').value.trim(),
        pengguna: formSlot.querySelector('#f-pengguna').value.trim(),
        keterangan: formSlot.querySelector('#f-ket').value.trim(),
      };
      try {
        if (existing) {
          await updatePeralatan(existing.id, { kategori, form });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createPeralatan({ tahunAnggaranId, opdId, kategori, form });
          showToast('Data baru berhasil ditambahkan.', 'success');
        }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  if (canWrite) root.querySelector('#btn-add').addEventListener('click', () => openForm());

  refresh();
}

function kondisiBadge(kondisi) {
  const map = { baik: ['Baik', 'safe'], rusak_ringan: ['Rusak Ringan', 'warning'], rusak_berat: ['Rusak Berat', 'critical'] };
  const [label, variant] = map[kondisi] || ['-', 'info'];
  return `<span class="status-badge status-badge--${variant}">${label}</span>`;
}
function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
