import { h, $ } from './dom.js';

/** Colonne des modules pédagogiques (onglets A / B / C). */
export class Rail {
  constructor(app, modules) {
    this.app = app;
    this.el = $('#rail');
    this.modules = modules;
    this.current = null;
    this.tabs = {};
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    for (const mod of modules) {
      this.tabs[mod.code] = h('button', { role: 'tab', onclick: () => this.toggle(mod.code) }, h('b', {}, `MODULE ${mod.code}`), h('span', {}, mod.title));
      tabs.append(this.tabs[mod.code]);
    }
    this.body = h('div', { class: 'rail-body' });
    this.el.append(tabs, this.body);
    this.el.classList.add('collapsed');
  }

  /** Re-clic sur l'onglet ouvert : replie le panneau. */
  toggle(code) {
    if (this.current === code && !this.el.classList.contains('collapsed')) this.collapse();
    else this.open(code);
  }

  open(code) {
    const mod = this.modules.find((m) => m.code === code);
    if (!mod) return;
    this.current = code;
    this.el.classList.remove('collapsed');
    for (const [k, t] of Object.entries(this.tabs)) {
      t.classList.toggle('on', k === code);
      t.setAttribute('aria-selected', k === code);
    }
    this.body.replaceChildren(mod.el);
    this.body.scrollTop = 0;
    mod.onShow?.();
  }

  collapse() {
    this.el.classList.add('collapsed');
    for (const t of Object.values(this.tabs)) t.classList.remove('on');
    this.current = null;
  }

  get active() {
    return this.el.classList.contains('collapsed') ? null : this.modules.find((m) => m.code === this.current);
  }
}
