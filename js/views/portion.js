// Shared "how much did you eat?" form, used when adding food and when editing an entry.
// onSubmit receives { amount, unit, meal, food } — `food` carries the portion size chosen here.

import { el, segmented, setChildren } from '../ui.js';
import {
  MEALS, NUTRIENTS, unitsFor, nutrientsFor, convertAmount, servingName, describeFood,
  fmtKcal, fmtGrams, fmtNum, parseAmount,
} from '../nutrition.js';
import { SOURCE_LABELS } from '../search.js';

const SERVING_CHIPS = [0.5, 1, 1.5, 2, 3];
const GRAM_CHIPS = [50, 100, 150, 200, 250];
const chipLabel = (v) => ({ 0.5: '½', 1.5: '1½' }[v] || String(v));

export function portionForm({ food: original, amount, unit, meal, submitLabel, onSubmit, extra = null }) {
  let food = { ...original };
  const units = unitsFor(food);
  const state = { amount, unit: units.includes(unit) ? unit : units[0], meal };

  const input = el('input', {
    id: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: fmtInput(state.amount),
    'aria-label': 'Amount', oninput: () => update(),
  });
  const chips = el('div', { class: 'chips' });
  const preview = el('div', { class: 'preview' });
  const submit = el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel);
  const error = el('p', { class: 'field-error', role: 'alert' });
  const subtitle = el('p', { class: 'muted' });

  const unitLabel = (u) => (u === 'g' ? 'grams' : servingName(food));
  const unitSeg = units.length > 1
    ? segmented(units.map((u) => ({ value: u, label: unitLabel(u) })), state.unit, (u) => setUnit(u), { label: 'Unit', cls: 'unit-seg' })
    : el('span', { class: 'unit-fixed' }, unitLabel(state.unit));

  function setUnit(u) {
    const current = parseAmount(input.value);
    if (current > 0) input.value = fmtInput(convertAmount(food, current, state.unit, u));
    else input.value = u === 'g' ? '100' : '1';
    state.unit = u;
    unitSeg.setValue?.(u);
    renderChips();
    update();
  }

  // Foods with several portion sizes (e.g. slice / whole pizza) get a picker.
  const portions = original.portions || [];
  const portionPicker = portions.length > 1 ? el('div', {},
    el('label', { class: 'field-label', for: 'portion' }, 'Portion size'),
    el('select', {
      id: 'portion', class: 'select',
      onchange: (e) => {
        const p = portions[Number(e.target.value)];
        food = { ...food, servingLabel: p.label, servingGrams: p.grams };
        if (unitSeg.setValue) unitSeg.querySelector('button').textContent = servingName(food);
        if (state.unit !== 'serving') { state.unit = 'serving'; input.value = '1'; unitSeg.setValue?.('serving'); renderChips(); }
        update();
      },
    }, portions.map((p, i) => el('option', {
      value: String(i), selected: p.label === food.servingLabel && p.grams === food.servingGrams,
    }, `${p.label} (${fmtNum(p.grams)} g)`)))) : null;

  function renderChips() {
    const values = state.unit === 'g' ? GRAM_CHIPS : SERVING_CHIPS;
    chips.replaceChildren(...values.map((v) => el('button', {
      type: 'button', class: 'chip',
      onclick: () => { input.value = fmtInput(v); update(); },
    }, state.unit === 'g' ? `${v} g` : chipLabel(v))));
  }

  function update() {
    subtitle.textContent = `${SOURCE_LABELS[food.source] || ''} · ${describeFood(food)}`;
    const amt = parseAmount(input.value);
    const valid = amt > 0 && amt < 100000;
    submit.disabled = !valid;
    error.textContent = input.value.trim() && !valid ? 'Enter an amount greater than 0' : '';
    const v = nutrientsFor(food, valid ? amt : 0, state.unit);
    const grams = state.unit === 'serving' && food.servingGrams > 0 && valid
      ? `${fmtNum(Math.round(amt * food.servingGrams))} g` : '';
    setChildren(preview,
      el('div', { class: 'preview-kcal' },
        el('span', { class: 'preview-value' }, fmtKcal(v.kcal)), el('span', {}, ' kcal'),
        grams ? el('span', { class: 'preview-grams' }, grams) : null),
      el('dl', { class: 'preview-macros' }, NUTRIENTS.slice(1).map((n) => el('div', {},
        el('dt', {}, n.label), el('dd', {}, `${fmtGrams(v[n.key])} g`)))));
  }

  const form = el('form', {
    class: 'portion-form',
    onsubmit: (e) => {
      e.preventDefault();
      const amt = parseAmount(input.value);
      if (!(amt > 0)) return;
      submit.disabled = true;
      Promise.resolve(onSubmit({ amount: amt, unit: state.unit, meal: state.meal, food }))
        .catch((err) => { error.textContent = err.message; submit.disabled = false; });
    },
  },
  el('div', { class: 'content' },
    el('div', { class: 'food-title' },
      el('h2', {}, food.name),
      subtitle,
      food.fibreMissing ? el('p', { class: 'muted small' }, 'Fibre not listed for this product.') : null),
    portionPicker,
    el('label', { class: 'field-label', for: 'amount' }, 'Amount'),
    el('div', { class: 'amount-row' }, input, unitSeg),
    error,
    chips,
    el('p', { class: 'field-label' }, 'Meal'),
    segmented(MEALS.map((m) => ({ value: m.key, label: m.label })), state.meal, (m) => { state.meal = m; }, { label: 'Meal', cls: 'meal-seg' }),
    el('section', { class: 'card preview-card', 'aria-live': 'polite' }, preview),
    extra),
  el('div', { class: 'sticky-actions' }, submit));

  renderChips();
  update();
  return form;
}

function fmtInput(x) {
  return String(Math.round(x * 100) / 100);
}
