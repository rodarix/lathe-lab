import { h, icon, fmt } from '../ui/dom.js';
import { PARTS } from '../data/parts.js';

const COMMANDS = [
  ['carriageWheel', 'Axe Z · 1 tour = 30 mm'],
  ['crossWheel', 'Axe X · 1 tour = 8 mm au Ø'],
  ['compoundWheel', 'Z fin · 1 tour = 2,5 mm'],
  ['carriageLock', 'À serrer pour dresser'],
  ['feedLever', 'Chariotage / dressage automatique'],
  ['halfNut', 'Filetage — mouvement rapide'],
  ['spindleLever', 'Bouton vert : marche / arrêt broche'],
  ['speedLevers', 'N — broche arrêtée uniquement'],
  ['gearbox', 'Avance f en mm/tr'],
  ['tailstock', 'Pointe, perçage'],
  ['brakeBar', 'Arrêt immédiat, au pied'],
  ['estop', 'Coupe tous les mouvements'],
];

/** Schéma vue de dessus : axes Z et X, zone de danger du talon. */
const AXES_SVG = `
<svg viewBox="0 0 260 120" width="100%" role="img" aria-label="Axes Z et X du tour, vus de dessus">
  <rect x="6" y="18" width="34" height="64" rx="3" fill="#3a3f47"/>
  <rect x="40" y="36" width="12" height="28" fill="#4b5058"/>
  <rect x="52" y="38" width="118" height="24" fill="#8d8a85"/>
  <line x1="0" y1="50" x2="260" y2="50" stroke="rgba(255,255,255,.3)" stroke-dasharray="8 3 2 3"/>
  <path d="M170 62 l0 0" />
  <polygon points="150,62 159,63 160,74 151,75" fill="#c9a24a"/>
  <rect x="151" y="75" width="20" height="40" fill="#6b7079"/>
  <rect x="160" y="66" width="11" height="9" fill="#ff5a4f" opacity=".85"/>
  <text x="176" y="72" fill="#ff8b82" font-size="9" font-family="Geist Mono, monospace">talon</text>
  <path d="M232 22 H 188" stroke="#2d6bff" stroke-width="2" marker-end="url(#ar)"/>
  <text x="236" y="26" fill="#9bb8ff" font-size="11" font-family="Geist Mono, monospace">Z</text>
  <path d="M215 110 V 72" stroke="#2d6bff" stroke-width="2" marker-end="url(#ar)"/>
  <text x="220" y="114" fill="#9bb8ff" font-size="11" font-family="Geist Mono, monospace">X</text>
  <text x="56" y="30" fill="#8b9099" font-size="9" font-family="Geist Mono, monospace">pièce</text>
  <text x="8" y="12" fill="#8b9099" font-size="9" font-family="Geist Mono, monospace">mandrin</text>
  <defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#2d6bff"/></marker></defs>
</svg>`;

/**
 * MODULE B — Leviers & mouvements : localisation des commandes, manuel vs
 * automatique, démonstrations (dont les collisions typiques), historique.
 */
export class ControlsModule {
  code = 'B';
  title = 'Commandes';

  constructor(app) {
    this.app = app;
    const m = app.machine;
    this.cmdBtns = {};
    this.hist = h('ul', { class: 'hist' });
    this.score = h('div', { class: 'score' });

    const cmds = h('ul', { class: 'cmds' },
      COMMANDS.map(([id, sub]) => {
        const b = h('button', { onclick: () => { app.select(id); app.focusPart(id); } },
          h('span', { class: 'cd' }, PARTS[id].code),
          h('span', {}, PARTS[id].name, h('small', {}, sub)),
          h('span', { class: 'ch', html: icon('chevron', 12) }));
        this.cmdBtns[id] = b;
        return h('li', {}, b);
      }));

    const demo = (kind, title, text, danger = false) =>
      h('button', { class: `demo${danger ? ' danger' : ''}`, onclick: () => this.runDemo(kind) }, h('b', {}, title), h('span', {}, text));

    this.tailOut = h('output', {});
    this.tailRange = h('input', { type: 'range', min: 0, max: 1, step: 0.001, oninput: (e) => this.setTail(Number(e.target.value)) });

    this.el = h('div', { class: 'mod' },
      h('h2', {}, 'Commandes & mouvements'),
      h('p', { class: 'lead' }, 'Deux axes : Z le long de la pièce (trainard), X perpendiculaire à l’axe (chariot transversal). Seule l’arête dorée de l’outil a le droit de toucher la matière.'),
      h('div', { style: { marginTop: '12px' }, html: AXES_SVG }),
      h('h3', {}, 'Les commandes'),
      cmds,
      h('h3', {}, 'Manuel ou automatique ?'),
      h('p', { style: { fontSize: '12.5px' } }, 'Manuel : on tourne les volants — approche, prise de passe, petites reprises. Automatique : le levier d’embrayage relie le trainard à la barre de chariotage ; l’outil avance de f mm à chaque tour de broche (Vf = f × N). L’avance ne s’arrête pas seule : on débraye avant la fin de course.'),
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm', onclick: () => { app.select('feedLever'); app.focusPart('feedLever'); } }, 'Voir le levier d’avance'),
        h('button', { class: 'btn sm', onclick: () => app.toggleProfile(true) }, 'Ouvrir la vue 2D')),
      h('h3', {}, 'Démonstrations'),
      h('div', { class: 'demos' },
        demo('turn', 'Chariotage', 'Passe longitudinale en avance automatique.'),
        demo('face', 'Dressage', 'Trainard bloqué, passe de 0,8 mm jusqu’au centre.'),
        demo('deepFace', 'Danger : dressage trop profond', 'Prise de passe de 10 mm : le talon touche.', true),
        demo('chuck', 'Danger : jusqu’au mandrin', 'L’avance n’est pas débrayée à temps.', true)),
      h('p', { class: 'note' }, 'Les démos préparent la machine automatiquement et ne comptent pas dans le score.'),
      h('h3', {}, 'Contre-poupée', this.tailOut),
      this.tailRange,
      h('p', { class: 'note' }, 'Approchez la pointe au contact de la face (pièces longues). Le trainard ne peut pas la dépasser.'),
      h('h3', {}, 'Historique', this.score),
      this.hist,
    );

    m.on('log', () => this.renderLog());
    m.on('change', () => this.syncTail());
    m.on('stock', () => this.syncTail());
    this.renderLog();
    this.syncTail();
  }

  onShow() {
    this.syncTail();
  }

  setTail(t) {
    const m = this.app.machine;
    const [a, b] = m.tailLimits();
    m.act('tail', a + (b - a) * t);
  }
  syncTail() {
    const m = this.app.machine;
    const [a, b] = m.tailLimits();
    const t = (m.s.tailZ - a) / Math.max(1, b - a);
    this.tailRange.value = t;
    this.tailRange.style.setProperty('--fill', `${t * 100}%`);
    this.tailOut.textContent = `pointe à ${fmt(m.s.tailZ - m.stock.faceZ(), 0)} mm de la face`;
  }

  renderLog() {
    const m = this.app.machine;
    const sc = m.score();
    this.score.replaceChildren(
      h('span', {}, 'collisions ', h('b', {}, sc.collisions)),
      h('span', {}, 'erreurs ', h('b', {}, sc.violations)),
      h('span', {}, 'score ', h('b', {}, sc.score)));
    this.hist.replaceChildren(
      ...(m.log.length
        ? m.log.slice(0, 20).map((e) =>
            h('li', { class: e.kind },
              h('time', {}, e.t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })),
              h('span', {}, e.title)))
        : [h('li', {}, h('time', {}, '—'), h('span', { class: 'muted' }, 'Aucun incident. Continuez ainsi.'))]),
    );
  }

  /** Démonstrations scriptées (file de mouvements de Machine.path). */
  runDemo(kind) {
    const app = this.app;
    const m = app.machine;
    const s = m.s;
    const st = m.stock;
    app.setExploded(false);
    app.lesson?.stop();

    m.path = [];
    m.demo = true;
    const rec = m.recommendation();
    Object.assign(s, {
      keyIn: false, guardClosed: true, toolClamped: true, power: true, estop: false, ppe: true,
      workpieceChecked: true, autoFeed: null, halfNut: false, spindleDir: 0, carriageLocked: false,
      rpm: rec.nBox, feed: rec.f,
    });
    m.changed();
    app.toggleProfile(true);
    app.view('top');

    const R = st.maxRadius();
    const face = st.faceZ();
    const fast = 60;
    const start = { fn: (mm) => { mm.s.spindleDir = 1; mm.changed(); } };
    const stop = (msg) => ({ fn: (mm) => { mm.s.spindleDir = 0; mm.s.carriageLocked = false; mm.changed(); if (msg) mm.emit('toast', msg); } });
    const lock = (on) => ({ fn: (mm) => { mm.s.carriageLocked = on; mm.changed(); } });
    const approach = [{ r: R + 6, v: fast }, { cz: 0, v: fast }];
    const len = Math.min(40, st.L - 12);

    const scripts = {
      turn: [...approach, { zc: face + 3, v: fast }, { r: R - 1.5, v: 30 }, start, { wait: 0.5 },
        { zc: face - len, v: 5 }, { r: R + 6, v: 30 }, { zc: face + 12, v: fast },
        stop({ level: 'ok', title: 'Chariotage terminé', text: `Ø réduit de ${fmt(3, 0)} mm sur ${len} mm. Vf réelle = f × N = ${fmt(s.feed * s.rpm, 0)} mm/min (démo accélérée).` })],
      face: [...approach, { zc: face - 0.8, v: fast }, lock(true), start, { wait: 0.5 },
        { r: 0, v: 4 }, { r: R + 6, v: 30 }, lock(false), { zc: face + 12, v: fast },
        stop({ level: 'ok', title: 'Dressage terminé', text: 'Face dressée de 0,8 mm. Trainard bloqué pendant la passe : l’effort de coupe ne l’a pas fait reculer.' })],
      deepFace: [...approach, { zc: face - 10, v: fast }, lock(true), start, { wait: 0.5 },
        { r: 0, v: 3, expectHit: true }, { wait: 2.5 }, { r: R + 8, v: 20 }, lock(false), { zc: face + 12, v: fast },
        stop({ level: 'warn', title: 'Ce qu’il fallait retenir', text: 'La prise de passe (10 mm) dépassait la longueur d’arête (≈ 7 mm) : le talon de l’outil a heurté la face. Dressez par passes de 0,5 à 2 mm.' })],
      chuck: [...approach, { zc: face + 3, v: fast }, { r: R - 1, v: 30 }, start, { wait: 0.5 },
        { zc: -st.L - 80, v: 25, expectHit: true }, { wait: 2.5 }, { r: R + 8, v: 20 }, { zc: face + 12, v: fast },
        stop({ level: 'warn', title: 'Ce qu’il fallait retenir', text: 'L’avance n’a pas été débrayée : la plaquette a percuté les mors. Repérez la cote d’arrêt et débrayez 3 mm avant.' })],
    };
    m.path = scripts[kind];
  }
}
