import JSZip from 'jszip';
import type { Item, ParsedItem, ParsedSheet } from './types';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
/** Rows at/after this number are LibreOffice's "empty sheet end" markers; never touch them. */
const FAR_ROWS = 1_000_000;

export const MIME_XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.12';
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type CellValue = string | number | boolean;

// ---------------------------------------------------------------- helpers
function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML parse error');
  return doc;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function splitRef(ref: string): { col: number; row: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref);
  if (!m) return { col: 0, row: 0 };
  return { col: colIndex(m[1]), row: Number(m[2]) };
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, '');

/** Trim, collapse spaces, drop stray trailing quote/backtick characters (e.g. "Manga`"). */
export function cleanMedium(raw: string): { value: string; fixed: boolean } {
  const value = raw.replace(/\s+/g, ' ').replace(/[`´'’‘]+$/g, '').trim();
  return { value, fixed: value !== raw.trim() };
}

async function sheetPath(zip: JSZip): Promise<string> {
  const fallback = 'xl/worksheets/sheet1.xml';
  try {
    const wb = parseXml(await zip.file('xl/workbook.xml')!.async('string'));
    const rid = wb.getElementsByTagNameNS(NS, 'sheet')[0]?.getAttributeNS(R_NS, 'id');
    const rels = parseXml(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
    for (const r of Array.from(rels.getElementsByTagName('Relationship'))) {
      if (r.getAttribute('Id') === rid) {
        const target = r.getAttribute('Target') ?? '';
        const p = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
        if (zip.file(p)) return p;
      }
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

async function sharedStrings(zip: JSZip): Promise<string[]> {
  const f = zip.file('xl/sharedStrings.xml');
  if (!f) return [];
  const doc = parseXml(await f.async('string'));
  return Array.from(doc.getElementsByTagNameNS(NS, 'si')).map((si) => {
    // Concatenate text runs, but skip phonetic (rPh) text.
    let s = '';
    for (const t of Array.from(si.getElementsByTagNameNS(NS, 't'))) {
      if (t.parentElement?.localName === 'rPh') continue;
      s += t.textContent ?? '';
    }
    return s;
  });
}

function readCells(doc: Document, sst: string[]): Map<number, Map<number, CellValue>> {
  const rows = new Map<number, Map<number, CellValue>>();
  for (const c of Array.from(doc.getElementsByTagNameNS(NS, 'c'))) {
    const { col, row } = splitRef(c.getAttribute('r') ?? '');
    if (!col) continue;
    const t = c.getAttribute('t');
    const v = c.getElementsByTagNameNS(NS, 'v')[0]?.textContent ?? '';
    let val: CellValue | undefined;
    if (t === 's') val = sst[Number(v)];
    else if (t === 'inlineStr') val = Array.from(c.getElementsByTagNameNS(NS, 't')).map((x) => x.textContent ?? '').join('');
    else if (t === 'str') val = v;
    else if (t === 'b') val = v === '1';
    else if (t === 'e') val = undefined;
    else if (v !== '') val = Number(v);
    if (val === undefined || val === '') continue;
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row)!.set(col, val);
  }
  return rows;
}

const HEADER_KEYS = new Set(['artnr', 'artikelnr', 'artikelnummer', 'nr', 'id']);
const TITLE_KEYS = new Set(['titel', 'title', 'name', 'artikel', 'bezeichnung']);
const MEDIUM_KEYS = new Set(['medium', 'kategorie', 'typ', 'art']);
const PRICE_KEYS = new Set(['verkaufspreis', 'preis', 'price']);

function findHeader(rows: Map<number, Map<number, CellValue>>): number | null {
  for (const [r, cells] of rows) {
    const a = cells.get(1);
    if (typeof a === 'string' && HEADER_KEYS.has(norm(a)) && cells.size >= 3) return r;
  }
  return null;
}

// ----------------------------------------------------------------- parse
export async function parseWorkbook(buf: ArrayBuffer | Uint8Array): Promise<ParsedSheet> {
  const zip = await JSZip.loadAsync(buf);
  const path = await sheetPath(zip);
  const file = zip.file(path);
  if (!file) throw new Error('Sheet not found');
  const doc = parseXml(await file.async('string'));
  const rows = readCells(doc, await sharedStrings(zip));

  const headerRow = findHeader(rows);
  if (headerRow === null) throw new Error('NO_HEADER');
  const header = rows.get(headerRow)!;
  let cTitle = 2,
    cMedium = 3,
    cPrice = 4;
  for (const [col, v] of header) {
    const k = norm(v);
    if (TITLE_KEYS.has(k)) cTitle = col;
    else if (MEDIUM_KEYS.has(k)) cMedium = col;
    else if (PRICE_KEYS.has(k)) cPrice = col;
  }

  const warnings: string[] = [];
  let mediumFixes = 0;
  let skippedNoName = 0;
  let sellerName = '';
  let sellerPhone = '';
  for (const [r, cells] of rows) {
    if (r >= headerRow) break;
    const label = norm(cells.get(1));
    const val = cells.get(2);
    if (val === undefined) continue;
    if (label.startsWith('name')) sellerName = String(val).trim();
    else if (label.startsWith('tel')) sellerPhone = String(val).trim();
  }
  // The organizer's template ships a placeholder text in the name cell.
  if (/dein realer name|kein nickname/i.test(sellerName)) sellerName = '';

  const items: ParsedItem[] = [];
  const seen = new Set<number>();
  for (const [r, cells] of rows) {
    if (r <= headerRow) continue;
    const rawId = cells.get(1);
    const id = typeof rawId === 'number' ? rawId : Number(String(rawId ?? '').trim());
    const hasAny = cells.has(cTitle) || cells.has(cMedium) || cells.has(cPrice);
    if (rawId === undefined) {
      if (hasAny) warnings.push(`row ${r}: no item number – skipped`);
      continue;
    }
    if (!Number.isInteger(id) || id < 1) {
      warnings.push(`row ${r}: invalid item number "${rawId}" – skipped`);
      continue;
    }
    // Entries without a name are not importable (e.g. pre-numbered but still empty rows).
    const title = String(cells.get(cTitle) ?? '').trim();
    if (!title) {
      skippedNoName++;
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`row ${r}: duplicate item number ${id} – skipped`);
      continue;
    }
    seen.add(id);
    const med = cleanMedium(String(cells.get(cMedium) ?? ''));
    if (med.fixed) mediumFixes++;
    const rawPrice = cells.get(cPrice);
    let price = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice ?? '').replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) {
      warnings.push(`item ${id}: price missing/invalid – set to 0`);
      price = 0;
    }
    items.push({ id, title, medium: med.value, price });
  }
  return { items, sellerName, sellerPhone, warnings, mediumFixes, skippedNoName };
}

// ---------------------------------------------------------------- export
export interface ExportOptions {
  /** 'organizer': columns A–D only, exactly like the template. 'full': adds a Status column. */
  mode: 'organizer' | 'full';
  /** Organizer mode only: keep sold items in the list. */
  keepSold: boolean;
}

export interface ExportInput {
  originalFile?: ArrayBuffer;
  originalName?: string;
  items: Item[];
  sellerName: string;
  sellerPhone: string;
}

export interface ExportResult {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  count: number;
}

function createCell(doc: Document, ref: string, style: string | null): Element {
  const c = doc.createElementNS(NS, 'c');
  c.setAttribute('r', ref);
  if (style) c.setAttribute('s', style);
  return c;
}

function setCell(doc: Document, row: Element, rowNum: number, col: number, letter: string, value: CellValue | null, style: string | null, forceStyle = false) {
  const ref = `${letter}${rowNum}`;
  let cell: Element | null = null;
  let before: Element | null = null;
  for (const c of Array.from(row.children)) {
    const ci = splitRef(c.getAttribute('r') ?? '').col;
    if (ci === col) {
      cell = c;
      break;
    }
    if (ci > col) {
      before = c;
      break;
    }
  }
  if (!cell) {
    cell = createCell(doc, ref, style);
    row.insertBefore(cell, before);
  }
  if (forceStyle && style) cell.setAttribute('s', style);
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.removeAttribute('t');
  if (value === null || value === '') return;
  if (typeof value === 'number') {
    const v = doc.createElementNS(NS, 'v');
    v.textContent = String(value);
    cell.appendChild(v);
  } else {
    cell.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(NS, 'is');
    const t = doc.createElementNS(NS, 't');
    const s = String(value);
    if (/^\s|\s$/.test(s)) t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.textContent = s;
    is.appendChild(t);
    cell.appendChild(is);
  }
}

function getOrCreateRow(doc: Document, sheetData: Element, n: number, tmpl: Element | null): Element {
  let before: Element | null = null;
  for (const r of Array.from(sheetData.children)) {
    const rn = Number(r.getAttribute('r'));
    if (rn === n) return r;
    if (rn > n) {
      before = r;
      break;
    }
  }
  const row = doc.createElementNS(NS, 'row');
  row.setAttribute('r', String(n));
  if (tmpl) for (const a of Array.from(tmpl.attributes)) if (a.name !== 'r') row.setAttribute(a.name, a.value);
  sheetData.insertBefore(row, before);
  return row;
}

function styleOf(row: Element | null, col: number): string | null {
  if (!row) return null;
  for (const c of Array.from(row.children)) if (splitRef(c.getAttribute('r') ?? '').col === col) return c.getAttribute('s');
  return null;
}

interface PatchCtx {
  headerRow: number;
  /** Parsed cell values of the ORIGINAL sheet (used to recognise the "Name:" / "Telefon" rows). */
  rows: Map<number, Map<number, CellValue>>;
}

/**
 * Patch the sheet in place: only cells A–E of the data rows (and the seller cells in B) are touched.
 * Styles, widths, merges, the instruction text and anything right of column E stay exactly as they were.
 */
function applyPatch(doc: Document, ctx: PatchCtx, input: ExportInput, list: Item[], opts: ExportOptions): string {
  const sheetData = doc.getElementsByTagNameNS(NS, 'sheetData')[0];
  if (!sheetData) throw new Error('sheetData missing');
  const rowsByNum = new Map<number, Element>();
  for (const r of Array.from(sheetData.children)) rowsByNum.set(Number(r.getAttribute('r')), r);
  const { headerRow } = ctx;
  const first = headerRow + 1;

  // --- seller info (only overwrite when the user has filled it in)
  for (const [r, el] of rowsByNum) {
    if (r >= headerRow) break;
    const label = norm(ctx.rows.get(r)?.get(1));
    const bStyle = styleOf(el, 2);
    if (label.startsWith('name') && input.sellerName) setCell(doc, el, r, 2, 'B', input.sellerName, bStyle);
    else if (label.startsWith('tel') && input.sellerPhone) setCell(doc, el, r, 2, 'B', input.sellerPhone, bStyle);
  }

  // --- template row (last row that has an item number) for styles/attributes of newly created rows
  let tmpl: Element | null = null;
  for (const [r, el] of rowsByNum) if (r >= first && r < FAR_ROWS && ctx.rows.get(r)?.has(1)) tmpl = el;
  if (!tmpl) tmpl = rowsByNum.get(first) ?? null;
  const tStyle = [1, 2, 3, 4].map((c) => styleOf(tmpl, c));

  // --- optional status column
  const full = opts.mode === 'full';
  if (full) {
    const hr = rowsByNum.get(headerRow);
    if (hr) setCell(doc, hr, headerRow, 5, 'E', 'Status', styleOf(hr, 4));
  }

  // --- data rows
  const cols: [number, string][] = [[1, 'A'], [2, 'B'], [3, 'C'], [4, 'D']];
  list.forEach((it, i) => {
    const rn = first + i;
    const row = getOrCreateRow(doc, sheetData, rn, tmpl);
    const vals: (CellValue | null)[] = [it.id, it.title, it.medium, it.price];
    cols.forEach(([ci, letter], k) => {
      const hadValue = ctx.rows.get(rn)?.has(ci) ?? false;
      // keep the sheet's own style where a value was; empty cells below the table borrow the table's style
      setCell(doc, row, rn, ci, letter, vals[k], hadValue ? styleOf(row, ci) ?? tStyle[k] : tStyle[k] ?? styleOf(row, ci), !hadValue);
    });
    if (full) setCell(doc, row, rn, 5, 'E', it.sold ? 'verkauft' : null, styleOf(row, 5) ?? tStyle[3] ?? styleOf(row, 4));
  });

  // --- empty the cells of rows left over below the new list (keeps their styles)
  for (const [rn, row] of rowsByNum) {
    if (rn < first + list.length || rn >= FAR_ROWS) continue;
    cols.forEach(([ci, letter]) => {
      if (Array.from(row.children).some((c) => c.getAttribute('r') === `${letter}${rn}`)) setCell(doc, row, rn, ci, letter, null, styleOf(row, ci));
    });
    if (Array.from(row.children).some((c) => c.getAttribute('r') === `E${rn}`)) setCell(doc, row, rn, 5, 'E', null, styleOf(row, 5));
  }
  // Some engines keep the original XML declaration when serializing; make sure there is exactly one.
  return XML_DECL + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^?]*\?>\s*/, '');
}

async function patchWithZip(zip: JSZip, path: string, input: ExportInput, list: Item[], opts: ExportOptions): Promise<string> {
  const doc = parseXml(await zip.file(path)!.async('string'));
  const rows = readCells(doc, await sharedStrings(zip));
  return applyPatch(doc, { headerRow: findHeader(rows) ?? 6, rows }, input, list, opts);
}

function exportList(items: Item[], opts: ExportOptions): Item[] {
  return items
    .filter((i) => !i.deleted)
    .filter((i) => opts.mode === 'full' || opts.keepSold || !i.sold)
    .sort((a, b) => a.id - b.id);
}

export async function buildExport(input: ExportInput, opts: ExportOptions): Promise<ExportResult> {
  const list = exportList(input.items, opts);
  let zip: JSZip;
  let name: string;
  let mime: string;
  if (input.originalFile) {
    zip = await JSZip.loadAsync(input.originalFile);
    name = input.originalName || 'Verkaufsliste.xlsm';
    mime = /\.xlsm$/i.test(name) ? MIME_XLSM : MIME_XLSX;
  } else {
    zip = await freshWorkbook();
    name = 'Verkaufsliste.xlsx';
    mime = MIME_XLSX;
  }
  const path = await sheetPath(zip);
  zip.file(path, await patchWithZip(zip, path, input, list, opts));
  if (opts.mode === 'full') name = name.replace(/(\.[^.]+)$/, '_voll$1');
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: mime });
  return { bytes, filename: name, mime, count: list.length };
}

// ---- minimal workbook used when the user never imported a template ----
const INSTRUCTIONS =
  'Bitte befülle diese "Liste" mit den Artikeln, welche du verkaufen möchtest.\nWichtig: Jeder Artikel benötigt eine Artikelnummer, einen Titel und einen Verkaufspreis!';

function istr(ref: string, text: string, s = 0): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<c r="${ref}"${s ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${esc}</t></is></c>`;
}

async function freshWorkbook(): Promise<JSZip> {
  const z = new JSZip();
  z.file('[Content_Types].xml', `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  z.file('_rels/.rels', `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file('xl/workbook.xml', `${XML_DECL}<workbook xmlns="${NS}" xmlns:r="${R_NS}"><sheets><sheet name="Verkaufsliste" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file('xl/styles.xml', `${XML_DECL}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`);
  z.file(
    'xl/worksheets/sheet1.xml',
    `${XML_DECL}<worksheet xmlns="${NS}" xmlns:r="${R_NS}"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="16.72" customWidth="1"/><col min="2" max="2" width="36.86" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="13.29" customWidth="1"/></cols><sheetData>` +
      `<row r="1">${istr('A1', 'Name:', 1)}</row><row r="2">${istr('A2', 'Telefonnummer:', 1)}</row><row r="3">${istr('A3', INSTRUCTIONS)}</row><row r="4"/><row r="5"/>` +
      `<row r="6">${istr('A6', 'Art. Nr', 1)}${istr('B6', 'Titel', 1)}${istr('C6', 'Medium', 1)}${istr('D6', 'Verkaufspreis', 1)}</row>` +
      `</sheetData><mergeCells count="1"><mergeCell ref="A3:D5"/></mergeCells></worksheet>`,
  );
  return z;
}
