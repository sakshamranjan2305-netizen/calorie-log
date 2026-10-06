// Add food: search -> pick a food -> choose amount -> logged.
// Steps share module state so going back from the amount screen keeps the search results.

import * as db from '../db.js';
import { el, icon, topbar, toast } from '../ui.js';
import { navigate, beginFlow, flowState, exitFlow } from '../router.js';
import { dayName } from '../dates.js';
import { mealLabel, nutrientsFor, defaultPortion, fmtKcal } from '../nutrition.js';
import { rememberFood } from '../search.js';
import { portionForm } from './portion.js';
import { foodForm } from './foodform.js';
import { foodSearch } from './foodsearch.js';
import { takeSavedRecipe } from './recipe.js';

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
  // Coming back from the meal builder: log the meal that was just built.
  if (s.buildingRecipe) {
    s.buildingRecipe = false;
    const built = takeSavedRecipe();
    if (built) {
      select(built);
      return;
    }
  }
  const search = foodSearch(s, {
    onSelect: select,
    emptyText: 'Search for a dish or ingredient. Foods you log will show up here for one-tap re-logging.',
    footer: () => [
      el('button', {
        type: 'button', class: 'btn btn-ghost create-btn',
        onclick: () => { s.buildingRecipe = true; navigate('#/recipe/new'); },
      }, icon('food'), 'Build a meal from ingredients'),
      el('button', {
        type: 'button', class: 'btn btn-ghost',
        onclick: () => navigate(`${s.base}/new`, { state: flowState() }),
      }, icon('edit'), 'Create a food manually'),
    ],
  });
  root.append(
    topbar({ title: `Add to ${mealLabel(s.meal)}`, subtitle: dayName(s.date), back: `#/day/${s.date}` }),
    ...search.nodes);
  return search.cleanup;
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
