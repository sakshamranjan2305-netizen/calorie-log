// Edit or delete a logged entry.

import * as db from '../db.js';
import { el, icon, topbar, toast } from '../ui.js';
import { goBack, refresh } from '../router.js';
import { mediumDate } from '../dates.js';
import { nutrientsFor } from '../nutrition.js';
import { portionForm } from './portion.js';

export async function render(root, { id }) {
  const entry = await db.getEntry(id);
  if (!entry) {
    root.append(topbar({ title: 'Entry not found', back: '#/day' }),
      el('p', { class: 'content empty' }, 'This entry was deleted.'));
    return;
  }
  const back = `#/day/${entry.date}`;

  const remove = el('button', {
    type: 'button', class: 'btn btn-danger',
    onclick: async () => {
      await db.deleteEntry(entry.id);
      toast(`Deleted ${entry.name}`, {
        actionLabel: 'Undo',
        onAction: async () => { await db.putEntry(entry); refresh(); },
      });
      goBack(back);
    },
  }, icon('trash'), 'Delete entry');

  root.append(
    topbar({ title: 'Edit entry', subtitle: mediumDate(entry.date), back }),
    portionForm({
      food: entry.food, amount: entry.amount, unit: entry.unit, meal: entry.meal, submitLabel: 'Save',
      extra: remove,
      onSubmit: async ({ amount, unit, meal }) => {
        await db.putEntry({ ...entry, amount, unit, meal, ...nutrientsFor(entry.food, amount, unit), updatedAt: Date.now() });
        toast('Saved');
        goBack(back);
      },
    }));
}
