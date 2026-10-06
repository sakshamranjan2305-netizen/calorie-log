// Hash router. Every navigation goes through pushState with a `depth` counter in history.state,
// so the app knows whether "back" stays inside the app and how far to unwind multi-step flows.

let resolveRoute = null;
let renderToken = 0;
let cleanup = null;
let lastHash = null;

const depth = () => history.state?.depth ?? 0;

export function navigate(hash, { replace = false, state = {} } = {}) {
  const next = { ...state, depth: replace ? depth() : depth() + 1 };
  if (replace) history.replaceState(next, '', hash);
  else history.pushState(next, '', hash);
  render();
}

/** Go back one screen if there is an in-app screen to go back to, otherwise open `fallback`. */
export function goBack(fallback) {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Mark the current screen as the first step of a multi-step flow (e.g. adding food). */
export function beginFlow() {
  if (history.state?.flowStart == null) history.replaceState({ ...history.state, depth: depth(), flowStart: depth() }, '');
  return history.state.flowStart;
}

export const flowState = () => ({ flowStart: history.state?.flowStart });

/** Leave a multi-step flow, returning to the screen that opened it. */
export function exitFlow(fallback) {
  const s = history.state;
  if (s && s.flowStart > 0) history.go(-(s.depth - s.flowStart + 1));
  else navigate(fallback, { replace: true });
}

/** Return to the first screen of the current flow, staying inside it. */
export function backToFlowStart(fallback) {
  const s = history.state;
  if (s && s.flowStart != null && s.depth > s.flowStart) history.go(s.flowStart - s.depth);
  else navigate(fallback, { replace: true });
}

/** Re-render the current screen (e.g. after data changed). */
export function refresh() {
  render({ keepScroll: true });
}

async function render({ keepScroll = false } = {}) {
  lastHash = location.hash;
  const token = ++renderToken;
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const route = resolveRoute(parts);

  if (cleanup) {
    try { cleanup(); } catch (err) { console.error(err); }
    cleanup = null;
  }

  const host = document.createElement('div');
  host.className = 'page';
  let result;
  try {
    result = await route.view.render(host, route.params);
  } catch (err) {
    console.error(err);
    host.replaceChildren();
    const p = document.createElement('p');
    p.className = 'content error-text';
    p.textContent = `Something went wrong: ${err.message}`;
    host.append(p);
  }
  if (token !== renderToken) {
    if (typeof result === 'function') result();
    return;
  }
  cleanup = typeof result === 'function' ? result : null;

  document.body.classList.toggle('no-tabbar', !route.tab);
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const scrollY = window.scrollY;
  document.getElementById('view').replaceChildren(host);
  window.scrollTo(0, keepScroll ? scrollY : 0);
}

export function startRouter(resolver) {
  resolveRoute = resolver;
  window.addEventListener('popstate', () => render());
  // Typed/edited URLs fire hashchange too; skip it when popstate already rendered this hash.
  window.addEventListener('hashchange', () => { if (location.hash !== lastHash) render(); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href'), { replace: a.hasAttribute('data-replace') });
  });
  render();
}
