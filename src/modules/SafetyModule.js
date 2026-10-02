import { h, icon, store } from '../ui/dom.js';
import { PARTS } from '../data/parts.js';

/**
 * MODULE A — Sécurité & mise en marche.
 * Les étapes sont évaluées sur l'ÉTAT de la machine (pas sur des cases cochées) :
 * remettre la clé fait revenir la séquence à l'étape 3, etc.
 * En mode « séquence imposée », une action qui ferait avancer une étape future
 * est refusée (voir `gate`) et comptée comme erreur.
 */
export const STEPS = [
  {
    action: 'ppe', target: null, btn: 'Je confirme',
    title: 'Porter les EPI',
    text: 'Lunettes de protection, chaussures de sécurité, cheveux attachés, manches ajustées. Pas de gants, bagues, montre ni écharpe près de la broche.',
    done: (s) => s.ppe,
  },
  {
    action: 'checkWorkpiece', target: 'workpiece', btn: 'Vérifier',
    title: 'Vérifier le serrage de la pièce',
    text: 'Pièce serrée sur ≈ 1/3 de la longueur des mors, bien centrée. Porte-à-faux ≤ 3 × Ø, sinon contre-pointe.',
    done: (s) => s.workpieceChecked,
  },
  {
    action: 'key', target: 'chuckKey', btn: 'Retirer la clé',
    title: 'Retirer la clé de mandrin',
    text: 'La clé ne reste JAMAIS sur le mandrin : au démarrage elle serait projetée. On la retire dès le serrage terminé.',
    done: (s) => !s.keyIn,
  },
  {
    action: 'toolClamp', target: 'toolClamp', btn: 'Brider l’outil',
    title: 'Brider l’outil dans la tourelle',
    text: 'Outil court en porte-à-faux, pointe à hauteur d’axe, tourelle serrée.',
    done: (s) => s.toolClamped,
  },
  {
    action: 'safePos', target: 'carriageWheel', btn: 'Dégager l’outil',
    title: 'Placer le trainard en position sûre',
    text: 'L’outil doit être éloigné de la pièce (≥ 5 mm) et le trainard libre de tout obstacle avant le démarrage.',
    // Une fois la broche lancée, l'outil a le droit d'approcher : l'étape reste acquise
    done: (s, m) => m.running || m.carriageSafe(),
  },
  {
    action: 'guard', target: 'guard', btn: 'Fermer le protecteur',
    title: 'Fermer le protecteur',
    text: 'Il protège des projections et commande un contact de sécurité : ouvert, la broche ne démarre pas.',
    done: (s) => s.guardClosed,
  },
  {
    action: 'applyRecommended', target: 'speedLevers', btn: 'Appliquer la vitesse conseillée',
    title: 'Sélectionner la vitesse de broche',
    text: 'N dépend du matériau et du Ø : N = 1000·Vc / (π·D). Broche arrêtée uniquement. Détail dans le module C.',
    done: (s, m) => m.running || m.speedOK(),
    dynamic: (m) => {
      const r = m.recommendation();
      return `Ici : ≈ ${Math.round(r.n)} tr/min → ${r.nBox} tr/min sur la boîte (actuel : ${m.s.rpm}).`;
    },
  },
  {
    action: 'power', target: 'mainSwitch', btn: 'Mettre sous tension',
    title: 'Mettre sous tension',
    text: 'Arrêt d’urgence déverrouillé, puis interrupteur général sur « I ».',
    done: (s) => s.power && !s.estop,
  },
  {
    action: 'spindleCycle', target: 'spindleLever', btn: 'Démarrer la broche',
    title: 'Démarrer la broche',
    text: 'Appuyer sur l’interrupteur vert, sur le dessus de la poupée fixe. Rester face à la machine, hors de l’axe de projection du mandrin.',
    done: (s) => s.spindleDir !== 0,
  },
];

const RULES = [
  'Jamais de gants près d’une pièce en rotation : ils s’enroulent et entraînent la main.',
  'Ne jamais mesurer, toucher ou nettoyer une pièce en rotation.',
  'Copeaux : crochet ou balayette, machine arrêtée. Jamais à la main ni à la soufflette.',
  'Changer de vitesse uniquement broche arrêtée.',
  'Garder la main près du levier d’avance pour débrayer avant la fin de course.',
  'Dresser trainard bloqué, par passes de 0,5 à 2 mm.',
  'En cas de doute : arrêt d’urgence (coup-de-poing) ou barre de freinage.',
];

export class SafetyModule {
  code = 'A';
  title = 'Sécurité';

  constructor(app) {
    this.app = app;
    this.enforce = store.get('enforce', true);
    this.el = h('div', { class: 'mod' });
    const m = app.machine;

    // Garde-fou : bloque les actions qui feraient avancer une étape future
    m.gate = (action, args) => {
      if (!this.enforce) return null;
      if (action === 'spindle' && args[0] === 0) return null;
      if (action === 'spindleCycle' && m.s.spindleDir !== 0) return null;
      const aliases = { spindle: 'spindleCycle', rpm: null, applyRecommended: null, safePos: null };
      const key = action in aliases ? aliases[action] : action;
      if (!key) return null;
      const idx = STEPS.findIndex((st) => st.action === key);
      if (idx < 0 || STEPS[idx].done(m.s, m)) return null;
      const cur = this.currentIndex();
      if (idx > cur) return `Terminez d’abord l’étape ${cur + 1} : « ${STEPS[cur].title} ».`;
      return null;
    };

    // Partie statique construite une fois (les <details> gardent leur état ouvert/fermé)
    this.dyn = h('div');
    this.el.append(
      h('h2', {}, 'Sécurité & mise en marche'),
      h('p', { class: 'lead' }, 'Neuf vérifications, toujours dans cet ordre, avant toute mise en rotation. L’étape en cours clignote dans la vue 3D.'),
      this.dyn,
      h('label', { class: 'switch' },
        h('span', {}, 'Séquence imposée (ordre obligatoire)'),
        h('input', { type: 'checkbox', checked: this.enforce, onchange: (e) => { this.enforce = e.target.checked; store.set('enforce', this.enforce); } }),
        h('i')),
      h('details', { class: 'fold' },
        h('summary', { class: 'lbl' }, 'Règles d’or au tour'),
        h('ul', { class: 'rules' }, RULES.map((r) => h('li', {}, r)))),
      h('details', { class: 'fold' },
        h('summary', { class: 'lbl' }, 'Arrêter la machine'),
        h('p', { style: { marginTop: '8px', fontSize: '12.5px' } }, 'Arrêt normal : nouvel appui sur l’interrupteur vert. Urgence : coup-de-poing rouge (Échap) ou barre de freinage au pied.'),
        h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm', onclick: () => m.act('spindle', 0) }, 'Arrêt broche'),
          h('button', { class: 'btn sm', onclick: () => m.act('brake') }, 'Barre de frein'),
          h('button', { class: 'btn danger sm', onclick: () => m.act('estop') }, 'Arrêt d’urgence'))),
    );

    m.on('change', () => this.render());
    this.render();
  }

  /** Certaines étapes dépendent de la position de l'outil : réévaluées à chaque image. */
  tick() {
    const key = this.app.machine.s.rpm + ':' + this.currentIndex();
    if (key !== this._key) this.render();
  }

  currentIndex() {
    const m = this.app.machine;
    const i = STEPS.findIndex((st) => !st.done(m.s, m));
    return i < 0 ? STEPS.length : i;
  }
  get complete() {
    return this.currentIndex() >= STEPS.length;
  }

  /** Organe à faire clignoter dans la vue 3D. */
  pulseIds() {
    const st = STEPS[this.currentIndex()];
    return st?.target ? [st.target] : [];
  }

  render() {
    const m = this.app.machine;
    const cur = this.currentIndex();
    this._key = m.s.rpm + ':' + cur;
    const pct = (Math.min(cur, STEPS.length) / STEPS.length) * 100;

    const list = h('ol', { class: 'steps' });
    STEPS.forEach((st, i) => {
      const done = st.done(m.s, m);
      const isCur = i === cur;
      const li = h('li', { class: `step${done ? ' done' : ''}${isCur ? ' cur' : ''}` },
        h('span', { class: 'n', html: done ? icon('check', 12) : String(i + 1) }),
        h('span', { class: 't' }, st.title));
      if (isCur) {
        li.append(h('p', { class: 'more' }, st.text, st.dynamic ? h('span', { style: { display: 'block', marginTop: '4px', color: '#9bb8ff' } }, st.dynamic(m)) : null));
        li.append(h('div', { class: 'do' },
          h('button', { class: 'btn primary sm pulse', onclick: () => m.act(st.action) }, st.btn),
          st.target ? h('span', { class: 'where' }, `ou cliquez : ${PARTS[st.target].name.toLowerCase()}`) : null));
      }
      list.append(li);
    });

    const status = this.complete
      ? h('div', { class: 'toast ok', style: { marginTop: '12px', animation: 'none' } },
          h('span', { class: 'ic', html: icon('check', 16) }),
          h('div', {}, h('b', {}, 'Machine prête — broche en marche'), h('p', {}, 'Passez au module B pour manœuvrer l’outil, ou lancez la leçon guidée.')))
      : null;

    this.dyn.replaceChildren(...[h('div', { class: 'progress' }, h('i', { style: { width: `${pct}%` } })), list, status].filter(Boolean));
  }
}
