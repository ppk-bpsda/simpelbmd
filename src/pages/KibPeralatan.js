import { listPeralatan, createPeralatan, updatePeralatan, softDeletePeralatan } from '../services/kibService.js';
import { listOpd } from '../services/opdService.js';
import { KATEGORI_OPTIONS, KONDISI_OPTIONS } from '../validators/kibValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog, openFormModal } from '../utils/ui.js';

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
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');

  let opdOptions = [];
  if (profile.role === 'super_admin') {
    try { opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  root.querySelectorAll('.tab-item').forEach((el) => {
    el.addEventListener('click', () => {
      activeTab = el.dataset.tab;
      root.querySelectorAll('.tab-item').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === activeTab));
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

  function openForm(existing = null, triggerRow = null) {
    if (triggerRow) triggerRow.classList.add('is-editing');

    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field"><label>OPD</label><select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}" ${o.id === existing?.opd_id ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}</select></div>`
      : '';

    const bodyHtml = `
      <div class="modal-form">
        <div class="form-section"><div class="form-section__title">Identitas Barang</div></div>
        <div class="field"><label>Nama Barang *</label><input id="f-nama" value="${escapeAttr(existing?.nama_barang)}" /></div>
        <div class="field"><label>Kategori</label>
          <select id="f-kategori">
            ${KATEGORI_OPTIONS.filter((k) => k.value !== 'kendaraan').map((k) => `<option value="${k.value}" ${(existing?.kategori || activeTab) === k.value ? 'selected' : ''}>${k.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Kode Barang</label><input id="f-kodebarang" value="${escapeAttr(existing?.kode_barang)}" /></div>
        <div class="field"><label>Register</label><input id="f-register" value="${escapeAttr(existing?.register)}" /></div>
        <div class="field"><label>Merk</label><input id="f-merk" value="${escapeAttr(existing?.merk)}" /></div>
        <div class="field"><label>Type</label><input id="f-type" value="${escapeAttr(existing?.type)}" /></div>
        <div class="field field--wide"><label>Spesifikasi</label><input id="f-spek" value="${escapeAttr(existing?.spesifikasi)}" /></div>

        <div class="form-section"><div class="form-section__title">Perolehan &amp; Nilai</div></div>
        <div class="field"><label>Tahun Perolehan</label><input id="f-tahun" type="number" value="${existing?.tahun_perolehan || ''}" /></div>
        <div class="field"><label>Jumlah</label><input id="f-jumlah" type="number" min="0" value="${existing?.jumlah || 1}" /></div>
        <div class="field"><label>Satuan</label><input id="f-satuan" value="${escapeAttr(existing?.satuan)}" placeholder="mis. unit, buah" /></div>
        <div class="field"><label>Harga Satuan (Rp)</label><input id="f-hargasatuan" type="number" min="0" value="${existing?.harga_satuan || ''}" /></div>
        <div class="field"><label>Nilai Perolehan (Rp)</label><input id="f-nilai" type="number" min="0" value="${existing?.nilai_perolehan || ''}" />
          <small style="color:var(--gray-500);font-size:11.5px;">Terisi otomatis dari Jumlah &times; Harga Satuan bila dikosongkan.</small>
        </div>
        <div class="field"><label>Kondisi</label>
          <select id="f-kondisi">
            <option value="">—</option>
            ${KONDISI_OPTIONS.map((o) => `<option value="${o.value}" ${existing?.kondisi === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>

        <div class="form-section"><div class="form-section__title">Penempatan</div></div>
        <div class="field"><label>Lokasi</label><input id="f-lokasi" value="${escapeAttr(existing?.lokasi)}" /></div>
        <div class="field"><label>Pengguna</label><input id="f-pengguna" value="${escapeAttr(existing?.pengguna)}" /></div>
        ${opdFieldHtml}
        <div class="field field--wide"><label>Keterangan</label><input id="f-ket" value="${escapeAttr(existing?.keterangan)}" /></div>
      </div>
    `;

    const modal = openFormModal({
      title: existing ? 'Edit Aset / Peralatan' : 'Tambah Aset / Peralatan',
      subtitle: existing
        ? `${escapeHtml(existing.nama_barang || '-')}${existing.register ? ` — Register ${escapeHtml(existing.register)}` : ''}`
        : 'Lengkapi data peralatan atau aset baru.',
      bodyHtml,
      saveLabel: existing ? 'Simpan Perubahan' : 'Simpan',
      onSave: async (body) => {
        const val = (sel) => body.querySelector(sel).value.trim();
        const nama_barang = val('#f-nama');
        if (!nama_barang) { showToast('Nama Barang wajib diisi.', 'warning'); body.querySelector('#f-nama').focus(); return false; }

        const kategori = body.querySelector('#f-kategori').value;
        const opdSelect = body.querySelector('#f-opd');
        const opdId = opdSelect ? opdSelect.value : profile.opd_id;

        const jumlah = Number(val('#f-jumlah')) || 1;
        const harga_satuan = Number(val('#f-hargasatuan')) || null;
        // Bantu user: kalau Nilai Perolehan dikosongkan, hitung dari jumlah x harga satuan.
        const nilai_perolehan = Number(val('#f-nilai')) || (harga_satuan ? harga_satuan * jumlah : null);

        const form = {
          nama_barang,
          kode_barang: val('#f-kodebarang'),
          register: val('#f-register'),
          merk: val('#f-merk'),
          type: val('#f-type'),
          spesifikasi: val('#f-spek'),
          tahun_perolehan: Number(val('#f-tahun')) || null,
          jumlah,
          satuan: val('#f-satuan'),
          harga_satuan,
          nilai_perolehan,
          kondisi: body.querySelector('#f-kondisi').value || null,
          lokasi: val('#f-lokasi'),
          pengguna: val('#f-pengguna'),
          keterangan: val('#f-ket'),
        };

        if (existing) {
          await updatePeralatan(existing.id, { kategori, form });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createPeralatan({ tahunAnggaranId, opdId, kategori, form });
          showToast('Data baru berhasil ditambahkan.', 'success');
        }
        refresh();
      },
      onClose: () => { if (triggerRow) triggerRow.classList.remove('is-editing'); },
    });

    return modal;
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
