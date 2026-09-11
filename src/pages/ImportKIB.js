import { listOpd } from '../services/opdService.js';
import {
  parseKibFile, suggestKibColumnMapping, applyKibMappingAndValidate,
  commitKibImport, downloadKibTemplate, KIB_TARGET_FIELDS, kibRequiredFields,
} from '../services/importKibService.js';
import { formatRupiah } from '../utils/format.js';
import { showToast } from '../utils/ui.js';

const STEPS = ['Unggah File', 'Mapping Kolom', 'Preview & Validasi', 'Hasil Import'];

export async function renderImportKIB(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const state = {
    step: 0, file: null, headers: [], rawRows: [], mapping: {}, validated: [],
    opdId: profile.role === 'super_admin' ? '' : profile.opd_id,
    opdOptions: [], summary: null,
  };

  if (profile.role === 'super_admin') {
    try { state.opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  function draw() {
    root.innerHTML = `
      <div class="toolbar">
        <div>
          <div class="toolbar__title">Import KIB</div>
          <div class="toolbar__subtitle">Kendaraan &amp; Peralatan/Aset, dengan deteksi Nopol / Nomor Rangka / Nomor Mesin ganda</div>
        </div>
        <div class="toolbar__actions">
          <button class="btn btn-outline" id="btn-template">⬇ Unduh Template Excel</button>
        </div>
      </div>
      <div class="stepper-nav">
        ${STEPS.map((s, i) => `<div class="stepper-nav__item ${i === state.step ? 'is-active' : i < state.step ? 'is-done' : ''}">${i + 1}. ${s}</div>`).join('')}
      </div>
      <div class="panel" id="step-slot"></div>
    `;

    root.querySelector('#btn-template').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Menyiapkan...';
      try { await downloadKibTemplate(); }
      catch (err) { showToast('Gagal membuat template.', 'error'); }
      finally { btn.disabled = false; btn.textContent = original; }
    });

    const slot = root.querySelector('#step-slot');
    if (state.step === 0) drawUploadStep(slot);
    else if (state.step === 1) drawMappingStep(slot);
    else if (state.step === 2) drawPreviewStep(slot);
    else drawResultStep(slot);
  }

  // ------------------------------------------------------
  // STEP 0: Upload
  // ------------------------------------------------------
  function drawUploadStep(slot) {
    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field" style="max-width:420px;">
          <label>OPD Tujuan</label>
          <select id="opd-select">
            <option value="">— Pilih OPD —</option>
            ${state.opdOptions.map((o) => `<option value="${o.id}" ${o.id === state.opdId ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}
          </select>
        </div>`
      : `<div class="alert alert--info" style="max-width:420px;">Import akan ditujukan untuk OPD Anda.</div>`;

    slot.innerHTML = `
      ${opdFieldHtml}
      <div style="height:14px;"></div>
      <div class="dropzone" id="dropzone">
        <strong>Seret file ke sini atau klik untuk memilih</strong>
        Format didukung: .xlsx, .xls, .csv (maks. 10MB). Satu file dapat berisi baris Kendaraan dan Peralatan sekaligus.
        File hasil unduhan resmi e-BMD (Format II.O.1.2 — Daftar BMD Peralatan &amp; Mesin) juga otomatis dikenali,
        tanpa perlu mapping kolom manual.
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none;" />
      </div>
      <div id="upload-alert"></div>
    `;

    if (profile.role === 'super_admin') {
      slot.querySelector('#opd-select').addEventListener('change', (e) => { state.opdId = e.target.value; });
    }

    const dropzone = slot.querySelector('#dropzone');
    const fileInput = slot.querySelector('#file-input');
    const alertSlot = slot.querySelector('#upload-alert');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

    async function handleFile(file) {
      if (!state.opdId) {
        alertSlot.innerHTML = `<div class="alert alert--warning">Pilih OPD tujuan terlebih dahulu.</div>`;
        return;
      }
      alertSlot.innerHTML = `<div class="alert alert--info">Membaca file...</div>`;
      try {
        const parsed = await parseKibFile(file);
        state.file = file;
        state.headers = parsed.headers;
        state.rawRows = parsed.rows;
        state.isOfficialFormat = parsed.isOfficialFormat;

        if (parsed.isOfficialFormat) {
          // Format resmi e-BMD: header sudah identik dengan label field
          // internal, jadi mapping otomatis 1:1 (identitas) — user tetap
          // bisa meninjau/mengubahnya di langkah berikutnya bila perlu.
          state.mapping = Object.fromEntries(KIB_TARGET_FIELDS.map((f) => [f.key, f.label]));
          const meta = parsed.meta || {};
          state.uploadNotice = `Format resmi e-BMD (${meta.formatCode || 'II.O.1.2'}) terdeteksi otomatis`
            + (meta.satuanKerja ? ` — ${escapeHtml(meta.satuanKerja)}` : '')
            + (meta.tahun ? `, Tahun ${escapeHtml(meta.tahun)}` : '')
            + `. ${parsed.rows.length} baris barang ditemukan &amp; mapping kolom sudah otomatis.`;
        } else {
          state.mapping = suggestKibColumnMapping(parsed.headers);
          state.uploadNotice = '';
        }

        state.step = 1;
        draw();
      } catch (err) {
        alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
      }
    }
  }

  // ------------------------------------------------------
  // STEP 1: Mapping kolom
  // ------------------------------------------------------
  function drawMappingStep(slot) {
    slot.innerHTML = `
      ${state.uploadNotice ? `<div class="alert alert--info" style="margin-bottom:14px;">${state.uploadNotice}</div>` : ''}
      <p style="font-size:13.5px;color:var(--gray-500);margin-top:0;">
        File <b>${escapeHtml(state.file?.name || '')}</b> memiliki ${state.rawRows.length} baris data.
        Field bertanda <b>(khusus Kendaraan)</b> boleh dikosongkan untuk baris Peralatan/Aset.
      </p>
      <div class="mapping-grid">
        ${KIB_TARGET_FIELDS.map((f) => `
          <div class="mapping-row">
            <label>${f.label}</label>
            <select data-field="${f.key}">
              <option value="">— Tidak dipetakan —</option>
              ${state.headers.map((h) => `<option value="${escapeAttr(h)}" ${state.mapping[f.key] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn-outline" id="btn-back">← Kembali</button>
        <button class="btn btn-solid" id="btn-next">Lanjut ke Preview →</button>
      </div>
    `;

    slot.querySelectorAll('[data-field]').forEach((sel) => {
      sel.addEventListener('change', (e) => { state.mapping[sel.dataset.field] = e.target.value; });
    });
    slot.querySelector('#btn-back').addEventListener('click', () => { state.step = 0; draw(); });
    slot.querySelector('#btn-next').addEventListener('click', () => {
      const requiredMissing = kibRequiredFields().filter((f) => !state.mapping[f.key]);
      if (requiredMissing.length) {
        showToast(`Kolom berikut belum dipetakan: ${requiredMissing.map((f) => f.label).join(', ')}`, 'warning');
        return;
      }
      state.validated = applyKibMappingAndValidate(state.rawRows, state.mapping);
      state.step = 2;
      draw();
    });
  }

  // ------------------------------------------------------
  // STEP 2: Preview + validasi + duplikasi
  // ------------------------------------------------------
  function drawPreviewStep(slot) {
    const validRows = state.validated.filter((r) => r.valid);
    const errorRows = state.validated.filter((r) => !r.valid && !r.isDuplicate);
    const dupRows = state.validated.filter((r) => r.isDuplicate);

    slot.innerHTML = `
      <div class="summary-grid" style="margin-bottom:18px;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${validRows.length}</div><div class="summary-chip__label">Baris Valid</div></div>
        <div class="summary-chip" style="background:var(--status-warning-bg);"><div class="summary-chip__value" style="color:var(--status-warning);">${dupRows.length}</div><div class="summary-chip__label">Duplikat dalam File</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${errorRows.length}</div><div class="summary-chip__label">Baris Bermasalah</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${state.validated.length}</div><div class="summary-chip__label">Total Baris</div></div>
      </div>

      ${dupRows.length ? `
        <div class="panel__title" style="margin-bottom:10px;color:var(--status-warning);">Duplikat Nopol / Nomor Rangka / Nomor Mesin dalam file (tidak akan diimpor)</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Alasan</th></tr></thead>
            <tbody>${dupRows.slice(0, 50).map((r) => `<tr><td>${r.rowNumber}</td><td style="color:var(--status-warning);">${r.errors.join('; ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      ${errorRows.length ? `
        <div class="panel__title" style="margin-bottom:10px;">Baris Bermasalah (tidak akan diimpor)</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Alasan</th></tr></thead>
            <tbody>${errorRows.slice(0, 50).map((r) => `<tr><td>${r.rowNumber}</td><td style="color:var(--status-critical);">${r.errors.join('; ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      <div class="panel__title" style="margin-bottom:10px;">Preview Data Valid (akan diimpor)</div>
      <div class="table-scroll" style="margin-bottom:20px;">
        <table class="data-table">
          <thead><tr><th>Kategori</th><th>Nopol / Register</th><th>Nama Barang</th><th>Merk/Type</th><th class="num">Nilai Perolehan</th></tr></thead>
          <tbody>
            ${validRows.slice(0, 50).map((r) => `
              <tr>
                <td>${kategoriLabel(r.normalized.kategori)}</td>
                <td>${escapeHtml(r.normalized.nopol || r.normalized.register || '-')}</td>
                <td>${escapeHtml(r.normalized.nama_barang)}</td>
                <td>${escapeHtml(r.normalized.merk)} ${escapeHtml(r.normalized.type)}</td>
                <td class="num">${formatRupiah(r.normalized.nilai_perolehan || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${validRows.length > 50 ? `<p style="font-size:12.5px;color:var(--gray-500);">Menampilkan 50 dari ${validRows.length} baris valid.</p>` : ''}

      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-outline" id="btn-back">← Kembali ke Mapping</button>
        <button class="btn btn-solid" id="btn-confirm" ${validRows.length === 0 ? 'disabled' : ''}>
          Konfirmasi &amp; Import ${validRows.length} Baris
        </button>
      </div>
      <p style="font-size:12px;color:var(--gray-500);margin-top:10px;">
        Sistem juga akan memeriksa Nopol/Nomor Rangka/Nomor Mesin terhadap data yang sudah ada di database
        pada tahap import — konflik akan dilaporkan sebagai error tanpa menimpa data yang sudah benar.
      </p>
    `;

    slot.querySelector('#btn-back').addEventListener('click', () => { state.step = 1; draw(); });
    slot.querySelector('#btn-confirm').addEventListener('click', async () => {
      const btn = slot.querySelector('#btn-confirm');
      btn.disabled = true;
      btn.textContent = 'Mengimpor...';
      try {
        state.summary = await commitKibImport({
          tahunAnggaranId,
          opdId: state.opdId,
          validatedRows: state.validated,
          fileName: state.file?.name || '(tidak diketahui)',
          userId: profile.id,
        });
        state.step = 3;
        draw();
      } catch (err) {
        showToast('Import gagal: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = `Konfirmasi & Import ${validRows.length} Baris`;
      }
    });
  }

  // ------------------------------------------------------
  // STEP 3: Hasil import
  // ------------------------------------------------------
  function drawResultStep(slot) {
    const s = state.summary;
    slot.innerHTML = `
      <div class="alert alert--info" style="background:var(--status-safe-bg);color:var(--status-safe);">
        Import selesai dan telah dicatat pada Import Log.
      </div>
      <div class="summary-grid" style="margin:16px 0;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${s.baru}</div><div class="summary-chip__label">Data Baru</div></div>
        <div class="summary-chip" style="background:var(--status-info-bg);"><div class="summary-chip__value" style="color:var(--status-info);">${s.diperbarui}</div><div class="summary-chip__label">Diperbarui</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${s.tidak_berubah}</div><div class="summary-chip__label">Tidak Berubah</div></div>
        <div class="summary-chip" style="background:var(--status-warning-bg);"><div class="summary-chip__value" style="color:var(--status-warning);">${s.duplikat}</div><div class="summary-chip__label">Duplikat</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${s.error}</div><div class="summary-chip__label">Error</div></div>
      </div>
      ${s.detail.some((d) => d.status === 'error') ? `
        <div class="panel__title" style="margin-bottom:10px;">Rincian Error</div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Pesan</th></tr></thead>
            <tbody>${s.detail.filter((d) => d.status === 'error').slice(0, 50).map((d) => `<tr><td>${d.baris}</td><td style="color:var(--status-critical);">${escapeHtml(d.pesan || '-')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-solid" id="btn-new">Import File Lain</button>
      </div>
    `;
    slot.querySelector('#btn-new').addEventListener('click', () => {
      state.step = 0; state.file = null; state.headers = []; state.rawRows = [];
      state.mapping = {}; state.validated = []; state.summary = null;
      state.isOfficialFormat = false; state.uploadNotice = '';
      draw();
    });
  }

  draw();
}

function kategoriLabel(k) {
  const map = { kendaraan: 'Kendaraan', peralatan: 'Peralatan', aset_lainnya: 'Aset Lainnya' };
  return map[k] || k;
}
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
