import { clear, h, modal, toast } from './dom';
import { fmtPrice, t } from './i18n';
import { goBack } from './nav';
import type { Store } from './store';
import type { AddError, Item } from './types';

export function parsePrice(s: string): number {
  const x = s.replace(/€/g, '').replace(/\s/g, '').replace(',', '.');
  return x === '' ? NaN : Number(x);
}

export class FormView {
  el = h('section', { class: 'view form-view', hidden: true });
  private lastMedium = '';

  constructor(private store: Store) {}

  /** id === undefined → new item. */
  open(id?: number, opts: { medium?: string } = {}) {
    const store = this.store;
    const existing = id !== undefined ? store.items.get(id) : undefined;
    if (id !== undefined && !existing) {
      location.replace('#/');
      return;
    }
    clear(this.el);

    const isNew = !existing;
    const locked = !!existing?.deleted;
    const idInput = h('input', {
      id: 'f-id',
      type: 'text',
      inputmode: 'numeric',
      pattern: '[0-9]*',
      value: String(existing ? existing.id : store.nextId()),
      disabled: !isNew,
      autocomplete: 'off',
    });
    const title = h('input', { id: 'f-title', type: 'text', value: existing?.title ?? '', autocomplete: 'off', enterkeyhint: 'next', disabled: locked });
    const medium = h('input', { id: 'f-medium', type: 'text', value: existing?.medium ?? opts.medium ?? this.lastMedium, list: 'mediums', autocomplete: 'off', enterkeyhint: 'next', disabled: locked });
    const dl = h('datalist', { id: 'mediums' }, store.mediums().map((m) => h('option', { value: m })));
    const price = h('input', { id: 'f-price', type: 'text', inputmode: 'decimal', value: existing ? fmtPrice(existing.price) : '', autocomplete: 'off', disabled: locked });
    const sold = h('input', { id: 'f-sold', type: 'checkbox', checked: existing?.sold ?? false, disabled: locked });

    const errId = h('p', { class: 'err', id: 'e-id', hidden: true });
    const errTitle = h('p', { class: 'err', id: 'e-title', hidden: true });
    const errPrice = h('p', { class: 'err', id: 'e-price', hidden: true });
    const showErr = (e: AddError) => {
      for (const p of [errId, errTitle, errPrice]) p.hidden = true;
      const [el, key] = e.startsWith('id') ? [errId, e] : e === 'title-required' ? [errTitle, e] : [errPrice, e];
      el.textContent = t(`err.${key}`);
      el.hidden = false;
      el.previousElementSibling?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    };

    const chips = h(
      'div',
      { class: 'chips wrap' },
      store.mediums().slice(0, 8).map((m) => h('button', { type: 'button', class: 'chip alt', disabled: locked, onclick: () => { medium.value = m; } }, m)),
    );

    const collect = () => ({
      title: title.value,
      medium: medium.value,
      price: parsePrice(price.value),
      sold: sold.checked,
    });

    const saveNew = async (andNext: boolean) => {
      const raw = idInput.value.trim();
      const idNum = raw === '' ? store.nextId() : Number(raw);
      const res = await store.add({ id: idNum, ...collect() });
      if (!res.ok) return showErr(res.error);
      this.lastMedium = res.value.medium;
      toast(t('toast.saved', { id: res.value.id }));
      if (andNext) {
        this.open(undefined);
        (this.el.querySelector('#f-title') as HTMLInputElement | null)?.focus();
      } else goBack();
    };

    const saveEdit = async () => {
      const res = await store.update(existing!.id, collect());
      if (!res.ok) return showErr(res.error);
      toast(t('toast.saved', { id: existing!.id }));
      goBack();
    };

    const doDelete = async () => {
      const r = await modal(t('form.delete'), [h('p', null, t('form.confirmDelete', { id: existing!.id }))], [
        { label: t('form.delete'), kind: 'danger', value: 'yes' },
        { label: t('common.cancel'), value: 'cancel' },
      ]);
      if (r !== 'yes') return;
      const delId = existing!.id;
      await store.remove(delId);
      toast(t('toast.deleted', { id: delId }), { label: t('toast.undo'), run: () => void store.restore(delId) });
      goBack();
    };

    const form = h(
      'form',
      {
        class: 'form',
        novalidate: true,
        onsubmit: (e: Event) => {
          e.preventDefault();
          if (locked) return;
          void (isNew ? saveNew(false) : saveEdit());
        },
      },
      locked && h('div', { class: 'banner warn-banner' }, t('form.deletedBanner')),
      h('label', { for: 'f-id' }, t('form.id')),
      h('div', { class: 'idfield' }, idInput),
      errId,
      h('p', { class: 'hint' }, isNew ? t('form.idHint', { n: store.nextId() }) : t('form.idLocked')),
      h('label', { for: 'f-title' }, t('form.title')),
      title,
      errTitle,
      h('label', { for: 'f-medium' }, t('form.medium')),
      medium,
      dl,
      chips,
      h('label', { for: 'f-price' }, t('form.price')),
      h('div', { class: 'pricefield' }, price, h('span', { class: 'suffix' }, '€')),
      errPrice,
      h('label', { class: 'switch', for: 'f-sold' }, sold, h('span', { class: 'slider' }), h('span', { class: 'switch-label' }, t('form.sold'))),
      h(
        'div',
        { class: 'actions' },
        locked
          ? h('button', { type: 'button', class: 'btn primary', onclick: async () => { await store.restore(existing!.id); toast(t('toast.restored', { id: existing!.id })); goBack(); } }, t('form.restore'))
          : [
              h('button', { type: 'submit', class: 'btn primary' }, t('form.save')),
              isNew && h('button', { type: 'button', class: 'btn plain', onclick: () => void saveNew(true) }, t('form.saveNext')),
              !isNew && h('button', { type: 'button', class: 'btn danger-outline', onclick: () => void doDelete() }, t('form.delete')),
            ],
      ),
    );

    this.el.appendChild(
      h(
        'header',
        { class: 'top bar' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('common.back'), onclick: goBack }, '‹'),
        h('h1', null, isNew ? t('form.newTitle') : t('form.editTitle', { id: (existing as Item).id })),
      ),
    );
    this.el.appendChild(form);
    if (isNew) setTimeout(() => title.focus(), 50);
  }
}
