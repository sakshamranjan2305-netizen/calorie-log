// On-device storage (IndexedDB). Three stores:
//   entries  - logged food, one record per item eaten, indexed by date
//   foods    - "My foods": foods created by hand or logged before (for quick re-logging)
//   settings - key/value pairs (goal history, last backup time)

const DB_NAME = 'calorie-app';
const DB_VERSION = 1;
const STORES = ['entries', 'foods', 'settings'];

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('entries')) {
          db.createObjectStore('entries', { keyPath: 'id' }).createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Close other tabs of this app and try again.'));
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

/** Runs `fn(stores)` in one transaction and resolves with its return value once committed. */
async function run(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries([].concat(storeNames).map((n) => [n, tx.objectStore(n)]));
    let result;
    try {
      result = fn(stores);
    } catch (err) {
      tx.abort();
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---- Entries ------------------------------------------------------------------

export const getEntry = (id) => run('entries', 'readonly', (s) => s.entries.get(id));
export const putEntry = (entry) => run('entries', 'readwrite', (s) => s.entries.put(entry));
export const deleteEntry = (id) => run('entries', 'readwrite', (s) => s.entries.delete(id));

export function entriesOn(date) {
  return entriesBetween(date, date);
}

/** All entries from `from` to `to` (inclusive), ordered by date then time added. */
export async function entriesBetween(from, to) {
  const list = await run('entries', 'readonly', (s) => s.entries.index('date').getAll(IDBKeyRange.bound(from, to)));
  return list.sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));
}

export const countEntries = () => run('entries', 'readonly', (s) => s.entries.count());

// ---- Foods --------------------------------------------------------------------

export const getFood = (id) => run('foods', 'readonly', (s) => s.foods.get(id));
export const getAllFoods = () => run('foods', 'readonly', (s) => s.foods.getAll());
export const putFood = (food) => run('foods', 'readwrite', (s) => s.foods.put(food));
export const deleteFood = (id) => run('foods', 'readwrite', (s) => s.foods.delete(id));

// ---- Settings -----------------------------------------------------------------

export async function getSetting(key, fallback = undefined) {
  const row = await run('settings', 'readonly', (s) => s.settings.get(key));
  return row ? row.value : fallback;
}

export const setSetting = (key, value) => run('settings', 'readwrite', (s) => s.settings.put({ key, value }));

// ---- Backup -------------------------------------------------------------------

export async function exportAll() {
  const data = await run(STORES, 'readonly', (s) => {
    const out = {};
    for (const name of STORES) {
      const req = s[name].getAll();
      req.onsuccess = () => { out[name] = req.result; };
    }
    return out;
  });
  return { app: 'calorie-log', version: 1, exportedAt: new Date().toISOString(), ...data };
}

export function validateBackup(data) {
  if (!data || data.app !== 'calorie-log' || !STORES.every((n) => Array.isArray(data[n]))) {
    throw new Error("This file isn't a Calorie Log backup.");
  }
}

/** Replaces everything on this device with the backup's contents. */
export async function importAll(data) {
  validateBackup(data);
  await run(STORES, 'readwrite', (s) => {
    for (const name of STORES) {
      s[name].clear();
      for (const row of data[name]) s[name].put(row);
    }
  });
}
