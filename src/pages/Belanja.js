import { listSubKegiatanByTahun, listBelanja, createBelanja, updateBelanja, softDeleteBelanja } from '../services/anggaranService.js';
import { KELOMPOK_OPTIONS } from '../validators/dpaValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog } from '../utils/ui.js';
import { currentQuery, navigate } from '../router.js';

export async function renderBelanja(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);
  const preselectedSub = currentQuery().get('sub_kegiatan') || '';

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Belanja</div>
        <div class="toolbar__subtitle">Rincian belanja beserta Pagu per Sub Kegiatan</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add" disabled>+ Tambah Belanja</button>` : ''}
      </div>
    </div>
    <div class="panel">
      <div class="field" style="max-width:480px;margin-bottom:16px;">
        <label>Sub Kegiatan</label>
        <select id="sub-select"><option value="">Memuat...</option></select>
      </div>
      <div id="form-slot"></div>
      <div id="table-slot"></div>
    </div>
  `;

  const subSelect = root.querySelector('#sub-select');
  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');
  const addBtn = root.querySelector('#btn-add');

  let subList = [];
  try {
    subList = await listSubKegiatanByTahun(tahunAnggaranId);
  } catch (e) {
    subSelect.innerHTML = `<option value="">Gagal memuat</option>`;
  }

  if (!subList.length) {
    subSelect.innerHTML = `<option value="">Belum ada Sub Kegiatan</option>`;
    tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada Sub Kegiatan</strong>Tambahkan Kegiatan dan Sub Kegiatan terlebih dahulu.</div>`;
    return;
  }

  subSelect.innerHTML = subList
    .map((s) => `<option value="${s.id}" ${s.id === preselectedSub ? 'selected' : ''}>${escapeHtml(s.kegiatan.kode_kegiatan)} / ${escapeHtml(s.kode_sub_kegiatan)} — ${escapeHtml(s.nama_sub_kegiatan)}</option>`)
    .join('');

  let currentSubId = preselectedSub || subList[0].id;
  subSelect.value = currentSubId;
  addBtn && (addBtn.disabled = false);

  subSelect.addEventListener('change', () => {
    currentSubId = subSelect.value;
    navigate(`/anggaran/belanja?sub_kegiatan=${currentSubId}`);
    refresh();
  });

  async function refresh() {
    tableSlot.innerHTML = `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`;
    try {
      const rows = await listBelanja(currentSubId);
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada Belanja</strong>Tambahkan rincian belanja baru atau gunakan Import DPA.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Kode Rekening</th><th>Nama Belanja</th><th>Kelompok</th><th class="num">Pagu</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(r.kode_rekening)}</td>
                  <td>${escapeHtml(r.nama_belanja)}</td>
                  <td>${kelompokBadge(r.kelompok)}</td>
                  <td class="num">${formatRupiah(r.pagu)}</td>
                  <td style="white-space:nowrap;">
                    ${canWrite ? `<button class="btn-ghost" data-edit='${JSON.stringify({ id: r.id, kode: r.kode_rekening, nama: r.nama_belanja, kelompok: r.kelompok, pagu: r.pagu })}'>Edit</button>` : ''}
                    ${canDelete ? `<button class="btn-danger-ghost" data-delete="${r.id}">Hapus</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      tableSlot.querySelectorAll('[data-edit]').forEach((el) => {
        el.addEventListener('click', () => openForm(JSON.parse(el.dataset.edit)));
      });
      tableSlot.querySelectorAll('[data-delete]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Hapus Belanja?', message: 'Data akan dipindahkan ke arsip dan tidak dihitung lagi pada dashboard.', danger: true });
          if (!ok) return;
          try {
            await softDeleteBelanja(el.dataset.delete, profile.id);
            showToast('Belanja berhasil dihapus.', 'success');
            refresh();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat Belanja.</div>`;
    }
  }

  function openForm(existing = null) {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Kode Rekening</label><input id="f-kode" value="${existing ? escapeAttr(existing.kode) : ''}" /></div>
        <div class="field" style="grid-column: span 2;"><label>Nama Belanja</label><input id="f-nama" value="${existing ? escapeAttr(existing.nama) : ''}" /></div>
        <div class="field">
          <label>Kelompok</label>
          <select id="f-kelompok">
            ${KELOMPOK_OPTIONS.map((k) => `<option value="${k.value}" ${existing?.kelompok === k.value ? 'selected' : ''}>${k.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Pagu (Rp)</label><input id="f-pagu" type="number" min="0" step="1" value="${existing ? existing.pagu : ''}" /></div>
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
      const kelompok = formSlot.querySelector('#f-kelompok').value;
      const pagu = Number(formSlot.querySelector('#f-pagu').value);

      if (!kode || !nama) { showToast('Kode dan Nama Belanja wajib diisi.', 'warning'); return; }
      if (!Number.isFinite(pagu) || pagu < 0) { showToast('Pagu harus berupa angka dan tidak boleh negatif.', 'warning'); return; }

      try {
        if (existing) {
          await updateBelanja(existing.id, { kode, nama, kelompok, pagu });
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createBelanja({ subKegiatanId: currentSubId, kode, nama, kelompok, pagu });
          showToast('Belanja baru berhasil ditambahkan.', 'success');
        }
        formSlot.innerHTML = '';
        refresh();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  if (canWrite) addBtn.addEventListener('click', () => openForm());

  refresh();
}

function kelompokBadge(kelompok) {
  const map = {
    pajak_perijinan: ['Pajak/Perijinan', 'info'],
    pemeliharaan: ['Pemeliharaan', 'warning'],
    bbm: ['BBM/Kupon', 'safe'],
    lainnya: ['Lainnya', 'info'],
  };
  const [label, variant] = map[kelompok] || ['Lainnya', 'info'];
  return `<span class="status-badge status-badge--${variant}">${label}</span>`;
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
