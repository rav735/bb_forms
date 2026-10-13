import { requestPersistence } from './actions';
import { clear, h, hideToast } from './dom';
import { Drawer } from './drawer';
import { FormView } from './form';
import { initLang } from './i18n';
import { ListView } from './list';
import { noteNavigation } from './nav';
import { SettingsView } from './settings';
import { Store } from './store';

async function start() {
  initLang();
  const store = await Store.open();
  if (store.items.size > 0) void requestPersistence();

  let drawer: Drawer;
  const list = new ListView(store, () => drawer.open());
  drawer = new Drawer(store);
  const form = new FormView(store);
  const settings = new SettingsView(store, () => {
    list.retranslate();
    drawer.retranslate();
    settings.render();
    route(true);
  });

  const main = h('main', null, list.el, form.el, settings.el);
  const root = document.getElementById('app')!;
  clear(root);
  root.append(main);

  const listScroll = { y: 0 };
  let current = '';

  let lastHash: string | null = null;
  /** Re-route only when the address really changed, so a stray duplicate event can't rebuild a form you are typing in. */
  function route(force = false) {
    if (!force && location.hash === lastHash) return;
    lastHash = location.hash;
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
    drawer.setCurrent(current);
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
