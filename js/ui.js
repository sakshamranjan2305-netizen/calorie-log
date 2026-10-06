// Small DOM helpers. Text is always inserted with textContent/append (never innerHTML),
// because food names can come from the internet (Open Food Facts).

import { goBack } from './router.js';

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (typeof v === 'boolean' || (k in node && typeof v !== 'string')) node[k] = v;
    else node.setAttribute(k, v);
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

/** Like node.replaceChildren(), but skips null/false (replaceChildren would print "null"). */
export function setChildren(node, ...children) {
  node.replaceChildren();
  return append(node, children);
}

const ICONS = {
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  day: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v4.5l3 2"/>',
  history: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6"/>',
  food: '<path d="M4 11h16a8 8 0 0 1-16 0zM9 7c0-1.5 1-1.5 1-3M13 7c0-1.5 1-1.5 1-3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
};

/** Static, trusted SVG markup only. */
export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

export function iconButton(name, label, onclick, cls = '') {
  return el('button', { type: 'button', class: `icon-btn ${cls}`.trim(), 'aria-label': label, title: label, onclick }, icon(name));
}

/** Page header with an optional back button and right-side actions. */
export function topbar({ title, subtitle, back, actions = [] }) {
  return el('header', { class: 'topbar' },
    back ? iconButton('back', 'Back', () => goBack(back)) : null,
    el('div', { class: 'topbar-title' },
      el('h1', {}, title),
      subtitle ? el('p', {}, subtitle) : null),
    actions);
}

/**
 * Segmented control. options: [{ value, label }]. Calls onChange(value) on selection.
 * Returns the element; call `.setValue(v)` to change the selection programmatically.
 */
export function segmented(options, value, onChange, { label, cls = '' } = {}) {
  const root = el('div', { class: `seg ${cls}`.trim(), role: 'group', 'aria-label': label });
  const buttons = options.map((o) => el('button', {
    type: 'button',
    'aria-pressed': String(o.value === value),
    onclick: () => {
      root.setValue(o.value);
      onChange(o.value);
    },
  }, o.label));
  root.setValue = (v) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
  append(root, buttons);
  return root;
}

let toastTimer = null;
/** Brief message at the bottom of the screen, optionally with one action (e.g. Undo). */
export function toast(message, { actionLabel, onAction, duration = actionLabel ? 6000 : 3500 } = {}) {
  const host = document.getElementById('toast');
  clearTimeout(toastTimer);
  host.replaceChildren(el('span', {}, message));
  if (actionLabel) {
    host.append(el('button', {
      type: 'button',
      onclick: () => {
        host.classList.remove('show');
        onAction();
      },
    }, actionLabel));
  }
  host.classList.add('show');
  toastTimer = setTimeout(() => host.classList.remove('show'), duration);
}

/** Native confirm wrapped so it can be swapped for a custom dialog later. */
export function confirmAction(message) {
  return Promise.resolve(window.confirm(message));
}
