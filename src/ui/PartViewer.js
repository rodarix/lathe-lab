import * as THREE from 'three';
import { $, h, fmt } from './dom.js';
import { MM, Y_AX } from '../config.js';
import { MATERIALS } from '../data/cutting.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, text) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
};
const n1 = (v) => fmt(v, 1);

/** Échelles d'affichage possibles (pixels par millimètre), de la plus grande à la plus petite. */
const SCALES = [8, 6, 5, 4, 3, 2.5, 2, 1.5];

/**
 * Visualiseur de pièce finie.
 *  1. le bouton « Voir la pièce » (à droite de l'arrêt d'urgence) passe en vue de dessus ;
 *  2. l'élève choisit à la souris l'endroit où couper la pièce ;
 *  3. la partie coupée (côté contre-poupée) est dessinée en 2D, avec une règle graduée
 *     en millimètres en haut et à droite : il suffit d'une capture d'écran pour l'envoyer.
 */
export class PartViewer {
  constructor(app) {
    this.app = app;
    this.picking = false;
    this.zCut = null;
    this.student = '';
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -Y_AX);
    this.hit = new THREE.Vector3();

    // Calque de sélection de la coupe (au-dessus de la vue 3D)
    this.line = h('div', { class: 'pv-line' });
    this.tag = h('div', { class: 'pv-tag' });
    this.pick = h('div', { class: 'pv-pick', hidden: true },
      h('div', { class: 'pv-banner panel' },
        h('b', {}, 'Choisissez où couper la pièce'),
        h('span', {}, 'Cliquez sur la pièce à l’endroit de la coupe. La partie à droite du trait (côté contre-poupée) sera dessinée.'),
        h('button', { class: 'btn sm', onclick: () => this.cancel() }, 'Annuler ', h('kbd', {}, 'Échap'))),
      this.line, this.tag);
    this.pick.addEventListener('pointermove', (e) => this.onMove(e));
    this.pick.addEventListener('pointerdown', (e) => this.onDown(e));
    this.pick.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    // Fenêtre de résultat
    this.sheet = h('div', { class: 'pv-sheet' });
    this.nameInput = h('input', {
      type: 'text', placeholder: 'Nom et prénom de l’élève', maxlength: 40,
      oninput: (e) => { this.student = e.target.value; this.render(); },
    });
    this.result = h('div', { class: 'overlay pv-result', hidden: true },
      h('div', { class: 'pv-card' },
        h('div', { class: 'pv-tools' },
          h('label', { class: 'pv-name' }, h('span', { class: 'lbl' }, 'Élève'), this.nameInput),
          h('div', { class: 'pv-btns' },
            h('button', { class: 'btn sm', onclick: () => this.start() }, 'Nouvelle coupe'),
            h('button', { class: 'btn sm', onclick: () => this.savePng() }, 'Enregistrer l’image'),
            h('button', { class: 'btn sm primary', onclick: () => this.close() }, 'Fermer'))),
        this.sheet,
        h('p', { class: 'pv-help' }, 'Faites une capture d’écran de la feuille (ou « Enregistrer l’image ») et envoyez-la à votre professeur.')));

    document.body.append(this.pick, this.result);
    window.addEventListener('resize', () => { if (!this.result.hidden) this.render(); });
    // Échap annule la sélection / ferme la fenêtre AVANT l'arrêt d'urgence clavier
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.picking) this.cancel();
      else if (!this.result.hidden) this.close();
      else return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }, { capture: true });
  }

  /* ---------------------------------------------------------------- sélection */

  start() {
    const { machine: m, model, stage } = this.app;
    if (m.running) {
      m.toast('part', 'warn', 'Arrêtez la broche d’abord', 'On ne mesure et on ne coupe une pièce que broche arrêtée.', 0);
      return;
    }
    if (m.s.exploded) this.app.setExploded(false);
    m.s.autoFeed = null;
    m.jog.z = m.jog.x = 0;
    this.result.hidden = true;
    this.picking = true;
    this.pick.hidden = false;
    this.line.hidden = this.tag.hidden = true;
    document.body.classList.add('pv-picking');
    // Protecteur masqué le temps de la sélection : vue dégagée sur la pièce
    model.guardPivot.visible = false;

    // Vue de dessus centrée sur la pièce (léger décalage en z pour éviter l'alignement exact avec « up »)
    const st = m.stock;
    const xc = m.faceX - (st.L * MM) / 2;
    const dist = Math.max(0.3, st.L * MM * 3.4);
    this.prevView = { pos: stage.camera.position.clone(), target: stage.controls.target.clone() };
    stage.flyTo(new THREE.Vector3(xc, Y_AX + dist, 0.001), new THREE.Vector3(xc, Y_AX, 0));
    this.app.hud.setView(null);
  }

  /** Abscisse Z (mm) visée par la souris, ou null hors de la pièce. */
  zFromEvent(e) {
    const { stage, machine: m } = this.app;
    const r = stage.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, stage.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null;
    const st = m.stock;
    const z = (this.hit.x - m.faceX) / MM;
    const zFace = st.faceZ();
    if (z < -st.L || z > zFace) return null;
    return Math.round(z * 4) / 4; // pas de 0,25 mm (résolution du profil)
  }

  onMove(e) {
    const z = this.zFromEvent(e);
    if (z == null) {
      this.line.hidden = this.tag.hidden = true;
      this.pick.style.cursor = 'not-allowed';
      return;
    }
    this.pick.style.cursor = 'crosshair';
    const { stage, machine: m } = this.app;
    const st = m.stock;
    const R = (st.maxRadius() + 6) * MM;
    const x = m.faceX + z * MM;
    const a = new THREE.Vector3(x, Y_AX, -R).project(stage.camera);
    const b = new THREE.Vector3(x, Y_AX, R).project(stage.camera);
    const rect = stage.canvas.getBoundingClientRect();
    const px = (v) => [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
    const [ax, ay] = px(a);
    const [bx, by] = px(b);
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    Object.assign(this.line.style, { left: `${ax}px`, top: `${ay}px`, width: `${len}px`, transform: `rotate(${ang}rad)` });
    this.line.hidden = false;
    this.tag.hidden = false;
    this.tag.textContent = `Longueur de la pièce : ${n1(st.faceZ() - z)} mm`;
    Object.assign(this.tag.style, { left: `${e.clientX + 16}px`, top: `${e.clientY + 16}px` });
  }

  onDown(e) {
    if (e.button !== 0) return;
    const z = this.zFromEvent(e);
    if (z == null) return;
    const st = this.app.machine.stock;
    if (st.faceZ() - z < 1) {
      this.app.machine.toast('part', 'warn', 'Pièce trop courte', 'Coupez plus à gauche : la pièce doit mesurer au moins 1 mm.', 0);
      return;
    }
    this.zCut = z;
    this.endPicking();
    this.result.hidden = false;
    this.render();
  }

  endPicking() {
    this.picking = false;
    this.pick.hidden = true;
    document.body.classList.remove('pv-picking');
    this.app.model.guardPivot.visible = true;
  }

  cancel() {
    this.endPicking();
    this.back();
  }

  close() {
    this.result.hidden = true;
    this.back();
  }

  back() {
    if (this.prevView) this.app.stage.flyTo(this.prevView.pos, this.prevView.target);
    this.prevView = null;
  }

  /* ---------------------------------------------------------------- dessin 2D */

  /** Profil de la pièce coupée : tronçons { u0, u1, R, cut } avec u en mm depuis la coupe. */
  segments() {
    const st = this.app.machine.stock;
    const zFace = st.faceZ();
    const i0 = Math.max(0, st.index(this.zCut + 1e-6));
    const runs = [];
    for (let i = i0; i < st.n; i++) {
      const z0 = st.zAt(i);
      if (z0 >= zFace - 1e-6) break;
      const R = st.R[i];
      const cut = !!st.cutFlag[i];
      const u0 = Math.max(0, z0 - this.zCut);
      const u1 = z0 + 0.25 - this.zCut;
      const last = runs[runs.length - 1];
      if (last && Math.abs(last.R - R) < 1e-4 && last.cut === cut) last.u1 = u1;
      else runs.push({ u0, u1, R, cut });
    }
    return runs.filter((r) => r.R > 1e-4 && r.u1 > r.u0);
  }

  render() {
    const m = this.app.machine;
    const st = m.stock;
    const runs = this.segments();
    if (!runs.length) return;
    const Lp = runs[runs.length - 1].u1;
    const Rmax = Math.max(...runs.map((r) => r.R));
    const Rmin = Math.min(...runs.map((r) => r.R));
    const Rr = Math.ceil(Rmax / 5) * 5; // règle verticale : jusqu'au multiple de 5 mm supérieur
    const Lr = Math.ceil(Lp);

    // Échelle : la plus grande qui tient à l'écran (identique pour les deux règles)
    const maxW = Math.min(innerWidth - 48, 1180) - 150;
    const maxH = innerHeight - 330;
    const s = SCALES.find((k) => Lr * k <= maxW && 2 * Rr * k <= maxH) ?? SCALES[SCALES.length - 1];

    const pad = 24;
    const x0 = pad + 14;
    const xE = x0 + Lp * s;
    const base = pad + 34; // trait de la règle du haut
    const yA = base + 26; // haut de la zone de dessin (+Rr)
    const yC = yA + Rr * s; // axe
    const yB = yC + Rr * s;
    const xR = x0 + Lr * s + 26; // règle de droite
    const W = Math.max(xR + 46 + pad, 600);
    const titleY = yB + 34;
    const H = titleY + 74 + pad;

    const svg = sv('svg', { xmlns: SVGNS, width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'font-family': 'Arial, Helvetica, sans-serif' });
    svg.append(sv('rect', { x: 0, y: 0, width: W, height: H, fill: '#ffffff' }));
    svg.append(sv('rect', { x: 8, y: 8, width: W - 16, height: H - 16, fill: 'none', stroke: '#1a1a1a', 'stroke-width': 1.2 }));

    // Quadrillage léger tous les 5 mm (sur toute la zone de dessin)
    const grid = sv('g', { stroke: '#e6ebf2', 'stroke-width': 1 });
    for (let k = 0; k <= Lr; k += 5) grid.append(sv('line', { x1: x0 + k * s, y1: yA, x2: x0 + k * s, y2: yB }));
    for (let k = -Rr; k <= Rr; k += 5) grid.append(sv('line', { x1: x0, y1: yC - k * s, x2: x0 + Lr * s, y2: yC - k * s }));
    svg.append(grid);

    // Pièce : tronçons bruts (gris foncé) et usinés (gris clair), puis contour
    for (const r of runs) {
      svg.append(sv('rect', {
        x: x0 + r.u0 * s, y: yC - r.R * s, width: (r.u1 - r.u0) * s, height: 2 * r.R * s,
        fill: r.cut ? '#dfe5ec' : '#a9a49b',
      }));
    }
    let d = `M ${x0} ${yC}`;
    for (const r of runs) d += ` L ${x0 + r.u0 * s} ${yC - r.R * s} L ${x0 + r.u1 * s} ${yC - r.R * s}`;
    d += ` L ${xE} ${yC}`;
    for (let i = runs.length - 1; i >= 0; i--) {
      const r = runs[i];
      d += ` L ${x0 + r.u1 * s} ${yC + r.R * s} L ${x0 + r.u0 * s} ${yC + r.R * s}`;
    }
    d += ' Z';
    svg.append(sv('path', { d, fill: 'none', stroke: '#111', 'stroke-width': 1.6, 'stroke-linejoin': 'miter' }));
    // Axe (trait mixte)
    svg.append(sv('line', { x1: x0 - 10, y1: yC, x2: xE + 10, y2: yC, stroke: '#c0392b', 'stroke-width': 1, 'stroke-dasharray': '14 3 2 3' }));

    // Règle du haut (longueur, 0 sur la face de coupe)
    const top = sv('g', { stroke: '#111', 'stroke-width': 1 });
    top.append(sv('line', { x1: x0, y1: base, x2: x0 + Lr * s, y2: base }));
    const stepTop = s >= 2.5 ? 1 : 2;
    for (let k = 0; k <= Lr; k += stepTop) {
      const big = k % 10 === 0;
      const mid = k % 5 === 0;
      const x = x0 + k * s;
      top.append(sv('line', { x1: x, y1: base, x2: x, y2: base - (big ? 11 : mid ? 7 : 4) }));
      if (big) top.append(sv('text', { x, y: base - 15, 'text-anchor': 'middle', 'font-size': 11, fill: '#111', stroke: 'none' }, String(k)));
    }
    top.append(sv('text', { x: x0 + Lr * s + 8, y: base + 4, 'font-size': 11, fill: '#555', stroke: 'none' }, 'mm'));
    // Repères de la pièce sous la règle (début et fin)
    top.append(sv('line', { x1: x0, y1: base, x2: x0, y2: yA - 2, stroke: '#9aa3ad', 'stroke-dasharray': '2 3' }));
    top.append(sv('line', { x1: xE, y1: base, x2: xE, y2: yC - Rmax * s, stroke: '#9aa3ad', 'stroke-dasharray': '2 3' }));
    svg.append(top);

    // Règle de droite (distance à l'axe, 0 sur l'axe)
    const right = sv('g', { stroke: '#111', 'stroke-width': 1 });
    right.append(sv('line', { x1: xR, y1: yA, x2: xR, y2: yB }));
    const stepR = s >= 2.5 ? 1 : 2;
    for (let k = -Rr; k <= Rr; k += stepR) {
      const big = k % 10 === 0;
      const mid = k % 5 === 0;
      const y = yC - k * s;
      right.append(sv('line', { x1: xR, y1: y, x2: xR + (big ? 11 : mid ? 7 : 4), y2: y }));
      if (big || (mid && Rr <= 15)) right.append(sv('text', { x: xR + 15, y: y + 4, 'font-size': 11, fill: '#111', stroke: 'none' }, String(Math.abs(k))));
    }
    svg.append(right);

    // Cartouche
    const mat = MATERIALS[m.s.material]?.name ?? m.s.material;
    const date = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    const cart = sv('g', { 'font-size': 12, fill: '#111' });
    cart.append(sv('line', { x1: 8, y1: titleY - 12, x2: W - 8, y2: titleY - 12, stroke: '#1a1a1a', 'stroke-width': 1.2 }));
    cart.append(sv('text', { x: pad, y: titleY + 6, 'font-size': 15, 'font-weight': 'bold' }, 'Pièce usinée — Lathe Lab'));
    cart.append(sv('text', { x: pad, y: titleY + 26 }, `Élève : ${this.student.trim() || '……………………………'}`));
    cart.append(sv('text', { x: pad, y: titleY + 44 }, `Matériau : ${mat} · brut Ø ${n1(st.d0)} mm`));
    cart.append(sv('text', { x: W - pad, y: titleY + 6, 'text-anchor': 'end' }, date));
    cart.append(sv('text', { x: W - pad, y: titleY + 26, 'text-anchor': 'end' }, `Longueur ${n1(Lp)} mm · Ø maxi ${n1(2 * Rmax)} mm · Ø mini ${n1(2 * Rmin)} mm`));
    cart.append(sv('text', { x: W - pad, y: titleY + 62, 'text-anchor': 'end', 'font-size': 11, fill: '#555' }, 'Règles en mm · à droite : distance à l’axe (Ø = 2 × lecture)'));
    // Légende des surfaces
    const lg = sv('g', { 'font-size': 11, fill: '#333' });
    lg.append(sv('rect', { x: pad, y: titleY + 54, width: 12, height: 9, fill: '#a9a49b', stroke: '#111', 'stroke-width': 0.6 }));
    lg.append(sv('text', { x: pad + 17, y: titleY + 62 }, 'surface brute'));
    lg.append(sv('rect', { x: pad + 110, y: titleY + 54, width: 12, height: 9, fill: '#dfe5ec', stroke: '#111', 'stroke-width': 0.6 }));
    lg.append(sv('text', { x: pad + 127, y: titleY + 62 }, 'surface usinée'));
    cart.append(lg);
    svg.append(cart);

    this.svg = svg;
    this.sheet.replaceChildren(svg);
  }

  savePng() {
    if (!this.svg) return;
    const xml = new XMLSerializer().serializeToString(this.svg);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      const k = 2;
      const c = document.createElement('canvas');
      c.width = img.width * k;
      c.height = img.height * k;
      const g = c.getContext('2d');
      g.scale(k, k);
      g.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      const who = this.student.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      a.download = `piece${who ? '-' + who : ''}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    };
    img.src = url;
  }
}
