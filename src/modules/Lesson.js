import { h, $, icon, fmt } from '../ui/dom.js';

/**
 * Leçon guidée « premier dressage » : sécurité → mouvements → dressage → bilan.
 * Chaque étape a une tâche concrète vérifiée en continu sur l'état de la
 * simulation ; « Suivant » s'active (et clignote) quand la tâche est faite.
 */
export class Lesson {
  constructor(app) {
    this.app = app;
    this.el = $('#lesson');
    this.i = -1;
    this.ctx = { orbited: false, selected: null, explodedSeen: false };
    this.steps = this._steps();
    app.stage.controls.addEventListener('start', () => (this.ctx.orbited = true));
  }

  _steps() {
    const app = this.app;
    const m = app.machine;
    const R = () => m.stock.maxRadius();
    const d0 = () => Math.round(R() * 2);
    return [
      {
        title: 'Bienvenue dans l’atelier',
        text: 'Voici un tour parallèle conventionnel. Faites-le pivoter en glissant avec la souris (ou un doigt). Molette ou pincement pour zoomer, clic droit pour déplacer la vue.',
        task: 'Faites tourner la vue autour de la machine',
        check: () => this.ctx.orbited,
        enter: () => app.view('overview'),
      },
      {
        title: 'Identifier les organes',
        text: 'Survolez la machine : chaque organe s’éclaire et affiche son nom. Le grand volant chromé sur le tablier, à l’avant, déplace le trainard.',
        task: 'Cliquez sur le volant du trainard',
        check: () => this.ctx.selected === 'carriageWheel',
        pulse: ['carriageWheel'],
        enter: () => app.view('operator'),
      },
      {
        title: 'Vue éclatée',
        text: 'La vue éclatée sépare les ensembles : poupée, trainard, chariots, tourelle, contre-poupée. Appuyez sur X (ou « Éclaté »), observez, puis revenez en vue assemblée.',
        task: 'Ouvrir puis refermer la vue éclatée',
        check: () => this.ctx.explodedSeen && app.model.explode < 0.05,
      },
      {
        title: 'Sécurité : la séquence de démarrage',
        text: 'Avant toute mise en rotation, neuf vérifications dans l’ordre (module A, à gauche). L’organe concerné clignote en bleu : cliquez-le dans la vue 3D ou utilisez le bouton de l’étape.',
        task: 'Démarrer la broche en respectant la séquence',
        check: () => app.safety.complete && m.running,
        module: 'A',
        pulse: () => app.safety.pulseIds(),
        enter: () => app.view('operator'),
      },
      {
        title: 'Axe Z : le trainard',
        text: 'Le volant du trainard déplace l’outil le long de la pièce. Tournez-le dans la vue 3D, avec la barre du bas, ou avec les flèches ← →. Z = 0 correspond à la face de la pièce.',
        task: 'Amenez l’outil entre Z = 0 et Z = +3 mm',
        check: () => m.z >= -0.05 && m.z <= 3,
        pulse: ['carriageWheel'],
        profile: true,
        enter: () => app.view('top'),
      },
      {
        title: 'Axe X : le chariot transversal',
        text: 'Le volant transversal rapproche l’outil de l’axe (sens horaire). Placez l’outil juste au-dessus du brut, sans le toucher. Flèches ↑ ↓ (Maj pour un réglage fin).',
        task: () => `Ø entre ${d0() + 2} et ${d0() + 6} mm`,
        check: () => 2 * m.s.r >= d0() + 1.9 && 2 * m.s.r <= d0() + 6.1 && m.z >= -0.05,
        pulse: ['crossWheel'],
        profile: true,
      },
      {
        title: 'Bloquer le trainard',
        text: 'En dressage, l’effort de coupe pousse l’outil vers la contre-poupée. On bloque donc le trainard avec sa vis, sur le dessus de la selle.',
        task: 'Cliquez sur la vis de blocage du trainard',
        check: () => m.s.carriageLocked,
        pulse: ['carriageLock'],
        enter: () => app.focusPart('carriageLock'),
      },
      {
        title: 'Prendre la passe au chariot supérieur',
        text: 'Trainard bloqué, la profondeur de dressage se règle au chariot supérieur (petit volant à droite de la tourelle). Attention : au-delà de ≈ 7 mm, ce n’est plus l’arête mais le talon de l’outil qui touche !',
        task: 'Z entre −1,0 et −0,3 mm (outil toujours au-dessus du brut)',
        check: () => m.z <= -0.3 && m.z >= -1 && m.s.r > R(),
        pulse: ['compoundWheel'],
        profile: true,
        enter: () => app.view('top'),
      },
      {
        title: 'Dresser la face',
        text: 'Tournez le volant transversal dans le sens horaire jusqu’au centre (Ø 0), ou embrayez l’avance automatique « Dressage ▲ ». Observez les copeaux et la vue 2D.',
        task: 'Face dressée jusqu’au centre',
        check: () => m.stock.faceZ() <= -0.25,
        pulse: ['crossWheel', 'feedLever'],
        profile: true,
        enter: () => app.view('cut'),
      },
      {
        title: 'Dégager et arrêter',
        text: 'Reculez l’outil au-dessus de la pièce (↓ ou volant transversal), débloquez le trainard, puis arrêtez la broche (interrupteur vert sur la poupée ou Espace).',
        task: 'Outil dégagé, trainard libre, broche arrêtée',
        check: () => !m.running && !m.s.carriageLocked && m.ev.workClear > 2,
        pulse: ['spindleLever', 'carriageLock'],
      },
      {
        title: 'Bilan',
        final: true,
        text: 'Vous avez réalisé votre premier dressage en sécurité. Pour aller plus loin : les démonstrations de collision (module B) et le calcul des vitesses (module C).',
      },
    ];
  }

  get active() {
    return this.i >= 0;
  }

  start() {
    this.app.setExploded(false);
    this.i = 0;
    this.ctx.orbited = false;
    this.ctx.selected = null;
    this.ctx.explodedSeen = false;
    this.startLog = this.app.machine.log.length;
    document.body.classList.add('lesson-on');
    this.go(0);
  }

  stop() {
    if (this.i < 0) return;
    this.i = -1;
    this.el.hidden = true;
    document.body.classList.remove('lesson-on');
    this.app.dock.highlight([]);
  }

  go(i) {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    const st = this.steps[this.i];
    st.enter?.();
    if (st.module) this.app.rail.open(st.module);
    if (st.profile) this.app.toggleProfile(true);
    this._done = null;
    this.render();
  }

  /** Organes à faire clignoter (le module A fournit les siens à l'étape sécurité). */
  pulseIds() {
    if (!this.active) return [];
    const p = this.steps[this.i].pulse;
    return typeof p === 'function' ? p() : p || [];
  }

  tick() {
    if (!this.active) return;
    if (this.app.model.explode > 0.9) this.ctx.explodedSeen = true;
    const st = this.steps[this.i];
    const done = st.final ? true : !!st.check();
    if (done !== this._done) {
      this._done = done;
      this.render();
    }
    this.app.dock.highlight(this.pulseIds());
  }

  render() {
    const st = this.steps[this.i];
    const n = this.steps.length;
    const done = this._done;
    const task = typeof st.task === 'function' ? st.task() : st.task;
    const next = h('button', { class: `btn ${done ? 'primary pulse' : 'ghost'}`, onclick: () => (this.i === n - 1 ? this.stop() : this.go(this.i + 1)) },
      this.i === n - 1 ? 'Terminer' : done ? 'Suivant →' : 'Passer');

    let body;
    if (st.final) {
      const all = this.app.machine.log.slice(0, this.app.machine.log.length - this.startLog);
      const c = all.filter((e) => e.kind === 'collision').length;
      const v = all.filter((e) => e.kind === 'violation').length;
      const score = Math.max(0, 100 - 10 * c - 5 * v);
      body = [
        h('div', { class: 'kpis' },
          h('div', {}, h('small', {}, 'Collisions'), h('b', { style: { color: c ? 'var(--bad)' : 'var(--ok)' } }, c)),
          h('div', {}, h('small', {}, 'Erreurs'), h('b', { style: { color: v ? 'var(--warn)' : 'var(--ok)' } }, v)),
          h('div', {}, h('small', {}, 'Score'), h('b', {}, score))),
        h('p', { class: 'txt' }, `Matière enlevée : ${fmt(this.app.machine.stock.removed / 1000, 2)} cm³. ${c + v === 0 ? 'Parcours sans faute, bravo !' : 'Consultez l’historique (module B) pour revoir vos erreurs.'}`),
      ];
    } else {
      body = [h('div', { class: `task${done ? ' done' : ''}` }, h('i', { html: done ? icon('check', 11) : '' }), h('span', {}, task))];
    }

    this.el.replaceChildren(
      h('div', { class: 'bar' }, h('i', { style: { width: `${((this.i + 1) / n) * 100}%` } })),
      h('header', {},
        h('span', { class: 'lbl' }, `Leçon guidée · ${this.i + 1}/${n}`),
        h('button', { class: 'close', title: 'Quitter la leçon', onclick: () => this.stop(), html: icon('close') })),
      h('h2', {}, st.title),
      h('p', { class: 'txt' }, st.text),
      ...body,
      h('footer', {},
        h('button', { class: 'btn ghost sm', disabled: this.i === 0, onclick: () => this.go(this.i - 1), html: `${icon('back', 12)} Précédent` }),
        st.final ? h('button', { class: 'btn sm', onclick: () => this.start() }, 'Recommencer') : null,
        next),
    );
    this.el.hidden = false;
  }
}
