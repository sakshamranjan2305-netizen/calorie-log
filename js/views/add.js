// Add food: search -> pick a food -> choose amount -> logged.
// Steps share module state so going back from the amount screen keeps the search results.

import * as db from '../db.js';
import { el, icon, topbar, toast, setChildren } from '../ui.js';
import { navigate, beginFlow, flowState, exitFlow } from '../router.js';
import { dayName } from '../dates.js';
import { mealLabel, nutrientsFor, defaultPortion, describeFood, macroLine, fmtKcal } from '../nutrition.js';
import { searchMyFoods, searchCatalog, recentFoods, rememberFood, searchOpenFoodFacts, SOURCE_LABELS } from '../search.js';
import { portionForm } from './portion.js';
import { foodForm } from './foodform.js';

let session = null;

export async function render(root, { date, meal, step }) {
  const base = `#/add/${date}/${meal}`;
  if (step === 'search') {
    if (history.state?.flowStart == null || !session || session.base !== base) {
      session = { base, date, meal, query: '', online: null, selected: null };
    }
    beginFlow();
    return renderSearch(root);
  }
  if (!session || session.base !== base) {
    navigate(base, { replace: true });
    return;
  }
  if (step === 'qty' && session.selected) return renderPortion(root);
  if (step === 'new') return renderNewFood(root);
  navigate(base, { replace: true });
}

// ---- Search -----------------------------------------------------------------------

function renderSearch(root) {
  const s = session;
  const results = el('div', { class: 'results' });
  const input = el('input', {
    type: 'search', value: s.query, placeholder: 'Search dal, roti, banana, Amul…', 'aria-label': 'Search foods',
    autocomplete: 'off', enterkeyhint: 'search',
  });
  let timer = null;
  let abort = null;

  input.addEventListener('input', () => {
    s.query = input.value;
    clearTimeout(timer);
    timer = setTimeout(showLocal, 120);
  });

  const form = el('form', {
    class: 'searchbar', role: 'search',
    onsubmit: (e) => { e.preventDefault(); input.blur(); searchOnline(); },
  }, icon('search', 'search-icon'), input);

  async function showLocal() {
    const q = s.query.trim();
    if (!q) {
      const recent = await recentFoods();
      setChildren(results,
        recent.length
          ? group('Recent', recent.map(foodRow))
          : el('p', { class: 'empty' }, 'Search for a dish or ingredient. Foods you log will show up here for one-tap re-logging.'),
        createRow());
      return;
    }
    const mine = await searchMyFoods(q);
    const shown = new Set(mine.map((f) => f.id));
    const { foods, packaged } = await searchCatalog(q, shown);
    if (s.query.trim() !== q) return; // a newer search has started
    packaged.forEach((f) => shown.add(f.id));
    setChildren(results,
      mine.length ? group('My foods', mine.map(foodRow)) : null,
      foods.length ? group('Foods — Indian & worldwide', foods.map(foodRow))
        : !packaged.length && !mine.length ? group('Foods', [el('p', { class: 'empty' }, `No matches for “${q}”.`)]) : null,
      packaged.length ? group('Packaged products', packaged.map(foodRow)) : null,
      onlineSection(q, shown),
      createRow());
  }

  function onlineSection(q, shown) {
    const o = s.online && s.online.query === q ? s.online : null;
    let body;
    if (!o) {
      body = el('button', { type: 'button', class: 'btn btn-secondary', onclick: searchOnline },
        icon('globe'), `Search more products online for “${q}”`);
    } else if (o.status === 'loading') {
      body = el('p', { class: 'empty' }, 'Searching Open Food Facts…');
    } else if (o.status === 'error') {
      body = el('div', {}, el('p', { class: 'empty' }, o.error),
        el('button', { type: 'button', class: 'btn btn-secondary', onclick: searchOnline }, 'Try again'));
    } else {
      const items = o.items.filter((f) => !shown.has(f.id));
      body = items.length ? items.map(foodRow) : [el('p', { class: 'empty' }, 'No other products found online.')];
    }
    return group('More products (online)', body);
  }

  async function searchOnline() {
    const q = s.query.trim();
    if (!q) return;
    if (!navigator.onLine) {
      s.online = { query: q, status: 'error', error: "You're offline — packaged-food search needs internet." };
      showLocal();
      return;
    }
    abort?.abort();
    abort = new AbortController();
    s.online = { query: q, status: 'loading' };
    showLocal();
    try {
      const items = await searchOpenFoodFacts(q, { signal: abort.signal });
      s.online = { query: q, status: 'done', items };
    } catch (err) {
      if (err.name === 'AbortError') return;
      s.online = { query: q, status: 'error', error: err.message === 'Failed to fetch' ? "Couldn't reach Open Food Facts. Check your connection." : err.message };
    }
    if (s.query.trim() === q) showLocal();
  }

  root.append(
    topbar({ title: `Add to ${mealLabel(s.meal)}`, subtitle: dayName(s.date), back: `#/day/${s.date}` }),
    el('div', { class: 'search-wrap' }, form),
    el('div', { class: 'content' }, results));

  showLocal();
  if (!s.query) requestAnimationFrame(() => input.focus());
  return () => { clearTimeout(timer); abort?.abort(); };
}

function group(title, children) {
  return el('section', { class: 'result-group' }, el('h3', {}, title), el('div', { class: 'card list-card' }, children));
}

function foodRow(food) {
  const per100 = food.basis === '100g' && food.servingGrams > 0;
  return el('button', { type: 'button', class: 'result', onclick: () => select(food) },
    el('span', { class: 'result-main' },
      el('span', { class: 'result-name' }, food.name),
      el('span', { class: 'result-meta' }, `${SOURCE_LABELS[food.source] || ''} · ${describeFood(food)}`),
      el('span', { class: 'result-meta' }, `${per100 ? 'per 100 g: ' : ''}${macroLine(food)}`)),
    icon('plus', 'result-add'));
}

function createRow() {
  return el('button', {
    type: 'button', class: 'btn btn-ghost create-btn',
    onclick: () => navigate(`${session.base}/new`, { state: flowState() }),
  }, icon('edit'), 'Create a food manually');
}

function select(food) {
  session.selected = { food, ...defaultPortion(food) };
  navigate(`${session.base}/qty`, { state: flowState() });
}

// ---- Amount -----------------------------------------------------------------------

function renderPortion(root) {
  const s = session;
  const { food, amount, unit } = s.selected;
  root.append(
    topbar({ title: 'How much?', subtitle: `${mealLabel(s.meal)} · ${dayName(s.date)}`, back: s.base }),
    portionForm({
      food, amount, unit, meal: s.meal, submitLabel: 'Add',
      onSubmit: async ({ amount: amt, unit: u, meal, food: chosen }) => {
        const food = chosen; // includes the portion size picked on this screen
        const { _idx, transient, lastUsed, useCount, lastAmount, lastUnit, ...snapshot } = food;
        await db.putEntry({
          id: db.uid(), date: s.date, meal, name: food.name, amount: amt, unit: u,
          ...nutrientsFor(food, amt, u),
          source: food.source, foodId: food.id, food: snapshot, createdAt: Date.now(),
        });
        if (!food.transient) await rememberFood(food, amt, u);
        toast(`Added ${food.name} · ${fmtKcal(nutrientsFor(food, amt, u).kcal)} kcal`);
        const back = `#/day/${s.date}`;
        session = null;
        exitFlow(back);
      },
    }));
}

// ---- Create food ------------------------------------------------------------------

function renderNewFood(root) {
  const s = session;
  root.append(
    topbar({ title: 'New food', subtitle: `For ${mealLabel(s.meal)}`, back: s.base }),
    foodForm({
      submitLabel: 'Next: choose amount',
      showKeep: true,
      onSubmit: async (food, { keep }) => {
        if (keep) await db.putFood(food);
        else food.transient = true;
        s.selected = { food, ...defaultPortion(food) };
        navigate(`${s.base}/qty`, { replace: true, state: flowState() });
      },
    }));
}
