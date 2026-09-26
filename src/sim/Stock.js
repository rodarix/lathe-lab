import * as THREE from 'three';
import { GRIP_LEN, MM } from '../config.js';
import { TOOL, edgeLimit } from './ToolGeometry.js';

const RAW = new THREE.Color(0x6e6962); // brut étiré, mat
const CUT = new THREE.Color(0xe2e6ea); // surface usinée, brillante
const DZ = 0.25; // résolution du profil (mm)

/**
 * Brut cylindrique usinable.
 *
 * Le profil est un tableau de rayons R[i] (mm) par tranche de 0,25 mm le long de Z,
 * de Z = −L (face des mors) à Z = 0 (face avant d'origine). R = 0 : matière enlevée.
 * Le maillage est un LatheGeometry reconstruit (au plus une fois par image) quand le profil change.
 */
export class Stock {
  constructor(diameter = 50, stickout = 80) {
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.85,
      roughness: 0.32,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.rotation.z = -Math.PI / 2; // axe du tour (Y du LatheGeometry) → X monde
    this.version = 0;
    this.reset(diameter, stickout);
  }

  reset(diameter, stickout) {
    this.d0 = diameter;
    this.R0 = diameter / 2;
    this.L = stickout;
    this.n = Math.round(stickout / DZ);
    this.R = new Float32Array(this.n).fill(this.R0);
    this.cutFlag = new Uint8Array(this.n);
    this.removed = 0; // volume enlevé (mm³)
    this.version++;
    this.dirty = true;
    this.rebuild();
  }

  /** Bord gauche de la tranche i (mm). */
  zAt(i) {
    return -this.L + i * DZ;
  }
  index(z) {
    return Math.floor((z + this.L) / DZ);
  }

  /** Z de la face avant actuelle (mm). */
  faceZ() {
    for (let i = this.n - 1; i >= 0; i--) if (this.R[i] > 0.001) return this.zAt(i) + DZ;
    return -this.L;
  }
  maxRadius() {
    let m = 0;
    for (let i = 0; i < this.n; i++) if (this.R[i] > m) m = this.R[i];
    return m;
  }
  radiusAt(z) {
    const i = this.index(z);
    return i >= 0 && i < this.n ? this.R[i] : 0;
  }

  /**
   * Distance signée entre la matière et une zone d'outil [a0, a1] × [b0, ∞[.
   * margin : on regarde aussi un peu à côté pour obtenir une distance « d'approche ».
   * zMin   : ignore les tranches dont le centre est avant zMin (même règle que cut() :
   *          la paroi fraîchement dressée à gauche de la pointe n'est pas « sous » l'outil).
   */
  clearance(a0, a1, b0, margin = 0, zMin = -Infinity) {
    let best = Infinity;
    const i0 = Math.max(0, this.index(a0 - margin));
    const i1 = Math.min(this.n - 1, this.index(a1 + margin));
    for (let i = i0; i <= i1; i++) {
      const R = this.R[i];
      if (R <= 0) continue;
      const zlo = this.zAt(i);
      if (zlo + DZ / 2 < zMin) continue;
      const gz = Math.max(zlo - a1, a0 - (zlo + DZ));
      const c = Math.max(gz, b0 - R);
      if (c < best) best = c;
    }
    return best;
  }

  _edgeRange(zt) {
    return [Math.max(0, this.index(zt)), Math.min(this.n - 1, this.index(zt + TOOL.edgeW))];
  }

  /** L'arête est-elle engagée dans la matière ? */
  engaged(zt, rt) {
    const [i0, i1] = this._edgeRange(zt);
    for (let i = i0; i <= i1; i++) {
      const zc = this.zAt(i) + DZ / 2;
      if (zc < zt) continue;
      if (this.R[i] > edgeLimit(zc, zt, rt) + 1e-4) return true;
    }
    return false;
  }

  /** Enlève la matière sous l'arête. Retourne le volume enlevé (mm³). */
  cut(zt, rt) {
    const [i0, i1] = this._edgeRange(zt);
    let vol = 0;
    for (let i = i0; i <= i1; i++) {
      const zc = this.zAt(i) + DZ / 2;
      if (zc < zt) continue;
      const lim = edgeLimit(zc, zt, rt);
      const R = this.R[i];
      if (R > lim + 1e-4) {
        vol += Math.PI * (R * R - lim * lim) * DZ;
        this.R[i] = lim;
        this.cutFlag[i] = 1;
      }
    }
    if (vol > 0) {
      this.removed += vol;
      this.dirty = true;
    }
    return vol;
  }

  /** Reconstruit le maillage à partir du profil (appelé par la boucle de rendu si dirty). */
  rebuild() {
    this.dirty = false;
    const pts = [];
    const flags = [];
    const same = (a, r, z) => a && Math.abs(a.x - r) < 1e-6 && Math.abs(a.y - z) < 1e-6;
    // pt : point simple (dédoublonné) ; corner : point doublé = arête vive dans le LatheGeometry
    const pt = (r, z, c) => {
      if (same(pts[pts.length - 1], r * MM, z * MM)) return;
      pts.push(new THREE.Vector2(r * MM, z * MM));
      flags.push(c);
    };
    const corner = (r, z, cIn, cOut) => {
      if (same(pts[pts.length - 1], r * MM, z * MM)) flags[flags.length - 1] = cIn;
      else {
        pts.push(new THREE.Vector2(r * MM, z * MM));
        flags.push(cIn);
      }
      pts.push(new THREE.Vector2(r * MM, z * MM));
      flags.push(cOut);
    };

    // Nombre de tranches jusqu'à la dernière contenant de la matière
    let nEff = this.n;
    while (nEff > 0 && this.R[nEff - 1] <= 0.001) nEff--;
    const faced = nEff < this.n ? 1 : 0;

    const zStart = -this.L - GRIP_LEN;
    pt(0, zStart, 0);
    corner(this.R0, zStart, 0, 0);
    pt(this.R0, -this.L, 0);

    let curR = this.R0;
    let curC = 0;
    let s = 0;
    while (s < nEff) {
      // Regroupe les tranches de rayon quasi constant (ou en légère pente)
      let e = s;
      const c = this.cutFlag[s];
      while (
        e + 1 < nEff &&
        this.cutFlag[e + 1] === c &&
        Math.abs(this.R[e + 1] - this.R[e]) < 0.06 &&
        Math.abs(this.R[e + 1] - this.R[s]) < 0.5
      ) e++;
      const z0 = this.zAt(s);
      const z1 = this.zAt(e) + DZ;
      const r0 = this.R[s];
      const r1 = this.R[e];
      if (Math.abs(r0 - curR) > 0.15) {
        // épaulement : surface radiale usinée
        corner(curR, z0, curC, 1);
        corner(r0, z0, 1, c);
      } else pt(r0, z0, c);
      pt(r1, z1, c);
      curR = r1;
      curC = c;
      s = e + 1;
    }
    const zEnd = nEff > 0 ? this.zAt(nEff - 1) + DZ : -this.L;
    corner(curR, zEnd, curC, faced);
    pt(0, zEnd, faced);

    const segments = 72;
    const geo = new THREE.LatheGeometry(pts, segments);
    const P = pts.length;
    const colors = new Float32Array((segments + 1) * P * 3);
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j < P; j++) {
        const col = flags[j] ? CUT : RAW;
        const k = (i * P + j) * 3;
        colors[k] = col.r;
        colors[k + 1] = col.g;
        colors[k + 2] = col.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  }
}
