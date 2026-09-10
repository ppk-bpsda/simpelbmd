import { listTahunAnggaran, createTahunAnggaran, setTahunAnggaranAktif } from '../services/tahunAnggaranService.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderAdminTahunAnggaran(root, { profile }) {
  if (profile.role !== 'super_admin') {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Akses Ditolak</strong>Hanya Super Admin yang dapat mengelola Tahun Anggaran.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Tahun Anggaran</div>
        <div class="toolbar__subtitle">Kelola Tahun Anggaran dan tentukan yang aktif</div>
      </div>
      <div class="toolbar__actions"><button class="btn btn-solid" id="btn-add">+ Tambah Tahun Anggaran</button></div>
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
      const rows = await listTahunAnggaran();
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada Tahun Anggaran</strong></div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Tahun</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td style="font-weight:700;">${r.tahun}</td>
                  <td>${r.status_aktif ? '<span class="status-badge status-badge--safe">Aktif</span>' : '<span class="status-badge status-badge--info">Nonaktif</span>'}</td>
                  <td>${!r.status_aktif ? `<button class="btn-ghost" data-activate="${r.id}">Jadikan Aktif</button>` : ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      tableSlot.querySelectorAll('[data-activate]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Aktifkan Tahun Anggaran ini?',
            message: 'Seluruh dashboard dan transaksi baru akan otomatis mengikuti Tahun Anggaran ini setelah Anda memuat ulang halaman.',
          });
          if (!ok) return;
          try {
            await setTahunAnggaranAktif(el.dataset.activate);
            showToast('Tahun Anggaran aktif berhasil diubah. Memuat ulang...', 'success');
            setTimeout(() => window.location.reload(), 900);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Tahun Anggaran.</div>`;
    }
  }

  function openForm() {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Tahun</label><input id="f-tahun" type="number" min="2000" max="2100" placeholder="mis. 2027" /></div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">Simpan</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;
    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const tahun = Number(formSlot.querySelector('#f-tahun').value);
      if (!tahun || tahun < 2000 || tahun > 2100) { showToast('Tahun tidak valid.', 'warning'); return; }
      try {
        await createTahunAnggaran(tahun);
        showToast('Tahun Anggaran berhasil ditambahkan.', 'success');
        formSlot.innerHTML = '';
        refresh();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  root.querySelector('#btn-add').addEventListener('click', openForm);
  refresh();
}
