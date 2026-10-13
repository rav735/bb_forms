import { importFlow } from './actions';
import { clear, fold, h, icon, modal, toast } from './dom';
import { fmtPrice, t } from './i18n';
import type { Store } from './store';
import type { Item } from './types';

type StatusFilter = 'all' | 'available' | 'sold';

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 10;

export class ListView {
  el: HTMLElement;
  private q = '';
  private status: StatusFilter = 'all';
  private medium = '';
  private search: HTMLInputElement;
  private title = h('h1', null, t('app.title'));
  private burger = h('button', { class: 'icon-btn burger', type: 'button', 'aria-label': t('menu.open'), onclick: () => this.onMenu() }, icon('menu'));
  private addBtn = h('a', { class: 'icon-btn accent add-btn', href: '#/new', 'aria-label': t('nav.new') }, icon('plus'));
  private selectBtn = h('button', { class: 'chip select-btn', type: 'button', onclick: () => this.enterSelection() }, t('list.select'));
  private titlebar = h('div', { class: 'titlebar' });
  private selTop = h('div', { class: 'seltop', hidden: true });
  private selbar = h('div', { class: 'selbar', hidden: true });
  private stats = h('div', { class: 'stats' });
  private chips = h('div', { class: 'chips', role: 'toolbar' });
  private mediumChips = h('div', { class: 'chips' });
  private banner = h('div', { class: 'banner-slot' });
  private ul = h('ul', { class: 'items' });
  private empty = h('div', { class: 'empty' });

  // ---- selection mode
  private selecting = false;
  private selected = new Set<number>();
  private pressTimer: number | undefined;
  private pressStart = { x: 0, y: 0 };
  private suppressClick = false;

  constructor(private store: Store, private onMenu: () => void) {
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
    this.titlebar.append(this.burger, this.title, this.selectBtn, this.addBtn);

    this.ul.addEventListener('click', (e) => this.onClick(e));
    this.ul.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.ul.addEventListener('pointermove', (e) => this.onPointerMove(e));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) this.ul.addEventListener(ev, () => this.cancelPress());
    this.ul.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('popstate', () => {
      // Android back button leaves selection mode first.
      if (this.selecting && !history.state?.sel) this.exitSelection(true);
    });

    this.el = h(
      'section',
      { class: 'view list-view' },
      h('header', { class: 'top' }, this.titlebar, this.selTop, this.stats, this.search, this.chips, this.mediumChips),
      this.banner,
      this.ul,
      this.empty,
      this.selbar,
    );
    store.subscribe(() => this.render());
    this.render();
  }

  /** Re-translate static text after a language switch. */
  retranslate() {
    this.title.textContent = t('app.title');
    this.selectBtn.textContent = t('list.select');
    this.burger.setAttribute('aria-label', t('menu.open'));
    this.addBtn.setAttribute('aria-label', t('nav.new'));
    this.search.placeholder = t('list.search');
    this.render();
  }

  private render() {
    this.renderChrome();
    this.renderItems();
  }

  // ------------------------------------------------------------ selection
  private enterSelection(first?: number) {
    if (this.selecting) return;
    this.selecting = true;
    this.selected.clear();
    if (first !== undefined) this.selected.add(first);
    history.pushState({ sel: 1 }, '');
    this.applySelectionMode();
  }

  private exitSelection(viaPop = false) {
    if (!this.selecting) return;
    this.selecting = false;
    this.selected.clear();
    if (!viaPop && history.state?.sel) history.back();
    this.applySelectionMode();
  }

  private applySelectionMode() {
    document.body.dataset.select = this.selecting ? '1' : '';
    this.titlebar.hidden = this.selecting;
    this.selTop.hidden = !this.selecting;
    this.selbar.hidden = !this.selecting;
    this.renderItems();
  }

  private renderSelectionChrome(visible: Item[]) {
    const n = this.selected.size;
    const allOn = visible.length > 0 && visible.every((i) => this.selected.has(i.id));
    clear(this.selTop);
    this.selTop.append(
      h('button', { class: 'chip', type: 'button', onclick: () => this.exitSelection() }, t('sel.done')),
      h('strong', { class: 'selcount', 'aria-live': 'polite' }, n ? t('sel.count', { n }) : t('sel.none')),
      h('button', { class: 'chip', type: 'button', onclick: () => this.toggleAll() }, allOn ? t('sel.clear') : t('sel.all')),
    );
    clear(this.selbar);
    const dis = n === 0;
    this.selbar.append(
      h('button', { class: 'btn plain', type: 'button', disabled: dis, onclick: () => void this.bulkSold(true) }, t('sel.sold')),
      h('button', { class: 'btn plain', type: 'button', disabled: dis, onclick: () => void this.bulkSold(false) }, t('sel.avail')),
      h('button', { class: 'btn danger', type: 'button', disabled: dis, onclick: () => void this.bulkDelete() }, t('sel.delete')),
    );
  }

  private toggleAll() {
    const visible = this.filtered();
    const allOn = visible.length > 0 && visible.every((i) => this.selected.has(i.id));
    if (allOn) for (const i of visible) this.selected.delete(i.id);
    else for (const i of visible) this.selected.add(i.id);
    this.renderItems();
  }

  private async bulkSold(sold: boolean) {
    const ids = [...this.selected];
    const changed = await this.store.bulk(ids, sold ? 'sold' : 'unsold');
    this.exitSelection();
    if (!changed.length) return toast(t('toast.bulkNothing'));
    toast(t(sold ? 'toast.bulkSold' : 'toast.bulkUnsold', { n: changed.length }), {
      label: t('toast.undo'),
      run: () => void this.store.bulk(changed, sold ? 'unsold' : 'sold'),
    });
  }

  private async bulkDelete() {
    const ids = [...this.selected];
    if (!ids.length) return;
    const r = await modal(t('sel.delete'), [h('p', null, t('sel.confirmDelete', { n: ids.length }))], [
      { label: t('sel.delete'), kind: 'danger', value: 'yes' },
      { label: t('common.cancel'), value: 'cancel' },
    ]);
    if (r !== 'yes') return;
    const changed = await this.store.bulk(ids, 'delete');
    this.exitSelection();
    if (!changed.length) return;
    toast(t('toast.bulkDeleted', { n: changed.length }), { label: t('toast.undo'), run: () => void this.store.bulk(changed, 'restore') });
  }

  // ------------------------------------------------------------- long press
  private onPointerDown(e: PointerEvent) {
    // A new touch always starts fresh: if the browser never delivered the click of a long-press
    // (the pressed row was re-rendered), the flag must not swallow this tap.
    this.suppressClick = false;
    if (this.selecting || e.button > 0) return;
    const target = e.target as HTMLElement;
    const li = target.closest('li.row') as HTMLElement | null;
    if (!li || target.closest('[data-act="sold"]')) return;
    this.pressStart = { x: e.clientX, y: e.clientY };
    this.cancelPress();
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = undefined;
      this.suppressClick = true;
      navigator.vibrate?.(15);
      this.enterSelection(Number(li.dataset.id));
    }, LONG_PRESS_MS);
  }

  private onPointerMove(e: PointerEvent) {
    if (this.pressTimer === undefined) return;
    if (Math.abs(e.clientX - this.pressStart.x) > MOVE_TOLERANCE || Math.abs(e.clientY - this.pressStart.y) > MOVE_TOLERANCE) this.cancelPress();
  }

  private cancelPress() {
    if (this.pressTimer !== undefined) window.clearTimeout(this.pressTimer);
    this.pressTimer = undefined;
  }

  // ---------------------------------------------------------------- render
  private renderChrome() {
    const all = this.store.active();
    const sold = all.filter((i) => i.sold);
    const sum = sold.reduce((a, i) => a + i.price, 0);
    this.stats.textContent = all.length ? t('list.stats', { n: all.length, a: all.length - sold.length, s: sold.length, sum: fmtPrice(sum) }) : '';
    this.selectBtn.hidden = all.length === 0;

    // status: one full-width bar, three equal sections
    clear(this.chips);
    this.chips.className = 'seg status';
    this.chips.setAttribute('role', 'group');
    const st: [StatusFilter, string][] = [['all', t('list.all')], ['available', t('list.available')], ['sold', t('list.sold')]];
    for (const [k, label] of st) {
      this.chips.appendChild(
        h('button', { type: 'button', class: this.status === k ? 'on' : '', 'aria-pressed': String(this.status === k), onclick: () => { this.status = k; this.render(); } }, h('span', { class: 'lbl' }, label)),
      );
    }

    // medium: same bar style; "All" + the two biggest media + a "More" section opening a picker
    clear(this.mediumChips);
    this.mediumChips.className = 'seg medium';
    this.mediumChips.setAttribute('role', 'group');
    const counts = new Map<string, number>();
    for (const i of all) if (i.medium) counts.set(i.medium, (counts.get(i.medium) ?? 0) + 1);
    const mediums = this.store.mediums();
    if (this.medium && !counts.has(this.medium)) this.medium = '';
    this.mediumChips.hidden = mediums.length < 2;
    if (mediums.length >= 2) {
      const direct = mediums.length <= 3 ? mediums : mediums.slice(0, 2);
      const overflow = mediums.length <= 3 ? [] : mediums.slice(2);
      const mk = (value: string, label: string, count?: number) =>
        h(
          'button',
          { type: 'button', class: this.medium === value ? 'on' : '', 'aria-pressed': String(this.medium === value), onclick: () => { this.medium = value; this.render(); } },
          h('span', { class: 'lbl' }, label),
          count !== undefined && h('span', { class: 'cnt' }, String(count)),
        );
      this.mediumChips.appendChild(mk('', t('list.all'), all.length));
      for (const m of direct) this.mediumChips.appendChild(mk(m, m, counts.get(m)));
      if (overflow.length) {
        const chosen = overflow.includes(this.medium) ? this.medium : '';
        this.mediumChips.appendChild(
          h(
            'button',
            { type: 'button', class: `more ${chosen ? 'on' : ''}`, 'aria-pressed': String(!!chosen), 'aria-haspopup': 'dialog', onclick: () => void this.pickMedium(mediums, counts) },
            h('span', { class: 'lbl' }, chosen || t('list.moreMediums')),
            h('span', { class: 'cnt' }, chosen ? `${counts.get(chosen)} ▾` : '▾'),
          ),
        );
      }
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

  private async pickMedium(mediums: string[], counts: Map<string, number>) {
    const r = await modal(t('list.pickMedium'), [], [
      { label: t('list.allMediums'), value: 'm:', active: this.medium === '' },
      ...mediums.map((m) => ({ label: `${m}  ·  ${counts.get(m) ?? 0}`, value: `m:${m}`, active: this.medium === m })),
      { label: t('common.cancel'), value: 'cancel' },
    ]);
    if (r.startsWith('m:')) {
      this.medium = r.slice(2);
      this.render();
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
    if (this.selecting) {
      // Only items you can see can stay selected, so a bulk action never touches hidden rows.
      const visible = new Set(items.map((i) => i.id));
      for (const id of [...this.selected]) if (!visible.has(id)) this.selected.delete(id);
      this.renderSelectionChrome(items);
    }
    this.ul.classList.toggle('selecting', this.selecting);
    clear(this.ul);
    clear(this.empty);
    const total = this.store.items.size;
    if (total === 0) {
      for (const el of [
        h('h2', null, t('list.emptyTitle')),
        h('p', null, t('list.emptyText')),
        h('button', { class: 'btn primary', onclick: () => importFlow(this.store) }, t('list.import')),
        h('a', { class: 'btn plain', href: '#/new' }, t('list.addFirst')),
      ]) this.empty.appendChild(el);
    } else if (items.length === 0) {
      this.empty.appendChild(h('p', null, t('list.none')));
    }
    const frag = document.createDocumentFragment();
    for (const it of items) frag.appendChild(this.row(it));
    this.ul.appendChild(frag);
  }

  private row(it: Item): HTMLElement {
    const picked = this.selected.has(it.id);
    return h(
      'li',
      { class: `row ${it.sold ? 'sold' : ''} ${picked ? 'picked' : ''}`, 'data-id': it.id, 'aria-selected': this.selecting ? String(picked) : null },
      h('div', { class: 'idb' }, String(it.id)),
      h(
        'div',
        { class: 'main' },
        h('div', { class: 'title' }, it.title),
        h('div', { class: 'meta' }, it.medium && h('span', { class: 'tag' }, it.medium), it.sold && h('span', { class: 'tag soldtag' }, t('list.sold'))),
      ),
      h('div', { class: 'price' }, `${fmtPrice(it.price)} €`),
      this.selecting
        ? h('span', { class: `pick ${picked ? 'on' : ''}`, 'aria-hidden': 'true' }, '✓')
        : h('button', { class: `check ${it.sold ? 'on' : ''}`, 'data-act': 'sold', 'aria-label': it.sold ? t('row.markUnsold') : t('row.markSold'), 'aria-pressed': String(it.sold) }, '✓'),
    );
  }

  private async onClick(e: Event) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const target = e.target as HTMLElement;
    const li = target.closest('li.row') as HTMLElement | null;
    if (!li) return;
    const id = Number(li.dataset.id);
    if (this.selecting) {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
      this.renderItems();
      return;
    }
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
