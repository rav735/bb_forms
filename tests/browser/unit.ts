import JSZip from 'jszip';
import { Store } from '../../src/store';
import type { ParsedSheet } from '../../src/types';
import { buildExport, parseWorkbook } from '../../src/xlsx';

type T = { name: string; fn: () => Promise<void> };
const tests: T[] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push({ name, fn });

function eq(a: unknown, b: unknown, msg = '') {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg} expected ${y} but got ${x}`);
}
function ok(c: unknown, msg: string) {
  if (!c) throw new Error(msg);
}

let n = 0;
const freshStore = () => Store.open(`test-${Date.now()}-${n++}`);

function sheet(ids: number[]): ParsedSheet {
  return { items: ids.map((id) => ({ id, title: `T${id}`, medium: 'Manga', price: id * 10 })), sellerName: '', sellerPhone: '', warnings: [], mediumFixes: 0 };
}
const FILE = { name: 'x.xlsm', buf: new ArrayBuffer(1) };

// ------------------------------------------------------------ synthetic template (mimics the real file)
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
async function template(rows: { id: number; title: string; medium: string; price: number }[], opts: { trailingBlank?: number } = {}): Promise<ArrayBuffer> {
  const sst: string[] = [];
  const si = (s: string) => {
    let i = sst.indexOf(s);
    if (i < 0) i = sst.push(s) - 1;
    return i;
  };
  const sc = (ref: string, s: number, text: string) => `<c r="${ref}" s="${s}" t="s"><v>${si(text)}</v></c>`;
  let data =
    `<row r="1" ht="15">${sc('A1', 2, 'Name:')}${sc('B1', 1, 'Dein realer Name, kein Nickname')}<c r="C1" s="3"/></row>` +
    `<row r="2">${sc('A2', 2, 'Telefonnummer:')}${sc('B2', 1, '699 123')}</row>` +
    `<row r="3">${sc('A3', 4, 'Anleitung & <Hinweis>')}<c r="B3" s="4"/></row><row r="4"/><row r="5" ht="63" customHeight="1"/>` +
    `<row r="6">${sc('A6', 5, 'Art. Nr')}${sc('B6', 5, 'Titel')}${sc('C6', 5, 'Medium')}${sc('D6', 6, 'Verkaufspreis')}<c r="J6" s="7"/></row>`;
  rows.forEach((r, i) => {
    const rn = 7 + i;
    const st = i % 2 ? 12 : 8; // alternate styles to prove they are preserved per row
    data += `<row r="${rn}" ht="15"><c r="A${rn}" s="${st}"><v>${r.id}</v></c>${sc(`B${rn}`, st, r.title)}${sc(`C${rn}`, st, r.medium)}<c r="D${rn}" s="${st}"><v>${r.price}</v></c><c r="J${rn}" s="7"/></row>`;
  });
  for (let k = 0; k < (opts.trailingBlank ?? 0); k++) {
    const rn = 7 + rows.length + k;
    data += `<row r="${rn}"><c r="B${rn}" s="0"/><c r="D${rn}" s="0"/></row>`;
  }
  data += `<row r="1048576" ht="12.8"/>`;
  const z = new JSZip();
  z.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>`);
  z.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Verkaufsliste" sheetId="1" r:id="rId3"/></sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`);
  z.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="${NS}" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></si>`).join('')}</sst>`);
  z.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="${NS}"><dimension ref="A1:N1048576"/><cols><col min="1" max="1" width="16.72" customWidth="1"/></cols><sheetData>${data}</sheetData><mergeCells count="2"><mergeCell ref="A3:D5"/><mergeCell ref="J8:K8"/></mergeCells></worksheet>`);
  return z.generateAsync({ type: 'arraybuffer' });
}
const sheetXml = async (buf: ArrayBuffer | Uint8Array) => (await (await JSZip.loadAsync(buf)).file('xl/worksheets/sheet1.xml')!.async('string'));
const rowsData = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Titel ${i + 1}`, medium: i % 3 ? 'Manga' : 'Funko Pop', price: (i + 1) * 5 }));

// ------------------------------------------------------------------- ID rules
test('automatic IDs continue after the highest imported ID', async () => {
  const s = await freshStore();
  await s.importSheet(sheet([1, 2, 3, 4, 5]), FILE, 'replace');
  const r = await s.add({ title: 'new', medium: 'Manga', price: 5 });
  ok(r.ok && r.value.id === 6, 'expected id 6');
});

test('a deleted ID is never handed out again', async () => {
  const s = await freshStore();
  await s.importSheet(sheet([1, 2, 3]), FILE, 'replace');
  const a = await s.add({ title: 'a', medium: '', price: 1 });
  ok(a.ok && a.value.id === 4, 'id 4');
  await s.remove(4);
  const b = await s.add({ title: 'b', medium: '', price: 1 });
  ok(b.ok && b.value.id === 5, 'must be 5, not 4 again');
  eq(s.nextId(), 6);
});

test('counter survives a restart even when the highest item was deleted', async () => {
  const name = `persist-${Date.now()}`;
  const s1 = await Store.open(name);
  await s1.importSheet(sheet([1, 2, 3]), FILE, 'replace');
  await s1.add({ title: 'x', medium: '', price: 1 }); // 4
  await s1.remove(4);
  s1.close();
  const s2 = await Store.open(name);
  eq(s2.nextId(), 5, 'next id after reopen');
  ok(s2.items.get(4)?.deleted === true, 'tombstone kept');
});

test('mark sold / unsold and delete / restore never change the ID', async () => {
  const s = await freshStore();
  await s.importSheet(sheet([1, 2, 3]), FILE, 'replace');
  await s.update(2, { sold: true });
  ok(s.items.get(2)!.sold && s.items.get(2)!.id === 2, 'sold keeps id');
  await s.update(2, { sold: false });
  await s.remove(2);
  ok(s.active().map((i) => i.id).join() === '1,3', 'hidden from list');
  await s.restore(2);
  eq(s.active().map((i) => i.id), [1, 2, 3]);
  eq(s.nextId(), 4);
});

test('explicit IDs: gap filling works, duplicates and tombstones are rejected', async () => {
  const s = await freshStore();
  await s.importSheet(sheet([1, 2, 4]), FILE, 'replace'); // gap at 3
  const gap = await s.add({ id: 3, title: 'gap', medium: '', price: 1 });
  ok(gap.ok, 'gap id accepted');
  eq(s.nextId(), 5, 'counter unaffected by gap fill');
  const dup = await s.add({ id: 2, title: 'dup', medium: '', price: 1 });
  ok(!dup.ok && dup.error === 'id-exists', 'duplicate rejected');
  await s.remove(2);
  const dead = await s.add({ id: 2, title: 'dead', medium: '', price: 1 });
  ok(!dead.ok && dead.error === 'id-deleted', 'tombstone rejected');
  const bad = await s.add({ id: 0, title: 'x', medium: '', price: 1 });
  ok(!bad.ok && bad.error === 'id-invalid', 'zero rejected');
  const big = await s.add({ id: 50, title: 'big', medium: '', price: 1 });
  ok(big.ok && s.nextId() === 51, 'high explicit id moves the counter');
});

test('validation: title and price', async () => {
  const s = await freshStore();
  const a = await s.add({ title: '  ', medium: '', price: 1 });
  ok(!a.ok && a.error === 'title-required', 'title');
  const b = await s.add({ title: 'x', medium: '', price: NaN });
  ok(!b.ok && b.error === 'price-invalid', 'price NaN');
  const c = await s.add({ title: 'x', medium: '', price: -1 });
  ok(!c.ok && c.error === 'price-invalid', 'price negative');
  eq(s.items.size, 0);
});

test('re-import: add-missing keeps sold/deleted state, replace resets but never lowers the counter', async () => {
  const s = await freshStore();
  await s.importSheet(sheet([1, 2, 3]), FILE, 'replace');
  await s.update(1, { sold: true });
  await s.remove(2);
  await s.add({ title: 'extra', medium: '', price: 1 }); // id 4
  const r = await s.importSheet(sheet([1, 2, 3, 5]), FILE, 'add-missing');
  eq(r, { added: 1, skipped: 3 });
  ok(s.items.get(1)!.sold, 'sold kept');
  ok(s.items.get(2)!.deleted, 'deleted kept');
  eq(s.nextId(), 6);
  await s.importSheet(sheet([1, 2]), FILE, 'replace');
  eq(s.active().map((i) => i.id), [1, 2]);
  ok(s.nextId() >= 6, 'counter never lowered by replace');
});

// ----------------------------------------------------------------- parser
test('parser reads template layout, seller info, cleans medium', async () => {
  const buf = await template([{ id: 1, title: 'A', medium: 'Manga`', price: 20 }, { id: 2, title: 'B', medium: 'Manga', price: 30 }, { id: 3, title: 'C', medium: 'Figur', price: 10 }]);
  const p = await parseWorkbook(buf);
  eq(p.items.map((i) => i.id), [1, 2, 3]);
  eq(p.items[0].medium, 'Manga');
  eq(p.mediumFixes, 1);
  eq(p.sellerName, '', 'placeholder name ignored');
  eq(p.sellerPhone, '699 123');
  eq(p.items[2].price, 10);
});

test('parser rejects files without the Art. Nr table', async () => {
  const z = new JSZip();
  z.file('xl/workbook.xml', `<workbook xmlns="${NS}"><sheets><sheet name="x" sheetId="1"/></sheets></workbook>`);
  z.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="${NS}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c></row></sheetData></worksheet>`);
  let err = '';
  try { await parseWorkbook(await z.generateAsync({ type: 'arraybuffer' })); } catch (e) { err = (e as Error).message; }
  eq(err, 'NO_HEADER');
});

// ----------------------------------------------------------------- export
test('export without changes keeps the data identical (round trip)', async () => {
  const orig = await template(rowsData(12), { trailingBlank: 2 });
  const parsed = await parseWorkbook(orig);
  const s = await freshStore();
  await s.importSheet(parsed, { name: 'v.xlsm', buf: orig }, 'replace');
  const res = await buildExport({ originalFile: orig, originalName: 'v.xlsm', items: [...s.items.values()], sellerName: '', sellerPhone: '' }, { mode: 'organizer', keepSold: true });
  const again = await parseWorkbook(res.bytes);
  eq(again.items, parsed.items);
  eq(res.filename, 'v.xlsm');
  eq(res.mime, 'application/vnd.ms-excel.sheet.macroEnabled.12');
});

test('export preserves layout: styles, merges, widths, instruction text, far-right cells, sheet XML outside data', async () => {
  const orig = await template(rowsData(6), { trailingBlank: 1 });
  const parsed = await parseWorkbook(orig);
  const res = await buildExport({ originalFile: orig, originalName: 'v.xlsm', items: parsed.items.map((i) => ({ ...i, sold: false, deleted: false, updatedAt: 0 })), sellerName: '', sellerPhone: '' }, { mode: 'organizer', keepSold: true });
  const x = await sheetXml(res.bytes);
  ok(x.includes('<mergeCell ref="A3:D5"/>') && x.includes('<mergeCell ref="J8:K8"/>'), 'merges');
  ok(x.includes('<col min="1" max="1" width="16.72" customWidth="1"/>'), 'col widths');
  ok(x.includes('<dimension ref="A1:N1048576"/>'), 'dimension');
  ok(/<c r="A7"[^>]*s="8"/.test(x) && /<c r="A8"[^>]*s="12"/.test(x), 'per-row styles kept');
  ok(x.includes('<c r="J7" s="7"/>'), 'cells right of the table kept');
  ok(x.includes('<c r="A6" s="5" t="s">') && x.includes('<c r="D6" s="6" t="s">'), 'header cells untouched');
  ok(x.includes('<row r="1048576"'), 'far rows kept');
  const z = await JSZip.loadAsync(res.bytes);
  const o = await JSZip.loadAsync(orig);
  eq(Object.keys(z.files), Object.keys(o.files), 'same file list/order');
  eq(await z.file('xl/sharedStrings.xml')!.async('string'), await o.file('xl/sharedStrings.xml')!.async('string'), 'sharedStrings untouched');
  eq(await z.file('xl/workbook.xml')!.async('string'), await o.file('xl/workbook.xml')!.async('string'), 'workbook.xml untouched');
});

test('export: edits, new items, sold, deleted – IDs stay, deleted rows disappear, leftovers cleared', async () => {
  const orig = await template(rowsData(8), { trailingBlank: 1 });
  const s = await freshStore();
  await s.importSheet(await parseWorkbook(orig), { name: 'v.xlsm', buf: orig }, 'replace');
  await s.update(2, { title: 'Neu & "gut" <b>', price: 12.5 });
  await s.update(3, { sold: true });
  await s.remove(5);
  const added = await s.add({ title: 'Neuer Artikel', medium: 'Karten', price: 7 });
  ok(added.ok && added.value.id === 9, 'new id 9');
  const input = { originalFile: orig, originalName: 'v.xlsm', items: [...s.items.values()], sellerName: 'Max Mustermann', sellerPhone: '+43 660 1' };

  const res = await buildExport(input, { mode: 'organizer', keepSold: true });
  const p = await parseWorkbook(res.bytes);
  eq(p.items.map((i) => i.id), [1, 2, 3, 4, 6, 7, 8, 9], 'ids (5 deleted)');
  eq(p.items.find((i) => i.id === 2), { id: 2, title: 'Neu & "gut" <b>', medium: 'Manga', price: 12.5 });
  eq(p.items.find((i) => i.id === 9)!.title, 'Neuer Artikel');
  eq(p.sellerName, 'Max Mustermann');
  eq(p.sellerPhone, '+43 660 1');
  const x = await sheetXml(res.bytes);
  ok(!/<c r="A15"[^>]*>\s*<v>/.test(x), 'row 15 (old 9th row) has no item number');
  // 8 old rows + 1 added − 1 deleted = 8 items → rows 7..14, trailing row 15 blank (old trailing blank row 15 is cleared)

  const noSold = await buildExport(input, { mode: 'organizer', keepSold: false });
  eq((await parseWorkbook(noSold.bytes)).items.map((i) => i.id), [1, 2, 4, 6, 7, 8, 9], 'sold omitted when keepSold=false');

  const full = await buildExport(input, { mode: 'full', keepSold: false });
  ok(full.filename === 'v_voll.xlsm', 'full filename');
  const fx = await sheetXml(full.bytes);
  ok(fx.includes('Status') && fx.includes('verkauft'), 'status column present');
  eq((await parseWorkbook(full.bytes)).items.length, 8, 'full keeps sold items');
});

test('export grows beyond the original number of rows', async () => {
  const orig = await template(rowsData(3));
  const s = await freshStore();
  await s.importSheet(await parseWorkbook(orig), { name: 'v.xlsm', buf: orig }, 'replace');
  for (let i = 0; i < 5; i++) await s.add({ title: `more ${i}`, medium: 'Manga', price: i });
  const res = await buildExport({ originalFile: orig, originalName: 'v.xlsm', items: [...s.items.values()], sellerName: '', sellerPhone: '' }, { mode: 'organizer', keepSold: true });
  const p = await parseWorkbook(res.bytes);
  eq(p.items.map((i) => i.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  const x = await sheetXml(res.bytes);
  ok(/<c r="A14"[^>]*s="12"|<c r="A14"[^>]*s="8"/.test(x) || /<c r="A14" s="\d+"/.test(x), 'new rows get a style');
});

test('export without an imported template builds a valid fresh workbook', async () => {
  const s = await freshStore();
  await s.add({ title: 'Hand angelegt', medium: 'Manga', price: 9 });
  await s.add({ title: 'Zweiter', medium: 'Figur', price: 15, sold: true });
  const res = await buildExport({ items: [...s.items.values()], sellerName: 'Anna', sellerPhone: '123' }, { mode: 'organizer', keepSold: true });
  eq(res.filename, 'Verkaufsliste.xlsx');
  const p = await parseWorkbook(res.bytes);
  eq(p.items.map((i) => [i.id, i.title, i.price]), [[1, 'Hand angelegt', 9], [2, 'Zweiter', 15]]);
  eq(p.sellerName, 'Anna');
});

// ------------------------------------------------------------------ runner
(async () => {
  const results: { name: string; pass: boolean; error?: string }[] = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, pass: true });
    } catch (e) {
      results.push({ name: t.name, pass: false, error: (e as Error).message });
    }
  }
  (window as unknown as { __results: unknown }).__results = results;
})();
