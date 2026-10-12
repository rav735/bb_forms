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
await page.click('nav.bottom a.plus');
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
check(await page.locator('.selbar').isVisible() && !(await page.locator('nav.bottom').isVisible()), 'selection mode shows action bar and hides the bottom nav');
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
check(await page.locator('.selbar').isHidden() && await page.locator('nav.bottom').isVisible(), 'selection mode closed after the action');
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
await page.click('.chips .chip:has-text("Verkauft")');
await page.click('.seltop .chip:has-text("Alle")');
const soldVisible = await rows().count();
check((await selCount()).includes(String(soldVisible)), `select-all under a filter only selects the ${soldVisible} visible rows`);
await page.click('.chips .chip:has-text("Alle") >> nth=0');
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

// ---- manifest sanity
const manifest = await (await ctx.request.get(url + 'manifest.webmanifest')).json();
check(manifest.display === 'standalone' && manifest.icons.length === 3, 'manifest ok');
check(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await page.waitForTimeout(300);
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall e2e checks passed');
process.exit(failed ? 1 : 0);
