// Nutrient definitions, portion math, daily totals and goal lookup.

// `limit` nutrients should stay under the goal; `target` nutrients should reach it.
export const NUTRIENTS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', kind: 'limit', short: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g', kind: 'target', short: 'P' },
  { key: 'carbs', label: 'Carbs', unit: 'g', kind: 'limit', short: 'C' },
  { key: 'fat', label: 'Fat', unit: 'g', kind: 'limit', short: 'F' },
  { key: 'fibre', label: 'Fibre', unit: 'g', kind: 'target', short: 'Fb' },
];
export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);
export const nutrient = (key) => NUTRIENTS.find((n) => n.key === key);

export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];
export const MEAL_KEYS = MEALS.map((m) => m.key);
export const mealLabel = (key) => MEALS.find((m) => m.key === key)?.label ?? key;

export const DEFAULT_GOALS = { kcal: 2000, protein: 60, carbs: 250, fat: 65, fibre: 30 };

export const round1 = (x) => Math.round(x * 10) / 10;

// ---- Foods & portions -------------------------------------------------------
// A food's nutrient values are per `basis`: per 100 g, or per one serving.
// `servingLabel` + `servingGrams` describe one serving when its weight is known.

/** Units a food can be logged in ('serving' and/or 'g'), preferred first. */
export function unitsFor(food) {
  const hasGrams = food.servingGrams > 0;
  if (food.basis === 'serving') return hasGrams ? ['serving', 'g'] : ['serving'];
  return hasGrams ? ['serving', 'g'] : ['g'];
}

/** Multiplier applied to the food's per-basis values for `amount` of `unit`. */
export function portionFactor(food, amount, unit) {
  if (food.basis === 'serving') return unit === 'serving' ? amount : amount / food.servingGrams;
  return unit === 'g' ? amount / 100 : (amount * food.servingGrams) / 100;
}

export function nutrientsFor(food, amount, unit) {
  const f = portionFactor(food, amount, unit);
  const out = {};
  for (const key of NUTRIENT_KEYS) out[key] = round1((Number(food[key]) || 0) * f);
  return out;
}

/** Convert an amount between units of the same food (e.g. 2 servings -> 240 g). */
export function convertAmount(food, amount, from, to) {
  if (from === to || !(food.servingGrams > 0)) return amount;
  return from === 'serving' ? round1(amount * food.servingGrams) : round1(amount / food.servingGrams);
}

export function defaultPortion(food) {
  if (food.lastAmount > 0 && unitsFor(food).includes(food.lastUnit)) {
    return { amount: food.lastAmount, unit: food.lastUnit };
  }
  const unit = unitsFor(food)[0];
  return { amount: unit === 'g' ? 100 : 1, unit };
}

export function servingName(food) {
  return food.servingLabel || 'serving';
}

/** "1 × bowl (120 g)", "150 g", "2 × serving" */
export function describePortion(food, amount, unit) {
  if (unit === 'g') return `${fmtNum(amount)} g`;
  const grams = food.servingGrams > 0 ? ` (${fmtNum(Math.round(amount * food.servingGrams))} g)` : '';
  return `${fmtNum(amount)} × ${servingName(food)}${grams}`;
}

/** Short per-unit summary for search results, e.g. "1 bowl (120 g) · 172 kcal". */
export function describeFood(food) {
  if (food.basis === 'serving') {
    const g = food.servingGrams > 0 ? ` (${fmtNum(food.servingGrams)} g)` : '';
    return `1 ${servingName(food)}${g} · ${fmtKcal(food.kcal)} kcal`;
  }
  if (food.servingGrams > 0) {
    const kcal = (food.kcal * food.servingGrams) / 100;
    return `1 ${servingName(food)} (${fmtNum(food.servingGrams)} g) · ${fmtKcal(kcal)} kcal`;
  }
  return `100 g · ${fmtKcal(food.kcal)} kcal`;
}

// ---- Totals & goals ---------------------------------------------------------

export function sumNutrients(items) {
  const total = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  for (const it of items) for (const k of NUTRIENT_KEYS) total[k] += Number(it[k]) || 0;
  for (const k of NUTRIENT_KEYS) total[k] = round1(total[k]);
  return total;
}

/**
 * Goals are kept as a history of { from: 'YYYY-MM-DD', kcal, protein, ... }, sorted by `from`,
 * so changing goals today doesn't change how earlier days are judged.
 */
export function goalsFor(goalsHistory, date) {
  if (!goalsHistory || goalsHistory.length === 0) return { ...DEFAULT_GOALS };
  let goals = goalsHistory[0];
  for (const g of goalsHistory) if (g.from <= date) goals = g;
  return goals;
}

/** How a consumed amount compares with its goal. */
export function goalStatus(n, consumed, goal) {
  const pct = goal > 0 ? consumed / goal : 0;
  if (n.kind === 'limit') {
    return consumed > goal
      ? { state: 'over', pct, text: `${fmtNutrient(n.key, consumed - goal)} ${n.unit} over` }
      : { state: 'ok', pct, text: `${fmtNutrient(n.key, goal - consumed)} ${n.unit} left` };
  }
  return consumed >= goal
    ? { state: 'reached', pct, text: 'Goal reached' }
    : { state: 'ok', pct, text: `${fmtNutrient(n.key, goal - consumed)} ${n.unit} to go` };
}

/** Whether a day's total counts as a success for this nutrient. */
export function metGoal(n, consumed, goal) {
  return n.kind === 'limit' ? consumed <= goal : consumed >= goal;
}

// ---- Formatting -------------------------------------------------------------

const intFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export const fmtKcal = (x) => intFmt.format(Math.round(x));
export const fmtNum = (x) => numFmt.format(x);
/** Grams: one decimal below 10 g, whole numbers above. */
export const fmtGrams = (x) => (Math.abs(x) < 10 ? numFmt.format(round1(x)) : intFmt.format(Math.round(x)));
export const fmtNutrient = (key, x) => (key === 'kcal' ? fmtKcal(x) : fmtGrams(x));

/** "P 6 · C 16 · F 6 · Fb 2" */
export function macroLine(v) {
  return NUTRIENTS.filter((n) => n.key !== 'kcal')
    .map((n) => `${n.short} ${fmtGrams(v[n.key] || 0)}`)
    .join(' · ');
}

/** Parses "1.5", "1,5", "½" style input; returns NaN when invalid. */
export function parseAmount(text) {
  const t = String(text).trim().replace(',', '.').replace('½', '.5').replace('¼', '.25').replace('¾', '.75');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
  return Number(t);
}
