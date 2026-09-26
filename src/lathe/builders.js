import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, dialMaterial } from './materials.js';
import { TAU } from '../config.js';

/** Primitives de construction du modèle procédural (coordonnées en mètres). */

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** Boîte définie par ses coins min/max, arrondie si r > 0. */
export function box(x0, x1, y0, y1, z0, z1, mat, r = 0.004) {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const rr = Math.min(r, w / 2, h / 2, d / 2) * 0.98;
  const geo = rr > 0.0005 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
  const m = mesh(geo, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

/** Cylindre d'axe X entre x0 et x1 (r1 : rayon côté x1 si conique). */
export function cylX(r, x0, x1, y, z, mat, seg = 32, r1 = r) {
  const m = mesh(new THREE.CylinderGeometry(r1, r, x1 - x0, seg), mat);
  m.rotation.z = -Math.PI / 2; // +Y → +X
  m.position.set((x0 + x1) / 2, y, z);
  return m;
}
/** Cylindre d'axe Z entre z0 et z1. */
export function cylZ(r, z0, z1, x, y, mat, seg = 32, r1 = r) {
  const m = mesh(new THREE.CylinderGeometry(r1, r, z1 - z0, seg), mat);
  m.rotation.x = Math.PI / 2; // +Y → +Z
  m.position.set(x, y, (z0 + z1) / 2);
  return m;
}
/** Cylindre d'axe Y entre y0 et y1. */
export function cylY(r, y0, y1, x, z, mat, seg = 32, r1 = r) {
  const m = mesh(new THREE.CylinderGeometry(r1, r, y1 - y0, seg), mat);
  m.position.set(x, (y0 + y1) / 2, z);
  return m;
}

const Y = new THREE.Vector3(0, 1, 0);
export function cylBetween(a, b, r, mat, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(Y, dir.normalize());
  return m;
}

export function sphere(r, mat, x = 0, y = 0, z = 0) {
  const m = mesh(new THREE.SphereGeometry(r, 20, 14), mat);
  m.position.set(x, y, z);
  return m;
}

/**
 * Volant à rayons. Axe du volant = +Z local ; le groupe `userData.spin` porte la rotation.
 * Pour un volant d'axe X, tourner la racine : root.rotation.y = Math.PI / 2.
 */
export function handwheel({ radius = 0.08, rim = 0.008, spokes = 3, hub = 0.022, dish = 0.018, handle = true, dial = false, mat = M.chrome } = {}) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  root.userData.spin = spin;

  const torus = mesh(new THREE.TorusGeometry(radius, rim, 14, 64), mat);
  torus.position.z = dish;
  spin.add(torus);

  const hubM = mesh(new THREE.CylinderGeometry(hub, hub * 1.15, 0.032, 24), mat);
  hubM.rotation.x = Math.PI / 2;
  spin.add(hubM);
  spin.add(cylZ(hub * 0.45, 0.016, 0.02, 0, 0, M.blackOxide, 6));

  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * TAU + Math.PI / 2;
    const p0 = new THREE.Vector3(Math.cos(a) * hub * 0.8, Math.sin(a) * hub * 0.8, 0.006);
    const p1 = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, dish);
    spin.add(cylBetween(p0, p1, rim * 0.62, mat));
  }

  if (handle) {
    const a = Math.PI / 2 + Math.PI / spokes;
    const hx = Math.cos(a) * radius;
    const hy = Math.sin(a) * radius;
    spin.add(cylBetween(new THREE.Vector3(hx, hy, dish), new THREE.Vector3(hx, hy, dish + 0.016), 0.0045, M.chrome));
    const grip = mesh(new THREE.CylinderGeometry(0.0085, 0.0095, radius * 0.6, 16), M.black);
    grip.rotation.x = Math.PI / 2;
    grip.position.set(hx, hy, dish + 0.016 + radius * 0.3);
    spin.add(grip);
  }

  if (dial) {
    const collar = mesh(new THREE.CylinderGeometry(hub * 1.5, hub * 1.5, 0.02, 48, 1, true), dialMaterial);
    collar.rotation.x = Math.PI / 2;
    collar.position.z = -0.022;
    spin.add(collar);
  }
  return root;
}

/** Levier : tige selon +Y à partir de l'origine (pivot) + boule. */
export function lever({ len = 0.08, r = 0.005, knob = 0.012, mat = M.chrome, knobMat = M.black } = {}) {
  const g = new THREE.Group();
  const rod = mesh(new THREE.CylinderGeometry(r * 0.85, r * 1.15, len, 12), mat);
  rod.position.y = len / 2;
  g.add(rod);
  g.add(sphere(knob, knobMat, 0, len, 0));
  g.add(sphere(r * 2, mat));
  return g;
}

/** Plaque rectangulaire orientée vers +Z. */
export function plate(w, h, mat) {
  return mesh(new THREE.PlaneGeometry(w, h), mat, { cast: false });
}

/** Pose l'id d'organe sur tous les maillages encore non marqués d'un objet. */
export function tag(obj, id) {
  obj.traverse((o) => {
    if (o.isMesh && !o.userData.part) o.userData.part = id;
  });
  return obj;
}
