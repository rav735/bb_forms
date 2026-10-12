import { Db } from './db';
import type { AddError, Item, Meta, ParsedSheet, Result } from './types';

const EMPTY_META: Meta = { maxId: 0, sellerName: '', sellerPhone: '', changes: 0 };

export interface NewItemInput {
  /** Optional. Defaults to the next number after the highest ever issued. */
  id?: number;
  title: string;
  medium: string;
  price: number;
  sold?: boolean;
}

export type ImportMode = 'replace' | 'add-missing';

/**
 * Single source of truth. Rules that protect the physical labels:
 *  - an ID can never be edited after the item exists;
 *  - deleting only hides an item (the ID stays reserved);
 *  - marking sold only flips a flag;
 *  - automatic IDs come from a counter that only ever goes up.
 */
export class Store {
  items = new Map<number, Item>();
  meta: Meta = { ...EMPTY_META };
  private listeners = new Set<() => void>();

  private constructor(private db: Db) {}

  static async open(dbName?: string): Promise<Store> {
    const s = new Store(await Db.open(dbName));
    const { items, meta } = await s.db.load();
    for (const it of items) s.items.set(it.id, it);
    s.meta = { ...EMPTY_META, ...meta };
    // The counter can never be lower than any ID that exists.
    for (const id of s.items.keys()) if (id > s.meta.maxId) s.meta.maxId = id;
    return s;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  // ---- queries -----------------------------------------------------------
  nextId(): number {
    return this.meta.maxId + 1;
  }

  active(): Item[] {
    return [...this.items.values()].filter((i) => !i.deleted).sort((a, b) => a.id - b.id);
  }

  trashed(): Item[] {
    return [...this.items.values()].filter((i) => i.deleted).sort((a, b) => a.id - b.id);
  }

  /** Mediums ordered by how often they are used. */
  mediums(): string[] {
    const n = new Map<string, number>();
    for (const i of this.items.values()) if (!i.deleted && i.medium) n.set(i.medium, (n.get(i.medium) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
  }

  // ---- mutations ---------------------------------------------------------
  private async save(putItems: Item[], metaPatch: Partial<Meta> = {}, countAsChange = true) {
    const meta: Partial<Meta> = { ...metaPatch };
    if (countAsChange) meta.changes = this.meta.changes + 1;
    await this.db.commit({ putItems, meta });
    for (const it of putItems) this.items.set(it.id, it);
    Object.assign(this.meta, meta);
    this.emit();
  }

  async add(input: NewItemInput): Promise<Result<Item>> {
    // Validate in the same top-to-bottom order as the form: ID, title, price.
    const id = input.id ?? this.nextId();
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: 'id-invalid' };
    const existing = this.items.get(id);
    if (existing) return { ok: false, error: existing.deleted ? 'id-deleted' : 'id-exists' };
    const title = input.title.trim();
    if (!title) return { ok: false, error: 'title-required' };
    if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, error: 'price-invalid' };
    const now = Date.now();
    const item: Item = {
      id,
      title,
      medium: input.medium.trim(),
      price: input.price,
      sold: !!input.sold,
      deleted: false,
      soldAt: input.sold ? now : undefined,
      updatedAt: now,
    };
    await this.save([item], { maxId: Math.max(this.meta.maxId, id) });
    return { ok: true, value: item };
  }

  async update(id: number, patch: Partial<Pick<Item, 'title' | 'medium' | 'price' | 'sold'>>): Promise<Result<Item>> {
    const cur = this.items.get(id);
    if (!cur) return { ok: false, error: 'id-invalid' };
    const next: Item = { ...cur, updatedAt: Date.now() };
    if (patch.title !== undefined) {
      next.title = patch.title.trim();
      if (!next.title) return { ok: false, error: 'title-required' };
    }
    if (patch.medium !== undefined) next.medium = patch.medium.trim();
    if (patch.price !== undefined) {
      if (!Number.isFinite(patch.price) || patch.price < 0) return { ok: false, error: 'price-invalid' };
      next.price = patch.price;
    }
    if (patch.sold !== undefined && patch.sold !== cur.sold) {
      next.sold = patch.sold;
      next.soldAt = patch.sold ? Date.now() : undefined;
    }
    await this.save([next]);
    return { ok: true, value: next };
  }

  async remove(id: number): Promise<void> {
    const cur = this.items.get(id);
    if (cur && !cur.deleted) await this.save([{ ...cur, deleted: true, updatedAt: Date.now() }]);
  }

  async restore(id: number): Promise<void> {
    const cur = this.items.get(id);
    if (cur?.deleted) await this.save([{ ...cur, deleted: false, updatedAt: Date.now() }]);
  }

  /**
   * Apply one operation to many items in a single transaction (one undo step, one change).
   * IDs are never touched: 'delete' only hides, 'sold'/'unsold' only flip the flag.
   * Returns the IDs that actually changed (use them for undo).
   */
  async bulk(ids: number[], op: 'delete' | 'restore' | 'sold' | 'unsold'): Promise<number[]> {
    const now = Date.now();
    const changed: Item[] = [];
    for (const id of new Set(ids)) {
      const cur = this.items.get(id);
      if (!cur) continue;
      if (op === 'delete' && !cur.deleted) changed.push({ ...cur, deleted: true, updatedAt: now });
      else if (op === 'restore' && cur.deleted) changed.push({ ...cur, deleted: false, updatedAt: now });
      else if (op === 'sold' && !cur.deleted && !cur.sold) changed.push({ ...cur, sold: true, soldAt: now, updatedAt: now });
      else if (op === 'unsold' && !cur.deleted && cur.sold) changed.push({ ...cur, sold: false, soldAt: undefined, updatedAt: now });
    }
    if (changed.length) await this.save(changed);
    return changed.map((i) => i.id);
  }

  async setSeller(name: string, phone: string): Promise<void> {
    await this.save([], { sellerName: name.trim(), sellerPhone: phone.trim() }, false);
  }

  async recordExport(): Promise<void> {
    await this.save([], { lastExportAt: Date.now(), changes: 0 }, false);
  }

  /**
   * Import a parsed sheet. IDs from the sheet are kept as they are.
   *  - 'replace': everything is replaced (the counter still never goes down).
   *  - 'add-missing': only IDs this app has never seen are added; nothing existing is touched.
   */
  async importSheet(parsed: ParsedSheet, file: { name: string; buf: ArrayBuffer }, mode: ImportMode): Promise<{ added: number; skipped: number }> {
    const now = Date.now();
    const seen = new Set<number>();
    const unique = parsed.items.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    let toPut: Item[];
    let skipped = 0;
    if (mode === 'replace') {
      toPut = unique.map((p) => ({ ...p, sold: false, deleted: false, updatedAt: now }));
    } else {
      toPut = [];
      for (const p of unique) {
        if (this.items.has(p.id)) skipped++;
        else toPut.push({ ...p, sold: false, deleted: false, updatedAt: now });
      }
    }
    const maxId = Math.max(this.meta.maxId, ...unique.map((p) => p.id), 0);
    const meta: Partial<Meta> = {
      maxId,
      originalFile: file.buf,
      originalName: file.name,
      importedAt: now,
      changes: mode === 'replace' ? 0 : this.meta.changes + (toPut.length ? 1 : 0),
    };
    if (mode === 'replace' || !this.meta.sellerName) meta.sellerName = parsed.sellerName;
    if (mode === 'replace' || !this.meta.sellerPhone) meta.sellerPhone = parsed.sellerPhone;

    await this.db.commit({ clearItems: mode === 'replace', putItems: toPut, meta });
    if (mode === 'replace') this.items.clear();
    for (const it of toPut) this.items.set(it.id, it);
    Object.assign(this.meta, meta);
    this.emit();
    return { added: toPut.length, skipped };
  }

  async wipe(): Promise<void> {
    await this.db.wipe();
    this.items.clear();
    this.meta = { ...EMPTY_META };
    this.emit();
  }

  close() {
    this.db.close();
  }
}

export function errorKey(e: AddError): string {
  return `err.${e}`;
}
