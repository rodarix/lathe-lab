import './styles.css';
import * as THREE from 'three';
import { Stage, isTyping } from './core/Stage.js';
import { LatheModel } from './lathe/LatheModel.js';
import { Stock } from './sim/Stock.js';
import { Machine } from './sim/Machine.js';
import { Chips } from './sim/Chips.js';
import { Hud } from './ui/Hud.js';
import { Dock } from './ui/Dock.js';
import { Detail } from './ui/Detail.js';
import { Interaction } from './ui/Interaction.js';
import { ProfileView } from './ui/ProfileView.js';
import { PartViewer } from './ui/PartViewer.js';
import { Rail } from './ui/Rail.js';
import { SafetyModule } from './modules/SafetyModule.js';
import { ControlsModule } from './modules/ControlsModule.js';
import { CuttingModule } from './modules/CuttingModule.js';
import { Lesson } from './modules/Lesson.js';
import { $, store } from './ui/dom.js';
import { Y_AX, MM } from './config.js';

/* ------------------------------------------------------------------ noyau */
const stage = new Stage($('#gl'), $('#labels'));
const stock = new Stock(50, 80);
const machine = new Machine(stock);
const model = new LatheModel(stage.scene, stock);
const chips = new Chips(stage.scene);
// Pour brancher un vrai modèle : import { loadLatheGLTF } from './lathe/gltfAdapter.js';
// loadLatheGLTF(model, './models/lathe.glb');

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const VIEWS = {
  overview: () => [v3(1.55, 1.75, 2.45), v3(0, 0.95, 0)],
  operator: (fx) => [v3(fx + 0.5, 1.6, 1.3), v3(fx + 0.18, 1.0, 0.1)],
  // Depuis l'arrière-droite, relatif à l'outil : la tourelle (côté opérateur) ne masque jamais la pointe
  cut: (fx, r) => [v3(fx + 0.2, Y_AX + 0.13, -0.15), v3(fx - 0.015, Y_AX, r * MM * 0.5)],
  top: (fx) => [v3(fx - 0.035, Y_AX + 0.62, 0.1), v3(fx - 0.035, Y_AX, 0.07)],
  exploded: () => [v3(2.1, 2.25, 3.1), v3(0, 1.15, 0)],
};
const VIEW_CYCLE = ['overview', 'operator', 'cut', 'top'];

/* ------------------------------------------------------------------ façade applicative */
const app = {
  stage,
  stock,
  machine,
  model,
  profileOn: false,
  currentView: 'overview',

  view(id) {
    const [pos, target] = VIEWS[id](machine.faceX, machine.s.r);
    // Écran en portrait (téléphone) : on recule pour garder le sujet entier
    const aspect = innerWidth / innerHeight;
    if (aspect < 1) pos.sub(target).multiplyScalar(Math.min(2.2, 1.25 / aspect)).add(target);
    stage.flyTo(pos, target);
    this.currentView = id;
    this.hud?.setView(id);
  },

  select(id) {
    model.selected = id;
    if (id) {
      this.detail.open(id);
      this.lesson.ctx.selected = id;
    } else if (this.detail.id) this.detail.close();
  },

  focusPart(id) {
    const box = new THREE.Box3();
    for (const m of model.parts[id] || []) if (m.visible) box.expandByObject(m);
    if (!box.isEmpty()) stage.frameBox(box, { fill: 2.4, minDist: 0.28 });
    this.hud.setView(null);
  },

  setExploded(on) {
    if (machine.s.exploded === on) return;
    machine.s.exploded = on;
    if (on) {
      machine.s.autoFeed = null;
      machine.jog.z = machine.jog.x = 0;
    }
    model.setExploded(on);
    this.hud.setExploded(on);
    this.view(on ? 'exploded' : 'overview');
    this.hud.setView(on ? null : 'overview');
    machine.emit('change');
  },

  toggleProfile(force) {
    this.profileOn = force ?? !this.profileOn;
    $('#profile').hidden = !this.profileOn;
    this.dock?.refresh();
  },
};

app.hud = new Hud(app);
app.detail = new Detail(app);
app.lesson = new Lesson(app);
app.safety = new SafetyModule(app);
app.controls = new ControlsModule(app);
app.cutting = new CuttingModule(app);
app.rail = new Rail(app, [app.safety, app.controls, app.cutting]);
app.dock = new Dock(app);
app.profile = new ProfileView(app);
app.interaction = new Interaction(app);
app.partViewer = new PartViewer(app);

/* ------------------------------------------------------------------ événements */
const tip = new THREE.Vector3();
machine.on('cut', ({ vol }) => {
  if (!machine.running) return;
  model.toolTipWorld(machine, tip);
  chips.emit(tip, vol);
});
machine.on('stock', () => {
  model.syncStock();
  chips.clear();
});
stage.controls.addEventListener('start', () => app.hud.hideHint());

/* ------------------------------------------------------------------ clavier */
const help = $('#help');
window.addEventListener('keydown', (e) => {
  if (isTyping(e)) return;
  const k = e.key;

  if (k === 'Escape') {
    if (!help.hidden) help.hidden = true;
    else machine.act('estop');
    return;
  }
  if (k.startsWith('Arrow')) {
    e.preventDefault();
    machine.jog.fine = e.shiftKey;
    if (k === 'ArrowLeft') machine.jog.z = -1;
    if (k === 'ArrowRight') machine.jog.z = 1;
    if (k === 'ArrowUp') machine.jog.x = -1;
    if (k === 'ArrowDown') machine.jog.x = 1;
    app.hud.hideHint();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') {
    e.preventDefault();
    machine.act('spindle', machine.s.spindleDir ? 0 : 1);
    return;
  }
  const digit = { Digit1: 'A', Digit2: 'B', Digit3: 'C', Numpad1: 'A', Numpad2: 'B', Numpad3: 'C' }[e.code];
  if (digit) return app.rail.open(digit);

  switch (k.toLowerCase()) {
    case 'x': app.setExploded(!machine.s.exploded); break;
    case 'r': app.setExploded(false); app.view('overview'); break;
    case 'h': app.hud.toggleUI(); break;
    case 'n': model.labelsOn = !model.labelsOn; break;
    case 'f': app.view('cut'); break;
    case 'v': app.view(VIEW_CYCLE[(VIEW_CYCLE.indexOf(app.currentView) + 1) % VIEW_CYCLE.length]); break;
    case 't': machine.act('safePos'); break;
    case 'p': app.toggleProfile(); break;
    case 'g': app.lesson.start(); break;
    case '?': app.hud.showHelp(); break;
    default: return;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') machine.jog.z = 0;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') machine.jog.x = 0;
  if (e.key === 'Shift') machine.jog.fine = false;
});
window.addEventListener('blur', () => (machine.jog.z = machine.jog.x = 0));

/* ------------------------------------------------------------------ boucle */
let lastRebuild = 0;
const lampTarget = new THREE.Vector3();
stage.onFrame((dt, t) => {
  machine.update(dt);
  if (stock.dirty && t - lastRebuild > 0.05) {
    stock.rebuild();
    lastRebuild = t;
  }

  model.alert = machine.alert;
  model.pulse = app.lesson.active ? app.lesson.pulseIds() : app.rail.current === 'A' ? app.safety.pulseIds() : [];
  model.update(machine, dt, t);
  chips.update(dt);
  stage.aimWorkLight(model.lampPos, lampTarget.set(machine.faceX - 0.02, Y_AX, machine.s.r * MM * 0.5));

  app.dock.tick();
  app.hud.tick();
  app.safety.tick();
  app.lesson.tick();
  if (app.rail.current === 'C') app.cutting.tick();
  if (app.profileOn) app.profile.draw();
});

/* ------------------------------------------------------------------ démarrage */
app.view('overview');
app.hud.setView('overview');
stage.start();
if (!store.get('welcomed')) app.hud.showWelcome();
else if (innerWidth > 900) app.rail.open('A'); // sur mobile, les modules restent repliés

// Accès console pour le débogage : window.lathe.machine.s …
window.lathe = app;
