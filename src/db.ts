import type { Item, Meta } from './types';

const ITEMS = 'items';
const META = 'meta';

export interface Commit {
  clearItems?: boolean;
  putItems?: Item[];
  meta?: Partial<Meta>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export class Db {
  private constructor(private db: IDBDatabase) {}

  static open(name = 'verkaufsliste'): Promise<Db> {
    return new Promise((res, rej) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore(ITEMS, { keyPath: 'id' });
        r.result.createObjectStore(META, { keyPath: 'key' });
      };
      r.onsuccess = () => res(new Db(r.result));
      r.onerror = () => rej(r.error);
    });
  }

  async load(): Promise<{ items: Item[]; meta: Partial<Meta> }> {
    const tx = this.db.transaction([ITEMS, META], 'readonly');
    const items = await req<Item[]>(tx.objectStore(ITEMS).getAll());
    const rows = await req<{ key: string; value: unknown }[]>(tx.objectStore(META).getAll());
    const meta: Record<string, unknown> = {};
    for (const r of rows) meta[r.key] = r.value;
    return { items, meta: meta as Partial<Meta> };
  }

  /** Writes items and meta in ONE transaction, so the ID counter and the rows never disagree. */
  commit(c: Commit): Promise<void> {
    return new Promise((res, rej) => {
      const tx = this.db.transaction([ITEMS, META], 'readwrite');
      const items = tx.objectStore(ITEMS);
      const meta = tx.objectStore(META);
      if (c.clearItems) items.clear();
      for (const it of c.putItems ?? []) items.put(it);
      for (const [key, value] of Object.entries(c.meta ?? {})) meta.put({ key, value });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  }

  async wipe(): Promise<void> {
    await new Promise<void>((res, rej) => {
      const tx = this.db.transaction([ITEMS, META], 'readwrite');
      tx.objectStore(ITEMS).clear();
      tx.objectStore(META).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  close() {
    this.db.close();
  }
}
