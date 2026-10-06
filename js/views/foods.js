// My foods: list, create, edit, delete saved foods. Editing a food never changes past entries.

import * as db from '../db.js';
import { el, icon, topbar, toast, confirmAction } from '../ui.js';
import { goBack, navigate } from '../router.js';
import { describeFood, macroLine } from '../nutrition.js';
import { SOURCE_LABELS } from '../search.js';
import { foodForm } from './foodform.js';

export async function render(root, { mode, id }) {
  if (mode === 'new') return renderForm(root, null);
  if (mode === 'edit') {
    const food = await db.getFood(id);
    if (food) return renderForm(root, food);
  }
  return renderList(root);
}

async function renderList(root) {
  const foods = (await db.getAllFoods()).sort((a, b) => a.name.localeCompare(b.name));
  const filter = el('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter my foods' });
  const list = el('div', { class: 'card list-card' });

  function draw() {
    const q = filter.value.trim().toLowerCase();
    const shown = foods.filter((f) => !q || f.name.toLowerCase().includes(q));
    list.replaceChildren(...(shown.length ? shown.map((f) => el('a', {
      class: 'result', href: `#/foods/edit/${encodeURIComponent(f.id)}`,
    },
    el('span', { class: 'result-main' },
      el('span', { class: 'result-name' }, f.name),
      el('span', { class: 'result-meta' }, `${SOURCE_LABELS[f.source] || ''} · ${describeFood(f)}`),
      el('span', { class: 'result-meta' }, macroLine(f))),
    icon('edit', 'result-add'))) : [el('p', { class: 'empty' }, foods.length ? 'No matches.' : 'No saved foods yet. Foods you log are saved here automatically.')]));
  }
  filter.addEventListener('input', draw);
  draw();

  root.append(
    topbar({
      title: 'My foods', subtitle: `${foods.length} saved`, back: '#/settings',
      actions: [el('button', { type: 'button', class: 'btn btn-small', onclick: () => navigate('#/foods/new') }, icon('plus'), 'New')],
    }),
    el('div', { class: 'content' }, foods.length > 8 ? el('div', { class: 'searchbar plain' }, icon('search', 'search-icon'), filter) : null, list));
}

function renderForm(root, food) {
  const del = food ? el('div', { class: 'content' }, el('button', {
    type: 'button', class: 'btn btn-danger',
    onclick: async () => {
      if (!(await confirmAction(`Remove “${food.name}” from My foods? Meals you've already logged stay as they are.`))) return;
      await db.deleteFood(food.id);
      toast('Food removed');
      goBack('#/foods');
    },
  }, icon('trash'), 'Remove from My foods')) : null;

  root.append(
    topbar({ title: food ? 'Edit food' : 'New food', back: '#/foods' }),
    foodForm({
      food, submitLabel: 'Save food',
      onSubmit: async (f) => {
        await db.putFood(f);
        toast('Food saved');
        goBack('#/foods');
      },
    }),
    del);
}
