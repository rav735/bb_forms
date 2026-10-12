import { exportFlow, importFlow, lastExportText, requestPersistence } from './actions';
import { clear, h, modal, toast } from './dom';
import { getLang, setLang, t, fmtPrice } from './i18n';
import { goBack } from './nav';
import type { Store } from './store';

declare const __VERSION__: string;

export class SettingsView {
  el = h('section', { class: 'view settings-view', hidden: true });
  private mode: 'organizer' | 'full' = 'organizer';
  private keepSold = true;
  private busy = false;

  constructor(private store: Store, private onLang: () => void) {
    store.subscribe(() => {
      if (!this.el.hidden && !this.el.contains(document.activeElement as Node)) this.render();
    });
  }

  render() {
    const s = this.store;
    clear(this.el);
    this.el.appendChild(
      h('header', { class: 'top bar' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.back'), onclick: goBack }, '‹'), h('h1', null, t('set.title'))),
    );

    const name = h('input', { type: 'text', value: s.meta.sellerName, autocomplete: 'name', onchange: () => save() });
    const phone = h('input', { type: 'tel', value: s.meta.sellerPhone, autocomplete: 'tel', onchange: () => save() });
    const save = () => void s.setSeller(name.value, phone.value);

    const radio = (value: 'organizer' | 'full', label: string, hint: string) =>
      h(
        'label',
        { class: `choice ${this.mode === value ? 'on' : ''}` },
        h('input', { type: 'radio', name: 'mode', value, checked: this.mode === value, onchange: () => { this.mode = value; this.render(); } }),
        h('span', null, h('b', null, label), h('small', null, hint)),
      );

    const busyWrap = (fn: () => Promise<void>) => async () => {
      if (this.busy) return;
      this.busy = true;
      try {
        await fn();
      } catch (e) {
        toast(String(e));
      } finally {
        this.busy = false;
        this.render();
      }
    };

    const opts = () => ({ mode: this.mode, keepSold: this.keepSold });
    const storageLine = h('p', { class: 'hint' }, '');
    void (async () => {
      const p = (await navigator.storage?.persisted?.()) ?? false;
      storageLine.textContent = p ? t('set.storagePersistent') : t('set.storageNormal');
    })();

    const trash = s.trashed();

    this.el.appendChild(
      h(
        'div',
        { class: 'cards' },
        h('div', { class: 'card' }, h('h2', null, t('set.seller')), h('label', null, t('set.name')), name, h('label', null, t('set.phone')), phone, h('p', { class: 'hint' }, t('set.sellerHint'))),
        h(
          'div',
          { class: 'card' },
          h('h2', null, t('set.import')),
          h('button', { class: 'btn primary', onclick: busyWrap(async () => { await importFlow(s); }) }, t('set.importBtn')),
          h('p', { class: 'hint' }, t('set.importHint')),
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', null, t('set.export')),
          radio('organizer', t('set.modeOrganizer'), t('set.modeOrganizerHint')),
          radio('full', t('set.modeFull'), t('set.modeFullHint')),
          this.mode === 'organizer' &&
            h('label', { class: 'check-row' }, h('input', { type: 'checkbox', checked: this.keepSold, onchange: (e: Event) => { this.keepSold = (e.target as HTMLInputElement).checked; } }), h('span', null, t('set.keepSold'))),
          h(
            'div',
            { class: 'actions' },
            h('button', { class: 'btn primary', onclick: busyWrap(() => exportFlow(s, opts(), 'share')) }, t('set.share')),
            h('button', { class: 'btn plain', onclick: busyWrap(() => exportFlow(s, opts(), 'save')) }, t('set.saveFile')),
          ),
          h('p', { class: 'hint' }, lastExportText(s)),
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', null, `${t('set.trash')}${trash.length ? ` (${trash.length})` : ''}`),
          trash.length === 0
            ? h('p', { class: 'hint' }, t('set.trashEmpty'))
            : h(
                'ul',
                { class: 'trash' },
                trash.map((it) =>
                  h(
                    'li',
                    null,
                    h('span', { class: 'idb sm' }, String(it.id)),
                    h('span', { class: 'grow' }, `${it.title} · ${fmtPrice(it.price)} €`),
                    h('button', { class: 'btn plain sm', onclick: async () => { await s.restore(it.id); toast(t('toast.restored', { id: it.id })); } }, t('form.restore')),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', null, t('set.data')),
          storageLine,
          h('label', null, t('set.language')),
          h(
            'select',
            { onchange: (e: Event) => { setLang((e.target as HTMLSelectElement).value); this.onLang(); } },
            h('option', { value: 'de', selected: getLang() === 'de' }, 'Deutsch'),
            h('option', { value: 'en', selected: getLang() === 'en' }, 'English'),
          ),
          h(
            'button',
            {
              class: 'btn danger-outline',
              onclick: async () => {
                const r = await modal(t('set.wipe'), [h('p', null, t('set.wipeConfirm'))], [
                  { label: t('set.wipe'), kind: 'danger', value: 'yes' },
                  { label: t('common.cancel'), value: 'cancel' },
                ]);
                if (r === 'yes') await s.wipe();
              },
            },
            t('set.wipe'),
          ),
          h('p', { class: 'hint' }, t('set.version', { v: typeof __VERSION__ === 'string' ? __VERSION__ : 'dev' })),
        ),
      ),
    );
    void requestPersistence;
  }
}
