import { listKegiatan, listSubKegiatan, createSubKegiatan, updateSubKegiatan, softDeleteSubKegiatan } from '../services/anggaranService.js';
import { showToast, confirmDialog } from '../utils/ui.js';
import { navigate, currentQuery } from '../router.js';

export async function renderSubKegiatan(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);
  const preselectedKegiatan = currentQuery().get('kegiatan') || '';

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Sub Kegiatan</div>
        <div class="toolbar__subtitle">Pilih Kegiatan untuk melihat Sub Kegiatan di bawahnya</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add" disabled>+ Tambah Sub Kegiatan</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="field" style="max-width:420px;margin-bottom:16px;">
        <label>Kegiatan</label>
        <select id="kegiatan-select"><option value="">Memuat daftar kegiatan...</option></select>
      </div>
      <div id="form-slot"></div>
      <div id="table-slot"></div>
    </div>
  `;

  const kegiatanSelect = root.querySelector('#kegiatan-select');
  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');
  const addBtn = root.querySelector('#btn-add');

  let kegiatanList = [];
  try {
    kegiatanList = await listKegiatan(tahunAnggaranId);
  } catch (e) {
    kegiatanSelect.innerHTML = `<option value="">Gagal memuat</option>`;
  }

  if (!kegiatanList.length) {
    kegiatanSelect.innerHTML = `<option value="">Belum ada Kegiatan</option>`;
    tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada Kegiatan</strong>Tambahkan Kegiatan terlebih dahulu di menu Kegiatan.</div>`;
    return;
  }

  kegiatanSelect.innerHTML = kegiatanList
    .map((k) => `<option value="${k.id}" ${k.id === preselectedKegiatan ? 'selected' : ''}>${escapeHtml(k.kode_kegiatan)} — ${escapeHtml(k.nama_kegiatan)}</option>`)
    .join('');

  let currentKegiatanId = preselectedKegiatan || kegiatanList[0].id;
  kegiatanSelect.value = currentKegiatanId;
  addBtn && (addBtn.disabled = false);

  kegiatanSelect.addEventListener('change', () => {
    currentKegiatanId = kegiatanSelect.value;
    navigate(`/anggaran/sub-kegiatan?kegiatan=${currentKegiatanId}`);
    refresh();
  });

  async function refresh() {
    tableSlot.innerHTML = `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`;
    try {
      const rows = await listSubKegiatan(currentKegiatanId);
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada Sub Kegiatan</strong>Tambahkan Sub Kegiatan baru atau gunakan Import DPA.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Kode</th><th>Nama Sub Kegiatan</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(r.kode_sub_kegiatan)}</td>
                  <td><a data-open="${r.id}" style="color:var(--blue-600);cursor:pointer;font-weight:600;">${escapeHtml(r.nama_sub_kegiatan)}</a></td>
                  <td style="white-space:nowrap;">
                    ${canWrite ? `<button class="btn-ghost" data-edit="${r.id}" data-kode="${escapeAttr(r.kode_sub_kegiatan)}" data-nama="${escapeAttr(r.nama_sub_kegiatan)}">Edit</button>` : ''}
                    ${canDelete ? `<button class="btn-danger-ghost" data-delete="${r.id}">Hapus</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      tableSlot.querySelectorAll('[data-open]').forEach((el) => {
        el.addEventListener('click', () => navigate(`/anggaran/belanja?sub_kegiatan=${el.dataset.open}`));
      });
      tableSlot.querySelectorAll('[data-edit]').forEach((el) => {
        el.addEventListener('click', () => openForm({ id: el.dataset.edit, kode: el.dataset.kode, nama: el.dataset.nama }));
      });
      tableSlot.querySelectorAll('[data-delete]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Hapus Sub Kegiatan?', message: 'Data akan dipindahkan ke arsip.', danger: true });
          if (!ok) return;
          try {
            await softDeleteSubKegiatan(el.dataset.delete, profile.id);
            showToast('Sub Kegiatan berhasil dihapus.', 'success');
            refresh();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat Sub Kegiatan.</div>`;
    }
  }

  function openForm(existing = null) {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Kode Sub Kegiatan</label><input id="f-kode" value="${existing ? escapeAttr(existing.kode) : ''}" /></div>
        <div class="field" style="grid-column: span 2;"><label>Nama Sub Kegiatan</label><input id="f-nama" value="${existing ? escapeAttr(existing.nama) : ''}" /></div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">${existing ? 'Simpan Perubahan' : 'Simpan'}</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;
    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const kode = formSlot.querySelector('#f-kode').value.trim();
      const nama = formSlot.querySelector('#f-nama').value.trim();
      if (!kode || !nama) { showToast('Kode dan Nama wajib diisi.', 'warning'); return; }
      try {
        if (existing) {
          await updateSubKegiatan(existing.id, { kode, nama });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createSubKegiatan({ kegiatanId: currentKegiatanId, kode, nama });
          showToast('Sub Kegiatan baru berhasil ditambahkan.', 'success');
        }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  if (canWrite) addBtn.addEventListener('click', () => openForm());

  refresh();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
