const routes = new Map();

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function currentPath() {
  const full = window.location.hash.replace(/^#/, '') || '/dashboard';
  return full.split('?')[0];
}

export function currentQuery() {
  const full = window.location.hash.replace(/^#/, '') || '';
  const idx = full.indexOf('?');
  return new URLSearchParams(idx >= 0 ? full.slice(idx + 1) : '');
}

export function navigate(path) {
  window.location.hash = path;
}

function showRenderError(outletEl, path, err) {
  console.error(`[router] Gagal merender halaman "${path}"`, err);
  outletEl.innerHTML = `
    <div class="panel">
      <div class="alert alert--error">
        <strong>Halaman gagal dimuat.</strong>
        <div style="margin-top:6px;font-size:12.5px;">
          Terjadi kesalahan saat menampilkan <code>${path}</code>. Silakan muat ulang halaman.
          Jika masalah berlanjut, laporkan pesan berikut kepada admin:
        </div>
        <div style="margin-top:6px;font-size:12px;font-family:monospace;word-break:break-word;">
          ${(err && (err.message || String(err))) || 'Unknown error'}
        </div>
      </div>
    </div>`;
}

export function startRouter(outletEl, notFoundFn) {
  const render = () => {
    const path = currentPath();
    const renderFn = routes.get(path) || notFoundFn;
    outletEl.innerHTML = '';
    // Bungkus render halaman: error sinkron maupun Promise yang reject tidak
    // boleh menyisakan outlet kosong (halaman putih) tanpa penjelasan apa pun.
    try {
      const result = renderFn(outletEl);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => showRenderError(outletEl, path, err));
      }
    } catch (err) {
      showRenderError(outletEl, path, err);
    }
  };
  window.addEventListener('hashchange', render);
  render();
}
