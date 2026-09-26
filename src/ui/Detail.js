import { h, $, icon } from './dom.js';
import { PARTS } from '../data/parts.js';

/** Libellé du bouton d'action selon l'état courant de la machine. */
function actionLabel(id, s) {
  switch (id) {
    case 'chuckKey': return s.keyIn ? 'Retirer la clé' : 'Remettre la clé';
    case 'guard': return s.guardClosed ? 'Ouvrir le protecteur' : 'Fermer le protecteur';
    case 'estop': return s.estop ? 'Déverrouiller' : 'Enclencher l’arrêt d’urgence';
    case 'mainSwitch': return s.power ? 'Mettre hors tension (0)' : 'Mettre sous tension (I)';
    case 'carriageLock': return s.carriageLocked ? 'Débloquer le trainard' : 'Bloquer le trainard';
    case 'toolClamp': return s.toolClamped ? 'Débrider l’outil' : 'Brider l’outil';
    case 'spindleLever': return s.spindleDir ? 'Arrêter la broche' : 'Démarrer la broche';
    case 'feedLever': return s.autoFeed ? 'Débrayer / changer' : 'Embrayer l’avance';
    case 'halfNut': return s.halfNut ? 'Débrayer l’écrou' : 'Embrayer l’écrou';
    case 'brakeBar': return 'Freiner la broche';
    case 'workpiece': return 'Vérifier le serrage';
    default: return null;
  }
}

/** Fiche d'un organe (panneau droit), ouverte au clic dans la vue 3D ou le module B. */
export class Detail {
  constructor(app) {
    this.app = app;
    this.el = $('#detail');
    this.id = null;
    app.machine.on('change', () => this.id && this.render());
  }

  open(id) {
    this.id = id;
    this.render();
    this.el.classList.add('open');
  }

  close() {
    this.id = null;
    this.el.classList.remove('open');
    this.app.select(null);
  }

  render() {
    const p = PARTS[this.id];
    if (!p) return;
    const app = this.app;
    const label = actionLabel(this.id, app.machine.s);
    // replaceChildren() natif écrirait « null » : on filtre les blocs absents
    const blocks = [
      h('div', { class: 'strip' }),
      h('header', {},
        h('span', { class: 'code' }, `${p.code} · ORGANE`),
        h('button', { class: 'close', title: 'Fermer', onclick: () => this.close(), html: icon('close') })),
      h('h2', {}, p.name),
      h('p', { class: 'desc' }, p.desc),
      p.safety ? h('div', { class: 'safety' }, h('span', { html: icon('warn', 14) }), h('span', {}, p.safety)) : null,
      h('div', { class: 'actions' },
        label && p.action ? h('button', { class: 'btn primary sm', onclick: () => app.machine.act(p.action) }, label) : null,
        p.drag ? h('span', { class: 'note', style: { margin: 0 } }, 'Glissez autour du volant dans la vue 3D, ou utilisez la barre du bas.') : null,
        h('button', { class: 'btn sm', html: `${icon('focus', 13)} Centrer`, onclick: () => app.focusPart(this.id) })),
    ];
    this.el.replaceChildren(...blocks.filter(Boolean));
  }
}
