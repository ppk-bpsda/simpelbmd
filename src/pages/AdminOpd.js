import { listAllOpd, createOpd, updateOpd } from '../services/opdService.js';
import { showToast } from '../utils/ui.js';

export async function renderAdminOpd(root, { profile }) {
  if (profile.role !== 'super_admin') {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Akses Ditolak</strong>Hanya Super Admin yang dapat mengelola OPD.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">OPD</div>
        <div class="toolbar__subtitle">Daftar Organisasi Perangkat Daerah</div>
      </div>
      <div class="toolbar__actions"><button class="btn btn-solid" id="btn-add">+ Tambah OPD</button></div>
    </div>
    <div class="panel">
      <div id="form-slot"></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');

  async function refresh() {
    tableSlot.innerHTML = `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`;
    try {
      const rows = await listAllOpd();
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada OPD</strong></div>`;
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
                  <td><span class="status-badge status-badge--${r.status === 'aktif' ? 'safe' : 'critical'}">${r.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td><button class="btn-ghost" data-edit='${JSON.stringify(r)}'>Edit</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      tableSlot.querySelectorAll('[data-edit]').forEach((el) => {
        el.addEventListener('click', () => openForm(JSON.parse(el.dataset.edit)));
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data OPD.</div>`;
    }
  }

  function openForm(existing = null) {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Kode OPD</label><input id="f-kode" value="${escapeAttr(existing?.kode_opd)}" /></div>
        <div class="field" style="grid-column:span 2;"><label>Nama OPD</label><input id="f-nama" value="${escapeAttr(existing?.nama_opd)}" /></div>
        ${existing ? `<div class="field"><label>Status</label>
          <select id="f-status">
            <option value="aktif" ${existing.status === 'aktif' ? 'selected' : ''}>Aktif</option>
            <option value="nonaktif" ${existing.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option>
          </select>
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
      if (!kode || !nama) { showToast('Kode dan Nama OPD wajib diisi.', 'warning'); return; }
      try {
        if (existing) {
          const status = formSlot.querySelector('#f-status').value;
          await updateOpd(existing.id, { kode, nama, status });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createOpd({ kode, nama });
          showToast('OPD baru berhasil ditambahkan.', 'success');
        }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  root.querySelector('#btn-add').addEventListener('click', () => openForm());
  refresh();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
