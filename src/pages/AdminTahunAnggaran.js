import { listTahunAnggaran, createTahunAnggaran, setActiveTahunAnggaran, softDeleteTahunAnggaran } from '../services/tahunAnggaranService.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderAdminTahunAnggaran(root, { profile }) {
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Administrasi — Tahun Anggaran</div>
        <div class="toolbar__subtitle">Hanya satu Tahun Anggaran yang boleh berstatus Aktif pada satu waktu</div>
      </div>
      <div class="toolbar__actions"><button class="btn btn-solid" id="btn-add">+ Tambah Tahun Anggaran</button></div>
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
      const rows = await listTahunAnggaran();
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada Tahun Anggaran</strong>Tambahkan Tahun Anggaran untuk mulai memasukkan DPA.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Tahun</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${r.tahun}</td>
                  <td>${r.status_aktif ? `<span class="status-badge status-badge--safe">Aktif</span>` : `<span class="status-badge">Nonaktif</span>`}</td>
                  <td style="white-space:nowrap;">
                    ${!r.status_aktif ? `<button class="btn-ghost" data-activate="${r.id}">Jadikan Aktif</button>` : ''}
                    <button class="btn-danger-ghost" data-delete="${r.id}" ${r.status_aktif ? 'disabled title="Nonaktifkan dulu sebelum menghapus"' : ''}>Hapus</button>
                  </td>
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
            message: 'Tahun Anggaran yang sedang aktif akan otomatis dinonaktifkan. Seluruh menu Dashboard/Monitoring/Laporan akan langsung mengacu ke Tahun Anggaran baru ini.',
          });
          if (!ok) return;
          try {
            await setActiveTahunAnggaran(el.dataset.activate);
            showToast('Tahun Anggaran aktif berhasil diubah. Memuat ulang…', 'success');
            refresh();
            setTimeout(() => window.location.reload(), 700);
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
      tableSlot.querySelectorAll('[data-delete]:not([disabled])').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Hapus Tahun Anggaran?',
            message: 'Seluruh data Kegiatan/Sub Kegiatan/Belanja pada Tahun Anggaran ini TIDAK ikut terhapus, hanya Tahun Anggarannya yang diarsipkan.',
            danger: true,
          });
          if (!ok) return;
          try {
            await softDeleteTahunAnggaran(el.dataset.delete, profile.id);
            showToast('Tahun Anggaran berhasil dihapus.', 'success');
            refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Tahun Anggaran.</div>`;
      console.error('[SIMBMD] listTahunAnggaran error:', err.message);
    }
  }

  function openForm() {
    const nextYear = new Date().getFullYear();
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Tahun</label><input id="f-tahun" type="number" min="2000" max="2100" value="${nextYear}" /></div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">Simpan</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;
    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const tahun = Number(formSlot.querySelector('#f-tahun').value);
      if (!tahun || tahun < 2000 || tahun > 2100) {
        showToast('Tahun tidak valid.', 'warning');
        return;
      }
      try {
        await createTahunAnggaran({ tahun });
        showToast('Tahun Anggaran baru berhasil ditambahkan.', 'success');
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  root.querySelector('#btn-add').addEventListener('click', openForm);
  refresh();
}

function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
