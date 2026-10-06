// Create / edit a food by hand (e.g. from a nutrition label or a home recipe).

import { el, segmented } from '../ui.js';
import { uid } from '../db.js';
import { NUTRIENTS, parseAmount, round1 } from '../nutrition.js';

export function foodForm({ food, submitLabel, showKeep = false, onSubmit }) {
  const state = { basis: food?.basis || '100g' };
  const field = (id, label, attrs = {}, hint = '') => el('div', { class: 'field' },
    el('label', { for: id }, label),
    el('input', { id, name: id, autocomplete: 'off', ...attrs }),
    hint ? el('p', { class: 'hint' }, hint) : null);
  const numAttrs = (v) => ({ type: 'text', inputmode: 'decimal', value: v != null && v !== '' ? String(v) : '' });

  const perLabel = el('p', { class: 'field-label' });
  const servingHint = el('p', { class: 'hint' });
  const error = el('p', { class: 'field-error', role: 'alert' });
  const keep = el('input', { type: 'checkbox', id: 'keep', checked: true });

  function syncBasis() {
    perLabel.textContent = state.basis === '100g' ? 'Nutrition per 100 g' : 'Nutrition per 1 serving';
    servingHint.textContent = state.basis === '100g'
      ? 'Optional. Lets you log by serving (e.g. 1 katori = 150 g).'
      : 'Optional. Lets you log by grams too.';
  }

  const form = el('form', {
    class: 'food-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const f = e.currentTarget.elements;
      const name = f.name.value.trim();
      const values = {};
      for (const n of NUTRIENTS) {
        const raw = f[n.key].value.trim();
        const v = raw === '' ? (n.key === 'kcal' ? NaN : 0) : parseAmount(raw);
        if (!(v >= 0)) { error.textContent = `Enter a valid number for ${n.label}.`; f[n.key].focus(); return; }
        values[n.key] = round1(v);
      }
      if (!name) { error.textContent = 'Give the food a name.'; f.name.focus(); return; }
      const gramsRaw = f.servingGrams.value.trim();
      const servingGrams = gramsRaw ? parseAmount(gramsRaw) : 0;
      if (!(servingGrams >= 0)) { error.textContent = 'Enter a valid serving weight.'; f.servingGrams.focus(); return; }
      error.textContent = '';
      await onSubmit({
        ...(food || {}),
        id: food?.id || `custom:${uid()}`,
        source: food?.source || 'custom',
        name,
        basis: state.basis,
        servingLabel: f.servingLabel.value.trim() || (state.basis === 'serving' ? 'serving' : ''),
        servingGrams: round1(servingGrams),
        ...values,
        _idx: undefined,
        createdAt: food?.createdAt || Date.now(),
      }, { keep: !showKeep || keep.checked });
    },
  },
  el('div', { class: 'content' },
    field('name', 'Name', { type: 'text', value: food?.name || '', placeholder: "e.g. Mom's dal, Amul protein lassi", required: true }),
    el('p', { class: 'field-label' }, 'Values on the label are per'),
    segmented([{ value: '100g', label: '100 g' }, { value: 'serving', label: '1 serving' }], state.basis,
      (v) => { state.basis = v; syncBasis(); }, { label: 'Values are per' }),
    el('div', { class: 'field-row' },
      field('servingLabel', 'Serving name', { type: 'text', value: food?.servingLabel || '', placeholder: 'katori, piece, scoop' }),
      field('servingGrams', 'Serving weight (g)', numAttrs(food?.servingGrams || ''))),
    servingHint,
    perLabel,
    el('div', { class: 'nutrient-fields' },
      NUTRIENTS.map((n) => field(n.key, `${n.label} (${n.unit})`, { ...numAttrs(food?.[n.key]), placeholder: n.key === 'kcal' ? 'required' : '0' }))),
    showKeep ? el('label', { class: 'check' }, keep, 'Save to My foods for next time') : null,
    error),
  el('div', { class: 'sticky-actions' }, el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel)));

  syncBasis();
  return form;
}
