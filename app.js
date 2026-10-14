// app.js — app state, tab routing, bottom sheets, settings, service worker.

import * as db from './db.js';
import { todayStr, normalizeRecord, isValidDateStr, cmp } from './stats.js';
import { initCalendar } from './calendar.js';
import { initSummary } from './summary.js';

/* ------------------------------- app state ------------------------------ */

const listeners = new Set();
let cachedToday = todayStr();

const ctx = {
  records: new Map(),
  settings: { startDate: cachedToday },
  today: () => cachedToday,
  onChange(fn) { listeners.add(fn); },
  emit() { listeners.forEach(fn => fn()); },

  async saveDay(date, flags, note) {
    const rec = normalizeRecord(date, flags, note);
    if (rec) {
      await db.putDay(rec);
      ctx.records.set(date, rec);
      // Logging a day earlier than the tracking start date pulls the start
      // date back, so the entry actually counts.
      if (cmp(date, ctx.settings.startDate) < 0) {
        ctx.settings = db.saveSettings({ startDate: date });
      }
    } else {
      // Both toggles off and no note -> the day is clean, so drop the record.
      await db.deleteDay(date);
      ctx.records.delete(date);
    }
    ctx.emit();
  },

  async resetDay(date) {
    await db.deleteDay(date);
    ctx.records.delete(date);
    ctx.emit();
  },

  openSheet, closeSheet, toast
};

/* -------------------------------- sheets -------------------------------- */

const backdrop = document.getElementById('backdrop');
let openEl = null;

function openSheet(el) {
  if (openEl) closeSheet();
  openEl = el;
  backdrop.hidden = false;
  el.hidden = false;
  el.style.setProperty('--drag', '0px');
  void el.offsetWidth;
  backdrop.classList.add('is-open');
  el.classList.add('is-open');
  document.body.classList.add('sheet-open');
}

function closeSheet() {
  const el = openEl;
  if (!el) return;
  openEl = null;
  el.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.body.classList.remove('sheet-open');
  if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  const finish = () => {
    if (el === openEl) return;              // it was reopened while closing
    el.hidden = true;
    el.style.setProperty('--drag', '0px');
    if (!openEl) backdrop.hidden = true;    // nothing else open -> stop catching taps
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else setTimeout(finish, 240);
}

backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openEl) closeSheet(); });

// Swipe a sheet down to dismiss (without saving).
for (const el of document.querySelectorAll('.sheet')) {
  let y0 = 0, dragging = false, dy = 0;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { dragging = false; return; }
    const t = e.target;
    if (t.closest('input, textarea')) { dragging = false; return; }
    y0 = e.touches[0].clientY; dy = 0; dragging = true;
    el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = e.touches[0].clientY - y0;
    el.style.setProperty('--drag', Math.max(0, dy) + 'px');
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    el.style.transition = '';
    if (dy > 80) closeSheet();
    else el.style.setProperty('--drag', '0px');
  });
}

/* --------------------------------- toast -------------------------------- */

const toastEl = document.getElementById('toast');
let toastTimer = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  void toastEl.offsetWidth;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-on');
    setTimeout(() => { toastEl.hidden = true; }, 220);
  }, 1500);
}

/* -------------------------------- routing ------------------------------- */

const screens = {
  calendar: document.getElementById('screen-calendar'),
  summary: document.getElementById('screen-summary')
};
const tabs = [...document.querySelectorAll('.tab')];
let currentTab = 'calendar';
let calendarView = null, summaryView = null;

function showTab(name) {
  if (!screens[name]) return;
  currentTab = name;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  tabs.forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  if (name === 'summary') { summaryView && summaryView.onShow(); }
  else { summaryView && summaryView.onHide(); }
  window.scrollTo(0, 0);
}

tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

/* -------------------------------- settings ------------------------------ */

const settingsSheet = document.getElementById('settings-sheet');
const startInput = document.getElementById('start-date-input');
const statusEl = document.getElementById('settings-status');
const importFile = document.getElementById('import-file');

document.getElementById('btn-settings').addEventListener('click', () => {
  startInput.value = ctx.settings.startDate;
  startInput.max = ctx.today();
  statusEl.textContent = '';
  openSheet(settingsSheet);
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
  const v = startInput.value;
  if (!isValidDateStr(v)) { statusEl.textContent = 'Pick a valid date.'; return; }
  if (cmp(v, ctx.today()) > 0) { statusEl.textContent = 'The start date cannot be in the future.'; return; }
  ctx.settings = db.saveSettings({ startDate: v });
  ctx.emit();
  closeSheet();
  toast('Start date updated');
});

document.getElementById('btn-export').addEventListener('click', async () => {
  try {
    const payload = await db.buildExport(ctx.settings);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sugar-count-' + ctx.today() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    statusEl.textContent = `Exported ${payload.days.length} ${payload.days.length === 1 ? 'day' : 'days'}.`;
  } catch (err) {
    statusEl.textContent = 'Export failed: ' + err.message;
  }
});

document.getElementById('btn-import').addEventListener('click', () => {
  importFile.value = '';
  importFile.click();
});

importFile.addEventListener('change', async () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  if (!confirm('Import will replace all data currently in Sugar Count. Continue?')) {
    importFile.value = '';
    return;
  }
  try {
    const text = await file.text();
    const result = await db.applyImport(JSON.parse(text));
    ctx.records = await db.getAllDays();
    if (result.startDate) ctx.settings = { startDate: result.startDate };
    ctx.emit();
    statusEl.textContent = `Imported ${result.days} ${result.days === 1 ? 'day' : 'days'}.`;
    startInput.value = ctx.settings.startDate;
    toast('Data imported');
  } catch (err) {
    statusEl.textContent = 'Import failed: ' + (err && err.message ? err.message : 'bad file');
  }
  importFile.value = '';
});

/* ------------------------------ day rollover ---------------------------- */

function checkRollover() {
  const now = todayStr();
  if (now !== cachedToday) {
    cachedToday = now;
    ctx.emit();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRollover(); });
window.addEventListener('focus', checkRollover);
setInterval(checkRollover, 60000);

/* --------------------------------- boot --------------------------------- */

async function boot() {
  ctx.settings = db.loadSettings();
  cachedToday = todayStr();
  try {
    ctx.records = await db.getAllDays();
  } catch (err) {
    console.error('Could not open the database', err);
    toast('Storage unavailable');
  }
  calendarView = initCalendar(ctx);
  summaryView = initSummary(ctx);
  showTab('calendar');
  document.body.classList.add('is-ready');
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW registration failed', err));
  });
}
