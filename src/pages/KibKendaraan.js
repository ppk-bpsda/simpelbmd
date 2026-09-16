import { listKendaraan, createKendaraan, updateKendaraan, softDeleteKendaraan } from '../services/kibService.js';
import { listOpd } from '../services/opdService.js';
import { KONDISI_OPTIONS, RODA_OPTIONS } from '../validators/kibValidator.js';
import { formatRupiah } from '../utils/format.js';
import { showToast, confirmDialog, openFormModal } from '../utils/ui.js';

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
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');

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
              <th>Nopol</th><th>Nama Barang</th><th>Merk / Type</th><th>Roda</th><th>Kondisi</th>
              <th class="num">Nilai Perolehan</th><th>OPD</th><th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td style="font-weight:700;">${escapeHtml(r.nopol)}</td>
                  <td>${escapeHtml(r.kib?.nama_barang || '-')}</td>
                  <td>${escapeHtml(r.kib?.merk || '-')} ${escapeHtml(r.kib?.type || '')}</td>
                  <td>${rodaBadge(r.roda)}</td>
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
        el.addEventListener('click', () => openForm(row, el.closest('tr')));
      });
      // Klik di mana saja pada baris juga membuka form edit — user tidak perlu
      // membidik tombol "Edit" yang kecil di ujung kanan tabel.
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

  function openForm(existing = null, triggerRow = null) {
    const k = existing?.kib || {};
    if (triggerRow) triggerRow.classList.add('is-editing');

    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field"><label>OPD</label><select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}" ${o.id === k.opd_id ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}</select></div>`
      : '';

    const bodyHtml = `
      <div class="modal-form">
        <div class="form-section"><div class="form-section__title">Identitas Kendaraan</div></div>
        <div class="field"><label>Nopol *</label><input id="f-nopol" value="${escapeAttr(existing?.nopol)}" style="text-transform:uppercase;" placeholder="mis. N 1234 AB" /></div>
        <div class="field"><label>Jenis Roda *</label>
          <select id="f-roda">
            <option value="">— Pilih —</option>
            ${RODA_OPTIONS.map((o) => `<option value="${o.value}" ${existing?.roda === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
          <small style="color:var(--gray-500);font-size:11.5px;">Menentukan nominal Kupon BBM &amp; rekening belanja BBM otomatis.</small>
        </div>
        <div class="field"><label>Jenis Kendaraan</label><input id="f-jenis" value="${escapeAttr(existing?.jenis_kendaraan)}" /></div>
        <div class="field"><label>Nomor Rangka</label><input id="f-rangka" value="${escapeAttr(existing?.nomor_rangka)}" style="text-transform:uppercase;" /></div>
        <div class="field"><label>Nomor Mesin</label><input id="f-mesin" value="${escapeAttr(existing?.nomor_mesin)}" style="text-transform:uppercase;" /></div>
        <div class="field"><label>Nomor BPKB</label><input id="f-bpkb" value="${escapeAttr(existing?.nomor_bpkb)}" /></div>

        <div class="form-section"><div class="form-section__title">Data KIB</div></div>
        <div class="field"><label>Nama Barang *</label><input id="f-nama" value="${escapeAttr(k.nama_barang)}" /></div>
        <div class="field"><label>Merk</label><input id="f-merk" value="${escapeAttr(k.merk)}" /></div>
        <div class="field"><label>Type</label><input id="f-type" value="${escapeAttr(k.type)}" /></div>
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

        <div class="form-section"><div class="form-section__title">Penempatan &amp; Penanggung Jawab</div></div>
        <div class="field"><label>Lokasi</label><input id="f-lokasi" value="${escapeAttr(k.lokasi)}" /></div>
        <div class="field"><label>Pengguna</label><input id="f-pengguna" value="${escapeAttr(k.pengguna)}" /></div>
        <div class="field"><label>Penanggung Jawab</label><input id="f-pj" value="${escapeAttr(existing?.penanggung_jawab)}" /></div>
        <div class="field"><label>Unit Kerja</label><input id="f-unit" value="${escapeAttr(existing?.unit_kerja)}" /></div>
        ${opdFieldHtml}
      </div>
    `;

    const modal = openFormModal({
      title: existing ? 'Edit Kendaraan' : 'Tambah Kendaraan',
      subtitle: existing
        ? `${escapeHtml(existing.nopol || '-')} — ${escapeHtml(k.nama_barang || 'Tanpa nama barang')}`
        : 'Lengkapi data kendaraan dinas/operasional baru.',
      bodyHtml,
      saveLabel: existing ? 'Simpan Perubahan' : 'Simpan',
      onSave: async (body) => {
        const val = (sel) => body.querySelector(sel).value.trim();
        const nopol = val('#f-nopol').toUpperCase();
        const nama_barang = val('#f-nama');
        const roda = body.querySelector('#f-roda').value || null;

        if (!nopol) { showToast('Nopol wajib diisi.', 'warning'); body.querySelector('#f-nopol').focus(); return false; }
        if (!nama_barang) { showToast('Nama Barang wajib diisi.', 'warning'); body.querySelector('#f-nama').focus(); return false; }
        if (!roda) { showToast('Jenis Roda wajib dipilih (menentukan nominal Kupon BBM).', 'warning'); body.querySelector('#f-roda').focus(); return false; }

        const opdSelect = body.querySelector('#f-opd');
        const opdId = opdSelect ? opdSelect.value : profile.opd_id;

        const payload = {
          kib: {
            nama_barang,
            merk: val('#f-merk'),
            type: val('#f-type'),
            kode_barang: val('#f-kodebarang'),
            register: val('#f-register'),
            tahun_perolehan: Number(val('#f-tahun')) || null,
            nilai_perolehan: Number(val('#f-nilai')) || null,
            kondisi: body.querySelector('#f-kondisi').value || null,
            lokasi: val('#f-lokasi'),
            pengguna: val('#f-pengguna'),
          },
          kendaraan: {
            nopol,
            nomor_rangka: val('#f-rangka').toUpperCase(),
            nomor_mesin: val('#f-mesin').toUpperCase(),
            nomor_bpkb: val('#f-bpkb'),
            jenis_kendaraan: val('#f-jenis'),
            roda,
            penanggung_jawab: val('#f-pj'),
            unit_kerja: val('#f-unit'),
          },
        };

        if (existing) {
          await updateKendaraan(existing.id, existing.kib.id, payload);
          showToast('Perubahan berhasil disimpan.', 'success');
        } else {
          await createKendaraan({ tahunAnggaranId, opdId, ...payload });
          showToast('Kendaraan baru berhasil ditambahkan.', 'success');
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

function rodaBadge(roda) {
  if (roda === 'roda4') return `<span class="status-badge status-badge--info">Roda 4</span>`;
  if (roda === 'roda2') return `<span class="status-badge status-badge--info">Roda 2</span>`;
  return `<span class="status-badge status-badge--warning">Belum diisi</span>`;
}
function kondisiBadge(kondisi) {
  const map = { baik: ['Baik', 'safe'], rusak_ringan: ['Rusak Ringan', 'warning'], rusak_berat: ['Rusak Berat', 'critical'] };
  const [label, variant] = map[kondisi] || ['-', 'info'];
  return `<span class="status-badge status-badge--${variant}">${label}</span>`;
}
function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
