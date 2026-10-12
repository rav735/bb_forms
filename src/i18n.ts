type Dict = Record<string, string>;

const de: Dict = {
  'app.title': 'Verkaufsliste',
  'nav.list': 'Liste',
  'nav.new': 'Neu',
  'nav.settings': 'Mehr',
  'list.search': 'Suchen oder Nr. eingeben',
  'list.all': 'Alle',
  'list.available': 'Verfügbar',
  'list.sold': 'Verkauft',
  'list.allMediums': 'Alle Medien',
  'list.stats': '{n} Artikel · {a} verfügbar · {s} verkauft ({sum} €)',
  'list.none': 'Keine Treffer.',
  'list.emptyTitle': 'Noch keine Artikel',
  'list.emptyText': 'Importiere deine Excel-Liste oder lege Artikel von Hand an.',
  'list.import': 'Excel importieren',
  'list.addFirst': 'Artikel anlegen',
  'list.dirty': '{n} Änderung(en) seit dem letzten Export',
  'list.dirtyNever': '{n} Änderung(en) – noch nie exportiert',
  'list.export': 'Exportieren',
  'row.markSold': 'Als verkauft markieren',
  'row.markUnsold': 'Verkauf rückgängig',
  'toast.sold': 'Nr. {id} als verkauft markiert',
  'toast.unsold': 'Nr. {id} wieder verfügbar',
  'toast.deleted': 'Nr. {id} gelöscht',
  'toast.restored': 'Nr. {id} wiederhergestellt',
  'toast.saved': 'Nr. {id} gespeichert',
  'toast.undo': 'Rückgängig',
  'form.newTitle': 'Neuer Artikel',
  'form.editTitle': 'Artikel {id}',
  'form.id': 'Artikelnummer (= Etikett)',
  'form.idHint': 'Nächste freie Nummer: {n}. Nur ändern, wenn das Etikett schon vergeben ist.',
  'form.idLocked': 'Die Nummer kann nicht geändert werden.',
  'form.title': 'Titel',
  'form.medium': 'Medium',
  'form.price': 'Verkaufspreis',
  'form.sold': 'Verkauft',
  'form.save': 'Speichern',
  'form.saveNext': 'Speichern & nächster',
  'form.delete': 'Löschen',
  'form.restore': 'Wiederherstellen',
  'form.deletedBanner': 'Dieser Artikel ist gelöscht. Die Nummer bleibt reserviert.',
  'form.confirmDelete': 'Nr. {id} wirklich löschen? Die Nummer bleibt reserviert, du kannst den Artikel wiederherstellen.',
  'err.id-invalid': 'Bitte eine ganze Zahl ab 1 eingeben.',
  'err.id-exists': 'Diese Nummer ist schon vergeben.',
  'err.id-deleted': 'Diese Nummer gehört zu einem gelöschten Artikel (unter Mehr → Papierkorb wiederherstellen).',
  'err.title-required': 'Bitte einen Titel eingeben.',
  'err.price-invalid': 'Bitte einen gültigen Preis eingeben.',
  'set.title': 'Mehr',
  'set.seller': 'Verkäufer',
  'set.name': 'Name',
  'set.phone': 'Telefonnummer',
  'set.sellerHint': 'Wird beim Export in die Zellen B1/B2 geschrieben (leer = Original bleibt).',
  'set.import': 'Import',
  'set.importBtn': 'Excel-Datei wählen…',
  'set.importHint': 'Die Artikelnummern aus der Datei bleiben unverändert.',
  'set.export': 'Export',
  'set.modeOrganizer': 'Für den Veranstalter',
  'set.modeOrganizerHint': 'Spalten A–D, exakt wie die Vorlage.',
  'set.modeFull': 'Komplett (mit Status)',
  'set.modeFullHint': 'Zusätzliche Spalte „Status“ mit verkauft.',
  'set.keepSold': 'Verkaufte Artikel in der Liste behalten',
  'set.share': 'Teilen…',
  'set.saveFile': 'Auf dem Handy speichern',
  'set.lastExport': 'Letzter Export: {when}',
  'set.neverExported': 'Noch nie exportiert.',
  'set.shareFail': 'Teilen wird hier nicht unterstützt – Datei wurde heruntergeladen.',
  'set.exported': 'Exportiert ({n} Artikel)',
  'set.trash': 'Papierkorb',
  'set.trashEmpty': 'Leer.',
  'set.data': 'Daten',
  'set.storagePersistent': 'Speicher: dauerhaft (wird vom Browser nicht automatisch gelöscht).',
  'set.storageNormal': 'Speicher: Browser-Standard. Exportiere regelmäßig, um nichts zu verlieren.',
  'set.wipe': 'Alle Daten löschen',
  'set.wipeConfirm': 'Wirklich ALLE Artikel und Einstellungen von diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.',
  'set.language': 'Sprache',
  'set.version': 'Version {v}',
  'imp.title': 'Import',
  'imp.summary': '{n} Artikel gefunden (Nr. {min}–{max}).',
  'imp.fixed': '{n} Medium korrigiert (z. B. überflüssige Zeichen entfernt).',
  'imp.warnings': '{n} Hinweis(e):',
  'imp.existing': 'Es sind schon {n} Artikel in der App.',
  'imp.addMissing': 'Nur fehlende hinzufügen',
  'imp.addMissingHint': 'Bestehende Artikel (auch verkaufte/gelöschte) bleiben unverändert.',
  'imp.replace': 'Alles ersetzen',
  'imp.replaceHint': 'Löscht den aktuellen Stand, inkl. „verkauft“-Markierungen.',
  'imp.go': 'Importieren',
  'imp.cancel': 'Abbrechen',
  'imp.done': '{n} Artikel importiert',
  'imp.doneSkip': '{n} importiert, {s} übersprungen',
  'imp.failHeader': 'In der Datei wurde keine Tabelle mit der Spalte „Art. Nr“ gefunden.',
  'imp.fail': 'Die Datei konnte nicht gelesen werden.',
  'common.cancel': 'Abbrechen',
  'common.ok': 'OK',
  'common.back': 'Zurück',
  'just.now': 'gerade eben',
};

const en: Dict = {
  'app.title': 'Sales list',
  'nav.list': 'List',
  'nav.new': 'New',
  'nav.settings': 'More',
  'list.search': 'Search or type an item no.',
  'list.all': 'All',
  'list.available': 'Available',
  'list.sold': 'Sold',
  'list.allMediums': 'All media',
  'list.stats': '{n} items · {a} available · {s} sold (€ {sum})',
  'list.none': 'No matches.',
  'list.emptyTitle': 'No items yet',
  'list.emptyText': 'Import your Excel list or add items by hand.',
  'list.import': 'Import Excel',
  'list.addFirst': 'Add an item',
  'list.dirty': '{n} change(s) since the last export',
  'list.dirtyNever': '{n} change(s) – never exported',
  'list.export': 'Export',
  'row.markSold': 'Mark as sold',
  'row.markUnsold': 'Undo sale',
  'toast.sold': 'No. {id} marked as sold',
  'toast.unsold': 'No. {id} available again',
  'toast.deleted': 'No. {id} deleted',
  'toast.restored': 'No. {id} restored',
  'toast.saved': 'No. {id} saved',
  'toast.undo': 'Undo',
  'form.newTitle': 'New item',
  'form.editTitle': 'Item {id}',
  'form.id': 'Item number (= label)',
  'form.idHint': 'Next free number: {n}. Only change it if the label is already taken.',
  'form.idLocked': 'The number cannot be changed.',
  'form.title': 'Title',
  'form.medium': 'Medium',
  'form.price': 'Price',
  'form.sold': 'Sold',
  'form.save': 'Save',
  'form.saveNext': 'Save & next',
  'form.delete': 'Delete',
  'form.restore': 'Restore',
  'form.deletedBanner': 'This item is deleted. Its number stays reserved.',
  'form.confirmDelete': 'Really delete no. {id}? The number stays reserved and you can restore the item.',
  'err.id-invalid': 'Enter a whole number, 1 or higher.',
  'err.id-exists': 'This number is already in use.',
  'err.id-deleted': 'This number belongs to a deleted item (restore it under More → Trash).',
  'err.title-required': 'Please enter a title.',
  'err.price-invalid': 'Please enter a valid price.',
  'set.title': 'More',
  'set.seller': 'Seller',
  'set.name': 'Name',
  'set.phone': 'Phone number',
  'set.sellerHint': 'Written to cells B1/B2 on export (empty = keep the original).',
  'set.import': 'Import',
  'set.importBtn': 'Choose Excel file…',
  'set.importHint': 'Item numbers from the file are kept unchanged.',
  'set.export': 'Export',
  'set.modeOrganizer': 'For the organizer',
  'set.modeOrganizerHint': 'Columns A–D, exactly like the template.',
  'set.modeFull': 'Full (with status)',
  'set.modeFullHint': 'Adds a "Status" column showing sold items.',
  'set.keepSold': 'Keep sold items in the list',
  'set.share': 'Share…',
  'set.saveFile': 'Save to phone',
  'set.lastExport': 'Last export: {when}',
  'set.neverExported': 'Never exported.',
  'set.shareFail': 'Sharing is not supported here – the file was downloaded instead.',
  'set.exported': 'Exported ({n} items)',
  'set.trash': 'Trash',
  'set.trashEmpty': 'Empty.',
  'set.data': 'Data',
  'set.storagePersistent': 'Storage: persistent (the browser will not clear it automatically).',
  'set.storageNormal': 'Storage: browser default. Export regularly so nothing gets lost.',
  'set.wipe': 'Delete all data',
  'set.wipeConfirm': 'Really delete ALL items and settings from this device? This cannot be undone.',
  'set.language': 'Language',
  'set.version': 'Version {v}',
  'imp.title': 'Import',
  'imp.summary': '{n} items found (no. {min}–{max}).',
  'imp.fixed': '{n} medium corrected (stray characters removed).',
  'imp.warnings': '{n} note(s):',
  'imp.existing': 'The app already holds {n} items.',
  'imp.addMissing': 'Add missing only',
  'imp.addMissingHint': 'Existing items (even sold/deleted ones) stay unchanged.',
  'imp.replace': 'Replace everything',
  'imp.replaceHint': 'Wipes the current state, including sold marks.',
  'imp.go': 'Import',
  'imp.cancel': 'Cancel',
  'imp.done': '{n} items imported',
  'imp.doneSkip': '{n} imported, {s} skipped',
  'imp.failHeader': 'No table with an "Art. Nr" column was found in the file.',
  'imp.fail': 'The file could not be read.',
  'common.cancel': 'Cancel',
  'common.ok': 'OK',
  'common.back': 'Back',
  'just.now': 'just now',
};

const dicts: Record<string, Dict> = { de, en };
let lang = 'de';

export function initLang() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('lang');
  } catch {
    /* ignore */
  }
  lang = saved && dicts[saved] ? saved : navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
  document.documentElement.lang = lang;
}

export function getLang() {
  return lang;
}

export function setLang(l: string) {
  lang = dicts[l] ? l : 'de';
  try {
    localStorage.setItem('lang', lang);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang;
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  let s = dicts[lang][key] ?? de[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function fmtPrice(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(2).replace('.', lang === 'de' ? ',' : '.');
}

export function fmtWhen(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return t('just.now');
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
}
