# Verkaufsliste

Offline-first PWA to manage a sales list (e.g. for a convention) on an Android phone.

* Add / edit / delete items with a form, search and filter the list, mark items as sold.
* **Item numbers match the physical labels and never change**: an ID cannot be edited, deleting only hides an item (the number stays reserved), "sold" is just a flag, and new numbers always continue after the highest number ever issued.
* Import the organizer's `.xlsm`/`.xlsx` sheet; export it again. Export patches the *original* file, so layout, styles and merged cells stay exactly as the organizer made them.
* Works offline once installed (service worker). No server, no account – data stays on the phone (IndexedDB).

## Use it
1. Open the published page in Chrome on Android → menu → **Install app** / *Add to Home screen*.
2. **☰ → Einstellungen → Excel-Datei wählen** to import your sheet.
3. Export from **☰ → Einstellungen → Export** (share sheet or save to the phone). Export regularly: clearing Chrome's site data or uninstalling the app deletes the list.

## Develop
```bash
npm install
npm run build        # type-check + bundle into dist/
npm run serve        # preview on http://localhost:4173 (localhost counts as secure → service worker works)
npm test             # unit tests inside headless Chromium (needs: npx playwright install chromium)
REAL_XLSM=/path/to/sheet.xlsm npm run e2e   # full UI test against your real file (not part of CI)
```

Source layout: `src/store.ts` (ID rules), `src/xlsx.ts` (import + in-place export), `src/list.ts` / `form.ts` / `settings.ts` (screens), `public/` (static files, service worker, icons).

## Deploy (GitHub Pages)
Repo → Settings → Pages → Source: **GitHub Actions**. Every push to `main` runs the tests and publishes `dist/`. All paths are relative, so it works under `https://<user>.github.io/<repo>/`.

Never commit your real spreadsheet (it is git-ignored via `*.xlsm`/`*.xlsx`).
