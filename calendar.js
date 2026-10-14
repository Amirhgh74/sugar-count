// calendar.js — month grid, day sheet, month legend line.

import {
  monthGrid, startOfMonth, addMonths, formatMonthYear, formatDayTitle,
  dayState, isEditable, countRange, endOfMonth, cmp, parseDateStr, FLAGS
} from './stats.js';

const DOT_CLASS = {
  ateSugar: 'dot-sugar',
  ateSimpleCarbs: 'dot-simple',
  ateComplexCarbs: 'dot-complex'
};

const LEAF_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.5 4.2c-7 0-12.6 3-13.8 8.6-.5 2.3.1 4.4 1.3 5.9l-2 2a1 1 0 1 0 1.4 1.4l2-2c1.6 1.2 3.8 1.7 6 1.1C19.7 20 22.4 11.6 19.5 4.2Zm-2 3.2c1.3 5.2-.8 10.7-4.1 11.6-1.4.4-2.7.2-3.7-.4l6.5-6.5a1 1 0 0 0-1.4-1.4l-6.5 6.5c-.6-1-.8-2.2-.5-3.6.8-3.7 5.6-6 9.7-6.2Z"/></svg>';

export function initCalendar(ctx) {
  const grid = document.getElementById('day-grid');
  const monthLabel = document.getElementById('month-label');
  const monthSummary = document.getElementById('month-summary');
  const monthCard = document.querySelector('.month-card');

  const sheet = document.getElementById('day-sheet');
  const sheetTitle = document.getElementById('day-sheet-title');
  const toggles = {};
  for (const f of FLAGS) toggles[f] = document.getElementById('toggle-' + f);
  const dayHint = document.getElementById('day-hint');
  const noteInput = document.getElementById('note-input');
  const noteCount = document.getElementById('note-count');
  const btnSave = document.getElementById('btn-save');
  const btnReset = document.getElementById('btn-reset');

  let viewMonth = startOfMonth(ctx.today());
  let draft = null; // { date, flags, note, hadRecord }

  /* ------------------------------ rendering ----------------------------- */

  function render() {
    const today = ctx.today();
    const startDate = ctx.settings.startDate;
    monthLabel.textContent = formatMonthYear(viewMonth);

    const month = viewMonth.slice(0, 7);
    const cells = monthGrid(viewMonth);
    const frag = document.createDocumentFragment();

    for (const date of cells) {
      const inMonth = date.slice(0, 7) === month;
      const st = dayState(date, ctx.records, startDate, today);
      // Any past day (and today) can be logged; future days cannot.
      const canLog = inMonth && isEditable(date, today);
      const cell = document.createElement(canLog ? 'button' : 'div');
      cell.className = 'cell';
      if (canLog) cell.type = 'button';

      if (!inMonth) {
        cell.classList.add('is-other-month');
      } else {
        cell.dataset.date = date;
        if (st.kind === 'future') cell.classList.add('is-future');
        if (st.kind === 'before') cell.classList.add('is-before');
        if (date === today) cell.classList.add('is-today');
        if (st.note) cell.classList.add('has-note');
      }

      const num = document.createElement('span');
      num.className = 'cell-num';
      num.textContent = String(parseDateStr(date).getDate());
      cell.appendChild(num);

      const marks = document.createElement('span');
      marks.className = 'cell-marks';
      if (inMonth && st.inRange) {
        if (st.isClean) {
          marks.className += ' is-leaf';
          marks.innerHTML = LEAF_SVG;
        } else {
          for (const f of FLAGS) if (st[f]) marks.appendChild(dot(DOT_CLASS[f]));
        }
      }
      cell.appendChild(marks);

      if (canLog) {
        cell.setAttribute('aria-label', formatDayTitle(date) + ' — ' + describe(st));
      } else if (inMonth) {
        cell.setAttribute('aria-label', formatDayTitle(date) + ' — future, not editable');
      } else {
        cell.setAttribute('aria-hidden', 'true');
      }
      frag.appendChild(cell);
    }
    grid.replaceChildren(frag);

    const c = countRange(viewMonth, endOfMonth(viewMonth), ctx.records, startDate, today);
    monthSummary.textContent = c.days === 0
      ? 'No tracked days this month.'
      : `Sugar ${c.sugarDays}, Simple ${c.simpleCarbDays}, Complex ${c.complexCarbDays}, ` +
        `Clean ${c.cleanDays} ${plural(c.cleanDays)}`;
  }

  function dot(cls) {
    const s = document.createElement('span');
    s.className = 'dot ' + cls;
    return s;
  }

  function plural(n) { return n === 1 ? 'day' : 'days'; }

  const FLAG_NAME = {
    ateSugar: 'sugar',
    ateSimpleCarbs: 'simple carbs',
    ateComplexCarbs: 'complex carbs'
  };

  function describe(st) {
    if (st.kind === 'before') return 'not counted';
    if (st.kind === 'future') return 'future';
    if (st.isClean) return 'clean';
    return FLAGS.filter(f => st[f]).map(f => FLAG_NAME[f]).join(', ');
  }

  /* ----------------------------- month moves ---------------------------- */

  function goMonth(delta) {
    viewMonth = addMonths(viewMonth, delta);
    render();
    monthCard.classList.remove('slide-l', 'slide-r');
    // restart the animation
    void monthCard.offsetWidth;
    monthCard.classList.add(delta > 0 ? 'slide-l' : 'slide-r');
  }

  document.getElementById('btn-prev-month').addEventListener('click', () => goMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => goMonth(1));
  document.getElementById('btn-today').addEventListener('click', () => {
    viewMonth = startOfMonth(ctx.today());
    render();
  });

  // Swipe left/right on the month card.
  let sx = 0, sy = 0, swiping = false;
  monthCard.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { swiping = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiping = true;
  }, { passive: true });
  monthCard.addEventListener('touchend', e => {
    if (!swiping) return;
    swiping = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) goMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ------------------------------ day sheet ----------------------------- */

  grid.addEventListener('click', e => {
    const cell = e.target.closest('.cell[data-date]');
    if (!cell || cell.tagName !== 'BUTTON') return;
    openDay(cell.dataset.date);
  });

  function openDay(date) {
    if (!isEditable(date, ctx.today())) return;
    const rec = ctx.records.get(date);
    const flags = {};
    for (const f of FLAGS) flags[f] = !!(rec && rec[f]);
    draft = { date, flags, note: (rec && rec.note) || '', hadRecord: !!rec };

    sheetTitle.textContent = formatDayTitle(date);
    noteInput.value = draft.note;
    syncSheet();
    btnReset.hidden = !draft.hadRecord;

    const before = cmp(date, ctx.settings.startDate) < 0;
    dayHint.hidden = !before;
    if (before) dayHint.textContent = 'Saving this day moves your tracking start date back to it.';

    ctx.openSheet(sheet);
  }

  function syncSheet() {
    for (const f of FLAGS) {
      const on = !!draft.flags[f];
      toggles[f].setAttribute('aria-pressed', String(on));
      toggles[f].classList.toggle('is-on', on);
    }
    noteCount.textContent = String(noteInput.value.length);
  }

  function bounce(el) {
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
  }

  for (const f of FLAGS) {
    toggles[f].addEventListener('click', () => {
      draft.flags[f] = !draft.flags[f];
      syncSheet();
      bounce(toggles[f]);
    });
  }

  noteInput.addEventListener('input', () => { noteCount.textContent = String(noteInput.value.length); });
  noteInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });

  async function commit() {
    const d = draft;
    if (!d) return;
    const note = noteInput.value;
    ctx.closeSheet();
    await ctx.saveDay(d.date, d.flags, note);
    ctx.toast('Saved');
  }

    btnSave.addEventListener('click', commit);
  btnReset.addEventListener('click', async () => {
    const d = draft;
    if (!d) return;
    ctx.closeSheet();
    await ctx.resetDay(d.date);
    ctx.toast('Reset to clean');
  });

  /* ------------------------------------------------------------------ */

  ctx.onChange(() => {
    // Keep the view on a month that still makes sense after an import.
    if (cmp(viewMonth, startOfMonth(ctx.today())) > 0) viewMonth = startOfMonth(ctx.today());
    render();
  });

  render();
  return { render, goToToday: () => { viewMonth = startOfMonth(ctx.today()); render(); } };
}
