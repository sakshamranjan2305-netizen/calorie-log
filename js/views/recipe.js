// Meal builder: a saved meal made of ingredients added one by one (search -> amount -> back).
// It's stored in My foods with values per serving, so it can be searched and logged like any food.
// Editing a meal never changes past entries.

import * as db from '../db.js';
import { el, icon, iconButton, topbar, toast, confirmAction, setChildren } from '../ui.js';
import { navigate, beginFlow, flowState, exitFlow, backToFlowStart, refresh } from '../router.js';
import {
  NUTRIENTS, NUTRIENT_KEYS, nutrientsFor, sumNutrients, defaultPortion, describePortion,
  fmtKcal, fmtGrams, fmtNum, parseAmount, round1,
} from '../nutrition.js';
import { rememberFood } from '../search.js';
import { portionForm } from './portion.js';
import { foodForm } from './foodform.js';
import { foodSearch } from './foodsearch.js';

let session = null;
let savedRecipe = null;

/** The meal saved by the last builder session (once), so "Add food" can log it straight away. */
export function takeSavedRecipe() {
  const r = savedRecipe;
  savedRecipe = null;
  return r;
}

export async function render(root, { id, step }) {
  const base = `#/recipe/${encodeURIComponent(id)}`;
  if (step === 'edit') {
    if (history.state?.flowStart == null || !session || session.base !== base) {
      const original = id === 'new' ? null : await db.getFood(id);
      if (id !== 'new' && !original) {
        root.append(topbar({ title: 'Meal not found', back: '#/foods' }),
          el('p', { class: 'content empty' }, 'This meal was removed.'));
        return;
      }
      savedRecipe = null;
      session = {
        base, original,
        name: original?.name || '',
        servings: String(original?.servings || 1),
        cooked: original?.cookedGrams ? String(original.cookedGrams) : '',
        ingredients: (original?.ingredients || []).map((i) => ({ ...i })),
        search: { query: '', online: null },
        selected: null,
      };
    }
    beginFlow();
    return renderBuilder(root);
  }
  if (!session || session.base !== base) {
    navigate(base, { replace: true });
    return;
  }
  if (step === 'add') return renderSearch(root);
  if (step === 'qty' && session.selected) return renderPortion(root);
  if (step === 'new') return renderNewFood(root);
  navigate(base, { replace: true });
}

const ingredientNutrients = (i) => nutrientsFor(i.food, i.amount, i.unit);

function perServing(total, servings) {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, round1(total[k] / servings)]));
}

/** Uncooked weight of the ingredients; `partial` when some have no known weight. */
function rawWeight(ingredients) {
  let grams = 0;
  let partial = false;
  for (const i of ingredients) {
    if (i.unit === 'g') grams += i.amount;
    else if (i.food.servingGrams > 0) grams += i.amount * i.food.servingGrams;
    else partial = true;
  }
  return { grams: Math.round(grams), partial };
}

// ---- Builder ----------------------------------------------------------------------

function renderBuilder(root) {
  const s = session;
  const error = el('p', { class: 'field-error', role: 'alert' });
  const totalsCard = el('section', { class: 'card preview-card', 'aria-live': 'polite' });
  const numAttrs = { type: 'text', inputmode: 'decimal', autocomplete: 'off' };

  const nameInput = el('input', {
    id: 'recipe-name', type: 'text', autocomplete: 'off', value: s.name,
    placeholder: 'e.g. Sunday rajma chawal, oats smoothie', oninput: (e) => { s.name = e.target.value; },
  });
  const servingsInput = el('input', {
    id: 'servings', ...numAttrs, value: s.servings, oninput: (e) => { s.servings = e.target.value; drawTotals(); },
  });
  const cookedInput = el('input', {
    id: 'cooked', ...numAttrs, value: s.cooked, placeholder: 'optional', oninput: (e) => { s.cooked = e.target.value; },
  });

  function drawTotals() {
    if (!s.ingredients.length) {
      setChildren(totalsCard, el('h2', {}, 'Whole meal'), el('p', { class: 'muted small' }, 'Totals appear here as you add ingredients.'));
      return;
    }
    const total = sumNutrients(s.ingredients.map(ingredientNutrients));
    const servings = parseAmount(s.servings);
    setChildren(totalsCard,
      el('h2', {}, 'Whole meal'),
      nutrientBlock(total),
      servings > 1 ? [
        el('h2', { class: 'per-serving' }, `Per serving (1 of ${fmtNum(servings)})`),
        nutrientBlock(perServing(total, servings)),
      ] : null);
  }

  const raw = rawWeight(s.ingredients);
  const ingredientsCard = el('section', { class: 'card meal' },
    el('div', { class: 'meal-head' },
      el('h2', {}, 'Ingredients'),
      s.ingredients.length ? el('span', { class: 'meal-kcal' }, String(s.ingredients.length)) : null),
    s.ingredients.length
      ? el('ul', { class: 'entry-list' }, s.ingredients.map((ing, i) => el('li', { class: 'ingredient' },
        el('button', {
          type: 'button', class: 'entry',
          onclick: () => {
            s.selected = { index: i, food: ing.food, amount: ing.amount, unit: ing.unit };
            navigate(`${s.base}/qty`, { state: flowState() });
          },
        },
        el('span', { class: 'entry-main' },
          el('span', { class: 'entry-name' }, ing.food.name),
          el('span', { class: 'entry-meta' }, describePortion(ing.food, ing.amount, ing.unit))),
        el('span', { class: 'entry-kcal' }, fmtKcal(ingredientNutrients(ing).kcal))),
        iconButton('close', `Remove ${ing.food.name}`, () => { s.ingredients.splice(i, 1); refresh(); }))))
      : el('p', { class: 'empty' }, 'Add what went into the meal one by one, e.g. 2 roti, 1 katori dal, 100 g curd.'),
    el('button', {
      type: 'button', class: 'btn btn-ghost add-ingredient',
      onclick: () => navigate(`${s.base}/add`, { state: flowState() }),
    }, icon('plus'), 'Add ingredient'));

  const remove = s.original ? el('button', {
    type: 'button', class: 'btn btn-danger',
    onclick: async () => {
      if (!(await confirmAction(`Remove “${s.original.name}” from My foods? Meals you've already logged stay as they are.`))) return;
      await db.deleteFood(s.original.id);
      session = null;
      toast('Meal removed');
      exitFlow('#/foods');
    },
  }, icon('trash'), 'Remove meal') : null;

  async function save(e) {
    e.preventDefault();
    const name = s.name.trim();
    const servings = parseAmount(s.servings);
    const cooked = s.cooked.trim() ? parseAmount(s.cooked) : 0;
    if (!name) { error.textContent = 'Give the meal a name.'; nameInput.focus(); return; }
    if (!s.ingredients.length) { error.textContent = 'Add at least one ingredient.'; return; }
    if (!(servings > 0)) { error.textContent = 'Enter how many servings it makes (1 or more).'; servingsInput.focus(); return; }
    if (!(cooked >= 0)) { error.textContent = 'Enter a valid weight in grams.'; cookedInput.focus(); return; }
    error.textContent = '';

    const prev = s.original || {};
    const { _idx, ...rest } = prev;
    const recipe = {
      ...rest,
      id: prev.id || `recipe:${db.uid()}`,
      source: 'recipe',
      name,
      basis: 'serving',
      servingLabel: servings === 1 ? 'meal' : 'serving',
      servingGrams: cooked > 0 ? round1(cooked / servings) : 0,
      portions: [],
      ...perServing(sumNutrients(s.ingredients.map(ingredientNutrients)), servings),
      servings,
      cookedGrams: round1(cooked),
      ingredients: s.ingredients,
      createdAt: prev.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await db.putFood(recipe);
    savedRecipe = recipe;
    session = null;
    toast(`Saved ${name}`);
    exitFlow('#/foods');
  }

  root.append(
    topbar({ title: s.original ? 'Edit meal' : 'New meal', back: '#/foods' }),
    el('form', { class: 'food-form', onsubmit: save },
      el('div', { class: 'content' },
        el('div', { class: 'field' }, el('label', { for: 'recipe-name' }, 'Meal name'), nameInput),
        el('div', { class: 'field-gap' }),
        ingredientsCard,
        el('div', { class: 'field-row' },
          el('div', { class: 'field' }, el('label', { for: 'servings' }, 'Makes how many servings?'), servingsInput),
          el('div', { class: 'field' }, el('label', { for: 'cooked' }, 'Cooked weight (g)'), cookedInput)),
        el('p', { class: 'hint' }, 'Weigh the finished dish to also log it by grams. '
          + (raw.grams > 0 ? `Ingredients add up to ${raw.partial ? 'at least ' : ''}${fmtNum(raw.grams)} g before cooking.` : '')),
        totalsCard,
        error,
        remove),
      el('div', { class: 'sticky-actions' }, el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save meal'))));

  drawTotals();
}

function nutrientBlock(v) {
  return [
    el('div', { class: 'preview-kcal' }, el('span', { class: 'preview-value' }, fmtKcal(v.kcal)), el('span', {}, ' kcal')),
    el('dl', { class: 'preview-macros' }, NUTRIENTS.slice(1).map((n) => el('div', {},
      el('dt', {}, n.label), el('dd', {}, `${fmtGrams(v[n.key])} g`)))),
  ];
}

// ---- Ingredient search / amount / create ------------------------------------------

function select(food) {
  session.selected = { food, ...defaultPortion(food) };
  navigate(`${session.base}/qty`, { state: flowState() });
}

function renderSearch(root) {
  const s = session;
  const search = foodSearch(s.search, {
    onSelect: select,
    exclude: new Set(s.original ? [s.original.id] : []),
    emptyText: 'Search for an ingredient — atta, rice, paneer, oil, milk…',
    footer: () => el('button', {
      type: 'button', class: 'btn btn-ghost create-btn',
      onclick: () => navigate(`${s.base}/new`, { state: flowState() }),
    }, icon('edit'), 'Create a food manually'),
  });
  root.append(topbar({ title: 'Add ingredient', subtitle: s.name.trim() || 'New meal', back: s.base }), ...search.nodes);
  return search.cleanup;
}

function renderPortion(root) {
  const s = session;
  const { food, amount, unit, index } = s.selected;
  const editing = index != null;
  root.append(
    topbar({ title: 'How much?', subtitle: `Ingredient · ${s.name.trim() || 'New meal'}`, back: s.base }),
    portionForm({
      food, amount, unit, showMeal: false, submitLabel: editing ? 'Update ingredient' : 'Add to meal',
      onSubmit: async ({ amount: amt, unit: u, food: chosen }) => {
        const { _idx, transient, lastUsed, useCount, lastAmount, lastUnit, ...snapshot } = chosen;
        const ingredient = { food: snapshot, amount: amt, unit: u };
        if (editing) s.ingredients[index] = ingredient;
        else s.ingredients.push(ingredient);
        if (!chosen.transient) await rememberFood(chosen, amt, u);
        s.selected = null;
        s.search = { query: '', online: null }; // next ingredient starts from a fresh search
        backToFlowStart(s.base);
      },
    }));
}

function renderNewFood(root) {
  const s = session;
  root.append(
    topbar({ title: 'New food', subtitle: `Ingredient · ${s.name.trim() || 'New meal'}`, back: `${s.base}/add` }),
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
