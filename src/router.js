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

export function startRouter(outletEl, notFoundFn) {
  const render = () => {
    const path = currentPath();
    const renderFn = routes.get(path) || notFoundFn;
    outletEl.innerHTML = '';
    renderFn(outletEl);
  };
  window.addEventListener('hashchange', render);
  render();
}
