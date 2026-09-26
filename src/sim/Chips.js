import * as THREE from 'three';

const MAX = 360;
const TRAY_Y = 0.625;
const LIFE_ON_TRAY = 14;

/**
 * Copeaux : petits rubans métalliques éjectés de la pointe d'outil,
 * qui retombent dans le bac. Un seul InstancedMesh, recyclé en anneau.
 */
export class Chips {
  constructor(scene) {
    const geo = new THREE.TorusGeometry(0.0025, 0.00045, 4, 10, Math.PI * 1.4);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9b58f, metalness: 0.9, roughness: 0.35 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.p = Array.from({ length: MAX }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      spin: new THREE.Vector3(),
      age: 0,
      alive: false,
      landed: false,
    }));
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._acc = 0;
  }

  /** Émet des copeaux proportionnellement au volume enlevé (mm³). */
  emit(at, vol) {
    this._acc += Math.min(vol, 400) * 0.06;
    while (this._acc >= 1) {
      this._acc -= 1;
      const c = this.p[this.next];
      this.next = (this.next + 1) % MAX;
      c.alive = true;
      c.landed = false;
      c.age = 0;
      c.pos.copy(at);
      c.vel.set((Math.random() - 0.3) * 0.5, 0.25 + Math.random() * 0.6, 0.35 + Math.random() * 0.6);
      c.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.spin.set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
      this.mesh.count = Math.max(this.mesh.count, this.next === 0 ? MAX : this.next);
    }
  }

  clear() {
    for (const c of this.p) c.alive = false;
  }

  update(dt) {
    let i = 0;
    for (const c of this.p) {
      if (c.alive) {
        c.age += dt;
        if (!c.landed) {
          c.vel.y -= 9.81 * dt;
          c.pos.addScaledVector(c.vel, dt);
          c.rot.x += c.spin.x * dt;
          c.rot.y += c.spin.y * dt;
          c.rot.z += c.spin.z * dt;
          const floorY = Math.abs(c.pos.x) < 0.4 && Math.abs(c.pos.z) < 0.34 ? TRAY_Y : 0.002;
          if (c.pos.y < floorY) {
            c.pos.y = floorY;
            c.landed = true;
            c.age = 0;
          }
        } else if (c.age > LIFE_ON_TRAY) c.alive = false;
      }
      this._s.setScalar(c.alive ? 1 : 0);
      this._q.setFromEuler(c.rot);
      this._m.compose(c.pos, this._q, this._s);
      this.mesh.setMatrixAt(i++, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
