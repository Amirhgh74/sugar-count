// stats.js — pure helpers. No DOM, no storage, no globals.
// Dates are always local calendar dates as "YYYY-MM-DD" strings.

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MS_PER_DAY = 86400000;

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/** Local calendar date of a Date object as "YYYY-MM-DD" (never UTC-shifted). */
export function toDateStr(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/** "YYYY-MM-DD" -> Date at local midnight. */
export function parseDateStr(s) {
  const p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

export function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDateStr(s)) === s; // rejects 2026-02-30 etc.
}

export function todayStr(now) {
  return toDateStr(now || new Date());
}

export function addDays(s, n) {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Whole days from a to b (b - a). DST-safe. */
export function diffDays(a, b) {
  return Math.round((parseDateStr(b) - parseDateStr(a)) / MS_PER_DAY);
}

/** -1 / 0 / 1 — plain string compare works for ISO dates. */
export function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

export function minDate(a, b) { return cmp(a, b) <= 0 ? a : b; }
export function maxDate(a, b) { return cmp(a, b) >= 0 ? a : b; }

/** Monday of the week containing dateStr (Monday-first weeks). */
export function startOfWeek(dateStr) {
  const dow = parseDateStr(dateStr).getDay();   // 0 = Sunday
  return addDays(dateStr, -((dow + 6) % 7));
}

export function startOfMonth(dateStr) {
  return dateStr.slice(0, 8) + '01';
}

export function endOfMonth(dateStr) {
  const d = parseDateStr(dateStr);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Add n months, staying on the 1st (used for month period walking). */
export function addMonths(dateStr, n) {
  const d = parseDateStr(dateStr);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function formatMonthYear(dateStr) {
  const d = parseDateStr(dateStr);
  return MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
}

/** "Tuesday, Oct 14" */
export function formatDayTitle(dateStr) {
  const d = parseDateStr(dateStr);
  return DAY_NAMES[d.getDay()] + ', ' + MONTH_SHORT[d.getMonth()] + ' ' + d.getDate();
}

/** The three things a day can be logged with, in display order. */
export const FLAGS = ['ateSugar', 'ateSimpleCarbs', 'ateComplexCarbs'];

/** Records may be a Map or a plain object keyed by date string. */
function getRecord(records, date) {
  if (!records) return undefined;
  return typeof records.get === 'function' ? records.get(date) : records[date];
}

/**
 * Normalize a stored/imported row, including rows from the old two-toggle
 * model where a single `ateCarbs` flag meant "carbs" (treated as simple carbs).
 */
export function migrateRecord(row) {
  if (!row || typeof row !== 'object') return null;
  const legacyCarbs = !('ateSimpleCarbs' in row) && !('ateComplexCarbs' in row) && !!row.ateCarbs;
  return {
    date: row.date,
    ateSugar: !!row.ateSugar,
    ateSimpleCarbs: !!row.ateSimpleCarbs || legacyCarbs,
    ateComplexCarbs: !!row.ateComplexCarbs,
    note: typeof row.note === 'string' ? row.note : ''
  };
}

/**
 * What a calendar cell should show.
 * kind: 'before' | 'future' | 'clean' | 'logged'
 * 'before' and 'future' are never counted anywhere.
 */
export function dayState(date, records, startDate, today) {
  const blank = {
    inRange: false, isClean: false, note: '',
    ateSugar: false, ateSimpleCarbs: false, ateComplexCarbs: false
  };
  if (cmp(date, startDate) < 0) return Object.assign({ kind: 'before' }, blank);
  if (cmp(date, today) > 0) return Object.assign({ kind: 'future' }, blank);

  const r = getRecord(records, date);
  const ateSugar = !!(r && r.ateSugar);
  const ateSimpleCarbs = !!(r && r.ateSimpleCarbs);
  const ateComplexCarbs = !!(r && r.ateComplexCarbs);
  const isClean = !ateSugar && !ateSimpleCarbs && !ateComplexCarbs;
  return {
    kind: isClean ? 'clean' : 'logged',
    inRange: true,
    isClean,
    ateSugar, ateSimpleCarbs, ateComplexCarbs,
    note: (r && typeof r.note === 'string') ? r.note : ''
  };
}

/** Any past day, and today, can be logged. Future days cannot. */
export function isEditable(date, today) {
  return cmp(date, today) <= 0;
}

/**
 * Counts over [from, to], clamped to the tracking range [startDate, today].
 * Days with no record count as clean.
 */
export function countRange(from, to, records, startDate, today) {
  const start = maxDate(from, startDate);
  const end = minDate(to, today);
  const out = {
    days: 0, sugarDays: 0, simpleCarbDays: 0, complexCarbDays: 0,
    carbDays: 0, cleanDays: 0, noteDays: 0
  };
  if (cmp(start, end) > 0) return out;
  for (let d = start; cmp(d, end) <= 0; d = addDays(d, 1)) {
    const r = getRecord(records, d);
    const sugar = !!(r && r.ateSugar);
    const simple = !!(r && r.ateSimpleCarbs);
    const complex = !!(r && r.ateComplexCarbs);
    out.days++;
    if (sugar) out.sugarDays++;
    if (simple) out.simpleCarbDays++;
    if (complex) out.complexCarbDays++;
    if (simple || complex) out.carbDays++;
    if (!sugar && !simple && !complex) out.cleanDays++;
    if (r && r.note) out.noteDays++;
  }
  return out;
}

/**
 * Consecutive days ending today without `field` (one of FLAGS).
 * Never counts past the start date. 0 if today itself has it.
 */
export function currentStreak(field, records, startDate, today) {
  if (cmp(today, startDate) < 0) return 0;
  let n = 0;
  for (let d = today; cmp(d, startDate) >= 0; d = addDays(d, -1)) {
    const r = getRecord(records, d);
    if (r && r[field]) break;
    n++;
  }
  return n;
}

/**
 * Periods for the summary chart, oldest first.
 * '4w' -> 4 weekly periods, '3m' -> 13 weekly periods, '1y' -> 12 monthly periods.
 * Each period keeps its full calendar span; counting clamps to the tracking range.
 */
export function buildPeriods(mode, today) {
  const periods = [];
  if (mode === '1y') {
    const thisMonth = startOfMonth(today);
    for (let i = 11; i >= 0; i--) {
      const start = addMonths(thisMonth, -i);
      periods.push({ start, end: endOfMonth(start), label: MONTH_SHORT[parseDateStr(start).getMonth()] });
    }
    return periods;
  }
  const weeks = mode === '3m' ? 13 : 4;
  const thisWeek = startOfWeek(today);
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisWeek, -7 * i);
    const d = parseDateStr(start);
    periods.push({ start, end: addDays(start, 6), label: MONTH_SHORT[d.getMonth()] + ' ' + d.getDate() });
  }
  return periods;
}

/** Per-period day counts for each flag, plus the clamped overall range totals. */
export function summarize(mode, records, startDate, today) {
  const periods = buildPeriods(mode, today);
  const labels = [], sugar = [], simpleCarbs = [], complexCarbs = [], days = [];
  for (const p of periods) {
    const c = countRange(p.start, p.end, records, startDate, today);
    labels.push(p.label);
    sugar.push(c.sugarDays);
    simpleCarbs.push(c.simpleCarbDays);
    complexCarbs.push(c.complexCarbDays);
    days.push(c.days);
  }
  const rangeStart = periods.length ? periods[0].start : today;
  const total = countRange(rangeStart, today, records, startDate, today);
  return {
    periods, labels, sugar, simpleCarbs, complexCarbs, days,
    rangeStart: maxDate(rangeStart, startDate),
    rangeEnd: today,
    sugarDays: total.sugarDays,
    simpleCarbDays: total.simpleCarbDays,
    complexCarbDays: total.complexCarbDays,
    cleanDays: total.cleanDays,
    trackedDays: total.days,
    sugarFreeStreak: currentStreak('ateSugar', records, startDate, today),
    simpleCarbFreeStreak: currentStreak('ateSimpleCarbs', records, startDate, today),
    complexCarbFreeStreak: currentStreak('ateComplexCarbs', records, startDate, today)
  };
}

/** True when a record carries no information and should be deleted instead of stored. */
export function isEmptyRecord(rec) {
  if (!rec) return true;
  if (FLAGS.some(f => rec[f])) return false;
  return !(rec.note && String(rec.note).trim());
}

/**
 * Normalize anything into a storable record, or null if it holds nothing.
 * `flags` is an object with any of the FLAGS keys (legacy `ateCarbs` accepted).
 */
export function normalizeRecord(date, flags, note) {
  const base = migrateRecord(Object.assign({ date, note }, flags || {}));
  base.note = String(base.note == null ? '' : base.note).trim().slice(0, 100);
  return isEmptyRecord(base) ? null : base;
}

/**
 * The 6-row Monday-first grid for a month: 42 date strings.
 * `monthDate` is any date inside the month.
 */
export function monthGrid(monthDate) {
  const first = startOfMonth(monthDate);
  const gridStart = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));
  return cells;
}
