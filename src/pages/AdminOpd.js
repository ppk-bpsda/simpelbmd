import { listOpdAll, createOpd, updateOpd, softDeleteOpd } from '../services/opdService.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderAdminOpd(root, { profile }) {
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Administrasi — OPD</div>
        <div class="toolbar__subtitle">Daftar Organisasi Perangkat Daerah pengguna aplikasi</div>
      </div>
      <div class="toolbar__actions"><button class="btn btn-solid" id="btn-add">+ Tambah OPD</button></div>
    </div>
    <div class="panel">
      <div id="form-slot"></div>
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listOpdAll();
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada OPD</strong>Tambahkan OPD baru untuk mulai memetakan pengguna.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Kode</th><th>Nama OPD</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(r.kode_opd)}</td>
                  <td>${escapeHtml(r.nama_opd)}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn-ghost" data-edit="${r.id}" data-kode="${escapeAttr(r.kode_opd)}" data-nama="${escapeAttr(r.nama_opd)}" data-status="${r.status}">Edit</button>
                    <button class="btn-danger-ghost" data-delete="${r.id}">Hapus</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      tableSlot.querySelectorAll('[data-edit]').forEach((el) => {
        el.addEventListener('click', () => openForm({
          id: el.dataset.edit, kode: el.dataset.kode, nama: el.dataset.nama, status: el.dataset.status,
        }));
      });
      tableSlot.querySelectorAll('[data-delete]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Hapus OPD?',
            message: 'OPD akan diarsipkan. Pastikan tidak ada user/kegiatan aktif yang masih memakai OPD ini.',
            danger: true,
          });
          if (!ok) return;
          try {
            await softDeleteOpd(el.dataset.delete, profile.id);
            showToast('OPD berhasil dihapus.', 'success');
            refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data OPD.</div>`;
      console.error('[SIMPELBMD] listOpdAll error:', err.message);
    }
  }

  function openForm(existing = null) {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Kode OPD</label><input id="f-kode" value="${existing ? escapeAttr(existing.kode) : ''}" /></div>
        <div class="field" style="grid-column: span 2;"><label>Nama OPD</label><input id="f-nama" value="${existing ? escapeAttr(existing.nama) : ''}" /></div>
        ${existing ? `<div class="field"><label>Status</label>
          <select id="f-status"><option value="aktif" ${existing.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="nonaktif" ${existing.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option></select>
        </div>` : ''}
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
      const statusSelect = formSlot.querySelector('#f-status');
      if (!kode || !nama) {
        showToast('Kode dan Nama OPD wajib diisi.', 'warning');
        return;
      }
      try {
        if (existing) {
          await updateOpd(existing.id, { kode, nama, status: statusSelect ? statusSelect.value : undefined });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createOpd({ kode, nama });
          showToast('OPD baru berhasil ditambahkan.', 'success');
        }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function statusBadge(s) {
    return s === 'aktif'
      ? `<span class="status-badge status-badge--safe">Aktif</span>`
      : `<span class="status-badge status-badge--warning">Nonaktif</span>`;
  }

  root.querySelector('#btn-add').addEventListener('click', () => openForm());
  refresh();
}

function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
