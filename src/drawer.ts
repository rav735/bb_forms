import { lastExportText } from './actions';
import { clear, h, icon } from './dom';
import { t } from './i18n';
import type { Store } from './store';

const ITEMS = [
  { key: 'list', href: '#/', icon: 'list', label: 'nav.list' },
  { key: 'new', href: '#/new', icon: 'plus', label: 'nav.new' },
  { key: 'settings', href: '#/settings', icon: 'sliders', label: 'nav.settings' },
] as const;

/**
 * Burger sidebar. While open it owns one history entry, so the Android back button
 * closes the menu instead of leaving the app.
 */
export class Drawer {
  private overlay = h('div', { class: 'drawer-overlay', hidden: true });
  private panel = h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' });
  private current = 'list';
  private isOpen = false;
  private after: (() => void) | undefined;

  constructor(private store: Store) {
    this.overlay.appendChild(this.panel);
    this.overlay.addEventListener('click', (e) => e.target === this.overlay && this.close());
    document.body.appendChild(this.overlay);
    window.addEventListener('popstate', () => {
      if (this.isOpen && !history.state?.drawer) this.hide();
    });
    window.addEventListener('keydown', (e) => e.key === 'Escape' && this.isOpen && this.close());
    this.render();
  }

  setCurrent(key: string) {
    this.current = key;
    this.render();
  }

  retranslate() {
    this.render();
  }

  private render() {
    clear(this.panel);
    this.panel.setAttribute('aria-label', t('menu.title'));
    this.panel.append(
      h('div', { class: 'drawer-head' }, h('img', { class: 'drawer-logo', src: 'icon.svg', alt: '' }), h('strong', null, t('app.title'))),
      h(
        'nav',
        { class: 'drawer-nav' },
        ITEMS.map((it) =>
          h(
            'a',
            {
              href: it.href,
              class: `drawer-item ${this.current === it.key || (it.key === 'list' && this.current === 'edit') ? 'on' : ''}`,
              'aria-current': this.current === it.key ? 'page' : null,
              onclick: (e: Event) => {
                e.preventDefault();
                this.close(() => {
                  const target = it.href;
                  const here = location.hash === '' ? '#/' : location.hash;
                  if (here !== target) location.hash = target;
                });
              },
            },
            icon(it.icon),
            h('span', null, t(it.label)),
          ),
        ),
      ),
      h('div', { class: 'drawer-foot' }, lastExportText(this.store)),
    );
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
    history.pushState({ drawer: 1 }, '');
    this.overlay.hidden = false;
    // next frame so the slide-in transition runs
    requestAnimationFrame(() => this.overlay.classList.add('open'));
    (this.panel.querySelector('.drawer-item') as HTMLElement | null)?.focus();
  }

  /** Close the menu; `after` runs once it is closed (used to navigate). */
  close(after?: () => void) {
    if (!this.isOpen) return after?.();
    this.after = after;
    if (history.state?.drawer) history.back(); // popstate handler hides it
    else this.hide();
  }

  private hide() {
    this.isOpen = false;
    this.overlay.classList.remove('open');
    const done = () => {
      if (!this.isOpen) this.overlay.hidden = true;
    };
    setTimeout(done, 230);
    const f = this.after;
    this.after = undefined;
    f?.();
  }
}
