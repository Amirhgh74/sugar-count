// summary.js — segmented range control, Chart.js line chart, stat tiles.

import { summarize } from './stats.js';

const RANGES = ['4w', '3m', '1y'];
const STORE_KEY = 'sugarcount.range';

export function initSummary(ctx) {
  const segmented = document.getElementById('range-segmented');
  const segs = [...segmented.querySelectorAll('.seg')];
  const canvas = document.getElementById('chart');
  const chartCard = document.querySelector('.chart-card');
  const tiles = document.getElementById('tiles');
  const empty = document.getElementById('summary-empty');
  const out = {
    sugar: document.getElementById('tile-sugar'),
    simple: document.getElementById('tile-simple'),
    complex: document.getElementById('tile-complex'),
    sugarStreak: document.getElementById('tile-sugar-streak'),
    simpleStreak: document.getElementById('tile-simple-streak'),
    complexStreak: document.getElementById('tile-complex-streak')
  };

  let range = readRange();
  let chart = null;
  let visible = false;
  let dirty = true;

  function readRange() {
    try {
      const v = localStorage.getItem(STORE_KEY);
      if (RANGES.includes(v)) return v;
    } catch (_) { /* ignore */ }
    return '4w';
  }

  function theme() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n, f) => (cs.getPropertyValue(n).trim() || f);
    return {
      sugar: get('--sugar', '#F7A8B8'),
      simple: get('--simple', '#F2C46D'),
      complex: get('--complex', '#8FC2E8'),
      text: get('--text-soft', '#4a6b58'),
      grid: get('--chart-grid', 'rgba(31,94,59,.12)'),
      card: get('--card', '#ffffff')
    };
  }

  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function build(data) {
    const t = theme();
    const Chart = window.Chart;
    chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          dataset('Sugar', data.sugar, t.sugar, t.card),
          dataset('Simple carbs', data.simpleCarbs, t.simple, t.card),
          dataset('Complex carbs', data.complexCarbs, t.complex, t.card)
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion() ? false : { duration: 350 },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 4, right: 6, left: 0, bottom: 0 } },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8,
              color: t.text, padding: 14,
              font: { family: fontStack(), size: 12, weight: '600' }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(31,94,59,.94)',
            titleFont: { family: fontStack(), size: 12 },
            bodyFont: { family: fontStack(), size: 12 },
            padding: 10, cornerRadius: 10, displayColors: true, usePointStyle: true,
            callbacks: {
              label: c => ` ${c.dataset.label}: ${c.parsed.y} ${c.parsed.y === 1 ? 'day' : 'days'}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: t.grid },
            ticks: {
              color: t.text, maxRotation: 0, autoSkipPadding: 8,
              font: { family: fontStack(), size: 11 }
            }
          },
          y: {
            beginAtZero: true,
            suggestedMax: 4,
            grid: { color: t.grid, drawTicks: false },
            border: { display: false },
            ticks: {
              color: t.text, precision: 0, maxTicksLimit: 6, padding: 6,
              font: { family: fontStack(), size: 11 }
            }
          }
        }
      }
    });
  }

  function dataset(label, values, color, pointRing) {
    return {
      label,
      data: values,
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: pointRing,
      pointBorderWidth: 1.5,
      pointStyle: 'circle',
      pointRadius: 4,
      pointHoverRadius: 6,
      borderWidth: 2.5,
      tension: 0.35,
      fill: false
    };
  }

  function fontStack() {
    return 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif';
  }

  function render() {
    const data = summarize(range, ctx.records, ctx.settings.startDate, ctx.today());

    const isEmpty = ctx.records.size === 0 && ctx.settings.startDate === ctx.today();
    empty.hidden = !isEmpty;
    chartCard.hidden = isEmpty;
    tiles.hidden = isEmpty;
    if (isEmpty) {
      if (chart) { chart.destroy(); chart = null; }
      return;
    }

    out.sugar.textContent = String(data.sugarDays);
    out.simple.textContent = String(data.simpleCarbDays);
    out.complex.textContent = String(data.complexCarbDays);
    out.sugarStreak.textContent = String(data.sugarFreeStreak);
    out.simpleStreak.textContent = String(data.simpleCarbFreeStreak);
    out.complexStreak.textContent = String(data.complexCarbFreeStreak);

    if (!window.Chart) { chartCard.hidden = true; return; }
    if (!chart) {
      build(data);
    } else {
      chart.data.labels = data.labels;
      chart.data.datasets[0].data = data.sugar;
      chart.data.datasets[1].data = data.simpleCarbs;
      chart.data.datasets[2].data = data.complexCarbs;
      chart.update();
    }
  }

  function refresh() {
    if (!visible) { dirty = true; return; }
    dirty = false;
    render();
  }

  function restyle() {
    if (chart) { chart.destroy(); chart = null; }
    refresh();
  }

  segs.forEach(btn => btn.addEventListener('click', () => {
    range = btn.dataset.range;
    try { localStorage.setItem(STORE_KEY, range); } catch (_) { /* ignore */ }
    segs.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    refresh();
  }));
  segs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === range)));

  ctx.onChange(refresh);

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => restyle();
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme);
  else if (darkQuery.addListener) darkQuery.addListener(onScheme);

  return {
    // The canvas has no size while the screen is hidden, so only draw when shown.
    onShow() { visible = true; if (dirty || !chart) refresh(); else chart.resize(); },
    onHide() { visible = false; }
  };
}
