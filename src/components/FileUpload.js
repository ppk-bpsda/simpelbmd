import { uploadDocument, listDocuments, getSignedUrl, softDeleteDocument } from '../services/documentService.js';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from '../validators/fileValidator.js';
import { showToast, confirmDialog } from '../utils/ui.js';

/**
 * Mount widget upload dokumen untuk satu record yang SUDAH tersimpan
 * (recordId wajib ada). Dipakai di form edit Pajak/Pemeliharaan/BBM untuk
 * melampirkan bukti pembayaran/transaksi (§11-13, §23-24).
 */
export async function mountFileUpload(container, { opdId, tableName, recordId, uploadedBy, canWrite = true }) {
  container.innerHTML = `<div class="skeleton" style="height:32px;"></div>`;

  async function refresh() {
    let docs = [];
    try {
      docs = await listDocuments(tableName, recordId);
    } catch (e) {
      container.innerHTML = `<div class="alert alert--warning">Gagal memuat daftar dokumen.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="doc-list">
        ${docs.length === 0 ? '<p style="font-size:12.5px;color:var(--gray-500);margin:0 0 8px;">Belum ada dokumen terlampir.</p>' : ''}
        ${docs.map((d) => `
          <div class="doc-item">
            <span>📎 ${escapeHtml(d.file_path.split('/').pop())}</span>
            <span class="doc-item__actions">
              <button type="button" class="btn-ghost" data-view="${d.id}" data-path="${escapeAttr(d.file_path)}">Lihat</button>
              ${canWrite ? `<button type="button" class="btn-danger-ghost" data-remove="${d.id}">Hapus</button>` : ''}
            </span>
          </div>
        `).join('')}
      </div>
      ${canWrite ? `
        <label class="btn btn-outline" style="cursor:pointer;display:inline-flex;margin-top:8px;">
          + Lampirkan Dokumen
          <input type="file" id="doc-file-input" accept="${Object.keys(ALLOWED_FILE_TYPES).join(',')}" style="display:none;" />
        </label>
        <span style="font-size:11.5px;color:var(--gray-500);margin-left:8px;">PDF/JPG/PNG/WEBP, maks. ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB</span>
      ` : ''}
      <div id="doc-upload-alert"></div>
    `;

    container.querySelectorAll('[data-view]').forEach((el) => {
      el.addEventListener('click', async () => {
        try {
          const url = await getSignedUrl(el.dataset.path);
          window.open(url, '_blank', 'noopener');
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    container.querySelectorAll('[data-remove]').forEach((el) => {
      el.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Hapus Dokumen?', message: 'Dokumen ini akan dipindahkan ke arsip.', danger: true });
        if (!ok) return;
        try {
          await softDeleteDocument(el.dataset.remove, uploadedBy);
          showToast('Dokumen berhasil dihapus.', 'success');
          refresh();
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    const fileInput = container.querySelector('#doc-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const alertSlot = container.querySelector('#doc-upload-alert');
        alertSlot.innerHTML = `<div class="alert alert--info">Mengunggah...</div>`;
        try {
          await uploadDocument({ file, jenis: 'bukti_transaksi', opdId, tableName, recordId, uploadedBy });
          showToast('Dokumen berhasil diunggah.', 'success');
          refresh();
        } catch (err) {
          alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
        }
      });
    }
  }

  await refresh();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
