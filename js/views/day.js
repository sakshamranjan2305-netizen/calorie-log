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
      dial(kcal.key, status, 'dial-hero',
        el('strong', {}, fmtKcal(totals.kcal)),
        el('span', {}, `of ${fmtKcal(goals.kcal)} kcal`)),
      statusLine(status)),
    el('div', { class: 'macro-grid' },
      NUTRIENTS.slice(1).map((n) => {
        const s = goalStatus(n, totals[n.key], goals[n.key]);
        return el('div', { class: 'macro', 'aria-label': `${n.label}: ${fmtNutrient(n.key, totals[n.key])} of ${fmtNutrient(n.key, goals[n.key])} ${n.unit}` },
          dial(n.key, s, '',
            el('strong', {}, fmtNutrient(n.key, totals[n.key])),
            el('span', {}, `/ ${fmtNutrient(n.key, goals[n.key])} ${n.unit}`)),
          el('span', { class: 'macro-label' }, n.label),
          statusLine(s));
      })));
}

/** Ring that fills (animated) to the share of the goal reached; `inner` sits in the middle. */
function dial(key, status, cls, ...inner) {
  const pct = Math.round(Math.max(0, Math.min(1, status.pct)) * 1000) / 10;
  const node = el('div', { class: `dial dial-${key} ${status.state} ${cls}`.trim() }, el('div', { class: 'dial-inner' }, inner));
  // Static markup with numbers only, so innerHTML is safe here.
  node.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 100 100" aria-hidden="true">'
    + '<circle class="dial-track" cx="50" cy="50" r="44"/>'
    + (pct > 0 ? `<circle class="dial-fill" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="${pct} 100"/>` : '')
    + '</svg>');
  return node;
}

function statusLine(status) {
  const mark = status.state === 'over' ? el('span', { class: 'status-mark over' }, '▲')
    : status.state === 'reached' ? el('span', { class: 'status-mark reached' }, '✓') : null;
  return el('p', { class: 'status-text' }, mark, status.text);
}

function mealCard(meal, entries, date) {
  const total = sumNutrients(entries);
  return el('section', { class: `card meal meal-${meal.key}`, 'aria-label': meal.label },
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
