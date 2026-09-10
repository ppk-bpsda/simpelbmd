import { listKendaraan, createKendaraan, updateKendaraan, softDeleteKendaraan } from '../services/kibService.js';
import { listOpd } from '../services/opdService.js';
import { KONDISI_OPTIONS } from '../validators/kibValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog } from '../utils/ui.js';

export async function renderKibKendaraan(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const canWrite = ['super_admin', 'admin_opd', 'operator'].includes(profile.role);
  const canDelete = ['super_admin', 'admin_opd'].includes(profile.role);

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">KIB Kendaraan</div>
        <div class="toolbar__subtitle">Data induk kendaraan dinas/operasional (KIB + identitas kendaraan)</div>
      </div>
      <div class="toolbar__actions">
        ${canWrite ? `<button class="btn btn-solid" id="btn-add">+ Tambah Kendaraan</button>` : ''}
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
  if (profile.role === 'super_admin') {
    try { opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listKendaraan(tahunAnggaranId);
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data Kendaraan</strong>Tambahkan kendaraan baru atau gunakan Import KIB.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>
              <th>Nopol</th><th>Nama Barang</th><th>Merk / Type</th><th>Kondisi</th>
              <th class="num">Nilai Perolehan</th><th>OPD</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td style="font-weight:700;">${escapeHtml(r.nopol)}</td>
                  <td>${escapeHtml(r.kib?.nama_barang || '-')}</td>
                  <td>${escapeHtml(r.kib?.merk || '-')} ${escapeHtml(r.kib?.type || '')}</td>
                  <td>${kondisiBadge(r.kib?.kondisi)}</td>
                  <td class="num">${formatRupiah(r.kib?.nilai_perolehan || 0)}</td>
                  <td>${escapeHtml(r.kib?.opd?.nama_opd || '-')}</td>
                  <td style="white-space:nowrap;">
                    ${canWrite ? `<button class="btn-ghost" data-edit-id="${r.id}">Edit</button>` : ''}
                    ${canDelete ? `<button class="btn-danger-ghost" data-delete-id="${r.id}" data-kib-id="${r.kib.id}">Hapus</button>` : ''}
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
          const ok = await confirmDialog({
            title: 'Hapus Kendaraan?',
            message: 'Data kendaraan akan dipindahkan ke arsip. Riwayat pajak/pemeliharaan/BBM terkait tetap tersimpan.',
            danger: true,
          });
          if (!ok) return;
          try {
            await softDeleteKendaraan(el.dataset.deleteId, el.dataset.kibId, profile.id);
            showToast('Kendaraan berhasil dihapus.', 'success');
            refresh();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Kendaraan.</div>`;
      console.error('[SIMPELBMD] listKendaraan error:', err.message);
    }
  }

  function openForm(existing = null) {
    const k = existing?.kib || {};
    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field"><label>OPD</label><select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}" ${o.id === k.opd_id ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}</select></div>`
      : '';

    formSlot.innerHTML = `
      <div class="inline-form" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
        <div class="field"><label>Nopol *</label><input id="f-nopol" value="${escapeAttr(existing?.nopol)}" style="text-transform:uppercase;" /></div>
        <div class="field"><label>Nama Barang *</label><input id="f-nama" value="${escapeAttr(k.nama_barang)}" /></div>
        <div class="field"><label>Merk</label><input id="f-merk" value="${escapeAttr(k.merk)}" /></div>
        <div class="field"><label>Type</label><input id="f-type" value="${escapeAttr(k.type)}" /></div>
        <div class="field"><label>Jenis Kendaraan</label><input id="f-jenis" value="${escapeAttr(existing?.jenis_kendaraan)}" /></div>
        <div class="field"><label>Kode Barang</label><input id="f-kodebarang" value="${escapeAttr(k.kode_barang)}" /></div>
        <div class="field"><label>Register</label><input id="f-register" value="${escapeAttr(k.register)}" /></div>
        <div class="field"><label>Tahun Perolehan</label><input id="f-tahun" type="number" value="${k.tahun_perolehan || ''}" /></div>
        <div class="field"><label>Nilai Perolehan (Rp)</label><input id="f-nilai" type="number" min="0" value="${k.nilai_perolehan || ''}" /></div>
        <div class="field"><label>Kondisi</label>
          <select id="f-kondisi">
            <option value="">—</option>
            ${KONDISI_OPTIONS.map((o) => `<option value="${o.value}" ${k.kondisi === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Lokasi</label><input id="f-lokasi" value="${escapeAttr(k.lokasi)}" /></div>
        <div class="field"><label>Pengguna</label><input id="f-pengguna" value="${escapeAttr(k.pengguna)}" /></div>
        <div class="field"><label>Nomor Rangka</label><input id="f-rangka" value="${escapeAttr(existing?.nomor_rangka)}" style="text-transform:uppercase;" /></div>
        <div class="field"><label>Nomor Mesin</label><input id="f-mesin" value="${escapeAttr(existing?.nomor_mesin)}" style="text-transform:uppercase;" /></div>
        <div class="field"><label>Nomor BPKB</label><input id="f-bpkb" value="${escapeAttr(existing?.nomor_bpkb)}" /></div>
        <div class="field"><label>Penanggung Jawab</label><input id="f-pj" value="${escapeAttr(existing?.penanggung_jawab)}" /></div>
        <div class="field"><label>Unit Kerja</label><input id="f-unit" value="${escapeAttr(existing?.unit_kerja)}" /></div>
        ${opdFieldHtml}
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">${existing ? 'Simpan Perubahan' : 'Simpan'}</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;

    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const nopol = formSlot.querySelector('#f-nopol').value.trim().toUpperCase();
      const nama_barang = formSlot.querySelector('#f-nama').value.trim();
      if (!nopol || !nama_barang) { showToast('Nopol dan Nama Barang wajib diisi.', 'warning'); return; }

      const opdSelect = formSlot.querySelector('#f-opd');
      const opdId = opdSelect ? opdSelect.value : profile.opd_id;

      const payload = {
        kib: {
          nama_barang,
          merk: formSlot.querySelector('#f-merk').value.trim(),
          type: formSlot.querySelector('#f-type').value.trim(),
          kode_barang: formSlot.querySelector('#f-kodebarang').value.trim(),
          register: formSlot.querySelector('#f-register').value.trim(),
          tahun_perolehan: Number(formSlot.querySelector('#f-tahun').value) || null,
          nilai_perolehan: Number(formSlot.querySelector('#f-nilai').value) || null,
          kondisi: formSlot.querySelector('#f-kondisi').value || null,
          lokasi: formSlot.querySelector('#f-lokasi').value.trim(),
          pengguna: formSlot.querySelector('#f-pengguna').value.trim(),
        },
        kendaraan: {
          nopol,
          nomor_rangka: formSlot.querySelector('#f-rangka').value.trim().toUpperCase(),
          nomor_mesin: formSlot.querySelector('#f-mesin').value.trim().toUpperCase(),
          nomor_bpkb: formSlot.querySelector('#f-bpkb').value.trim(),
          jenis_kendaraan: formSlot.querySelector('#f-jenis').value.trim(),
          penanggung_jawab: formSlot.querySelector('#f-pj').value.trim(),
          unit_kerja: formSlot.querySelector('#f-unit').value.trim(),
        },
      };

      try {
        if (existing) {
          await updateKendaraan(existing.id, existing.kib.id, payload);
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createKendaraan({ tahunAnggaranId, opdId, ...payload });
          showToast('Kendaraan baru berhasil ditambahkan.', 'success');
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
