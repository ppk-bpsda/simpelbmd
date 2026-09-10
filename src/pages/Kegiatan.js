import {
  listKegiatan, createKegiatan, updateKegiatan, softDeleteKegiatan,
} from '../services/anggaranService.js';
import { listOpd } from '../services/opdService.js';
import { showToast, confirmDialog } from '../utils/ui.js';
import { navigate } from '../router.js';

export async function renderKegiatan(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = emptyPanel('Belum ada Tahun Anggaran aktif', 'Tambahkan Tahun Anggaran terlebih dahulu di menu Administrasi.');
    return;
  }

  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Kegiatan</div>
        <div class="toolbar__subtitle">Struktur: Tahun Anggaran → Kegiatan → Sub Kegiatan → Belanja</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add">+ Tambah Kegiatan</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div id="form-slot"></div>
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');
  let opdOptions = [];

  try {
    opdOptions = profile.role === 'super_admin' ? await listOpd() : [];
  } catch (e) { /* non-fatal */ }

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listKegiatan(tahunAnggaranId);
      if (!rows.length) {
        tableSlot.innerHTML = emptyState('Belum ada Kegiatan', 'Tambahkan Kegiatan baru atau gunakan Import DPA.');
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Kode</th><th>Nama Kegiatan</th><th>OPD</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(r.kode_kegiatan)}</td>
                  <td>
                    <a data-open="${r.id}" style="color:var(--blue-600);cursor:pointer;font-weight:600;">${escapeHtml(r.nama_kegiatan)}</a>
                  </td>
                  <td>${escapeHtml(r.opd?.nama_opd || '-')}</td>
                  <td style="white-space:nowrap;">
                    ${canWrite ? `<button class="btn-ghost" data-edit="${r.id}" data-kode="${escapeAttr(r.kode_kegiatan)}" data-nama="${escapeAttr(r.nama_kegiatan)}">Edit</button>` : ''}
                    ${canDelete ? `<button class="btn-danger-ghost" data-delete="${r.id}">Hapus</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      tableSlot.querySelectorAll('[data-open]').forEach((el) => {
        el.addEventListener('click', () => navigate(`/anggaran/sub-kegiatan?kegiatan=${el.dataset.open}`));
      });
      tableSlot.querySelectorAll('[data-edit]').forEach((el) => {
        el.addEventListener('click', () => openForm({ id: el.dataset.edit, kode: el.dataset.kode, nama: el.dataset.nama }));
      });
      tableSlot.querySelectorAll('[data-delete]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Hapus Kegiatan?',
            message: 'Kegiatan akan dipindahkan ke arsip dan tidak tampil lagi di daftar. Data dapat dipulihkan oleh Administrator.',
            danger: true,
          });
          if (!ok) return;
          try {
            await softDeleteKegiatan(el.dataset.delete, profile.id);
            showToast('Kegiatan berhasil dihapus.', 'success');
            refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Kegiatan. Silakan coba lagi.</div>`;
      console.error('[SIMPELBMD] listKegiatan error:', err.message);
    }
  }

  function openForm(existing = null) {
    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field"><label>OPD</label>
          <select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}">${escapeHtml(o.nama_opd)}</option>`).join('')}</select>
         </div>`
      : '';

    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Kode Kegiatan</label><input id="f-kode" value="${existing ? escapeAttr(existing.kode) : ''}" /></div>
        <div class="field" style="grid-column: span 2;"><label>Nama Kegiatan</label><input id="f-nama" value="${existing ? escapeAttr(existing.nama) : ''}" /></div>
        ${opdFieldHtml}
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
      const opdSelect = formSlot.querySelector('#f-opd');
      const opdId = opdSelect ? opdSelect.value : profile.opd_id;

      if (!kode || !nama) {
        showToast('Kode dan Nama Kegiatan wajib diisi.', 'warning');
        return;
      }
      try {
        if (existing) {
          await updateKegiatan(existing.id, { kode, nama });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createKegiatan({ tahunAnggaranId, opdId, kode, nama });
          showToast('Kegiatan baru berhasil ditambahkan.', 'success');
        }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  if (canWrite) {
    root.querySelector('#btn-add').addEventListener('click', () => openForm());
  }

  refresh();
}

function loadingRows() {
  return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join('');
}
function emptyState(title, desc) {
  return `<div class="empty-state"><strong>${title}</strong>${desc}</div>`;
}
function emptyPanel(title, desc) {
  return `<div class="panel">${emptyState(title, desc)}</div>`;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}
