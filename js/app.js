import { startRouter } from './router.js';
import { today, isValidDateStr } from './dates.js';
import { MEAL_KEYS } from './nutrition.js';
import './install.js';
import * as dayView from './views/day.js';
import * as addView from './views/add.js';
import * as entryView from './views/entry.js';
import * as historyView from './views/history.js';
import * as settingsView from './views/settings.js';
import * as foodsView from './views/foods.js';

function resolve([name, a, b, c]) {
  switch (name) {
    case 'add':
      if (isValidDateStr(a) && MEAL_KEYS.includes(b)) return { view: addView, params: { date: a, meal: b, step: c || 'search' } };
      break;
    case 'entry':
      if (a) return { view: entryView, params: { id: a } };
      break;
    case 'history':
      return { view: historyView, params: {}, tab: 'history' };
    case 'settings':
      return { view: settingsView, params: {}, tab: 'settings' };
    case 'foods':
      return { view: foodsView, params: { mode: a || 'list', id: b } };
    default:
  }
  return { view: dayView, params: { date: name === 'day' && isValidDateStr(a) ? a : today() }, tab: 'day' };
}

startRouter(resolve);

// Ask the browser not to evict our data under storage pressure (granted automatically to installed apps).
if (navigator.storage?.persist) {
  navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered', err));
}
