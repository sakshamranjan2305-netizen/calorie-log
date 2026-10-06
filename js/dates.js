// Dates are stored as local 'YYYY-MM-DD' strings. Never use toISOString() for these:
// it converts to UTC, which in India (UTC+5:30) gives the wrong day before 5:30 am.

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function today() {
  return toDateStr(new Date());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDateStr(parseDate(s)) === s;
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Inclusive list of date strings from `from` to `to`. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Today", "Yesterday", or a weekday name. */
export function dayName(s) {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return parseDate(s).toLocaleDateString('en-IN', { weekday: 'long' });
}

/** "6 Oct" */
export function shortDate(s) {
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Mon, 6 Oct" (adds the year when it isn't the current one) */
export function mediumDate(s) {
  const d = parseDate(s);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-IN', opts);
}

/** "M", "T", ... */
export function weekdayLetter(s) {
  return parseDate(s).toLocaleDateString('en-IN', { weekday: 'narrow' });
}
