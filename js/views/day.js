// Today / any day: totals against goals, then the day's meals.

import * as db from '../db.js';
import { el, icon, iconButton } from '../ui.js';
import { navigate } from '../router.js';
import { today, addDays, dayName, mediumDate, isValidDateStr } from '../dates.js';
import {
  NUTRIENTS, MEALS, sumNutrients, goalsFor, goalStatus, fmtKcal, fmtNutrient, macroLine, describePortion,
} from '../nutrition.js';

export async function render(root, { date }) {
  const [entries, goalsHistory] = await Promise.all([db.entriesOn(date), db.getSetting('goalsHistory', [])]);
  const goals = goalsFor(goalsHistory, date);
  const totals = sumNutrients(entries);
  const isToday = date === today();

  root.append(
    dayHeader(date, isToday),
    el('div', { class: 'content' },
      goalsHistory.length === 0
        ? el('a', { class: 'banner', href: '#/settings' },
          el('strong', {}, 'Set your daily goals'),
          el('span', {}, 'Using defaults (2,000 kcal) until you do →'))
        : null,
      summaryCard(totals, goals),
      MEALS.map((meal) => mealCard(meal, entries.filter((e) => e.meal === meal.key), date))),
  );
}

function dayHeader(date, isToday) {
  const go = (d) => navigate(`#/day/${d}`, { replace: true });
  const picker = el('input', {
    type: 'date', class: 'date-overlay', value: date, max: today(), 'aria-label': 'Pick a date',
    onchange: (e) => { if (isValidDateStr(e.target.value)) go(e.target.value); },
  });
  return el('header', { class: 'topbar daynav' },
    iconButton('left', 'Previous day', () => go(addDays(date, -1))),
    el('div', { class: 'topbar-title center' },
      el('h1', {}, dayName(date)),
      el('p', {}, mediumDate(date), ' ', icon('calendar', 'tiny')),
      picker),
    iconButton('right', 'Next day', () => go(addDays(date, 1)), isToday ? 'invisible' : ''));
}

function summaryCard(totals, goals) {
  const kcal = NUTRIENTS[0];
  const status = goalStatus(kcal, totals.kcal, goals.kcal);
  return el('section', { class: 'card summary', 'aria-label': 'Daily totals' },
    el('div', { class: 'hero' },
      el('span', { class: 'hero-value' }, fmtKcal(totals.kcal)),
      el('span', { class: 'hero-unit' }, `of ${fmtKcal(goals.kcal)} kcal`)),
    meter(status),
    statusLine(status),
    el('div', { class: 'macro-grid' },
      NUTRIENTS.slice(1).map((n) => {
        const s = goalStatus(n, totals[n.key], goals[n.key]);
        return el('div', { class: 'macro' },
          el('div', { class: 'macro-head' },
            el('span', { class: 'macro-label' }, n.label),
            el('span', { class: 'macro-value' },
              el('strong', {}, fmtNutrient(n.key, totals[n.key])),
              ` / ${fmtNutrient(n.key, goals[n.key])} ${n.unit}`)),
          meter(s),
          statusLine(s));
      })));
}

export function meter(status) {
  const pct = Math.min(1, status.pct) * 100;
  return el('div', { class: `meter ${status.state}`, 'aria-hidden': 'true' },
    el('span', { style: { width: `${pct}%` } }));
}

function statusLine(status) {
  const mark = status.state === 'over' ? el('span', { class: 'status-mark over' }, '▲')
    : status.state === 'reached' ? el('span', { class: 'status-mark reached' }, '✓') : null;
  return el('p', { class: 'status-text' }, mark, status.text);
}

function mealCard(meal, entries, date) {
  const total = sumNutrients(entries);
  return el('section', { class: 'card meal', 'aria-label': meal.label },
    el('div', { class: 'meal-head' },
      el('h2', {}, meal.label),
      entries.length ? el('span', { class: 'meal-kcal' }, `${fmtKcal(total.kcal)} kcal`) : null,
      el('a', { class: 'add-btn', href: `#/add/${date}/${meal.key}`, 'aria-label': `Add food to ${meal.label}` },
        icon('plus'), 'Add')),
    entries.length
      ? el('ul', { class: 'entry-list' }, entries.map((e) => el('li', {},
        el('a', { class: 'entry', href: `#/entry/${encodeURIComponent(e.id)}` },
          el('div', { class: 'entry-main' },
            el('span', { class: 'entry-name' }, e.name),
            el('span', { class: 'entry-meta' }, `${describePortion(e.food, e.amount, e.unit)} · ${macroLine(e)}`)),
          el('span', { class: 'entry-kcal' }, fmtKcal(e.kcal))))))
      : null);
}
