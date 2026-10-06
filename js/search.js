// Food search: My foods (saved on the phone), the bundled food lists (Indian dishes from INDB,
// basic foods from USDA) and packaged products from Open Food Facts (online).

import * as db from './db.js';

// ---- Text matching ------------------------------------------------------------
// Normalises spelling variants common in romanised Hindi so "daal"/"dhal"/"dal",
// "chapathi"/"chapati" and "channa"/"chana" all match.
export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/([bcdgjkpt])h/g, '$1')
    .trim();
}

const tokenize = (s) => normalize(s).split(' ').filter(Boolean);

// A few English <-> Hindi equivalents that the data doesn't always spell out.
const SYNONYMS = [
  ['roti', 'capati', 'pulka', 'fulka'],
  ['curd', 'dahi', 'yogurt', 'yoghurt'],
  ['rice', 'cawal'],
  ['egg', 'anda', 'ande'],
  ['potato', 'alo', 'alu'],
  ['cickpea', 'cana', 'cole', 'kabuli'],
  ['cauliflower', 'gobi'],
  ['okra', 'bindi'],
  ['spinac', 'palak'],
  ['milk', 'dod'],
  ['paner', 'cotage'],
  ['cicken', 'murg', 'murgi'],
  ['muton', 'goat', 'lamb'],
  ['lentil', 'masor'],
  ['kidney', 'rajma', 'rajmah'],
  ['prawn', 'shrimp', 'jinga'],
].map((group) => group.map(normalize));

function variants(token) {
  const out = [token];
  if (token.length < 3) return out;
  for (const group of SYNONYMS) {
    if (group.some((g) => token.startsWith(g) || g.startsWith(token))) out.push(...group);
  }
  return out;
}

/**
 * Index a name: all tokens, plus the "main" name (before any bracketed alias) split into its
 * "/"-separated alternatives, e.g. "Chapati/Roti" -> [[capati], [roti]].
 */
function indexName(name) {
  const main = name.split('(')[0];
  return {
    terms: tokenize(name),
    segments: main.split('/').map(tokenize).filter((s) => s.length),
  };
}

/** Score how well a name matches the query tokens; 0 means no match. */
function score(queryTokens, { terms, segments }) {
  let total = 0;
  const exact = new Set();
  for (const qt of queryTokens) {
    let best = 0;
    for (const v of variants(qt)) {
      for (const t of terms) {
        if (t === v) { best = Math.max(best, 3); exact.add(t); }
        else if (t.startsWith(v)) best = Math.max(best, 2);
        else if (v.length >= 3 && t.includes(v)) best = Math.max(best, 1);
      }
    }
    if (!best) return 0;
    total += best;
  }
  // Prefer names that are mostly the query ("Banana" over "Banana cake") ...
  total += 2 * Math.max(0, ...segments.map((seg) => seg.filter((t) => exact.has(t)).length / seg.length));
  // ... and names that start with the first query word.
  if (terms[0]?.startsWith(queryTokens[0])) total += 0.5;
  return total;
}

function rank(list, query, limit) {
  const qt = tokenize(query);
  if (qt.length === 0) return [];
  return list
    .map((item) => {
      const idx = item._idx || (item._idx = indexName(item.name));
      const s = score(qt, idx);
      return { item, s: s && item.source === 'usda' ? s + 0.75 : s }; // plain foods slightly first
    })
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || (b.item.useCount || 0) - (a.item.useCount || 0) || a.item.name.length - b.item.name.length)
    .slice(0, limit)
    .map((r) => r.item);
}

// ---- Bundled food lists -----------------------------------------------------------

const DATASETS = [
  { url: 'data/indb.json', source: 'indb' },
  { url: 'data/basics.json', source: 'usda' },
];
let catalogPromise = null;

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = Promise.all(DATASETS.map(async ({ url, source }) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not load the food list');
      const data = await res.json();
      return data.foods.map(([code, name, kcal, protein, carbs, fat, fibre, servingUnit, servingGrams]) => ({
        id: `${source}:${code}`, source, name, basis: '100g',
        kcal, protein, carbs, fat, fibre,
        servingLabel: servingUnit || '', servingGrams: servingGrams || 0,
      }));
    })).then((lists) => lists.flat());
    catalogPromise.catch(() => { catalogPromise = null; });
  }
  return catalogPromise;
}

export async function searchCatalog(query, excludeIds = new Set(), limit = 40) {
  const all = await loadCatalog();
  return rank(all.filter((f) => !excludeIds.has(f.id)), query, limit);
}

// ---- My foods -------------------------------------------------------------------

export async function searchMyFoods(query, limit = 15) {
  return rank(await db.getAllFoods(), query, limit);
}

export async function recentFoods(limit = 25) {
  const foods = await db.getAllFoods();
  return foods.filter((f) => f.lastUsed).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, limit);
}

/** Save/refresh a food in My foods after it's logged, remembering the portion used. */
export async function rememberFood(food, amount, unit) {
  const existing = await db.getFood(food.id);
  const base = existing || food;
  const { _idx, ...clean } = base;
  await db.putFood({
    ...clean,
    lastUsed: Date.now(),
    useCount: (existing?.useCount || 0) + 1,
    lastAmount: amount,
    lastUnit: unit,
  });
}

export const SOURCE_LABELS = {
  indb: 'Indian dish (INDB)',
  usda: 'Basic food (USDA)',
  off: 'Packaged (Open Food Facts)',
  custom: 'Your food',
};

// ---- Open Food Facts --------------------------------------------------------------
// Free, no key. Search is rate-limited (~10/min), so it runs only when the user asks.

const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity';

async function offQuery(query, { india, signal }) {
  const params = new URLSearchParams({
    search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '30', fields: OFF_FIELDS,
  });
  if (india) {
    params.set('tagtype_0', 'countries');
    params.set('tag_contains_0', 'contains');
    params.set('tag_0', 'india');
  }
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, { signal });
  if (!res.ok) throw new Error(res.status === 429 || res.status === 503 ? 'Too many searches — wait a minute and try again.' : `Search failed (${res.status})`);
  const data = await res.json();
  return (data.products || []).map(offToFood).filter(Boolean);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function offToFood(p) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n.energy_100g) != null) kcal = n.energy_100g / 4.184; // kJ -> kcal
  const name = (p.product_name || p.product_name_en || '').trim();
  if (kcal == null || !name || !p.code) return null;
  const brand = (p.brands || '').split(',')[0].trim();
  const grams = num(p.serving_quantity);
  const r1 = (x) => Math.round((num(x) || 0) * 10) / 10;
  return {
    id: `off:${p.code}`, source: 'off',
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name,
    basis: '100g',
    kcal: r1(kcal), protein: r1(n.proteins_100g), carbs: r1(n.carbohydrates_100g), fat: r1(n.fat_100g), fibre: r1(n.fiber_100g),
    fibreMissing: num(n.fiber_100g) == null,
    servingLabel: grams > 0 ? 'serving' : '', servingGrams: grams > 0 ? Math.round(grams * 10) / 10 : 0,
  };
}

/** Products sold in India first; tops up with worldwide results when there are few. */
export async function searchOpenFoodFacts(query, { signal } = {}) {
  const india = await offQuery(query, { india: true, signal });
  if (india.length >= 8) return india;
  const world = await offQuery(query, { india: false, signal });
  const seen = new Set(india.map((f) => f.id));
  return india.concat(world.filter((f) => !seen.has(f.id)));
}
