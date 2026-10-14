# Sugar Count

A tiny personal web app for tracking which days I eat sugar, simple carbs
and/or complex carbs. Two screens, no accounts, no backend, no analytics, and
no network calls after the first load. Everything lives on the phone.

- **Calendar** — a month grid where every day is clean until I say otherwise.
  Pink dot = sugar, amber dot = simple carbs, blue dot = complex carbs,
  green leaf = clean, small underline = note.
- **Summary** — days per week (4 weeks / 3 months) or per month (Year) for each
  of the three, plus day counts and the current streak free of each one.

## How it works

| Thing | Where it lives |
| --- | --- |
| Day records | IndexedDB (`sugar-count` v2 → `days`), one record per `YYYY-MM-DD` |
| Tracking start date | `localStorage` key `sugarcount.settings` |
| Last used summary range | `localStorage` key `sugarcount.range` |
| App files | Service worker cache `sugar-count-v2` (cache-first) |

A day with **no record is clean**. Turning all three toggles off and clearing
the note deletes the record again.

**Any past day can be logged**, and today. Future days are dimmed and not
tappable. Days before the tracking start date are still tappable but are not
counted — saving one pulls the start date back to that day so the entry counts,
and the day sheet says so before you save.

## Files

```
index.html             markup for both screens, the two sheets and the tab bar
styles.css             all styling, light + dark, safe-area aware
app.js                 state, tab routing, sheets, settings, export/import, SW registration
db.js                  IndexedDB wrapper + settings + export/import
calendar.js            month grid, day sheet, month legend line
summary.js             segmented control, Chart.js line chart, stat tiles
stats.js               pure date/count/streak/period functions (no DOM, no storage)
sw.js                  cache-first service worker
manifest.webmanifest   PWA manifest
vendor/chart.umd.js    Chart.js 4.4.1, vendored so the app works fully offline
icons/                 app icons (provided)
tests/stats.test.html  in-browser unit tests for stats.js
```

## Running it locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```bash
python3 -m http.server 8787
```

Then open <http://localhost:8787/index.html>.

## Tests

Open <http://localhost:8787/tests/stats.test.html> while that server is running.
It runs the `stats.js` unit tests in the browser and prints a pass/fail summary
at the top. All 42 should pass.

## Deploying to GitHub Pages

1. Create a repository and push this folder (everything at the repo root):

   ```bash
   git init
   git add .
   git commit -m "Sugar Count"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment**, set *Source* to
   **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.

3. Wait for the Pages build, then open `https://<you>.github.io/<repo>/`.

Every path in the app is relative — `icons/…` in the markup, `"./"` for the
manifest's `start_url` and `scope`, and `"./sw.js"` for the service worker
registration — so it works from a project subpath (`/<repo>/`) with no
configuration. Pages serves over HTTPS, which the service worker needs.

### After you change a file

The service worker serves cached files first, so bump the cache name in
[`sw.js`](sw.js) (`sugar-count-v2` → `-v3`, …) when you deploy changes.
Otherwise the phone may keep showing the old version.

## Add to Home Screen on iPhone

1. Open the Pages URL in **Safari** (it must be Safari, not Chrome).
2. Tap the **Share** button (the square with the arrow).
3. Scroll down and tap **Add to Home Screen**.
4. The name is already "Sugar Count" — tap **Add**.
5. Launch it from the home screen icon. It opens full screen with no Safari UI.

Open it once with internet so the service worker can cache everything. After
that it works in airplane mode.

## Backing up

**Settings (gear icon) → Export data** downloads a JSON file with every day and
the tracking start date. **Import data** reads that file back and **replaces**
everything currently stored, so export first if you are unsure.

Export files record a `version`. Files written by the old two-toggle build
(`ateCarbs`) are still accepted; that flag is read as **simple carbs**, and the
same migration runs once on the IndexedDB store when the app first starts.

Data lives only on the device. It survives closing the app and restarting the
phone, but deleting the home screen icon or clearing Safari's website data for
the site removes it — export now and then.
