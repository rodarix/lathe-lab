import { h, $, fmt, icon, store } from './dom.js';
import { vcFor } from '../data/cutting.js';

const ICONS = { info: 'info', ok: 'check', warn: 'warn', danger: 'warn' };

/**
 * Éléments d'interface « globaux » : barre de vues, notifications, bandeau
 * d'alerte collision, panneau d'état machine, aide clavier, écran d'accueil.
 */
export class Hud {
  constructor(app) {
    this.app = app;
    this._buildTopbar();
    this._buildStatus();
    this.notices = $('#notices');
    this.alertEl = null;
    this.hint = $('#hint');
    this.hint.textContent = 'Glisser : orbite · Clic droit : déplacer · Molette : zoom · ZQSD / WASD : marcher · ? : raccourcis';

    const m = app.machine;
    m.on('toast', (t) => this.toast(t));
    m.on('collision', (c) => this.toast({ level: 'danger', title: c.title, text: c.text }));
    m.on('alert', (a) => this.renderAlert(a));
    m.on('change', () => this.refresh());
    this.refresh();

    $('#uipill').addEventListener('click', () => this.toggleUI(true));
  }

  /* ------------------------------------------------------------ barre de vues */

  _buildTopbar() {
    const app = this.app;
    const bar = $('#topbar');
    const b = (label, title, fn, cls = '') => h('button', { class: cls, title, onclick: fn, html: label });
    this.btnAssembled = b('Assemblé', 'Vue assemblée (X)', () => app.setExploded(false), 'on');
    this.btnExploded = b('Éclaté', 'Vue éclatée (X)', () => app.setExploded(true));
    this.viewBtns = {};
    const views = [
      ['overview', 'Ensemble', 'Vue d’ensemble (R)'],
      ['operator', 'Opérateur', 'Poste de l’opérateur'],
      ['cut', 'Coupe', 'Zone de coupe (F)'],
      ['top', 'Dessus', 'Vue de dessus : plan XZ'],
    ];
    for (const [id, label, title] of views) this.viewBtns[id] = b(label, title, () => app.view(id), id === 'top' || id === 'operator' ? 'wide' : '');
    const lesson = b(`${icon('play', 12)} Leçon guidée`, 'Leçon guidée (G)', () => app.lesson.start(), 'primary');
    const help = b(icon('help', 15), 'Raccourcis clavier (?)', () => this.showHelp());
    bar.append(this.btnAssembled, this.btnExploded, h('span', { class: 'sep' }), ...Object.values(this.viewBtns), h('span', { class: 'sep' }), lesson, help);

    // Retour au portail : seulement quand l'app est servie par le Raspberry Pi du labo
    if (location.hostname === '192.168.1.38') {
      bar.append(h('span', { class: 'sep' }), h('a', { class: 'portal', href: 'http://192.168.1.38', html: `${icon('grid', 13)} Portail` }));
    }
  }

  setExploded(on) {
    this.btnAssembled.classList.toggle('on', !on);
    this.btnExploded.classList.toggle('on', on);
  }
  setView(id) {
    for (const [k, el] of Object.entries(this.viewBtns)) el.classList.toggle('on', k === id);
  }

  hideHint() {
    this.hint.classList.add('gone');
  }

  /* ------------------------------------------------------------ notifications */

  toast({ level = 'info', title, text = '' }) {
    const el = h('div', { class: `toast ${level}`, role: 'status' },
      h('span', { class: 'ic', html: icon(ICONS[level], 16) }),
      h('div', {}, h('b', {}, title), text ? h('p', {}, text) : null));
    const all = this.notices.querySelectorAll('.toast');
    if (all.length >= 3) all[0].remove();
    this.notices.append(el);
    const ttl = level === 'danger' ? 6500 : 4200;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, ttl);
  }

  /** Bandeau persistant tant que le corps de l'outil est trop proche / en collision. */
  renderAlert(a) {
    this.alertEl?.remove();
    this.alertEl = null;
    if (a.level === 'ok' || !a.info) return;
    const { zone, obstacle, clearance } = a.info;
    const title =
      a.level === 'hit'
        ? 'Collision — mouvement bloqué'
        : obstacle.id === 'work'
          ? 'Risque de collision — le corps de l’outil va toucher la pièce'
          : `Risque de collision — ${obstacle.label} à proximité`;
    const text =
      a.level === 'hit'
        ? `${cap(zone.label)} est en contact avec ${obstacle.label}. Reculez l’outil.`
        : `${cap(zone.label)} est à ${fmt(Math.max(0, clearance), 1)} mm de ${obstacle.label}. Seule l’arête doit toucher la matière.`;
    this.alertEl = h('div', { class: `alertbar ${a.level}`, role: 'alert' },
      h('span', { html: icon('warn', 18), style: { color: a.level === 'hit' ? 'var(--bad)' : 'var(--warn)' } }),
      h('div', {}, h('b', {}, title), h('p', {}, text)));
    this.notices.append(this.alertEl);
  }

  /* ------------------------------------------------------------ état machine */

  _buildStatus() {
    const app = this.app;
    const el = $('#status');
    const led = (id, label, action) => {
      const b = h('button', { class: 'led', 'data-id': id, title: 'Cliquer pour agir', onclick: () => app.machine.act(action) }, h('i'), h('span', {}, label));
      return b;
    };
    this.leds = {
      power: led('power', 'Sous tension', 'power'),
      estop: led('estop', 'Arrêt d’urgence', 'estop'),
      key: led('key', 'Clé retirée', 'key'),
      guard: led('guard', 'Protecteur fermé', 'guard'),
      clamp: led('clamp', 'Outil bridé', 'toolClamp'),
      lock: led('lock', 'Trainard', 'lock'),
    };
    this.nums = {};
    const num = (id, label) => h('div', {}, h('small', {}, label), (this.nums[id] = h('b', {}, '—')));
    el.append(
      h('div', { class: 'head' }, h('span', { class: 'lbl' }, 'État machine'), (this.nums.spindle = h('span', { class: 'mono muted', style: { fontSize: '11px' } }))),
      h('div', { class: 'leds' }, ...Object.values(this.leds)),
      h('div', { class: 'nums' }, num('n', 'N tr/min'), num('f', 'f mm/tr'), num('vc', 'Vc m/min'), num('score', 'Score')),
    );
  }

  refresh() {
    const m = this.app.machine;
    const s = m.s;
    const set = (id, cls, label) => {
      const el = this.leds[id];
      el.className = `led ${cls}`;
      if (label) el.lastChild.textContent = label;
    };
    set('power', s.power ? 'ok' : '', s.power ? 'Sous tension' : 'Hors tension');
    set('estop', s.estop ? 'bad' : 'ok', s.estop ? 'AU enclenché' : 'AU réarmé');
    set('key', s.keyIn ? 'bad' : 'ok', s.keyIn ? 'Clé sur mandrin' : 'Clé retirée');
    set('guard', s.guardClosed ? 'ok' : 'warn', s.guardClosed ? 'Protecteur fermé' : 'Protecteur ouvert');
    set('clamp', s.toolClamped ? 'ok' : 'warn', s.toolClamped ? 'Outil bridé' : 'Outil débridé');
    set('lock', s.carriageLocked ? 'warn' : '', s.carriageLocked ? 'Trainard bloqué' : 'Trainard libre');
    this.nums.n.textContent = s.rpm;
    this.nums.f.textContent = fmt(s.feed, 2);
    this.nums.score.textContent = m.score().score;
    this.nums.spindle.textContent = m.running ? (s.spindleDir > 0 ? '● marche avant' : '● marche arrière') : '○ broche arrêtée';
    this.nums.spindle.style.color = m.running ? 'var(--ok)' : '';
  }

  /** Valeurs continues (appelé à chaque image). */
  tick() {
    const m = this.app.machine;
    const d = Math.min(2 * m.s.r, m.stock.maxRadius() * 2);
    this.nums.vc.textContent = m.running ? Math.round(vcFor(m.s.rpm, d)) : '0';
  }

  /* ------------------------------------------------------------ superpositions */

  toggleUI(force) {
    const off = force === undefined ? !document.body.classList.contains('ui-off') : !force;
    document.body.classList.toggle('ui-off', off);
    $('#uipill').hidden = !off;
  }

  showHelp() {
    const el = $('#help');
    const k = (label, key) => h('div', {}, h('span', {}, label), h('kbd', {}, key));
    el.replaceChildren(
      h('div', { class: 'card', role: 'dialog', 'aria-label': 'Raccourcis clavier' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          h('h2', {}, 'Raccourcis clavier'),
          h('button', { class: 'close', onclick: () => (el.hidden = true), html: icon('close') })),
        h('div', { class: 'keys' },
          k('Trainard ← mandrin / → contre-poupée', '← →'),
          k('Transversal ↑ vers le centre / ↓ recul', '↑ ↓'),
          k('Déplacement fin (avec les flèches)', 'Maj'),
          k('Marche / arrêt broche', 'Espace'),
          k('Arrêt d’urgence', 'Échap'),
          k('Outil en position sûre', 'T'),
          k('Vue assemblée / éclatée', 'X'),
          k('Réinitialiser la vue', 'R'),
          k('Cadrer la zone de coupe', 'F'),
          k('Changer de point de vue', 'V'),
          k('Vue 2D (plan XZ)', 'P'),
          k('Étiquettes des organes', 'N'),
          k('Masquer l’interface', 'H'),
          k('Leçon guidée', 'G'),
          k('Modules A · B · C', '1 2 3'),
          k('Marcher dans l’atelier', 'ZQSD / WASD'),
        ),
        h('p', { class: 'lead' }, 'Souris : glisser pour tourner autour de la machine, clic droit pour déplacer, molette pour zoomer. Sur tablette : un doigt pour tourner, deux pour zoomer. Les volants se tournent en glissant autour de leur centre, dans la vue 3D ou dans la barre du bas.'),
      ),
    );
    el.hidden = false;
    el.onclick = (e) => {
      if (e.target === el) el.hidden = true;
    };
  }

  showWelcome() {
    const el = $('#welcome');
    const close = () => {
      el.hidden = true;
      store.set('welcomed', true);
    };
    el.replaceChildren(
      h('div', { class: 'card', role: 'dialog', 'aria-label': 'Bienvenue' },
        h('div', { class: 'lbl' }, 'Lathe Lab · atelier de tournage'),
        h('h2', { style: { marginTop: '8px' } }, 'Apprenez à conduire un tour, sans risque.'),
        h('p', { class: 'lead' }, 'Un tour parallèle conventionnel, entièrement manipulable. Chaque erreur (clé oubliée, passe trop profonde, collision avec le mandrin) est expliquée, sans conséquence.'),
        h('div', { class: 'paths' },
          h('div', {}, h('b', {}, 'A'), h('h4', {}, 'Sécurité'), h('p', {}, 'La séquence de démarrage, dans l’ordre.')),
          h('div', {}, h('b', {}, 'B'), h('h4', {}, 'Commandes'), h('p', {}, 'Trainard, transversal, avances, collisions.')),
          h('div', {}, h('b', {}, 'C'), h('h4', {}, 'Vitesses'), h('p', {}, 'Vc, N et avance selon le matériau.'))),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', html: `${icon('play', 12)} Commencer la leçon guidée`, onclick: () => { close(); this.app.lesson.start(); } }),
          h('button', { class: 'btn', onclick: () => { close(); if (innerWidth > 900) this.app.rail.open('A'); } }, 'Explorer librement'),
        ),
        h('p', { class: 'note', style: { marginTop: '14px' } }, 'Astuce : appuyez sur ? à tout moment pour voir les raccourcis clavier.'),
      ),
    );
    el.hidden = false;
  }
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
