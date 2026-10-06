// Settings: daily goals, My foods, backup/restore, install, data sources.

import * as db from '../db.js';
import { el, icon, topbar, toast, confirmAction } from '../ui.js';
import { refresh } from '../router.js';
import { today, mediumDate } from '../dates.js';
import { NUTRIENTS, goalsFor, parseAmount, round1 } from '../nutrition.js';
import { canInstall, isInstalled, promptInstall, onInstallChange } from '../install.js';

export async function render(root) {
  const [goalsHistory, foods, entryCount, lastBackup, persisted] = await Promise.all([
    db.getSetting('goalsHistory', []),
    db.getAllFoods(),
    db.countEntries(),
    db.getSetting('lastBackup', null),
    navigator.storage?.persisted ? navigator.storage.persisted() : Promise.resolve(false),
  ]);
  const goals = goalsFor(goalsHistory, today());
  const installSlot = el('div');
  const drawInstall = () => installSlot.replaceChildren(installSection(persisted));
  drawInstall();
  const offInstall = onInstallChange(drawInstall);

  root.append(
    topbar({ title: 'Settings' }),
    el('div', { class: 'content' },
      goalsSection(goals, goalsHistory),
      el('section', { class: 'card' },
        el('h2', {}, 'My foods'),
        el('p', { class: 'muted small' }, 'Foods you create or log are saved here for quick re-logging. You can also build a meal from ingredients and log it in one go.'),
        el('a', { class: 'btn btn-secondary', href: '#/foods' }, `Manage my foods (${foods.length})`)),
      backupSection(entryCount, lastBackup),
      installSlot,
      aboutSection()));
  return offInstall;
}

function goalsSection(goals, goalsHistory) {
  const status = el('p', { class: 'muted small', role: 'status' });
  const form = el('form', {
    class: 'goals-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const next = {};
      for (const n of NUTRIENTS) {
        const v = parseAmount(e.currentTarget.elements[n.key].value);
        if (!(v > 0)) { status.textContent = `Enter a goal above 0 for ${n.label}.`; return; }
        next[n.key] = round1(v);
      }
      const t = today();
      await db.setSetting('goalsHistory', [...goalsHistory.filter((g) => g.from < t), { from: t, ...next }]);
      toast('Goals saved');
      refresh();
    },
  },
  el('div', { class: 'nutrient-fields' }, NUTRIENTS.map((n) => el('div', { class: 'field' },
    el('label', { for: `goal-${n.key}` }, `${n.label} (${n.unit})`),
    el('input', { id: `goal-${n.key}`, name: n.key, type: 'text', inputmode: 'decimal', value: String(goals[n.key]), autocomplete: 'off' })))),
  el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save goals'),
  status);

  return el('section', { class: 'card' },
    el('h2', {}, 'Daily goals'),
    el('p', { class: 'muted small' },
      goalsHistory.length
        ? `New goals apply from today. Past days keep the goals they had. Last changed ${mediumDate(goalsHistory[goalsHistory.length - 1].from)}.`
        : 'Not set yet — these are defaults. Calories, carbs and fat are limits; protein and fibre are targets to reach.'),
    form);
}

function backupSection(entryCount, lastBackup) {
  const fileInput = el('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        db.validateBackup(data);
        const ok = await confirmAction(`Restore backup from ${new Date(data.exportedAt).toLocaleString('en-IN')}? `
          + `It has ${data.entries.length} entries and replaces everything currently on this phone.`);
        if (!ok) return;
        await db.importAll(data);
        toast('Backup restored');
        refresh();
      } catch (err) {
        toast(err instanceof SyntaxError ? "That file isn't a valid backup." : err.message);
      }
    },
  });

  async function makeFile() {
    const data = await db.exportAll();
    const name = `calorie-log-backup-${today()}.json`;
    return new File([JSON.stringify(data)], name, { type: 'application/json' });
  }
  async function saved() {
    await db.setSetting('lastBackup', Date.now());
    refresh();
  }

  const shareSupported = !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));

  return el('section', { class: 'card' },
    el('h2', {}, 'Backup & restore'),
    el('p', { class: 'muted small' },
      `Your data lives only on this phone (${entryCount} entries). Save a backup now and then — it's needed if you `
      + 'uninstall the app, clear browser data or switch phones.'),
    el('p', { class: 'small' }, lastBackup ? `Last backup: ${new Date(lastBackup).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup yet.'),
    el('div', { class: 'btn-col' },
      shareSupported ? el('button', {
        type: 'button', class: 'btn btn-secondary',
        onclick: async () => {
          try {
            await navigator.share({ files: [await makeFile()], title: 'Calorie Log backup' });
            await saved();
          } catch (err) {
            if (err.name !== 'AbortError') toast("Couldn't share the backup.");
          }
        },
      }, icon('share'), 'Share backup (Drive, WhatsApp…)') : null,
      el('button', {
        type: 'button', class: 'btn btn-secondary',
        onclick: async () => {
          const file = await makeFile();
          const url = URL.createObjectURL(file);
          el('a', { href: url, download: file.name }).click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          toast('Backup saved to Downloads');
          await saved();
        },
      }, icon('download'), 'Save backup file'),
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => fileInput.click() }, icon('upload'), 'Restore from backup…'),
      fileInput));
}

function installSection(persisted) {
  const installed = isInstalled();
  return el('section', { class: 'card' },
    el('h2', {}, 'App'),
    installed ? el('p', { class: 'small' }, 'Installed on this device.')
      : canInstall()
        ? el('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: async () => { if (await promptInstall()) toast('Installing…'); },
        }, icon('download'), 'Install app')
        : el('p', { class: 'muted small' }, 'To install: open the Chrome menu (⋮) and choose “Add to Home screen” / “Install app”.'),
    el('p', { class: 'muted small' }, persisted
      ? 'Storage: protected — Android won’t clear your data to free up space.'
      : 'Storage: not yet protected. Installing the app usually fixes this.'));
}

function aboutSection() {
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  return el('section', { class: 'card about' },
    el('h2', {}, 'Food data'),
    el('p', { class: 'small' }, 'Indian dishes: ', link('https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-', 'Indian Nutrient Databank (INDB)'),
      ', Anuvaad Solutions / Vijayakumar et al. 2024 (CC BY). Values are per 100 g of the cooked recipe. '
      + 'Deep-fried items include all the frying oil in the recipe, so their fat and calories can read high.'),
    el('p', { class: 'small' }, 'Worldwide and basic foods: ', link('https://fdc.nal.usda.gov/', 'USDA FoodData Central'),
      ' — FNDDS and SR Legacy (public domain).'),
    el('p', { class: 'small' }, 'Packaged products: ', link('https://world.openfoodfacts.org/', 'Open Food Facts'),
      ' (ODbL) — ~3,000 popular products built in, more searchable online. Entered by volunteers, so check the pack label when it matters.'));
}
