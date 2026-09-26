import { h, $, fmt, signed } from './dom.js';
import { HANDWHEEL, TAU } from '../config.js';
import { GEARBOX_RPM, FEEDS } from '../data/cutting.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/**
 * Volant virtuel : on le tourne en glissant AUTOUR de son centre (comme un vrai
 * volant), ou à la molette. `onTurn(angleRad)` reçoit l'angle, positif = sens horaire.
 */
function wheelWidget({ label, small = false, onTurn, onStep }) {
  const svg = s('svg', { viewBox: '-50 -50 100 100', role: 'img', 'aria-label': label });
  const ticks = s('g', { class: 'ticks' });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    ticks.append(s('line', { x1: Math.cos(a) * 47, y1: Math.sin(a) * 47, x2: Math.cos(a) * (i % 5 ? 49 : 50.5), y2: Math.sin(a) * (i % 5 ? 49 : 50.5) }));
  }
  const spin = s('g');
  spin.append(s('circle', { r: 40, class: 'rim' }));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU - Math.PI / 2;
    spin.append(s('line', { x1: 0, y1: 0, x2: Math.cos(a) * 39, y2: Math.sin(a) * 39, class: 'spoke' }));
  }
  spin.append(s('circle', { r: 9, class: 'hub' }));
  spin.append(s('circle', { cx: Math.cos(Math.PI / 6) * 40, cy: Math.sin(Math.PI / 6) * 40, r: 6.5, class: 'grip' }));
  const arrow = s('path', { class: 'arrow', d: 'M -20 -54 A 58 58 0 0 1 20 -54 M 14 -58 L 20 -54 L 14 -49' });
  svg.append(ticks, spin, arrow);
  const el = h('div', { class: `wheel${small ? ' small' : ''}`, title: `${label} — glisser en tournant, ou molette` }, svg, h('span', {}, label));

  let last = null;
  const angleOf = (e) => {
    const r = svg.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    last = angleOf(e);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    if (last == null) return;
    const a = angleOf(e);
    let d = a - last;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    last = a;
    onTurn(d);
  });
  const end = () => (last = null);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    onStep(Math.sign(e.deltaY), e.shiftKey);
  }, { passive: false });

  return { el, setAngle: (rad) => spin.setAttribute('transform', `rotate(${(rad * 180) / Math.PI})`) };
}

export class Dock {
  constructor(app) {
    this.app = app;
    const m = app.machine;
    const root = $('#dock');

    this.wz = wheelWidget({
      label: 'Trainard · Z',
      onTurn: (d) => m.move({ dzc: (d / TAU) * HANDWHEEL.carriage }),
      onStep: (dir, fine) => m.move({ dzc: dir * (fine ? 0.1 : 1) }),
    });
    this.wx = wheelWidget({
      label: 'Transversal · X',
      onTurn: (d) => m.move({ dr: -(d / TAU) * HANDWHEEL.cross }),
      onStep: (dir, fine) => m.move({ dr: -dir * (fine ? 0.01 : 0.1) }),
    });
    this.wc = wheelWidget({
      label: 'Ch. sup.',
      small: true,
      onTurn: (d) => m.move({ dcz: -(d / TAU) * HANDWHEEL.compound }),
      onStep: (dir, fine) => m.move({ dcz: -dir * (fine ? 0.01 : 0.1) }),
    });

    this.droZ = h('b', {}, '+0,00');
    this.droX = h('b', {}, '0,00');
    this.droC = h('span', {});
    this.droLock = h('span', {});
    const dro = h('div', { class: 'dro', title: 'Visualisation des cotes (outil)' },
      h('div', { class: 'row' }, h('span', {}, 'Z'), this.droZ, h('i', {}, 'mm')),
      h('div', { class: 'row' }, h('span', {}, 'Ø'), this.droX, h('i', {}, 'mm')),
      h('div', { class: 'sub' }, this.droC, this.droLock));

    // Avance automatique
    this.feedBtns = {};
    const fb = (mode, label, title) =>
      (this.feedBtns[mode ?? 'off'] = h('button', { title, onclick: () => m.act('autoFeed', mode) }, label));
    this.feedSel = h('select', { title: 'Avance f (mm/tr)', onchange: (e) => m.act('feed', Number(e.target.value)) },
      FEEDS.map((f) => h('option', { value: f }, `f ${fmt(f, 2)}`)));
    const feed = h('div', { class: 'dk-col dk-feed' },
      h('span', { class: 'lbl' }, 'Avance automatique'),
      h('div', { class: 'seg' },
        fb('z-', '◀ Chariotage', 'Avance longitudinale vers le mandrin'),
        fb(null, '■', 'Débrayer'),
        fb('x-', 'Dressage ▲', 'Avance transversale vers le centre')),
      h('div', { class: 'dk' }, this.feedSel,
        (this.speedSel = h('select', { title: 'Accélération de la simulation', onchange: (e) => m.act('simSpeed', Number(e.target.value)) },
          h('option', { value: 1 }, 'temps réel'), h('option', { value: 5 }, 'accéléré ×5'), h('option', { value: 20 }, 'accéléré ×20')))));

    // Broche
    this.spBtns = {};
    const sb = (dir, label, title) => (this.spBtns[dir] = h('button', { title, onclick: () => m.act('spindle', dir) }, label));
    this.rpmSel = h('select', { title: 'Fréquence de rotation (tr/min)', onchange: (e) => { if (!m.act('rpm', Number(e.target.value))) e.target.value = m.s.rpm; } },
      GEARBOX_RPM.map((n) => h('option', { value: n }, `${n} tr/min`)));
    const spindle = h('div', { class: 'dk-col dk-spin' },
      h('span', { class: 'lbl' }, 'Broche'),
      h('div', { class: 'seg' }, sb(-1, '↺', 'Marche arrière'), sb(0, '■ Arrêt', 'Arrêt (Espace)'), sb(1, 'Marche ↻', 'Marche avant (Espace)')),
      h('div', { class: 'dk' }, this.rpmSel));

    this.btnProfile = h('button', { class: 'btn sm btn-2d', onclick: () => app.toggleProfile(), title: 'Vue de dessus 2D (P)' }, 'Vue 2D ', h('kbd', {}, 'P'));
    const actions = h('div', { class: 'dk-col dk-act' },
      h('button', { class: 'btn sm', onclick: () => m.act('safePos'), title: 'Reculer l’outil en position sûre (T)' }, 'Position sûre ', h('kbd', {}, 'T')),
      this.btnProfile);
    this.estop = h('button', { class: 'estop', title: 'Arrêt d’urgence (Échap)', onclick: () => m.act('estop') }, 'ARRÊT', h('br'), 'URGENCE');

    root.append(
      h('div', { class: 'dk dk-axes' }, this.wz.el, dro, this.wx.el, this.wc.el),
      h('span', { class: 'dk-sep' }), feed,
      h('span', { class: 'dk-sep' }), spindle,
      h('span', { class: 'dk-sep' }), actions, this.estop,
    );

    // La hauteur réelle du dock pilote la position des panneaux (--dock-h)
    new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${root.offsetHeight}px`)).observe(root);

    m.on('change', () => this.refresh());
    this.refresh();
  }

  highlight(ids = []) {
    this.wz.el.classList.toggle('hl', ids.includes('carriageWheel'));
    this.wx.el.classList.toggle('hl', ids.includes('crossWheel'));
    this.wc.el.classList.toggle('hl', ids.includes('compoundWheel'));
  }

  refresh() {
    const s = this.app.machine.s;
    for (const [k, b] of Object.entries(this.feedBtns)) b.classList.toggle('on', (s.autoFeed ?? 'off') === k);
    for (const [k, b] of Object.entries(this.spBtns)) b.classList.toggle('on', Number(k) === s.spindleDir);
    this.rpmSel.value = s.rpm;
    this.feedSel.value = s.feed;
    this.speedSel.value = s.simSpeed;
    this.estop.classList.toggle('on', s.estop);
    this.wz.el.classList.toggle('locked', s.carriageLocked);
    this.droLock.textContent = s.carriageLocked ? '● trainard bloqué' : '';
    this.droLock.className = s.carriageLocked ? 'lk' : '';
    this.btnProfile.classList.toggle('primary', this.app.profileOn);
  }

  /** Valeurs continues (chaque image). */
  tick() {
    const m = this.app.machine;
    const s = m.s;
    this.droZ.textContent = signed(m.z, 2);
    this.droX.textContent = fmt(2 * s.r, 2);
    this.droC.textContent = `ch. sup. ${signed(s.cz, 2)}`;
    this.wz.setAngle((s.zc / HANDWHEEL.carriage) * TAU);
    this.wx.setAngle(-(s.r / HANDWHEEL.cross) * TAU);
    this.wc.setAngle(-(s.cz / HANDWHEEL.compound) * TAU);
  }
}
