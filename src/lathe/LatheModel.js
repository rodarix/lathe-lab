import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { M, speedPlate, feedPlate, namePlate, warningSticker, threadMaterial } from './materials.js';
import { box, cylX, cylY, cylZ, cylBetween, sphere, mesh, handwheel, lever, plate, tag } from './builders.js';
import { Y_AX, MM, TAU, SPINDLE_NOSE_X, JAW_FACE_LOCAL, HANDWHEEL } from '../config.js';
import { GEARBOX_RPM, FEEDS } from '../data/cutting.js';
import { PARTS } from '../data/parts.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const approach = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);

/** Portion de cylindre d'axe X (rayon r, de x0 à x1) entre les angles a0 et a1 :
 *  y = r·sin φ, z = r·cos φ (φ = 0 vers l'avant, π/2 en haut). */
function arcShell(r, x0, x1, a0, a1, seg = 64) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const phi = a0 + ((a1 - a0) * i) / seg;
    const y = r * Math.sin(phi);
    const z = r * Math.cos(phi);
    pos.push(x0, y, z, x1, y, z);
    if (i < seg) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Tour parallèle procédural (placeholder réaliste) + « rig » d'animation.
 *
 * ─── CONTRAT POUR REMPLACER PAR UN GLTF ─────────────────────────────────────
 * La simulation ne connaît que les nœuds suivants (voir gltfAdapter.js) :
 *   carriage        Group  x = faceX + Zc·MM      (trainard + tablier + chariots)
 *   crossPos        Group  z = r·MM               (enfant de carriage)
 *   compPos         Group  x = cz·MM              (enfant de crossPos : chariot sup. + tourelle + outil)
 *   spindleRot      Group  rotation.x = angle     (mandrin, mors, clé, pièce)
 *   tail            Group  x = faceX + tailZ·MM   (contre-poupée)
 *   guardPivot      Group  rotation.x (0 fermé → −0.75 ouvert)
 *   wheels.*        Group  userData.spin.rotation.z = angle du volant
 *   levers.*        Group  rotations d'état (voir update())
 * La POINTE de l'outil est à l'origine locale de compPos (x = 0, y = Y_AX, z = 0).
 * Chaque maillage cliquable porte userData.part = id de data/parts.js.
 * ────────────────────────────────────────────────────────────────────────────
 */
export class LatheModel {
  constructor(scene, stock) {
    this.scene = scene;
    this.stock = stock;
    this.root = new THREE.Group();
    this.root.name = 'Lathe';
    scene.add(this.root);

    this.assemblies = [];
    this.wheels = {};
    this.levers = {};
    this.explode = 0;
    this.explodeTarget = 0;
    this.labelsOn = false;
    this.hover = null;
    this.selected = null;
    this.pulse = [];
    this.alert = null;
    this.anim = { key: 0, guard: 1, clamp: 1, lock: 0, feed: 0, spindle: 0, nut: 1.1, estop: 0, brake: 0 };

    this._buildBase();
    this._buildBed();
    this._buildHeadstock();
    this._buildSpindle();
    this._buildGuard();
    this._buildCarriage();
    this._buildTailstock();
    this._buildSplash();

    this.syncStock();
    this.indexParts();
  }

  /* ================================================================ outils */

  /** Ensemble éclatable : décalage appliqué proportionnellement au facteur d'éclatement. */
  addAssembly(obj, offset, partId, anchor) {
    const entry = { obj, base: obj.position.clone(), offset: new THREE.Vector3(...offset) };
    if (partId) {
      const el = document.createElement('div');
      el.className = 'label3d';
      el.innerHTML = `<b>${PARTS[partId]?.code ?? ''}</b>${PARTS[partId]?.name ?? partId}`;
      el.dataset.part = partId;
      const lbl = new CSS2DObject(el);
      lbl.position.set(...anchor);
      obj.add(lbl);
      entry.label = lbl;
    }
    this.assemblies.push(entry);
    return obj;
  }

  indexParts() {
    this.parts = {};
    this.pickables = [];
    this.root.traverse((o) => {
      if (o.isMesh && o.userData.part) {
        (this.parts[o.userData.part] ??= []).push(o);
        this.pickables.push(o);
      }
    });
  }

  /* ================================================================ socle */

  _buildBase() {
    // Socle gauche (armoire électrique)
    const left = new THREE.Group();
    left.add(box(-0.98, -0.36, 0.06, 0.8, -0.26, 0.26, M.blue, 0.01));
    left.add(box(-0.97, -0.37, 0, 0.06, -0.25, 0.25, M.plinth, 0.004));
    left.add(box(-0.9, -0.46, 0.14, 0.7, 0.258, 0.266, M.white, 0.004));
    left.add(box(-0.475, -0.465, 0.36, 0.46, 0.266, 0.274, M.black, 0.002));
    const sticker = plate(0.08, 0.08, warningSticker);
    sticker.position.set(-0.8, 0.6, 0.2665);
    left.add(sticker);

    const sw = new THREE.Group();
    sw.position.set(-0.56, 0.6, 0.266);
    sw.add(box(-0.04, 0.04, -0.04, 0.04, 0, 0.006, M.yellow, 0.004));
    const knob = new THREE.Group();
    knob.add(cylZ(0.018, 0.006, 0.02, 0, 0, M.red));
    knob.add(box(-0.006, 0.006, -0.03, 0.03, 0.012, 0.03, M.red, 0.004));
    sw.add(knob);
    tag(sw, 'mainSwitch');
    left.add(sw);
    this.levers.mainSwitch = knob;
    // Voyant « sous tension » : matériau propre, non cliquable (piloté dans update)
    this.powerLamp = cylZ(0.009, 0.266, 0.276, -0.56, 0.5, M.ledOn.clone());
    left.add(this.powerLamp);
    tag(left, 'pedestal');
    this.root.add(this.addAssembly(left, [-0.12, 0, 0], 'pedestal', [-0.67, 0.84, 0.28]));

    // Socle droit
    const right = new THREE.Group();
    right.add(box(0.42, 0.98, 0.06, 0.8, -0.24, 0.24, M.blue, 0.01));
    right.add(box(0.43, 0.97, 0, 0.06, -0.23, 0.23, M.plinth, 0.004));
    right.add(box(0.5, 0.9, 0.16, 0.66, 0.24, 0.243, M.blueDark, 0.002));
    right.add(box(0.86, 0.87, 0.38, 0.46, 0.243, 0.25, M.black, 0.002));
    tag(right, 'pedestal');
    this.root.add(this.addAssembly(right, [0.12, 0, 0]));

    // Bac à copeaux
    const tray = new THREE.Group();
    tray.add(box(-0.36, 0.42, 0.6, 0.62, -0.26, 0.34, M.tray, 0.004));
    tray.add(box(-0.36, 0.42, 0.62, 0.66, 0.33, 0.345, M.tray, 0.003));
    tray.add(box(-0.36, 0.42, 0.62, 0.8, -0.24, -0.225, M.tray, 0.003));
    tag(tray, 'chipTray');
    this.root.add(this.addAssembly(tray, [0, 0, 0.3], 'chipTray', [0.03, 0.66, 0.33]));

    // Barre de freinage rouge
    const brake = new THREE.Group();
    brake.add(cylX(0.014, -0.4, 0.46, 0.5, 0.4, M.red, 20));
    brake.add(box(-0.39, -0.37, 0.49, 0.51, 0.25, 0.41, M.red, 0.004));
    brake.add(box(0.43, 0.45, 0.49, 0.51, 0.23, 0.41, M.red, 0.004));
    tag(brake, 'brakeBar');
    this.brake = brake;
    this.root.add(this.addAssembly(brake, [0, 0, 0.5], 'brakeBar', [0.03, 0.53, 0.4]));
  }

  /* ================================================================ banc */

  _buildBed() {
    const bed = new THREE.Group();
    bed.add(box(-0.98, 0.98, 0.8, 0.925, -0.2, 0.2, M.blue, 0.006));
    // Glissières : V avant / plat arrière pour le trainard, plat + V intérieurs pour la contre-poupée
    const vway = (z) => {
      const m = mesh(new THREE.BoxGeometry(1.96, 0.026, 0.026), M.steel);
      m.rotation.x = Math.PI / 4;
      m.position.set(0, 0.927, z);
      return m;
    };
    bed.add(vway(0.165));
    bed.add(vway(-0.04));
    bed.add(box(-0.98, 0.98, 0.925, 0.94, 0.07, 0.12, M.steel, 0.001));
    bed.add(box(-0.98, 0.98, 0.925, 0.94, -0.19, -0.12, M.steel, 0.001));
    bed.add(box(-0.9, 0.95, 0.885, 0.905, 0.2, 0.212, M.steelDark, 0));
    bed.add(box(0.92, 0.98, 0.7, 0.925, 0.2, 0.3, M.blue, 0.006));
    tag(bed, 'bed');
    this.root.add(this.addAssembly(bed, [0, 0.08, 0], 'bed', [0.62, 0.95, 0.2]));

    const rods = new THREE.Group();
    rods.add(cylX(0.013, -0.62, 0.95, 0.87, 0.255, threadMaterial, 20));
    rods.add(cylX(0.01, -0.62, 0.95, 0.815, 0.255, M.steel, 16));
    rods.add(cylX(0.008, -0.62, 0.95, 0.76, 0.255, M.steel, 16));
    tag(rods, 'leadscrew');
    this.root.add(this.addAssembly(rods, [0, -0.06, 0.3], 'leadscrew', [0.4, 0.87, 0.255]));
  }

  /* ================================================================ poupée fixe */

  _buildHeadstock() {
    const hs = new THREE.Group();
    hs.add(box(-0.98, -0.45, 0.925, 1.36, -0.24, 0.2, M.blue, 0.02));
    hs.add(box(-0.96, -0.47, 1.35, 1.38, -0.22, 0.18, M.blue, 0.01));
    hs.add(cylX(0.1, -0.47, -0.447, Y_AX, 0, M.blue, 40));

    const sp = plate(0.16, 0.12, speedPlate(GEARBOX_RPM));
    sp.position.set(-0.575, 1.24, 0.2015);
    hs.add(sp);
    const np = plate(0.16, 0.05, namePlate);
    np.position.set(-0.72, 1.335, 0.2015);
    hs.add(np);
    hs.add(cylZ(0.018, 0.2, 0.206, -0.56, 1.02, M.steel));
    hs.add(cylZ(0.013, 0.206, 0.208, -0.56, 1.02, new THREE.MeshStandardMaterial({ color: 0xd8a830, roughness: 0.2, metalness: 0.2 })));

    // Leviers de vitesse (sélection gamme + vitesse)
    const speed = new THREE.Group();
    const mkSpeedLever = (x, y) => {
      const g = new THREE.Group();
      g.position.set(x, y, 0.2);
      g.add(cylZ(0.034, 0, 0.018, 0, 0, M.chrome, 40));
      const arm = lever({ len: 0.075, r: 0.006, knob: 0.014 });
      arm.position.z = 0.022;
      g.add(arm);
      speed.add(g);
      return g;
    };
    this.levers.speedA = mkSpeedLever(-0.89, 1.2);
    this.levers.speedB = mkSpeedLever(-0.77, 1.2);
    tag(speed, 'speedLevers');
    hs.add(speed);

    // Interrupteur vert de marche broche, sur le dessus de la poupée fixe
    const sw = new THREE.Group();
    sw.position.set(-0.8, 1.38, 0.1);
    sw.add(box(-0.04, 0.04, 0, 0.022, -0.04, 0.04, M.black, 0.005)); // boîtier
    sw.add(cylY(0.026, 0.022, 0.03, 0, 0, M.chrome, 40)); // collerette
    const btnCap = cylY(0.019, 0, 0.016, 0, 0, M.green.clone(), 40);
    btnCap.position.y = 0.03;
    btnCap.userData.ownMat = true; // matériau propre : l'éclairage « en marche » sert de base aux surbrillances
    btnCap.userData.baseEmissive = new THREE.Color(0, 0, 0);
    btnCap.material.emissiveIntensity = 1;
    sw.add(btnCap);
    tag(sw, 'spindleLever');
    this.levers.spindle = btnCap;
    hs.add(sw);

    // Arrêt d'urgence
    const es = new THREE.Group();
    es.position.set(-0.92, 1.3, 0.2);
    es.add(cylZ(0.036, 0, 0.006, 0, 0, M.yellow, 40));
    const btn = new THREE.Group();
    btn.add(cylZ(0.012, 0.006, 0.02, 0, 0, M.black));
    const cap = mesh(new THREE.SphereGeometry(0.026, 28, 14, 0, TAU, 0, Math.PI / 2), M.red);
    cap.rotation.x = Math.PI / 2;
    cap.scale.set(1, 0.55, 1);
    cap.position.z = 0.02;
    btn.add(cap);
    es.add(btn);
    tag(es, 'estop');
    this.levers.estop = btn;
    hs.add(es);

    // Lampe de travail
    const lamp = new THREE.Group();
    lamp.add(cylY(0.018, 1.38, 1.4, -0.62, -0.18, M.black));
    lamp.add(cylBetween(new THREE.Vector3(-0.62, 1.4, -0.18), new THREE.Vector3(-0.6, 1.64, -0.16), 0.006, M.black));
    // Tête de lampe en arrière de l'axe : elle éclaire la coupe sans masquer la vue de dessus
    lamp.add(cylBetween(new THREE.Vector3(-0.6, 1.64, -0.16), new THREE.Vector3(-0.44, 1.6, -0.2), 0.006, M.black));
    const shade = mesh(new THREE.ConeGeometry(0.045, 0.07, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.set(-0.43, 1.575, -0.2);
    shade.rotation.set(-0.5, 0, 0.35);
    lamp.add(shade);
    lamp.add(sphere(0.018, M.lampOn, -0.43, 1.56, -0.19));
    tag(lamp, 'lamp');
    hs.add(lamp);
    this.lampPos = new THREE.Vector3(-0.43, 1.55, -0.19);

    // Clé de mandrin rangée (visible quand elle est retirée)
    this.keyParked = this._makeKey();
    this.keyParked.rotation.set(0, 0.4, Math.PI / 2); // couchée sur le dessus de la poupée
    this.keyParked.position.set(-0.52, 1.391, 0.02);
    tag(this.keyParked, 'chuckKey');
    hs.add(this.keyParked);

    tag(hs, 'headstock');
    this.root.add(this.addAssembly(hs, [-0.1, 0.42, -0.05], 'headstock', [-0.72, 1.42, 0]));

    // Boîte des avances (Norton)
    const gb = new THREE.Group();
    gb.add(box(-0.98, -0.6, 0.64, 0.925, 0.19, 0.29, M.blue, 0.012));
    const fp = plate(0.2, 0.078, feedPlate(FEEDS));
    fp.position.set(-0.82, 0.87, 0.2915);
    gb.add(fp);
    [-0.93, -0.84, -0.75].forEach((x, i) => {
      const g = new THREE.Group();
      g.position.set(x, 0.74, 0.29);
      g.add(cylZ(0.022, 0, 0.012, 0, 0, M.chrome, 32));
      const l = lever({ len: 0.05, r: 0.004, knob: 0.01 });
      l.rotation.z = (i - 1) * 0.5;
      l.position.z = 0.016;
      g.add(l);
      gb.add(g);
    });
    gb.add(cylX(0.018, -0.6, -0.58, 0.87, 0.255, M.blue));
    tag(gb, 'gearbox');
    this.root.add(this.addAssembly(gb, [-0.05, -0.12, 0.4], 'gearbox', [-0.79, 0.95, 0.29]));
  }

  _makeKey() {
    const k = new THREE.Group();
    k.add(cylY(0.0065, 0.072, 0.15, 0, 0, M.steelDark, 6)); // carré d'entraînement
    k.add(cylZ(0.008, -0.07, 0.07, 0, 0.152, M.steelDark, 16));
    k.add(cylZ(0.0105, -0.075, -0.035, 0, 0.152, M.black, 16));
    k.add(cylZ(0.0105, 0.035, 0.075, 0, 0.152, M.black, 16));
    return k;
  }

  /* ================================================================ broche & mandrin */

  _buildSpindle() {
    const ex = new THREE.Group();
    ex.position.set(SPINDLE_NOSE_X, Y_AX, 0);
    const rot = new THREE.Group();
    ex.add(rot);
    this.spindleRot = rot;

    const chuck = new THREE.Group();
    chuck.add(cylX(0.075, 0, 0.012, 0, 0, M.steelDark, 48));
    chuck.add(cylX(0.08, 0.012, 0.06, 0, 0, M.steel, 64, 0.077));
    chuck.add(cylX(0.024, 0.059, 0.0605, 0, 0, M.blackOxide, 32));
    this.jaws = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const slot = box(0.0595, 0.0605, 0.02, 0.078, -0.011, 0.011, M.blackOxide, 0);
      const holder = new THREE.Group();
      holder.rotation.x = a;
      holder.add(slot);
      const jaw = new THREE.Group();
      jaw.add(box(0.052, JAW_FACE_LOCAL, 0, 0.012, -0.009, 0.009, M.blackOxide, 0.001));
      jaw.add(box(0.052, 0.066, 0.012, 0.024, -0.009, 0.009, M.blackOxide, 0.001));
      holder.add(jaw);
      this.jaws.push(jaw);
      // Carrés de clé entre les mors
      const sock = new THREE.Group();
      sock.rotation.x = a + TAU / 6;
      sock.add(box(0.03, 0.042, 0.0775, 0.0805, -0.006, 0.006, M.black, 0));
      chuck.add(holder, sock);
    }
    tag(chuck, 'spindle');
    rot.add(chuck);

    // Clé de mandrin (dans le carré supérieur)
    const keyPivot = new THREE.Group();
    keyPivot.rotation.x = TAU / 6;
    this.key = this._makeKey();
    this.key.position.x = 0.036;
    keyPivot.add(this.key);
    tag(this.key, 'chuckKey');
    rot.add(keyPivot);

    // Pièce
    tag(this.stock.mesh, 'workpiece');
    rot.add(this.stock.mesh);

    this.spindleEx = ex;
    this.root.add(this.addAssembly(ex, [0.1, 0.34, 0.42], 'spindle', [0.04, 0.12, 0]));
  }

  /** Recalage du brut (longueur / Ø) dans le mandrin. */
  syncStock() {
    this.stock.mesh.position.x = JAW_FACE_LOCAL + this.stock.L * MM;
    for (const jaw of this.jaws) jaw.position.y = this.stock.R0 * MM;
  }

  /* ================================================================ protecteur */

  _buildGuard() {
    // Protecteur articulé à l'arrière, sur toute la longueur du tour :
    // cadre blanc + vitre en polycarbonate transparente sur toute sa surface.
    const R = 0.2;
    const PHI_BACK = Math.PI - 0.2; // bord arrière (charnière), angle mesuré depuis +Z (avant) vers +Y (haut)
    const PHI_FRONT = 0.55; // bord avant de la partie longue : passe au-dessus de la tourelle et de son levier
    const PHI_CHUCK = -0.45; // au droit du mandrin, le protecteur descend plus bas côté opérateur
    const X0 = -0.46; // contre la poupée fixe
    const XC = -0.36; // fin de la zone mandrin
    const X1 = 0.95; // bout du banc
    const hy = R * Math.sin(PHI_BACK);
    const hz = R * Math.cos(PHI_BACK);
    const ex = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.position.set(0, Y_AX + hy, hz);
    ex.add(pivot);
    // Repère « axe de broche » dans le repère du pivot
    const shell = new THREE.Group();
    shell.position.set(0, -hy, -hz);
    pivot.add(shell);

    const P = (r, phi) => [r * Math.sin(phi), r * Math.cos(phi)]; // → [y, z]
    const glass = (geo) => {
      const m = mesh(geo, M.polycarb, { cast: false, receive: false });
      m.userData.seeThrough = true;
      m.renderOrder = 2;
      return m;
    };
    /** Arc de tube (montant du cadre) d'axe X, à l'abscisse x. */
    const ribGeo = (r, tube, a0, a1) => {
      const g = new THREE.TorusGeometry(r, tube, 8, 64, a1 - a0);
      g.rotateZ(a0);
      g.rotateY(-Math.PI / 2); // (cos a, sin a, 0) → (0, sin a, cos a) : φ = a
      return g;
    };
    /** Secteur plan (joue) dans le plan YZ, à l'abscisse x. */
    const cheekGeo = (r0, r1, a0, a1) => {
      const g = new THREE.RingGeometry(r0, r1, 48, 1, a0, a1 - a0);
      g.rotateY(-Math.PI / 2);
      return g;
    };
    // Vitres : grande coque sur toute la longueur + jupe avant au droit du mandrin
    const longGlass = glass(arcShell(R, X0, X1, PHI_FRONT, PHI_BACK));
    shell.add(longGlass);
    shell.add(glass(arcShell(R, X0, XC, PHI_CHUCK, PHI_FRONT)));
    // Joues : côté contre-poupée (bout du banc) et fin de la jupe mandrin
    const endCheek = glass(cheekGeo(0.12, R, PHI_FRONT, PHI_BACK));
    endCheek.position.x = X1;
    shell.add(endCheek);
    const chuckCheek = glass(cheekGeo(0.105, R, PHI_CHUCK, PHI_FRONT));
    chuckCheek.position.x = XC;
    shell.add(chuckCheek);

    // Cadre blanc : arceaux, lisses longitudinales
    const tube = 0.006;
    const rib = (x, a0, a1) => {
      const m = mesh(ribGeo(R, tube, a0, a1), M.white);
      m.position.x = x;
      shell.add(m);
    };
    rib(X0 + tube, PHI_CHUCK, PHI_BACK);
    rib(XC, PHI_CHUCK, PHI_FRONT);
    rib(X1, PHI_FRONT, PHI_BACK);
    [0.06, 0.5].forEach((x) => rib(x, PHI_FRONT, PHI_BACK));
    const rail = (x0, x1, phi) => {
      const [y, z] = P(R, phi);
      shell.add(cylX(tube, x0, x1, y, z, M.white, 12));
    };
    rail(X0, X1, PHI_FRONT); // lisse avant
    rail(X0, X1, Math.PI / 2 + 0.25); // lisse supérieure
    rail(X0, XC, PHI_CHUCK); // bord bas de la jupe mandrin

    // Poignée sur la lisse avant, à portée de main près du mandrin
    const [hy0, hz0] = P(R, PHI_FRONT);
    const [hy1, hz1] = P(R + 0.03, PHI_FRONT - 0.05);
    const hx0 = -0.3;
    const hx1 = -0.12;
    shell.add(cylX(0.007, hx0, hx1, hy1, hz1, M.black, 12));
    shell.add(cylBetween(new THREE.Vector3(hx0 + 0.005, hy0, hz0), new THREE.Vector3(hx0 + 0.005, hy1, hz1), 0.004, M.black));
    shell.add(cylBetween(new THREE.Vector3(hx1 - 0.005, hy0, hz0), new THREE.Vector3(hx1 - 0.005, hy1, hz1), 0.004, M.black));

    pivot.add(cylX(0.012, X0, X1, 0, 0, M.steelDark, 16)); // charnière
    tag(ex, 'guard');
    this.guardPivot = pivot;
    this.root.add(this.addAssembly(ex, [-0.05, 0.6, -0.3], 'guard', [-0.41, Y_AX + 0.22, 0]));
  }

  /* ================================================================ trainard */

  _buildCarriage() {
    const car = new THREE.Group();
    this.carriage = car;

    // Trainard (selle)
    const saddle = new THREE.Group();
    saddle.add(box(-0.03, 0.21, 0.945, 0.985, -0.215, 0.215, M.blue, 0.006));
    saddle.add(box(-0.015, 0.18, 0.985, 1.0, -0.2, 0.24, M.blue, 0.004));
    saddle.add(box(-0.02, 0.2, 0.9, 0.985, 0.195, 0.235, M.blue, 0.006));
    const lock = new THREE.Group();
    lock.position.set(0.19, 0.985, 0.13);
    lock.add(cylY(0.011, 0, 0.012, 0, 0, M.blackOxide, 6));
    lock.add(cylY(0.004, 0.012, 0.03, 0, 0, M.steel));
    lock.add(cylX(0.004, -0.025, 0.025, 0.03, 0, M.steel, 10));
    lock.add(sphere(0.007, M.black, -0.027, 0.03, 0));
    lock.add(sphere(0.007, M.black, 0.027, 0.03, 0));
    tag(lock, 'carriageLock');
    this.levers.lock = lock;
    saddle.add(lock);
    tag(saddle, 'carriage');
    car.add(this.addAssembly(saddle, [0, 0.16, 0], 'carriage', [0.09, 0.99, -0.21]));

    // Tablier
    const apron = new THREE.Group();
    apron.add(box(-0.02, 0.2, 0.64, 0.94, 0.215, 0.3, M.blue, 0.01));
    apron.add(cylZ(0.03, 0.3, 0.31, 0.04, 0.79, M.blue));
    const cw = handwheel({ radius: 0.085, rim: 0.009, spokes: 3, hub: 0.024, dish: 0.02 });
    cw.position.set(0.04, 0.79, 0.31);
    tag(cw, 'carriageWheel');
    this.wheels.carriage = cw;
    apron.add(cw);

    const mkLever = (x, y, z, id, len = 0.07) => {
      const outer = new THREE.Group();
      outer.position.set(x, y, z);
      const inner = new THREE.Group();
      inner.rotation.x = 1.0;
      inner.add(lever({ len, r: 0.005, knob: 0.012 }));
      outer.add(cylZ(0.016, -0.004, 0.006, 0, 0, M.chrome));
      outer.add(inner);
      tag(outer, id);
      apron.add(outer);
      return { outer, inner };
    };
    this.levers.feed = mkLever(0.13, 0.87, 0.3, 'feedLever');
    this.levers.nut = mkLever(0.172, 0.72, 0.3, 'halfNut', 0.06);
    const knob = cylZ(0.012, 0.3, 0.325, 0.12, 0.72, M.black);
    tag(knob, 'feedLever');
    apron.add(knob);

    tag(apron, 'apron');
    car.add(this.addAssembly(apron, [0, -0.08, 0.4], 'apron', [0.09, 0.64, 0.3]));

    // Chariot transversal
    const crossPos = new THREE.Group();
    car.add(crossPos);
    this.crossPos = crossPos;
    const cross = new THREE.Group();
    cross.add(box(-0.015, 0.125, 1.0, 1.045, -0.17, 0.3, M.blue, 0.006));
    cross.add(box(0.025, 0.085, 0.995, 1.05, 0.3, 0.325, M.blue, 0.004));
    cross.add(box(-0.018, -0.012, 1.004, 1.04, -0.16, 0.29, M.steelDark, 0.001));
    const xw = handwheel({ radius: 0.06, rim: 0.007, spokes: 3, hub: 0.02, dish: 0.014, dial: true });
    xw.position.set(0.055, 1.022, 0.35);
    tag(xw, 'crossWheel');
    this.wheels.cross = xw;
    cross.add(xw);
    cross.add(box(0.053, 0.057, 1.047, 1.051, 0.322, 0.33, M.red, 0)); // repère du tambour
    tag(cross, 'crossSlide');
    crossPos.add(this.addAssembly(cross, [0, 0.3, 0.06], 'crossSlide', [0.055, 1.03, -0.17]));

    // Chariot supérieur
    const compPos = new THREE.Group();
    cross.add(compPos);
    this.compPos = compPos;
    const comp = new THREE.Group();
    comp.add(cylY(0.062, 1.045, 1.058, 0.055, 0.095, M.blue, 48));
    comp.add(box(-0.01, 0.125, 1.058, 1.09, 0.05, 0.14, M.blue, 0.005));
    comp.add(box(0.125, 0.145, 1.06, 1.088, 0.075, 0.115, M.blue, 0.003));
    const cpw = handwheel({ radius: 0.034, rim: 0.005, spokes: 3, hub: 0.013, dish: 0.008 });
    cpw.rotation.y = Math.PI / 2;
    cpw.position.set(0.16, 1.074, 0.095);
    tag(cpw, 'compoundWheel');
    this.wheels.compound = cpw;
    comp.add(cpw);
    tag(comp, 'compound');
    compPos.add(this.addAssembly(comp, [0, 0.14, 0], 'compound', [0.13, 1.09, 0.14]));

    // Tourelle
    const post = new THREE.Group();
    post.add(box(-0.01, 0.07, 1.09, 1.108, 0.055, 0.135, M.blackOxide, 0.003));
    post.add(box(0.025, 0.07, 1.108, 1.132, 0.055, 0.135, M.blackOxide, 0.001));
    post.add(box(-0.01, 0.07, 1.132, 1.17, 0.055, 0.135, M.blackOxide, 0.003));
    [0.072, 0.118].forEach((z) => post.add(cylY(0.0065, 1.17, 1.182, 0.01, z, M.steel, 6)));
    const clamp = new THREE.Group();
    clamp.position.set(0.03, 1.17, 0.095);
    clamp.add(cylY(0.013, 0, 0.022, 0, 0, M.chrome));
    const arm = lever({ len: 0.1, r: 0.005, knob: 0.012 });
    arm.rotation.z = -Math.PI / 2;
    arm.position.y = 0.016;
    clamp.add(arm);
    tag(clamp, 'toolClamp');
    this.levers.clamp = clamp;
    post.add(clamp);
    tag(post, 'toolpost');
    compPos.add(this.addAssembly(post, [0, 0.14, 0], 'toolpost', [0.03, 1.2, 0.095]));

    // Outil : plaquette losange (arête) + tête + queue. Pointe en (0, Y_AX, 0).
    const tool = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.0072, -0.0006);
    shape.lineTo(0.0078, -0.0085);
    shape.lineTo(0.0006, -0.0092);
    shape.closePath();
    const ins = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.005, bevelEnabled: false }), M.insert);
    ins.rotation.x = -Math.PI / 2;
    ins.position.y = Y_AX - 0.005;
    tool.add(ins);
    tool.add(cylY(0.0018, Y_AX, Y_AX + 0.0012, 0.0042, 0.0046, M.blackOxide, 6));
    tool.add(box(0.0004, 0.0205, Y_AX - 0.02, Y_AX - 0.005, 0.0008, 0.025, M.holder, 0.0008));
    tool.add(box(0.0004, 0.0205, Y_AX - 0.005, Y_AX, 0.0093, 0.025, M.holder, 0.0005));
    tool.add(box(0.0079, 0.0205, Y_AX - 0.005, Y_AX, 0.0008, 0.0093, M.holder, 0.0005));
    tool.add(box(0.0004, 0.0205, Y_AX - 0.02, Y_AX, 0.025, 0.165, M.holder, 0.001));
    tag(tool, 'tool');
    this.tool = tool;
    post.add(this.addAssembly(tool, [-0.02, 0.06, 0.16], 'tool', [0.01, Y_AX - 0.03, 0.165]));

    this.root.add(car);
  }

  /* ================================================================ contre-poupée */

  _buildTailstock() {
    const tail = new THREE.Group();
    this.tail = tail;
    const ex = new THREE.Group();
    tail.add(ex);
    const y = Y_AX;
    const cone = mesh(new THREE.ConeGeometry(0.011, 0.022, 32), M.steel);
    cone.rotation.z = Math.PI / 2; // pointe vers −X
    cone.position.set(0.011, y, 0);
    ex.add(cone);
    ex.add(cylX(0.011, 0.022, 0.036, y, 0, M.steel, 24, 0.014));
    ex.add(cylX(0.024, 0.036, 0.11, y, 0, M.chrome, 40));
    ex.add(cylX(0.055, 0.1, 0.33, y, 0, M.blue, 48));
    ex.add(box(0.1, 0.33, 0.985, y, -0.055, 0.055, M.blue, 0.006));
    ex.add(box(0.09, 0.345, 0.985, 1.03, -0.1, 0.1, M.blue, 0.008));
    ex.add(box(0.06, 0.36, 0.95, 0.985, -0.16, 0.16, M.blueDark, 0.006));
    ex.add(cylX(0.03, 0.33, 0.36, y, 0, M.blue, 32));

    const tw = handwheel({ radius: 0.07, rim: 0.007, spokes: 3, hub: 0.02, dish: 0.016 });
    tw.rotation.y = Math.PI / 2;
    tw.position.set(0.36, y, 0);
    tag(tw, 'tailWheel');
    this.wheels.tail = tw;
    ex.add(tw);

    const ql = lever({ len: 0.055, r: 0.004, knob: 0.01 });
    ql.position.set(0.14, y + 0.055, 0.02);
    ql.rotation.x = 0.9;
    ex.add(ql);
    const tl = lever({ len: 0.07, r: 0.005, knob: 0.012 });
    tl.position.set(0.32, 0.99, 0.15);
    tl.rotation.x = 1.3;
    ex.add(tl);
    tag(ex, 'tailstock');
    this.root.add(tail);
    this.addAssembly(ex, [0.28, 0.3, 0], 'tailstock', [0.21, y + 0.09, 0]);
  }

  /* ================================================================ écran arrière */

  _buildSplash() {
    const sp = new THREE.Group();
    sp.add(box(-0.45, 0.98, 0.95, 1.42, -0.285, -0.27, M.white, 0.004));
    sp.add(box(-0.45, 0.98, 1.42, 1.44, -0.29, -0.2, M.white, 0.004));
    tag(sp, 'splash');
    this.root.add(this.addAssembly(sp, [0, 0.15, -0.32], 'splash', [0.3, 1.44, -0.28]));
  }

  /* ================================================================ animation */

  setExploded(on) {
    this.explodeTarget = on ? 1 : 0;
  }

  /** Point monde (m) de la pointe d'outil. */
  toolTipWorld(machine, out = new THREE.Vector3()) {
    return out.set(machine.faceX + machine.z * MM, Y_AX, machine.s.r * MM);
  }

  update(machine, dt, t) {
    const s = machine.s;
    const fx = machine.faceX;

    // Vue éclatée
    this.explode = approach(this.explode, this.explodeTarget, 4, dt);
    if (Math.abs(this.explode - this.explodeTarget) < 1e-4) this.explode = this.explodeTarget;
    const e = ease(this.explode);
    for (const a of this.assemblies) {
      a.obj.position.copy(a.base).addScaledVector(a.offset, e);
      if (a.label) a.label.visible = this.labelsOn || this.explode > 0.6;
    }

    // Axes
    this.carriage.position.x = fx + s.zc * MM;
    this.crossPos.position.z = s.r * MM;
    this.compPos.position.x = s.cz * MM;
    this.tail.position.x = fx + s.tailZ * MM;
    this.spindleRot.rotation.x = machine.spindleAngle;

    // Volants (sens horaire vu de face = rotation négative autour de l'axe du volant)
    this.wheels.carriage.userData.spin.rotation.z = -(s.zc / HANDWHEEL.carriage) * TAU;
    this.wheels.cross.userData.spin.rotation.z = (s.r / HANDWHEEL.cross) * TAU;
    this.wheels.compound.userData.spin.rotation.z = (s.cz / HANDWHEEL.compound) * TAU;
    this.wheels.tail.userData.spin.rotation.z = (s.tailZ / HANDWHEEL.tail) * TAU;

    // Organes d'état
    const A = this.anim;
    A.key = approach(A.key, s.keyIn ? 0 : 1, 6, dt);
    this.key.position.y = A.key * 0.12;
    this.key.visible = A.key < 0.97;
    this.keyParked.visible = A.key > 0.9;

    A.guard = approach(A.guard, s.guardClosed ? 0 : 1, 4, dt);
    // Ouverture limitée : le protecteur long ne doit pas traverser l'écran arrière
    this.guardPivot.rotation.x = -0.75 * ease(A.guard);

    A.clamp = approach(A.clamp, s.toolClamped ? 0 : 1, 8, dt);
    this.levers.clamp.rotation.y = 0.3 + A.clamp * 1.3;

    A.lock = approach(A.lock, s.carriageLocked ? 1 : 0, 8, dt);
    this.levers.lock.rotation.y = A.lock * (Math.PI / 2);

    const feedTarget = s.autoFeed === 'z-' ? 0.5 : s.autoFeed === 'x-' ? -0.5 : 0;
    A.feed = approach(A.feed, feedTarget, 10, dt);
    this.levers.feed.outer.rotation.z = A.feed;

    A.nut = approach(A.nut, s.halfNut ? 0.3 : 1.1, 10, dt);
    this.levers.nut.inner.rotation.x = A.nut;

    // Interrupteur vert : enfoncé et allumé quand la broche tourne
    A.spindle = approach(A.spindle, machine.running ? 1 : 0, 12, dt);
    const btn = this.levers.spindle;
    btn.position.y = 0.03 + 0.008 * (1 - A.spindle);
    btn.userData.baseEmissive.setRGB(0.02 * A.spindle, 0.55 * A.spindle, 0.12 * A.spindle);
    if (!this._tinted?.includes(btn)) btn.material.emissive.copy(btn.userData.baseEmissive);

    A.estop = approach(A.estop, s.estop ? 1 : 0, 14, dt);
    this.levers.estop.position.z = -0.008 * A.estop;
    this.levers.mainSwitch.rotation.z = s.power ? -Math.PI / 2 : 0;
    this.powerLamp.material.emissiveIntensity = s.power && !s.estop ? 2.5 : 0;

    const idx = Math.max(0, GEARBOX_RPM.indexOf(s.rpm));
    this.levers.speedA.rotation.z = approach(this.levers.speedA.rotation.z, idx < 5 ? 0.6 : -0.6, 8, dt);
    this.levers.speedB.rotation.z = approach(this.levers.speedB.rotation.z, 0.9 - (idx % 5) * 0.45, 8, dt);

    this._updateTints(t);
  }

  /* ================================================================ surbrillances */

  _updateTints(t) {
    const want = new Map();
    const add = (id, color, k) => {
      for (const m of this.parts[id] || []) {
        const cur = want.get(m);
        if (!cur || cur.k < k) want.set(m, { color, k });
      }
    };
    if (this.hover) add(this.hover, TINT.hover, 0.16);
    if (this.selected) add(this.selected, TINT.accent, 0.3);
    const p = 0.2 + 0.22 * (0.5 + 0.5 * Math.sin(t * 5));
    for (const id of this.pulse) add(id, TINT.accent, p);
    if (this.alert && this.alert.level !== 'ok' && this.alert.info) {
      const hit = this.alert.level === 'hit';
      const k = hit ? 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 18)) : 0.45;
      const col = hit ? TINT.red : TINT.orange;
      add(this.alert.info.zone.part, col, k + 0.01);
      add(this.alert.info.obstacle.part, col, k);
    }

    for (const m of this._tinted || []) {
      if (!want.has(m)) m.material.emissive?.copy(m.userData.baseEmissive);
    }
    for (const [m, { color, k }] of want) {
      if (!m.material.emissive) continue;
      if (!m.userData.ownMat) {
        // Matériau propre au maillage à la première surbrillance (les matériaux sont partagés)
        m.material = m.material.clone();
        m.userData.ownMat = true;
        m.userData.baseEmissive = m.material.emissive.clone().multiplyScalar(m.material.emissiveIntensity);
        m.material.emissiveIntensity = 1;
      }
      const b = m.userData.baseEmissive;
      m.material.emissive.setRGB(b.r + color.r * k, b.g + color.g * k, b.b + color.b * k);
    }
    this._tinted = [...want.keys()];
  }
}

const TINT = {
  hover: new THREE.Color(0xffffff),
  accent: new THREE.Color(0x2d6bff),
  red: new THREE.Color(0xff1a10),
  orange: new THREE.Color(0xff8a00),
};
