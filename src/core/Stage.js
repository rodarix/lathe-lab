import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { floorMaterial } from '../lathe/materials.js';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const WALK_CODES = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] }; // positions physiques : ZQSD en AZERTY

/**
 * Scène, rendu, atelier, caméra orbitale + marche au clavier + transitions douces.
 */
export class Stage {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c0f);
    scene.fog = new THREE.Fog(0x0b0c0f, 5, 17);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.42;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 60);
    this.camera.position.set(1.7, 1.8, 2.6);

    const controls = new OrbitControls(this.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.12;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.95, 0);
    controls.zoomToCursor = true;
    this.controls = controls;

    this.labels = new CSS2DRenderer({ element: labelLayer });

    this._buildWorkshop();

    this.walk = new Set();
    this.tween = null;
    this.frameFns = [];
    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (WALK_CODES[e.code] && !isTyping(e) && !e.ctrlKey && !e.metaKey) this.walk.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.walk.delete(e.code));
    window.addEventListener('blur', () => this.walk.clear());
    this.resize();
  }

  /* ---------------------------------------------------------------- atelier */

  _buildWorkshop() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xc6d6ff, 0x1a1a1c, 0.55));

    const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
    key.position.set(2.4, 4.6, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 1, far: 12 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 4;
    s.add(key);

    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.55);
    fill.position.set(-3, 2.2, -2.5);
    s.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.35);
    rim.position.set(0, 3, -4);
    s.add(rim);

    // Lampe de la machine
    this.workLight = new THREE.SpotLight(0xffe8c4, 3.2, 2.2, 0.55, 0.6, 1.6);
    s.add(this.workLight, this.workLight.target);

    // Sol béton
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMaterial());
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // Marquage jaune de la zone de travail
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xd9b21f, roughness: 0.7 });
    const tape = (x0, x1, z0, z1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), tapeMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.002, (z0 + z1) / 2);
      m.receiveShadow = true;
      s.add(m);
    };
    const X0 = -1.35, X1 = 1.35, Z0 = -0.65, Z1 = 1.25, W = 0.05;
    tape(X0, X1, Z0, Z0 + W);
    tape(X0, X1, Z1 - W, Z1);
    tape(X0, X0 + W, Z0, Z1);
    tape(X1 - W, X1, Z0, Z1);

    // Silhouettes d'autres machines (atmosphère d'atelier, noyées dans le brouillard)
    const dark = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.8 });
    const green = new THREE.MeshStandardMaterial({ color: 0x1d3322, roughness: 0.7 });
    [
      [-4.6, -5.2, 1.4, 1.7, 1.0, dark],
      [-1.4, -6.8, 2.2, 2.1, 1.2, dark],
      [2.8, -6.0, 1.2, 2.2, 1.4, dark],
      [6.4, -2.0, 1.0, 1.6, 1.8, dark],
      [-6.0, 0.4, 1.2, 1.7, 1.0, green],
      [-6.2, 4.2, 1.8, 1.4, 1.0, dark],
    ].forEach(([x, z, w, h, d, mat]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      s.add(m);
    });

    // Rampes lumineuses au plafond
    const tube = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.6 });
    for (let i = -2; i <= 2; i++) {
      for (let j = -1; j <= 1; j++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.12), tube);
        m.position.set(j * 3, 3.6, i * 2.6);
        s.add(m);
      }
    }
  }

  /** Oriente la lampe de la machine vers la zone de coupe. */
  aimWorkLight(from, to) {
    this.workLight.position.copy(from);
    this.workLight.target.position.copy(to);
  }

  /* ---------------------------------------------------------------- caméra */

  flyTo(pos, target, duration = 1.1) {
    this.tween = {
      p0: this.camera.position.clone(),
      t0: this.controls.target.clone(),
      p1: pos.clone(),
      t1: target.clone(),
      k: 0,
      duration,
    };
  }

  /** Cadre une boîte englobante en conservant la direction de vue actuelle. */
  frameBox(box3, { fill = 1.6, minDist = 0.25 } = {}) {
    const center = box3.getCenter(new THREE.Vector3());
    const size = box3.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.15) dir.y = 0.25;
    dir.normalize();
    const dist = Math.max(minDist, (size * fill) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.flyTo(center.clone().addScaledVector(dir, dist), center);
  }

  onFrame(fn) {
    this.frameFns.push(fn);
  }

  start() {
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    if (this.tween) {
      const tw = this.tween;
      tw.k = Math.min(1, tw.k + dt / tw.duration);
      const e = easeInOut(tw.k);
      this.camera.position.lerpVectors(tw.p0, tw.p1, e);
      this.controls.target.lerpVectors(tw.t0, tw.t1, e);
      if (tw.k >= 1) this.tween = null;
    }

    if (this.walk.size) {
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
      const move = new THREE.Vector3();
      for (const code of this.walk) {
        const [sx, sz] = WALK_CODES[code];
        move.addScaledVector(right, sx).addScaledVector(fwd, sz);
      }
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(1.3 * dt);
        this.camera.position.add(move);
        this.controls.target.add(move);
        this.tween = null;
      }
    }

    this.controls.update();
    for (const fn of this.frameFns) fn(dt, t);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // Sur téléphone (portrait) on élargit le champ pour garder la machine entière
    this.camera.fov = w < h ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }
}

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
