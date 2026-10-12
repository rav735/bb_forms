export interface Item {
  /** Immutable. Matches the physical label on the item. */
  id: number;
  title: string;
  medium: string;
  price: number;
  sold: boolean;
  /** Soft delete: the row is hidden but its ID stays reserved. */
  deleted: boolean;
  soldAt?: number;
  updatedAt: number;
}

export interface ParsedItem {
  id: number;
  title: string;
  medium: string;
  price: number;
}

export interface ParsedSheet {
  items: ParsedItem[];
  sellerName: string;
  sellerPhone: string;
  warnings: string[];
  mediumFixes: number;
  /** Rows that had an item number but no name; they are not imported. */
  skippedNoName: number;
}

export interface Meta {
  /** Highest ID ever issued. Never decreases, so numbers are never reused. */
  maxId: number;
  sellerName: string;
  sellerPhone: string;
  originalFile?: ArrayBuffer;
  originalName?: string;
  importedAt?: number;
  lastExportAt?: number;
  /** Number of edits since the last export (drives the reminder banner). */
  changes: number;
}

export type AddError = 'id-invalid' | 'id-exists' | 'id-deleted' | 'title-required' | 'price-invalid';
export type Result<T> = { ok: true; value: T } | { ok: false; error: AddError };
