// History: trends against goals, week-over-week and day-vs-day comparison, and a day-by-day table.

import * as db from '../db.js';
import { el, topbar, segmented } from '../ui.js';
import { navigate } from '../router.js';
import { today, addDays, dateRange, shortDate, mediumDate, weekdayLetter, isValidDateStr } from '../dates.js';
import { NUTRIENTS, sumNutrients, goalsFor, metGoal, fmtNutrient, round1 } from '../nutrition.js';
import { columnChart } from '../charts.js';

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];
let range = 7;
let compareDays = null;

export async function render(root) {
  const end = today();
  const from = addDays(end, -(Math.max(range, 14) - 1));
  const [entries, goalsHistory] = await Promise.all([db.entriesBetween(from, end), db.getSetting('goalsHistory', [])]);

  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }
  const days = dateRange(addDays(end, -(range - 1)), end).map((date) => {
    const list = byDate.get(date);
    return { date, logged: !!list, totals: list ? sumNutrients(list) : null, goals: goalsFor(goalsHistory, date) };
  });
  const logged = days.filter((d) => d.logged);

  const charts = [];
  const cleanup = () => charts.forEach((c) => c.destroy());

  root.append(
    topbar({ title: 'History' }),
    el('div', { class: 'filter-row' },
      segmented(RANGES, range, (v) => { range = v; navigate('#/history', { replace: true }); }, { label: 'Time range' })),
    el('div', { class: 'content' },
      logged.length === 0
        ? el('p', { class: 'card empty' }, 'Nothing logged in this period yet. Logged days will show up here.')
        : [
          el('p', { class: 'muted small range-note' },
            `Logged ${logged.length} of ${days.length} days · averages count logged days only`),
          NUTRIENTS.map((n) => nutrientCard(n, days, logged, charts)),
        ],
      compareWeeks(byDate, goalsHistory, end),
      await compareTwoDays(goalsHistory),
      dayTable(days)));
  return cleanup;
}

function average(list, key) {
  return list.length ? list.reduce((a, d) => a + d.totals[key], 0) / list.length : 0;
}

function nutrientCard(n, days, logged, charts) {
  const fmt = (v) => fmtNutrient(n.key, v);
  const avg = average(logged, n.key);
  const met = logged.filter((d) => metGoal(n, d.totals[n.key], d.goals[n.key])).length;
  const goalNow = days[days.length - 1].goals[n.key];

  let points;
  if (days.length <= 30) {
    points = days.map((d) => ({
      label: days.length <= 7 ? weekdayLetter(d.date) : shortDate(d.date),
      title: mediumDate(d.date),
      value: d.logged ? d.totals[n.key] : null,
      goal: d.goals[n.key],
    }));
  } else {
    // 90 days: weekly averages so each column stays readable
    points = [];
    for (let end = days.length; end > 0; end -= 7) {
      const week = days.slice(Math.max(0, end - 7), end);
      const wl = week.filter((d) => d.logged);
      points.unshift({
        label: shortDate(week[0].date),
        title: `Week of ${shortDate(week[0].date)} (avg)`,
        value: wl.length ? round1(average(wl, n.key)) : null,
        goal: round1(week.reduce((a, d) => a + d.goals[n.key], 0) / week.length),
        note: `${wl.length} of ${week.length} days logged`,
      });
    }
  }

  const chart = columnChart({
    points, format: fmt,
    ariaLabel: `${n.label} per ${days.length > 30 ? 'week' : 'day'}, average ${fmt(avg)} ${n.unit} against a goal of ${fmt(goalNow)} ${n.unit}`,
  });
  charts.push(chart);

  const extremes = logged.length > 1 ? (() => {
    const sorted = [...logged].sort((a, b) => a.totals[n.key] - b.totals[n.key]);
    const lo = sorted[0];
    const hi = sorted[sorted.length - 1];
    return `High ${fmt(hi.totals[n.key])} (${shortDate(hi.date)}) · Low ${fmt(lo.totals[n.key])} (${shortDate(lo.date)})`;
  })() : '';

  return el('section', { class: 'card chart-card' },
    el('div', { class: 'chart-head' },
      el('h2', {}, n.label),
      el('p', { class: 'chart-stat' },
        el('strong', {}, `${fmt(avg)} ${n.unit}`), ` avg · goal ${fmt(goalNow)}`)),
    el('p', { class: 'muted small' },
      `${met} of ${logged.length} logged days ${n.kind === 'limit' ? 'within goal' : 'reached goal'}`,
      extremes ? el('br') : null, extremes),
    chart);
}

function compareWeeks(byDate, goalsHistory, end) {
  const week = (offset) => dateRange(addDays(end, -(offset + 6)), addDays(end, -offset))
    .filter((d) => byDate.has(d))
    .map((d) => ({ totals: sumNutrients(byDate.get(d)) }));
  const cur = week(0);
  const prev = week(7);
  if (!cur.length && !prev.length) return null;
  return el('section', { class: 'card' },
    el('h2', {}, 'Last 7 days vs the 7 before'),
    el('p', { class: 'muted small' }, `Daily averages · ${cur.length} vs ${prev.length} days logged`),
    compareTable(['Last 7', 'Prev 7'], [cur.length ? (k) => average(cur, k) : null, prev.length ? (k) => average(prev, k) : null]));
}

async function compareTwoDays(goalsHistory) {
  if (!compareDays) compareDays = [today(), addDays(today(), -1)];
  const holder = el('section', { class: 'card' });

  async function draw() {
    const [a, b] = compareDays;
    const [ea, eb] = await Promise.all([db.entriesOn(a), db.entriesOn(b)]);
    const ta = sumNutrients(ea);
    const tb = sumNutrients(eb);
    const picker = (i) => el('input', {
      type: 'date', value: compareDays[i], max: today(), 'aria-label': i ? 'Second day' : 'First day',
      onchange: (e) => { if (isValidDateStr(e.target.value)) { compareDays[i] = e.target.value; draw(); } },
    });
    holder.replaceChildren(
      el('h2', {}, 'Compare two days'),
      el('div', { class: 'field-row' }, picker(0), picker(1)),
      compareTable([shortDate(a), shortDate(b)], [ea.length ? (k) => ta[k] : null, eb.length ? (k) => tb[k] : null]),
      el('p', { class: 'muted small' }, `Goals: ${fmtNutrient('kcal', goalsFor(goalsHistory, a).kcal)} kcal on ${shortDate(a)}, ${fmtNutrient('kcal', goalsFor(goalsHistory, b).kcal)} kcal on ${shortDate(b)}`));
  }
  await draw();
  return holder;
}

/** Rows = nutrients; columns = the two periods plus the change from the second to the first. */
function compareTable(headers, getters) {
  return el('table', { class: 'data-table compare' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), headers.map((h) => el('th', {}, h)), el('th', {}, 'Change'))),
    el('tbody', {}, NUTRIENTS.map((n) => {
      const [va, vb] = getters.map((g) => (g ? g(n.key) : null));
      const delta = va != null && vb != null ? va - vb : null;
      const deltaText = delta == null ? '—'
        : Math.abs(delta) < 0.05 ? '0'
          : `${delta > 0 ? '▲' : '▼'} ${fmtNutrient(n.key, Math.abs(delta))}`;
      return el('tr', {},
        el('th', { scope: 'row' }, `${n.label} (${n.unit})`),
        el('td', {}, va == null ? '—' : fmtNutrient(n.key, va)),
        el('td', {}, vb == null ? '—' : fmtNutrient(n.key, vb)),
        el('td', {}, deltaText));
    })));
}

function dayTable(days) {
  return el('section', { class: 'card' },
    el('h2', {}, 'Day by day'),
    el('p', { class: 'muted small' }, 'Tap a day to see or edit its meals.'),
    el('div', { class: 'table-scroll' },
      el('table', { class: 'data-table days' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Day'), NUTRIENTS.map((n) => el('th', {}, n.key === 'kcal' ? 'kcal' : n.short)))),
        el('tbody', {}, [...days].reverse().map((d) => el('tr', {
          class: d.logged ? '' : 'unlogged', tabindex: '0',
          onclick: () => navigate(`#/day/${d.date}`),
          onkeydown: (e) => { if (e.key === 'Enter') navigate(`#/day/${d.date}`); },
        },
        el('th', { scope: 'row' }, mediumDate(d.date)),
        NUTRIENTS.map((n) => {
          if (!d.logged) return el('td', {}, '—');
          const ok = metGoal(n, d.totals[n.key], d.goals[n.key]);
          return el('td', { class: n.kind === 'limit' && !ok ? 'over' : '' }, fmtNutrient(n.key, d.totals[n.key]));
        })))))),
    el('p', { class: 'muted small' }, 'P protein · C carbs · F fat · Fb fibre (grams). ▲ marks totals over a limit.'));
}
