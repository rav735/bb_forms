import { requestPersistence } from './actions';
import { clear, h, hideToast } from './dom';
import { FormView } from './form';
import { initLang, t } from './i18n';
import { ListView } from './list';
import { noteNavigation } from './nav';
import { SettingsView } from './settings';
import { Store } from './store';

async function start() {
  initLang();
  const store = await Store.open();
  if (store.items.size > 0) void requestPersistence();

  const list = new ListView(store);
  const form = new FormView(store);
  const settings = new SettingsView(store, () => {
    list.retranslate();
    buildNav();
    settings.render();
    route();
  });

  const main = h('main', null, list.el, form.el, settings.el);
  const nav = h('nav', { class: 'bottom' });
  const root = document.getElementById('app')!;
  clear(root);
  root.append(main, nav);

  const listScroll = { y: 0 };
  let current = '';

  function buildNav() {
    clear(nav);
    const mk = (href: string, label: string, icon: string, key: string, cls = '') =>
      h('a', { href, class: `navitem ${cls} ${current === key ? 'on' : ''}`, 'aria-current': current === key ? 'page' : null }, h('span', { class: 'ico' }, icon), h('span', null, label));
    nav.append(mk('#/', t('nav.list'), '☰', 'list'), mk('#/new', t('nav.new'), '+', 'new', 'plus'), mk('#/settings', t('nav.settings'), '⋯', 'settings'));
  }

  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [seg, arg] = hash.split('/');
    const prev = current;
    hideToast();
    if (prev === 'list') listScroll.y = window.scrollY;
    list.el.hidden = seg === 'new' || seg === 'edit' || seg === 'settings';
    form.el.hidden = !(seg === 'new' || seg === 'edit');
    settings.el.hidden = seg !== 'settings';
    if (seg === 'new') {
      current = 'new';
      form.open(undefined);
    } else if (seg === 'edit' && arg) {
      current = 'edit';
      form.open(Number(arg));
    } else if (seg === 'settings') {
      current = 'settings';
      settings.render();
    } else {
      current = 'list';
    }
    document.body.dataset.view = current;
    buildNav();
    window.scrollTo(0, current === 'list' ? listScroll.y : 0);
  }

  window.addEventListener('hashchange', () => {
    noteNavigation();
    route();
  });
  route();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
  (window as unknown as { __store: Store }).__store = store;
}

start().catch((e) => {
  document.getElementById('app')!.textContent = `Error: ${e}`;
});
