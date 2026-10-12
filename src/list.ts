import { importFlow } from './actions';
import { clear, fold, h, toast } from './dom';
import { fmtPrice, t } from './i18n';
import type { Store } from './store';
import type { Item } from './types';

type StatusFilter = 'all' | 'available' | 'sold';

export class ListView {
  el: HTMLElement;
  private q = '';
  private status: StatusFilter = 'all';
  private medium = '';
  private search: HTMLInputElement;
  private stats = h('div', { class: 'stats' });
  private chips = h('div', { class: 'chips', role: 'toolbar' });
  private mediumChips = h('div', { class: 'chips' });
  private banner = h('div', { class: 'banner-slot' });
  private ul = h('ul', { class: 'items' });
  private empty = h('div', { class: 'empty' });

  constructor(private store: Store) {
    this.search = h('input', {
      type: 'search',
      class: 'search',
      placeholder: t('list.search'),
      inputmode: 'search',
      enterkeyhint: 'search',
      autocomplete: 'off',
      'aria-label': t('list.search'),
      oninput: () => {
        this.q = this.search.value;
        this.renderItems();
      },
    });
    this.ul.addEventListener('click', (e) => this.onClick(e));
    this.el = h(
      'section',
      { class: 'view list-view' },
      h('header', { class: 'top' }, h('h1', null, t('app.title')), this.stats, this.search, this.chips, this.mediumChips),
      this.banner,
      this.ul,
      this.empty,
    );
    store.subscribe(() => this.render());
    this.render();
  }

  /** Re-translate static text after a language switch. */
  retranslate() {
    this.el.querySelector('h1')!.textContent = t('app.title');
    this.search.placeholder = t('list.search');
    this.render();
  }

  private render() {
    this.renderChrome();
    this.renderItems();
  }

  private renderChrome() {
    const all = this.store.active();
    const sold = all.filter((i) => i.sold);
    const sum = sold.reduce((a, i) => a + i.price, 0);
    this.stats.textContent = all.length ? t('list.stats', { n: all.length, a: all.length - sold.length, s: sold.length, sum: fmtPrice(sum) }) : '';

    clear(this.chips);
    const st: [StatusFilter, string][] = [['all', t('list.all')], ['available', t('list.available')], ['sold', t('list.sold')]];
    for (const [k, label] of st) {
      this.chips.appendChild(h('button', { class: `chip ${this.status === k ? 'on' : ''}`, 'aria-pressed': String(this.status === k), onclick: () => { this.status = k; this.render(); } }, label));
    }
    clear(this.mediumChips);
    const counts = new Map<string, number>();
    for (const i of all) if (i.medium) counts.set(i.medium, (counts.get(i.medium) ?? 0) + 1);
    if (counts.size > 1) {
      if (this.medium && !counts.has(this.medium)) this.medium = '';
      const mk = (value: string, label: string) =>
        h('button', { class: `chip alt ${this.medium === value ? 'on' : ''}`, 'aria-pressed': String(this.medium === value), onclick: () => { this.medium = value; this.render(); } }, label);
      this.mediumChips.appendChild(mk('', t('list.allMediums')));
      for (const m of this.store.mediums()) this.mediumChips.appendChild(mk(m, `${m} ${counts.get(m)}`));
    }

    clear(this.banner);
    const n = this.store.meta.changes;
    if (all.length && n > 0) {
      this.banner.appendChild(
        h(
          'div',
          { class: 'banner' },
          h('span', null, t(this.store.meta.lastExportAt ? 'list.dirty' : 'list.dirtyNever', { n })),
          h('a', { href: '#/settings', class: 'banner-link' }, t('list.export')),
        ),
      );
    }
  }

  private filtered(): Item[] {
    let items = this.store.active();
    if (this.status === 'available') items = items.filter((i) => !i.sold);
    if (this.status === 'sold') items = items.filter((i) => i.sold);
    if (this.medium) items = items.filter((i) => i.medium === this.medium);
    const q = this.q.trim();
    if (!q) return items;
    if (/^\d+$/.test(q)) {
      const n = Number(q);
      const hit = (i: Item) => String(i.id).startsWith(q) || fold(i.title).includes(q);
      return items.filter(hit).sort((a, b) => Number(b.id === n) - Number(a.id === n) || a.id - b.id);
    }
    const tokens = fold(q).split(/\s+/).filter(Boolean);
    return items.filter((i) => {
      const hay = fold(`${i.title} ${i.medium}`);
      return tokens.every((tok) => hay.includes(tok));
    });
  }

  private renderItems() {
    const items = this.filtered();
    clear(this.ul);
    clear(this.empty);
    const total = this.store.items.size;
    if (total === 0) {
      append2(this.empty, [
        h('h2', null, t('list.emptyTitle')),
        h('p', null, t('list.emptyText')),
        h('button', { class: 'btn primary', onclick: () => importFlow(this.store) }, t('list.import')),
        h('a', { class: 'btn plain', href: '#/new' }, t('list.addFirst')),
      ]);
    } else if (items.length === 0) {
      append2(this.empty, [h('p', null, t('list.none'))]);
    }
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(this.row(it));
    this.ul.appendChild(frag);
  }

  private row(it: Item): HTMLElement {
    return h(
      'li',
      { class: `row ${it.sold ? 'sold' : ''}`, 'data-id': it.id },
      h('div', { class: 'idb' }, String(it.id)),
      h(
        'div',
        { class: 'main' },
        h('div', { class: 'title' }, it.title),
        h('div', { class: 'meta' }, it.medium && h('span', { class: 'tag' }, it.medium), it.sold && h('span', { class: 'tag soldtag' }, t('list.sold'))),
      ),
      h('div', { class: 'price' }, `${fmtPrice(it.price)} €`),
      h('button', { class: `check ${it.sold ? 'on' : ''}`, 'data-act': 'sold', 'aria-label': it.sold ? t('row.markUnsold') : t('row.markSold'), 'aria-pressed': String(it.sold) }, '✓'),
    );
  }

  private async onClick(e: Event) {
    const target = e.target as HTMLElement;
    const li = target.closest('li.row') as HTMLElement | null;
    if (!li) return;
    const id = Number(li.dataset.id);
    if (target.closest('[data-act="sold"]')) {
      const it = this.store.items.get(id);
      if (!it) return;
      const nowSold = !it.sold;
      await this.store.update(id, { sold: nowSold });
      toast(t(nowSold ? 'toast.sold' : 'toast.unsold', { id }), { label: t('toast.undo'), run: () => void this.store.update(id, { sold: !nowSold }) });
      return;
    }
    location.hash = `#/edit/${id}`;
  }
}

function append2(el: HTMLElement, kids: HTMLElement[]) {
  for (const k of kids) el.appendChild(k);
}
