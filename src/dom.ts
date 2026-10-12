export type Child = Node | string | number | null | undefined | false | Child[];

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Lowercase + strip diacritics for forgiving search. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

let toastTimer: number | undefined;
export function toast(msg: string, action?: { label: string; run: () => void }) {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(box);
  }
  clear(box);
  append(box, [h('span', null, msg)]);
  if (action) {
    box.appendChild(
      h('button', { class: 'toast-action', onclick: () => { box!.classList.remove('show'); action.run(); } }, action.label),
    );
  }
  box.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box!.classList.remove('show'), action ? 6000 : 2600);
}

export function hideToast() {
  document.getElementById('toast')?.classList.remove('show');
}

export interface DialogButton {
  label: string;
  hint?: string;
  kind?: 'primary' | 'danger' | 'plain';
  value: string;
}

/** Simple modal; resolves with the chosen button's value (or 'cancel'). */
export function modal(title: string, body: Child[], buttons: DialogButton[]): Promise<string> {
  return new Promise((resolve) => {
    const close = (v: string) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'overlay', onclick: (e: Event) => e.target === overlay && close('cancel') },
      h(
        'div',
        { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h2', null, title),
        h('div', { class: 'modal-body' }, body),
        h(
          'div',
          { class: 'modal-actions' },
          buttons.map((b) =>
            h(
              'button',
              { class: `btn ${b.kind ?? 'plain'}`, onclick: () => close(b.value) },
              h('span', null, b.label),
              b.hint && h('small', null, b.hint),
            ),
          ),
        ),
      ),
    );
    document.body.appendChild(overlay);
  });
}
