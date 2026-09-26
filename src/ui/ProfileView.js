import { $, h, icon, fmt, signed } from './dom.js';
import { ZONES } from '../sim/ToolGeometry.js';

const COL = {
  work: '#8d8a85',
  cut: '#d9dde2',
  chuck: '#4b5058',
  tail: '#3c6f98',
  edge: '#c9a24a',
  body: '#6b7079',
  holder: '#3a3d42',
  warn: '#ffa53a',
  hit: '#ff4b3e',
  axis: 'rgba(255,255,255,.28)',
};

/**
 * Vue de dessus 2D du plan XZ, à l'échelle : profil réel de la pièce, mandrin,
 * contre-poupée et zones de l'outil (arête dorée, corps gris). C'est ici qu'on
 * comprend pourquoi le TALON de l'outil touche la pièce en dressage trop profond.
 */
export class ProfileView {
  constructor(app) {
    this.app = app;
    this.el = $('#profile');
    this.canvas = h('canvas', { 'aria-label': 'Vue de dessus du plan XZ' });
    this.el.append(
      h('header', {},
        h('span', { class: 'lbl' }, 'Vue de dessus · plan XZ'),
        h('button', { class: 'close', title: 'Fermer (P)', onclick: () => app.toggleProfile(false), html: icon('close') })),
      this.canvas,
      h('div', { class: 'legend' },
        h('span', {}, h('i', { style: { background: COL.edge } }), 'arête'),
        h('span', {}, h('i', { style: { background: COL.body } }), 'corps d’outil'),
        h('span', {}, h('i', { style: { background: COL.cut } }), 'usiné')),
    );
    this.ctx = this.canvas.getContext('2d');
  }

  draw() {
    if (this.el.hidden) return;
    const { machine: m } = this.app;
    const st = m.stock;
    const s = m.s;
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Fenêtre : de derrière les mors jusqu'à 45 mm devant la face ; outil vers le bas (côté opérateur)
    const z0 = -st.L - 26;
    const z1 = 45;
    const rTop = st.R0 + 6;
    const rBot = st.R0 + 44;
    const pad = 10;
    const sc = Math.min((W - 2 * pad) / (z1 - z0), (H - 2 * pad) / (rTop + rBot));
    const ox = pad + ((W - 2 * pad) - (z1 - z0) * sc) / 2;
    const ay = pad + rTop * sc;
    const X = (z) => ox + (z - z0) * sc;
    const Y = (r) => ay + r * sc;

    const alert = m.alert.level !== 'ok' ? m.alert : null;
    const hl = (part, base) => (alert?.info && (alert.info.obstacle.part === part) ? COL[alert.level === 'hit' ? 'hit' : 'warn'] : base);

    // Mandrin et mors (volume balayé : symétrique)
    g.fillStyle = hl('spindle', COL.chuck);
    const jawZ0 = -st.L - 14;
    g.fillRect(X(z0), Y(-80), X(jawZ0) - X(z0), Y(80) - Y(-80));
    g.fillRect(X(jawZ0), Y(-(st.R0 + 24)), X(-st.L) - X(jawZ0), Y(st.R0 + 24) - Y(-(st.R0 + 24)));

    // Pièce (demi-profil haut + bas)
    const path = (sign) => {
      g.beginPath();
      g.moveTo(X(-st.L), Y(0));
      for (let i = 0; i < st.n; i++) {
        const zl = st.zAt(i);
        g.lineTo(X(zl), Y(sign * st.R[i]));
        g.lineTo(X(zl + 0.25), Y(sign * st.R[i]));
      }
      g.lineTo(X(0), Y(0));
      g.closePath();
    };
    g.fillStyle = hl('workpiece', COL.work);
    path(-1);
    g.fill();
    path(1);
    g.fill();
    // surfaces usinées en clair
    g.fillStyle = COL.cut;
    for (let i = 0; i < st.n; i++) {
      if (!st.cutFlag[i] || st.R[i] <= 0) continue;
      const x = X(st.zAt(i));
      const w = Math.max(1, 0.25 * sc);
      g.fillRect(x, Y(-st.R[i]), w, 1.5);
      g.fillRect(x, Y(st.R[i]) - 1.5, w, 1.5);
    }

    // Contre-poupée (si visible dans la fenêtre)
    if (s.tailZ < z1) {
      g.fillStyle = hl('tailstock', COL.tail);
      g.beginPath();
      g.moveTo(X(s.tailZ), Y(0));
      g.lineTo(X(s.tailZ + 22), Y(-9));
      g.lineTo(X(s.tailZ + 22), Y(9));
      g.fill();
      g.fillRect(X(s.tailZ + 22), Y(-24), X(z1 + 50) - X(s.tailZ + 22), Y(24) - Y(-24));
    }

    // Axe
    g.strokeStyle = COL.axis;
    g.setLineDash([10, 3, 2, 3]);
    g.beginPath();
    g.moveTo(0, ay);
    g.lineTo(W, ay);
    g.stroke();
    g.setLineDash([]);

    // Outil
    const zt = m.z;
    const rt = s.r;
    for (const zone of [...ZONES].reverse()) {
      const isAlert = alert?.info?.zone.id === zone.id;
      g.fillStyle = isAlert ? COL[alert.level === 'hit' ? 'hit' : 'warn'] : zone.edge ? COL.edge : zone.id === 'holder' ? COL.holder : COL.body;
      if (zone.edge) {
        g.beginPath();
        g.moveTo(X(zt), Y(rt));
        g.lineTo(X(zt + 7.2), Y(rt + 0.6));
        g.lineTo(X(zt + 7.8), Y(rt + 8.5));
        g.lineTo(X(zt + 0.6), Y(rt + 9.2));
        g.closePath();
        g.fill();
      } else {
        const r1 = Math.min(rt + zone.r1, rBot + 10);
        g.fillRect(X(zt + zone.z0), Y(rt + zone.r0), (zone.z1 - zone.z0) * sc, Y(r1) - Y(rt + zone.r0));
      }
    }
    // pointe
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(X(zt), Y(rt), 2.2, 0, Math.PI * 2);
    g.fill();

    // Repères
    g.font = '10px "Geist Mono", monospace';
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillText(`Z ${signed(zt, 2)}   Ø ${fmt(2 * rt, 2)}`, 8, H - 8);
    g.fillText('Z →', W - 30, ay - 4);
    g.fillText('X ↓', 8, 14);
  }
}
