import { h, fmt } from '../ui/dom.js';
import { MATERIALS, TOOLS, OPS, recommend, vcFor } from '../data/cutting.js';

/**
 * MODULE C — Vitesse de coupe & avance.
 * Calculateur N = 1000·Vc / (π·D), choix de la vitesse de boîte immédiatement
 * inférieure, avance conseillée, et jauge de Vc réelle au Ø où se trouve l'outil.
 */
export class CuttingModule {
  code = 'C';
  title = 'Vitesses';

  constructor(app) {
    this.app = app;
    const m = app.machine;
    this.p = { material: m.s.material, tool: m.s.toolType, op: m.s.op, d: m.stock.d0 };

    const segOf = (obj, key) => {
      const wrap = h('div', { class: 'seg' });
      for (const [k, label] of Object.entries(obj)) {
        wrap.append(h('button', { 'data-k': k, onclick: () => { this.p[key] = k; this.update(); } }, label));
      }
      return wrap;
    };
    this.segTool = segOf(TOOLS, 'tool');
    this.segOp = segOf(OPS, 'op');
    this.matSel = h('select', { onchange: (e) => { this.p.material = e.target.value; this.update(); } },
      Object.entries(MATERIALS).map(([k, v]) => h('option', { value: k }, v.name)));
    this.dOut = h('output');
    this.dRange = h('input', { type: 'range', min: 10, max: 150, step: 1, oninput: (e) => { this.p.d = Number(e.target.value); this.update(); } });

    this.out = {};
    const cell = (id, label, cls = '') => h('div', { class: cls }, h('small', {}, label), (this.out[id] = h('b')));
    const results = h('div', { class: 'results' },
      cell('nBox', 'N à afficher sur la boîte', 'big'),
      cell('vc', 'Vc conseillée'),
      cell('n', 'N théorique'),
      cell('f', 'Avance f'),
      cell('vf', 'Vf = f × N'),
      cell('ap', 'Passe ap'),
      cell('vcr', 'Vc obtenue'));

    this.formula = h('div', { class: 'formula' });
    this.applyBtn = h('button', { class: 'btn primary', onclick: () => this.apply() }, 'Appliquer à la machine');

    // Jauge live
    this.gauge = h('div', { class: 'gauge' }, (this.zone = h('span', { class: 'zone' })), (this.needle = h('span', { class: 'needle' })));
    this.live = h('p', { class: 'note' });

    // Brut
    this.stockD = h('input', { type: 'range', min: 16, max: 100, step: 2, value: m.stock.d0, oninput: () => this.syncStockLabels() });
    this.stockL = h('input', { type: 'range', min: 30, max: 200, step: 5, value: m.stock.L, oninput: () => this.syncStockLabels() });
    this.stockDOut = h('output');
    this.stockLOut = h('output');
    this.ratio = h('p', { class: 'note' });

    this.el = h('div', { class: 'mod' },
      h('h2', {}, 'Vitesse de coupe & avance'),
      h('p', { class: 'lead' }, 'La vitesse de coupe Vc (m/min) dépend du matériau et de l’outil. La machine, elle, se règle en tours par minute : on calcule N à partir du Ø.'),
      h('label', { class: 'field' }, h('span', {}, 'Matériau'), this.matSel),
      h('div', { class: 'field' }, h('span', {}, 'Outil'), this.segTool),
      h('div', { class: 'field' }, h('span', {}, 'Opération'), this.segOp),
      h('label', { class: 'field' }, h('span', {}, 'Diamètre de la pièce', this.dOut), this.dRange),
      h('button', { class: 'btn ghost sm', style: { marginTop: '4px', paddingLeft: 0 }, onclick: () => { this.p.d = Math.round(m.stock.maxRadius() * 2); this.update(); } }, '↺ Reprendre le Ø actuel de la pièce'),
      results,
      this.formula,
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' } }, this.applyBtn,
        h('span', { class: 'note', style: { margin: 0 } }, 'Broche arrêtée uniquement.')),
      h('h3', {}, 'Vc réelle au Ø de l’outil'),
      this.gauge,
      this.live,
      h('label', { class: 'switch' },
        h('span', {}, 'Rotation affichée à la vitesse réelle'),
        h('input', { type: 'checkbox', onchange: (e) => m.act('realSpeed', e.target.checked) }),
        h('i')),
      h('p', { class: 'note' }, 'Par défaut la rotation est ralentie pour rester lisible à l’écran.'),
      h('h3', {}, 'Monter un nouveau brut'),
      h('label', { class: 'field' }, h('span', {}, 'Diamètre', this.stockDOut), this.stockD),
      h('label', { class: 'field' }, h('span', {}, 'Longueur hors mors', this.stockLOut), this.stockL),
      this.ratio,
      h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => this.mountStock() }, 'Monter ce brut'),
    );

    m.on('stock', () => {
      this.p.d = m.stock.d0;
      this.update();
    });
    this.update();
    this.syncStockLabels();
  }

  update() {
    const p = this.p;
    const rec = recommend(p);
    this.rec = rec;
    this.matSel.value = p.material;
    for (const b of this.segTool.children) b.classList.toggle('on', b.dataset.k === p.tool);
    for (const b of this.segOp.children) b.classList.toggle('on', b.dataset.k === p.op);
    this.dRange.value = p.d;
    this.dRange.style.setProperty('--fill', `${((p.d - 10) / 140) * 100}%`);
    this.dOut.textContent = `Ø ${p.d} mm`;

    const set = (k, v, unit) => this.out[k].replaceChildren(v, h('i', {}, unit));
    set('nBox', rec.nBox, 'tr/min');
    set('vc', rec.vc, 'm/min');
    set('n', Math.round(rec.n), 'tr/min');
    set('f', fmt(rec.f, 2), 'mm/tr');
    set('vf', Math.round(rec.vf), 'mm/min');
    set('ap', fmt(rec.ap, 1), 'mm');
    set('vcr', Math.round(rec.vcReal), 'm/min');

    this.formula.innerHTML =
      `N = 1000 × <em>Vc</em> / (π × <em>D</em>)<br>` +
      `N = 1000 × ${rec.vc} / (π × ${p.d}) = <em>${Math.round(rec.n)} tr/min</em><br>` +
      (rec.capped
        ? `→ au-delà du maximum de la machine : on prend ${rec.nBox} tr/min.`
        : `→ vitesse de boîte immédiatement inférieure : <em>${rec.nBox} tr/min</em>`);
  }

  apply() {
    const m = this.app.machine;
    const p = this.p;
    m.act('cutting', { material: p.material, toolType: p.tool, op: p.op });
    if (m.act('rpm', this.rec.nBox)) {
      m.act('feed', this.rec.f);
      m.emit('toast', { level: 'ok', title: 'Conditions appliquées', text: `N = ${this.rec.nBox} tr/min · f = ${fmt(this.rec.f, 2)} mm/tr` });
    }
  }

  syncStockLabels() {
    const d = Number(this.stockD.value);
    const L = Number(this.stockL.value);
    this.stockDOut.textContent = `Ø ${d} mm`;
    this.stockLOut.textContent = `${L} mm`;
    this.stockD.style.setProperty('--fill', `${((d - 16) / 84) * 100}%`);
    this.stockL.style.setProperty('--fill', `${((L - 30) / 170) * 100}%`);
    const r = L / d;
    this.ratio.textContent = `Porte-à-faux : ${fmt(r, 1)} × Ø ${r > 3 ? '— trop long sans contre-pointe !' : '— correct (≤ 3 × Ø).'}`;
    this.ratio.style.color = r > 3 ? 'var(--warn)' : '';
  }

  mountStock() {
    this.app.machine.act('newStock', Number(this.stockD.value), Number(this.stockL.value));
  }

  /** Jauge de Vc réelle (chaque image). */
  tick() {
    const m = this.app.machine;
    const d = Math.min(2 * m.s.r, m.stock.maxRadius() * 2);
    const rec = m.recommendation();
    const vc = m.running ? vcFor(m.s.rpm, d) : 0;
    const max = rec.vc * 1.6;
    this.zone.style.left = `${((rec.vc * 0.7) / max) * 100}%`;
    this.zone.style.width = `${((rec.vc * 0.4) / max) * 100}%`;
    this.needle.style.left = `${Math.min(100, (vc / max) * 100)}%`;
    this.live.textContent = m.running
      ? `Vc = π × ${fmt(d, 1)} × ${m.s.rpm} / 1000 = ${Math.round(vc)} m/min (zone verte : ${Math.round(rec.vc * 0.7)}–${Math.round(rec.vc * 1.1)}). En dressage, Vc tombe à 0 au centre : l’état de surface s’y dégrade.`
      : 'Broche arrêtée : Vc = 0.';
  }
}
