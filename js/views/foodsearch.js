// Food search screen body, shared by "Add food" and the meal builder: local results as you type,
// Open Food Facts on demand. `state` ({ query, online }) belongs to the caller so it survives
// going back to the search screen.

import { el, icon, setChildren } from '../ui.js';
import { describeFood, macroLine } from '../nutrition.js';
import { searchMyFoods, searchCatalog, recentFoods, searchOpenFoodFacts, SOURCE_LABELS } from '../search.js';

/** Returns { nodes, cleanup }. `footer()` returns extra nodes shown below the results. */
export function foodSearch(state, { onSelect, footer = () => null, exclude = new Set(), emptyText }) {
  const s = state;
  const results = el('div', { class: 'results' });
  const input = el('input', {
    type: 'search', value: s.query, placeholder: 'Search dal, roti, banana, Amul…', 'aria-label': 'Search foods',
    autocomplete: 'off', enterkeyhint: 'search',
  });
  const keep = (f) => !exclude.has(f.id);
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
      const recent = (await recentFoods()).filter(keep);
      setChildren(results,
        recent.length
          ? group('Recent', recent.map(foodRow))
          : el('p', { class: 'empty' }, emptyText),
        footer());
      return;
    }
    const mine = (await searchMyFoods(q)).filter(keep);
    const shown = new Set([...exclude, ...mine.map((f) => f.id)]);
    const { foods, packaged } = await searchCatalog(q, shown);
    if (s.query.trim() !== q) return; // a newer search has started
    packaged.forEach((f) => shown.add(f.id));
    setChildren(results,
      mine.length ? group('My foods', mine.map(foodRow)) : null,
      foods.length ? group('Foods — Indian & worldwide', foods.map(foodRow))
        : !packaged.length && !mine.length ? group('Foods', [el('p', { class: 'empty' }, `No matches for “${q}”.`)]) : null,
      packaged.length ? group('Packaged products', packaged.map(foodRow)) : null,
      onlineSection(q, shown),
      footer());
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

  function foodRow(food) {
    const per100 = food.basis === '100g' && food.servingGrams > 0;
    return el('button', { type: 'button', class: 'result', onclick: () => onSelect(food) },
      el('span', { class: 'result-main' },
        el('span', { class: 'result-name' }, food.name),
        el('span', { class: 'result-meta' }, `${SOURCE_LABELS[food.source] || ''} · ${describeFood(food)}`),
        el('span', { class: 'result-meta' }, `${per100 ? 'per 100 g: ' : ''}${macroLine(food)}`)),
      icon('plus', 'result-add'));
  }

  showLocal();
  if (!s.query) requestAnimationFrame(() => input.focus());
  return {
    nodes: [el('div', { class: 'search-wrap' }, form), el('div', { class: 'content' }, results)],
    cleanup: () => { clearTimeout(timer); abort?.abort(); },
  };
}

function group(title, children) {
  return el('section', { class: 'result-group' }, el('h3', {}, title), el('div', { class: 'card list-card' }, children));
}
