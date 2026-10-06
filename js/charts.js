// Hand-drawn SVG column chart with a goal line. One series per chart (no legend needed — the
// card title names it). Thin columns with 4px rounded tops, hairline grid, tooltip on hover/tap
// and arrow keys. Every value is also shown in the History table, so the tooltip never gates.

import { el, setChildren } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

function columnPath(x, top, w, base, r) {
  const h = base - top;
  if (h <= 0) return '';
  r = Math.min(r, w / 2, h);
  return `M${x},${base}V${top + r}A${r},${r} 0 0 1 ${x + r},${top}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${top + r}V${base}Z`;
}

/**
 * points: [{ label, title, value (number|null), goal (number|null), note? }]
 * format: value -> string. Returns an element that redraws on resize.
 */
export function columnChart({ points, format, ariaLabel, plotHeight = 120 }) {
  const wrap = el('div', { class: 'chart' });
  const tip = el('div', { class: 'chart-tip', role: 'status' });
  tip.hidden = true;
  const svg = s('svg', { role: 'img', 'aria-label': ariaLabel, tabindex: '0' });
  wrap.append(svg, tip);

  let geom = null;
  let active = -1;
  let pinned = false;

  function draw() {
    const width = wrap.clientWidth;
    if (!width) return;
    const m = { top: 10, right: 6, bottom: 22, left: 38 };
    const H = plotHeight + m.top + m.bottom;
    const plotW = width - m.left - m.right;
    const n = points.length;
    const max = niceMax(Math.max(1, ...points.map((p) => Math.max(p.value || 0, p.goal || 0))) * 1.05);
    const y = (v) => m.top + plotHeight - (v / max) * plotHeight;
    const slot = plotW / n;
    const barW = Math.max(2, Math.min(24, slot * 0.62, slot - 2));
    const base = y(0);
    geom = { m, slot, width, n };

    svg.setAttribute('viewBox', `0 0 ${width} ${H}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', H);
    svg.replaceChildren();

    // Gridlines + y ticks (0, half, max)
    for (const v of [0, max / 2, max]) {
      svg.append(s('line', { class: v === 0 ? 'axis' : 'grid', x1: m.left, x2: width - m.right, y1: y(v), y2: y(v) }));
      const t = s('text', { class: 'tick', x: m.left - 6, y: y(v) + 4, 'text-anchor': 'end' });
      t.textContent = format(v);
      svg.append(t);
    }

    // Hover band, drawn under the columns
    const band = s('rect', { class: 'hover-band', y: m.top, height: plotHeight, width: slot, x: -999 });
    svg.append(band);

    // Columns
    const cols = points.map((p, i) => {
      const x = m.left + i * slot + (slot - barW) / 2;
      const path = s('path', { class: 'col', d: p.value ? columnPath(x, y(p.value), barW, base, 4) : '' });
      svg.append(path);
      return path;
    });

    // Goal: a step line following the goal that applied each day
    let d = '';
    points.forEach((p, i) => {
      if (p.goal == null) return;
      const x0 = m.left + i * slot;
      const prev = points[i - 1];
      d += `${prev && prev.goal != null ? 'L' : 'M'}${x0},${y(p.goal)}H${x0 + slot}`;
    });
    if (d) {
      svg.append(s('path', { class: 'goal-line', d }));
      const last = [...points].reverse().find((p) => p.goal != null);
      const gl = s('text', { class: 'goal-label', x: width - m.right, y: y(last.goal) - 5, 'text-anchor': 'end' });
      gl.textContent = 'Goal';
      svg.append(gl);
    }

    // X labels, thinned so they never collide
    const labelW = Math.max(...points.map((p) => p.label.length)) * 6.5 + 12;
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / labelW))));
    points.forEach((p, i) => {
      if ((n - 1 - i) % every !== 0) return; // always label the latest point
      const t = s('text', { class: 'tick', x: m.left + i * slot + slot / 2, y: H - 6, 'text-anchor': 'middle' });
      t.textContent = p.label;
      svg.append(t);
    });

    geom.band = band;
    geom.cols = cols;
    if (active >= 0) show(active);
  }

  function show(i) {
    if (!geom) return;
    active = i;
    const p = points[i];
    geom.band.setAttribute('x', geom.m.left + i * geom.slot);
    geom.cols.forEach((c, j) => c.classList.toggle('active', j === i));
    setChildren(tip,
      el('strong', {}, p.value != null ? format(p.value) : 'Nothing logged'),
      el('span', {}, p.title),
      p.goal != null ? el('span', {}, `Goal ${format(p.goal)}`) : null,
      p.note ? el('span', {}, p.note) : null);
    tip.hidden = false;
    const cx = geom.m.left + i * geom.slot + geom.slot / 2;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, cx - tw / 2), geom.width - tw)}px`;
  }

  function hide() {
    active = -1;
    tip.hidden = true;
    if (geom) {
      geom.band.setAttribute('x', -999);
      geom.cols.forEach((c) => c.classList.remove('active'));
    }
  }

  const indexAt = (clientX) => {
    const r = svg.getBoundingClientRect();
    return Math.min(geom.n - 1, Math.max(0, Math.floor((clientX - r.left - geom.m.left) / geom.slot)));
  };
  svg.addEventListener('pointermove', (e) => { if (geom) show(indexAt(e.clientX)); });
  svg.addEventListener('pointerdown', (e) => { if (geom) { pinned = e.pointerType !== 'mouse'; show(indexAt(e.clientX)); } });
  svg.addEventListener('pointerleave', () => { if (!pinned) hide(); });
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    show(Math.min(points.length - 1, Math.max(0, (active < 0 ? points.length : active) + (e.key === 'ArrowLeft' ? -1 : 1))));
  });
  svg.addEventListener('focus', () => { if (active < 0) show(points.length - 1); });
  svg.addEventListener('blur', hide);
  const outside = (e) => { if (pinned && !wrap.contains(e.target)) { pinned = false; hide(); } };
  document.addEventListener('pointerdown', outside);

  const ro = new ResizeObserver(draw);
  ro.observe(wrap);
  wrap.destroy = () => { ro.disconnect(); document.removeEventListener('pointerdown', outside); };
  return wrap;
}
