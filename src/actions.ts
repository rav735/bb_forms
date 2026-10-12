import { h, modal, toast } from './dom';
import { fmtWhen, t } from './i18n';
import type { Store } from './store';
import { buildExport, parseWorkbook, type ExportOptions } from './xlsx';

/** Ask the browser not to evict our data (best effort). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    /* ignore */
  }
  return false;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export async function importFlow(store: Store): Promise<boolean> {
  const file = await pickFile('.xlsm,.xlsx,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!file) return false;
  const buf = await file.arrayBuffer();
  let parsed;
  try {
    parsed = await parseWorkbook(buf);
  } catch (e) {
    toast(e instanceof Error && e.message === 'NO_HEADER' ? t('imp.failHeader') : t('imp.fail'));
    return false;
  }
  const ids = parsed.items.map((i) => i.id);
  const body = [
    h('p', null, t('imp.summary', { n: parsed.items.length, min: ids.length ? Math.min(...ids) : 0, max: ids.length ? Math.max(...ids) : 0 })),
    parsed.mediumFixes > 0 && h('p', null, t('imp.fixed', { n: parsed.mediumFixes })),
    parsed.warnings.length > 0 && h('div', null, h('p', null, t('imp.warnings', { n: parsed.warnings.length })), h('ul', { class: 'warn' }, parsed.warnings.slice(0, 6).map((w) => h('li', null, w)))),
  ];
  const existing = [...store.items.values()].length;
  let mode: 'replace' | 'add-missing';
  if (existing === 0) {
    const r = await modal(t('imp.title'), body, [
      { label: t('imp.go'), kind: 'primary', value: 'replace' },
      { label: t('imp.cancel'), value: 'cancel' },
    ]);
    if (r === 'cancel') return false;
    mode = 'replace';
  } else {
    body.push(h('p', null, t('imp.existing', { n: existing })));
    const r = await modal(t('imp.title'), body, [
      { label: t('imp.addMissing'), hint: t('imp.addMissingHint'), kind: 'primary', value: 'add-missing' },
      { label: t('imp.replace'), hint: t('imp.replaceHint'), kind: 'danger', value: 'replace' },
      { label: t('imp.cancel'), value: 'cancel' },
    ]);
    if (r === 'cancel') return false;
    mode = r as 'replace' | 'add-missing';
  }
  const res = await store.importSheet(parsed, { name: file.name, buf }, mode);
  void requestPersistence();
  toast(res.skipped ? t('imp.doneSkip', { n: res.added, s: res.skipped }) : t('imp.done', { n: res.added }));
  return true;
}

export async function exportFlow(store: Store, opts: ExportOptions, how: 'share' | 'save'): Promise<void> {
  const res = await buildExport(
    {
      originalFile: store.meta.originalFile,
      originalName: store.meta.originalName,
      items: [...store.items.values()],
      sellerName: store.meta.sellerName,
      sellerPhone: store.meta.sellerPhone,
    },
    opts,
  );
  const file = new File([res.bytes as BlobPart], res.filename, { type: res.mime });
  if (how === 'share') {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: res.filename });
        await store.recordExport();
        toast(t('set.exported', { n: res.count }));
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // user closed the share sheet
      }
    }
    toast(t('set.shareFail'));
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: res.filename, style: 'display:none' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  await store.recordExport();
  if (how === 'save') toast(t('set.exported', { n: res.count }));
}

export function lastExportText(store: Store): string {
  return store.meta.lastExportAt ? t('set.lastExport', { when: fmtWhen(store.meta.lastExportAt) }) : t('set.neverExported');
}
