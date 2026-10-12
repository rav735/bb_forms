// End-to-end test in headless Chromium against the built app (dist/).
// Usage: REAL_XLSM=/path/to/Verkaufsliste.xlsm node e2e/run.mjs     (needs `npm run build` first)
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
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failed++; };
const rows = () => page.locator('li.row');
const until = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v || Date.now() - t0 > ms) return v; await page.waitForTimeout(60); } };
const ids = async () => (await page.locator('li.row .idb').allTextContents()).map(Number);

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

// ---- search / jump / filters
await page.fill('.search', '87');
check((await ids())[0] === 87, 'typing 87 puts item 87 first');
await page.fill('.search', 'dragon');
const dragon = await rows().count();
check(dragon >= 1, `text search "dragon" finds ${dragon}`);
await page.screenshot({ path: `${OUT}/04-search.png` });
await page.fill('.search', '');
await page.click('.chips >> nth=1 >> text=Funko Pop');
check(await rows().count() === 37, 'medium chip Funko Pop → 37 rows');
await page.click('.chips >> nth=1 >> text=Alle Medien');
check(await page.locator('.chips .chip', { hasText: /^Manga`/ }).count() === 0, 'no "Manga`" medium chip any more');

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
await page.click('nav.bottom a.plus');
await page.waitForSelector('.form');
check((await page.inputValue('#f-id')) === '155', 'new item suggests id 155');
await page.screenshot({ path: `${OUT}/06-form-new.png` });
await page.fill('#f-title', 'Testartikel Eins');
await page.fill('#f-medium', 'Karten');
await page.fill('#f-price', '12,5');
await page.click('.form button[type=submit]');
await page.waitForSelector('li.row');
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
await page.waitForSelector('li.row');
check(await rows().count() === 154, 'deleted item disappears from list');
await page.click('nav.bottom a.plus');
await page.waitForSelector('.form');
check((await page.inputValue('#f-id')) === '156', 'after deleting 155 the next new ID is 156 (never reused)');
await page.fill('#f-title', 'Testartikel Zwei');
await page.fill('#f-price', '3');
// try to claim the deleted ID 155 → rejected
await page.fill('#f-id', '155');
await page.click('.form button[type=submit]');
check(await page.locator('#e-id:not([hidden])').count() === 1, 'typing the deleted ID 155 is rejected');
await page.fill('#f-id', '12');
await page.click('.form button[type=submit]');
check(/schon vergeben/.test(await page.locator('#e-id').innerText()), 'typing existing ID 12 is rejected');
await page.fill('#f-id', '156');
await page.click('.form button[type=submit]');
await page.waitForSelector('li.row');
check(await page.locator('li.row[data-id="156"]').count() === 1, 'item 156 added');

// ---- edit an existing item, ID unchanged
await page.locator('li.row[data-id="10"] .title').click();
await page.waitForSelector('.form');
await page.fill('#f-title', 'Geänderter Titel');
await page.click('.form button[type=submit]');
await page.waitForSelector('li.row');
check((await page.locator('li.row[data-id="10"] .title').innerText()) === 'Geänderter Titel', 'edited title shows on item 10');

// ---- settings: seller, export
await page.click('nav.bottom a:has-text("Mehr")');
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
check(await rows().count() === 155, 'data persisted across reload (154 + item 156)');
check((await page.locator('li.row[data-id="5"].sold').count()) === 1, 'sold flag persisted');
await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
await page.waitForTimeout(500);
await page.reload(); // let the SW take control
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('li.row', { timeout: 10000 });
check(true, 'app loads while offline (service worker cache)');
await ctx.setOffline(false);

// ---- manifest sanity
const manifest = await (await ctx.request.get(url + 'manifest.webmanifest')).json();
check(manifest.display === 'standalone' && manifest.icons.length === 3, 'manifest ok');
check(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall e2e checks passed');
process.exit(failed ? 1 : 0);
