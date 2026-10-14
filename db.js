// db.js — IndexedDB for day records, localStorage for the tiny settings blob.

import { isValidDateStr, todayStr, normalizeRecord, migrateRecord } from './stats.js';

const DB_NAME = 'sugar-count';
const DB_VERSION = 2;          // v2: ateCarbs -> ateSimpleCarbs / ateComplexCarbs
const STORE = 'days';
const SETTINGS_KEY = 'sugarcount.settings';
export const EXPORT_FORMAT = 'sugar-count-export';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = event => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: 'date' });

      // Rewrite old two-toggle rows in place: "carbs" becomes "simple carbs".
      if (event.oldVersion < 2) {
        store.openCursor().onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) return;
          const row = cursor.value;
          if (row && isValidDateStr(row.date) && !('ateSimpleCarbs' in row)) {
            cursor.update(migrateRecord(row));
          }
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    try { result = run(store); } catch (err) { reject(err); return; }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  }));
}

function wrap(req) { return { __req: req }; }

/** All day records as a Map keyed by date string. */
export async function getAllDays() {
  const rows = await tx('readonly', store => wrap(store.getAll()));
  const map = new Map();
  for (const row of rows || []) {
    if (row && isValidDateStr(row.date)) map.set(row.date, migrateRecord(row));
  }
  return map;
}

export function getDay(date) {
  return tx('readonly', store => wrap(store.get(date)));
}

export function putDay(rec) {
  return tx('readwrite', store => { store.put(rec); });
}

export function deleteDay(date) {
  return tx('readwrite', store => { store.delete(date); });
}

export function clearDays() {
  return tx('readwrite', store => { store.clear(); });
}

export function replaceAllDays(records) {
  return tx('readwrite', store => {
    store.clear();
    for (const rec of records) store.put(rec);
  });
}

/* ------------------------------- settings ------------------------------- */

function readSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && isValidDateStr(s.startDate)) return { startDate: s.startDate };
  } catch (_) { /* corrupt or unavailable — fall through */ }
  return null;
}

/** Settings, creating defaults (start date = first open) when missing. */
export function loadSettings() {
  const existing = readSettings();
  if (existing) return existing;
  const fresh = { startDate: todayStr() };
  saveSettings(fresh);
  return fresh;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ startDate: settings.startDate }));
  } catch (_) { /* private mode / full quota — settings just won't persist */ }
  return settings;
}

/* --------------------------- export / import ---------------------------- */

export async function buildExport(settings) {
  const map = await getAllDays();
  const days = [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    format: EXPORT_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: { startDate: settings.startDate },
    days
  };
}

/**
 * Validate and write an exported payload. Replaces all existing data.
 * Version 1 files (single `ateCarbs` flag) are accepted and migrated.
 * Returns { days, startDate }.
 */
export async function applyImport(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Not a Sugar Count file.');
  if (payload.format && payload.format !== EXPORT_FORMAT) throw new Error('Not a Sugar Count file.');
  if (!Array.isArray(payload.days)) throw new Error('No days found in the file.');

  const byDate = new Map();
  for (const row of payload.days) {
    if (!row || !isValidDateStr(row.date)) continue;
    const rec = normalizeRecord(row.date, row, row.note);
    if (rec) byDate.set(rec.date, rec);     // skip empty records, de-dupe by date
  }
  const records = [...byDate.values()];
  await replaceAllDays(records);

  let startDate = null;
  if (payload.settings && isValidDateStr(payload.settings.startDate)) {
    startDate = payload.settings.startDate;
    saveSettings({ startDate });
  }
  return { days: records.length, startDate };
}
