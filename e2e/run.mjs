// End-to-end test in headless Chromium against the built app (dist/).
// Usage: REAL_XLSM=/path/to/Verkaufsliste.xlsm node e2e/run.mjs     (needs `npm run build` first)
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const REAL = process.env.REAL_XLSM;
if (!REAL) { console.error('Set REAL_XLSM to the path of your Verkaufsliste .xlsm'); process.exit(2); }
const OUT = 'e2e/out';
await mkdir(OUT, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p.endsWith('/')) p += 'index.html';
  try { const body = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }).end(body); } catch { res.writeHead(404).end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'de-AT', acceptDownloads: true, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
let shot = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) {
    failed++;
    page.evaluate(() => JSON.stringify({ hash: location.hash, err: document.querySelector('#e-id')?.outerHTML, id: document.querySelector('#f-id')?.value, toast: document.getElementById('toast')?.className, active: document.activeElement?.id }))
      .then((st) => console.log('   state:', st)).catch(() => {});
    page.screenshot({ path: `${OUT}/fail-${++shot}.png` }).catch(() => {});
  }
};
const rows = () => page.locator('li.row');
const until = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await page.waitForTimeout(60); } };
const listReady = async () => { await page.waitForFunction(() => /^(#\/?)?$/.test(location.hash) && !!document.querySelector('li.row') && !document.querySelector('.list-view')?.hidden); };
const ids = async () => (await page.locator('li.row .idb').allTextContents()).map(Number);

// ---- import skips rows without a name (separate context → separate storage)
{
  execFileSync('python3', ['-I', '-c', `
import openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.active
for row in ws.iter_rows(min_row=7):
    if row[0].value in (3, 4): row[1].value = None
    if row[0].value == 5: row[1].value = '   '
wb.save(sys.argv[2])`, REAL, `${OUT}/noname.xlsx`]);
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-AT' });
  const p2 = await ctx2.newPage();
  await p2.goto(url);
  await p2.waitForSelector('.empty');
  const [fc] = await Promise.all([p2.waitForEvent('filechooser'), p2.click('.empty .btn.primary')]);
  await fc.setFiles(`${OUT}/noname.xlsx`);
  await p2.waitForSelector('.modal');
  const d = await p2.locator('.modal').innerText();
  check(/151 Artikel/.test(d) && /3 Eintrag\/Einträge ohne Namen/.test(d), `no-name rows reported and not counted ("${d.split('\n').slice(1, 3).join(' | ')}")`);
  await p2.screenshot({ path: `${OUT}/02b-import-noname.png` });
  await p2.click('.modal .btn.primary');
  await p2.waitForSelector('li.row');
  const got = (await p2.locator('li.row .idb').allTextContents()).map(Number);
  check(got.length === 151 && ![3, 4, 5].some((x) => got.includes(x)) && got.includes(6) && got.includes(154), 'items 3, 4, 5 (no name) are not in the list; all others are, IDs unchanged');
  await ctx2.close();
}

await page.goto(url);
await page.waitForSelector('.empty');
await page.screenshot({ path: `${OUT}/01-empty.png` });
check(await page.locator('.empty .btn.primary').count() === 1, 'empty state offers import');

// ---- import the real file
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.empty .btn.primary')]);
await chooser.setFiles(REAL);
await page.waitForSelector('.modal');
await page.screenshot({ path: `${OUT}/02-import-dialog.png` });
const dlg = await page.locator('.modal').innerText();
check(/154 Artikel/.test(dlg) && /1–154/.test(dlg), `import dialog reports 154 items (1–154): "${dlg.split('\n').slice(1,2)}"`);
check(/1 Medium korrigiert/.test(dlg), 'import dialog mentions the corrected medium');
await page.click('.modal .btn.primary');
await page.waitForSelector('li.row');
check(await rows().count() === 154, 'list shows 154 rows after import');
const all = await ids();
check(all[0] === 1 && all[153] === 154 && all.every((v, i) => v === i + 1), 'IDs are exactly 1..154 in order');
await page.screenshot({ path: `${OUT}/03-list.png` });
{
  const m = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, w: b.width, h: b.height }; };
    const segs = (sel) => [...document.querySelectorAll(sel + ' > button')].map((b) => Math.round(b.getBoundingClientRect().width));
    return { vw: innerWidth, status: r('.seg.status'), medium: r('.seg.medium'), sBtns: segs('.seg.status'), mBtns: segs('.seg.medium'), idb: r('li.row .idb'), row: r('li.row'), nav: document.querySelectorAll('nav.bottom').length, burger: !!document.querySelector('.burger') };
  });
  const fill = (b) => b && b.w >= m.vw - 32 && b.x <= 16;
  check(fill(m.status) && fill(m.medium), `status and medium bars span the screen width (${Math.round(m.status.w)} / ${Math.round(m.medium.w)} of ${m.vw}px)`);
  check(m.sBtns.length === 3 && Math.max(...m.sBtns) - Math.min(...m.sBtns) <= 1, `status bar has 3 equal sections ${m.sBtns}`);
  check(m.mBtns.length === 4 && Math.max(...m.mBtns) - Math.min(...m.mBtns) <= 1, `medium bar has 4 equal sections ${m.mBtns}`);
  check(m.idb.w <= 44 && m.row.h <= 64, `compact rows: ID badge ${Math.round(m.idb.w)}px wide, row ${Math.round(m.row.h)}px high`);
  check(m.nav === 0 && m.burger, 'no bottom navigation bar; burger button present');
}

// ---- search / jump / filters
await page.fill('.search', '87');
check((await ids())[0] === 87, 'typing 87 puts item 87 first');
await page.fill('.search', 'dragon');
const dragon = await rows().count();
check(dragon >= 1, `text search "dragon" finds ${dragon}`);
await page.screenshot({ path: `${OUT}/04-search.png` });
await page.fill('.search', '');
await page.click('.seg.medium button:has-text("Funko Pop")');
check(await rows().count() === 37, 'medium chip Funko Pop → 37 rows');
await page.click('.seg.medium button >> nth=0');
await page.click('.seg.medium .more');
await page.waitForSelector('.modal');
const pickerText = await page.locator('.modal').innerText();
check(!pickerText.includes('`') && /Figur/.test(pickerText), 'medium picker lists the remaining media and no "Manga`"');
await page.screenshot({ path: `${OUT}/03b-medium-picker.png` });
await page.click('.modal .btn:has-text("Figur")');
await until(async () => (await rows().count()) === 4);
check((await rows().count()) === 4 && (await page.locator('.seg.medium .more.on .lbl').innerText()) === 'Figur', 'picking "Figur" in the picker filters to its 4 items and shows the name in the bar');
await page.click('.seg.medium button >> nth=0');
await until(async () => (await rows().count()) === 154);

// ---- mark sold from list
await page.fill('.search', '5');
await page.locator('li.row[data-id="5"] .check').click();
check(await until(async () => (await page.locator('li.row[data-id="5"].sold').count()) === 1), 'item 5 marked sold in the list');
await page.screenshot({ path: `${OUT}/05-sold.png` });
await page.click('#toast .toast-action'); // undo
check(await until(async () => (await page.locator('li.row[data-id="5"].sold').count()) === 0), 'undo restores item 5');
await page.locator('li.row[data-id="5"] .check').click();
await until(async () => (await page.locator('li.row[data-id="5"].sold').count()) === 1);
await page.fill('.search', '');

// ---- add new item → 155
// burger menu: open, back button closes it, overlay closes it, items navigate
await page.click('.burger');
await page.waitForSelector('.drawer-overlay.open .drawer-item');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03c-drawer.png` });
check((await page.locator('.drawer-item').allInnerTexts()).join('|') === 'Liste|Neuer Artikel|Einstellungen', 'drawer lists Liste / Neuer Artikel / Einstellungen');
await page.goBack();
await until(async () => await page.locator('.drawer-overlay').isHidden());
check(await page.locator('.drawer-overlay').isHidden() && (await rows().count()) === 154, 'Android back closes the menu and stays on the list');
await page.click('.burger');
await page.waitForSelector('.drawer-overlay.open');
await page.mouse.click(370, 400);
await until(async () => await page.locator('.drawer-overlay').isHidden());
check(await page.locator('.drawer-overlay').isHidden(), 'tapping outside closes the menu');
await page.click('.burger');
await page.waitForSelector('.drawer-overlay.open');
await page.click('.drawer-item:has-text("Neuer Artikel")');
await page.waitForSelector('.form');
check(await until(async () => await page.locator('.drawer-overlay').isHidden()), 'menu item opens the form and closes the menu');
check((await page.inputValue('#f-id')) === '155', 'new item suggests id 155');
await page.screenshot({ path: `${OUT}/06-form-new.png` });
await page.fill('#f-title', 'Testartikel Eins');
await page.fill('#f-medium', 'Karten');
await page.fill('#f-price', '12,5');
await page.click('.form button[type=submit]');
await listReady();
check(await rows().count() === 155, 'list has 155 rows after adding');
const priceTxt = (await page.locator('li.row[data-id="155"] .price').textContent()).trim();
check(priceTxt === '12,50 €', `price 12,5 stored and shown as 12,50 € (got "${priceTxt}")`);

// ---- delete 155, add another → must be 156
await page.locator('li.row[data-id="155"] .title').click();
await page.waitForSelector('.form');
await page.screenshot({ path: `${OUT}/07-form-edit.png` });
check((await page.inputValue('#f-id')) === '155' && await page.locator('#f-id').isDisabled(), 'ID field is read-only when editing');
await page.click('.btn.danger-outline');
await page.click('.modal .btn.danger');
await listReady();
check(await rows().count() === 154, 'deleted item disappears from list');
await page.click('.add-btn');
await page.waitForSelector('.form');
check((await page.inputValue('#f-id')) === '156', 'after deleting 155 the next new ID is 156 (never reused)');
await page.fill('#f-title', 'Testartikel Zwei');
await page.fill('#f-price', '3');
// try to claim the deleted ID 155 → rejected
await page.fill('#f-id', '155');
await page.click('.form button[type=submit]');
check(await until(async () => (await page.locator('#e-id:not([hidden])').count()) === 1), 'typing the deleted ID 155 is rejected');
await page.fill('#f-id', '12');
await page.click('.form button[type=submit]');
check(await until(async () => /schon vergeben/.test(await page.locator('#e-id').innerText())), 'typing existing ID 12 is rejected');
await page.fill('#f-id', '156');
await page.click('.form button[type=submit]');
await listReady();
check(await page.locator('li.row[data-id="156"]').count() === 1, 'item 156 added');

// ---- edit an existing item, ID unchanged
await page.locator('li.row[data-id="10"] .title').click();
await page.waitForSelector('.form');
await page.fill('#f-title', 'Geänderter Titel');
await page.click('.form button[type=submit]');
await listReady();
check((await page.locator('li.row[data-id="10"] .title').innerText()) === 'Geänderter Titel', 'edited title shows on item 10');

// ---- bulk select / delete / sold
const selCount = () => page.locator('.selcount').innerText();
await page.click('.select-btn');
check(await page.locator('.selbar').isVisible() && await page.locator('.titlebar').isHidden(), 'selection mode shows the action bar and replaces the title bar');
check(/Nichts ausgewählt/.test(await selCount()) && await page.locator('.selbar .btn.danger').isDisabled(), 'nothing selected → actions disabled');
for (const id of [20, 21, 22]) await page.locator(`li.row[data-id="${id}"] .title`).click();
check(/3 ausgewählt/.test(await selCount()), 'tapping rows selects them (3 selected)');
await page.locator('li.row[data-id="21"] .title').click();
check(/2 ausgewählt/.test(await selCount()), 'tapping again deselects');
await page.locator('li.row[data-id="21"] .title').click();
await page.screenshot({ path: `${OUT}/09-select.png` });
await page.click('.selbar .btn.danger');
await page.waitForSelector('.modal');
check(/3 Artikel löschen/.test(await page.locator('.modal').innerText()), 'delete asks for confirmation with the count');
await page.screenshot({ path: `${OUT}/10-bulk-confirm.png` });
await page.click('.modal .btn.danger');
await until(async () => (await rows().count()) === 152);
check(await rows().count() === 152, 'bulk delete removed 3 rows (155 → 152)');
check(await page.locator('.selbar').isHidden() && await page.locator('.titlebar').isVisible(), 'selection mode closed after the action');
await page.click('#toast .toast-action'); // undo
await until(async () => (await rows().count()) === 155);
check(await rows().count() === 155 && (await page.locator('li.row[data-id="21"]').count()) === 1, 'undo restores all 3 with the same IDs');
// long-press enters selection mode
await page.locator('li.row[data-id="30"] .title').scrollIntoViewIfNeeded();
const box = await page.locator('li.row[data-id="30"] .title').boundingBox();
await page.mouse.move(box.x + 10, box.y + 10);
await page.mouse.down();
await page.waitForTimeout(750);
await page.mouse.up();
check(/1 ausgewählt/.test(await selCount()) && await page.locator('li.row[data-id="30"].picked').count() === 1, 'long-press on item 30 starts selection with it selected');
// select all visible, then none
await page.click('.seltop .chip:has-text("Alle")');
check((await selCount()).includes('155'), 'Alle selects every visible item (155)');
await page.click('.seltop .chip:has-text("Keine")');
check(/Nichts/.test(await selCount()), 'Keine clears the selection');
// selection only covers visible rows: filter to sold-only, select all
await page.click('.seg.status button:has-text("Verkauft")');
await page.click('.seltop .chip:has-text("Alle")');
const soldVisible = await rows().count();
check((await selCount()).includes(String(soldVisible)), `select-all under a filter only selects the ${soldVisible} visible rows`);
await page.click('.seg.status button:has-text("Alle")');
check(await page.locator('.selbar').isVisible(), 'still in selection mode after changing the filter');
// Android back button leaves selection mode first
await page.goBack();
await until(async () => (await page.locator('.selbar').isHidden()));
check(await page.locator('.selbar').isHidden() && await page.locator('li.row').count() > 0, 'back button leaves selection mode (stays in the app)');
// bulk mark sold
await page.click('.select-btn');
for (const id of [25, 26]) await page.locator(`li.row[data-id="${id}"] .title`).click();
await page.click('.selbar .btn:has-text("Verkauft")');
await until(async () => (await page.locator('li.row[data-id="25"].sold').count()) === 1);
check(await page.locator('li.row[data-id="25"].sold').count() === 1 && await page.locator('li.row[data-id="26"].sold').count() === 1, 'bulk "Verkauft" marks 25 and 26 as sold');
// final: bulk delete 40 + 41 for good (these stay deleted for the export check)
await page.click('.select-btn');
await page.fill('.search', '4');
for (const id of [40, 41]) await page.locator(`li.row[data-id="${id}"] .title`).click();
await page.click('.selbar .btn.danger');
await page.click('.modal .btn.danger');
await until(async () => (await page.locator('li.row[data-id="40"]').count()) === 0);
await page.fill('.search', '');
check(await rows().count() === 153, 'items 40 and 41 deleted (155 → 153)');
await page.screenshot({ path: `${OUT}/11-after-bulk.png` });

// ---- settings: seller, export
await page.click('.burger');
await page.click('.drawer-item:has-text("Einstellungen")');
await page.waitForSelector('.cards');
await page.fill('.settings-view input[type=text]', 'Max Mustermann');
await page.fill('.settings-view input[type=tel]', '+43 660 1234567');
await page.locator('.settings-view input[type=tel]').blur();
await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/08-settings.png`, fullPage: true });
async function download(clickSel) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(clickSel)]);
  const path = `${OUT}/${d.suggestedFilename()}`;
  await d.saveAs(path);
  return path;
}
const organizer = await download('button:has-text("Auf dem Handy speichern")');
console.log('exported organizer:', organizer);
await page.locator('label.choice', { hasText: 'Komplett' }).click();
const full = await download('button:has-text("Auf dem Handy speichern")');
console.log('exported full:', full);
// share fallback: headless Chromium has no file sharing → falls back to download
await page.locator('label.choice', { hasText: 'Für den Veranstalter' }).click();
await page.locator('.check-row input').uncheck();
const [d2] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Teilen")')]);
await d2.saveAs(`${OUT}/share-fallback-no-sold.xlsm`);
check(true, 'Teilen falls back to a download when file sharing is unavailable');
check(!(await page.locator('.banner').count()), 'no unsaved-changes banner after export');

// ---- persistence + offline
await page.goto(url + '#/');
await page.reload();
await page.waitForSelector('li.row');
check(await rows().count() === 153, 'data persisted across reload (153 rows)');
check((await page.locator('li.row[data-id="5"].sold').count()) === 1, 'sold flag persisted');
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.reload(); // let the SW take control
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('li.row', { timeout: 10000 });
check(true, 'app loads while offline (service worker cache)');
await ctx.setOffline(false);

// ---- contrast of the pastel palette (WCAG AA 4.5:1 for text pairs) in light and dark
const contrast = async (scheme) => {
  await page.emulateMedia({ colorScheme: scheme });
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    const lum = (hex) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (a, b) => { const [x, y] = [lum(v(a)), lum(v(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const pairs = [['--ink', '--surface'], ['--ink', '--bg'], ['--muted', '--bg'], ['--muted', '--surface'], ['--muted', '--accent-soft'], ['--accent-ink', '--accent'], ['--accent-strong', '--accent-soft'], ['--accent-strong', '--surface'], ['--ok-ink', '--ok'], ['--ok-strong', '--ok-soft'], ['--ok-strong', '--surface'], ['--danger-ink', '--danger'], ['--danger-strong', '--surface'], ['--ink', '--warn-soft']];
    return pairs.map(([a, b]) => [`${a} on ${b}`, cr(a, b)]).filter(([, r]) => r < 4.5);
  });
};
for (const scheme of ['light', 'dark']) {
  const bad = await contrast(scheme);
  check(bad.length === 0, `${scheme} palette: all text pairs ≥ 4.5:1${bad.length ? ' – failing: ' + JSON.stringify(bad) : ''}`);
}
// dark-mode screenshots
await page.emulateMedia({ colorScheme: 'dark' });
await page.goto(url + '#/');
await page.waitForSelector('li.row');
await page.screenshot({ path: `${OUT}/12-dark-list.png` });
await page.click('.burger');
await page.waitForSelector('.drawer-overlay.open .drawer-item');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/13-dark-drawer.png` });
await page.goBack();
await page.emulateMedia({ colorScheme: 'light' });

// ---- manifest sanity
const manifest = await (await ctx.request.get(url + 'manifest.webmanifest')).json();
check(manifest.display === 'standalone' && manifest.icons.length === 3, 'manifest ok');
check(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await page.waitForTimeout(300);
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall e2e checks passed');
process.exit(failed ? 1 : 0);
