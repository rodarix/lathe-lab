import * as THREE from 'three';
import { $ } from './dom.js';
import { PARTS } from '../data/parts.js';
import { HANDWHEEL, TAU } from '../config.js';

/**
 * Survol, clic et manipulation directe dans la vue 3D.
 *  - survol : surbrillance + infobulle (nom + consigne)
 *  - clic   : fiche de l'organe + action éventuelle (clé, protecteur, leviers…)
 *  - volant : on le tourne en glissant autour de son centre projeté à l'écran
 */
export class Interaction {
  constructor(app) {
    this.app = app;
    this.canvas = app.stage.canvas;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.tip = $('#tip');
    this.drag = null;
    this.down = null;
    this._pendingHover = null;

    // capture : notre gestionnaire passe AVANT celui d'OrbitControls (même élément)
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointerleave', () => this.setHover(null));
  }

  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.app.stage.camera);
    const hits = this.ray.intersectObjects(this.app.model.pickables, false);
    for (const hit of hits) {
      let o = hit.object;
      let visible = true;
      while (o) {
        if (!o.visible) visible = false;
        o = o.parent;
      }
      if (visible) return hit.object.userData.part;
    }
    return null;
  }

  onDown(e) {
    if (e.button !== 0) return;
    this.down = { x: e.clientX, y: e.clientY };
    const id = this.pick(e);
    const p = PARTS[id];
    if (p?.drag) {
      // Volant : on bloque l'orbite et on suit l'angle autour du centre projeté
      this.app.stage.controls.enabled = false;
      const wheel = this.app.model.wheels[p.drag];
      const c = new THREE.Vector3();
      wheel.getWorldPosition(c);
      c.project(this.app.stage.camera);
      const r = this.canvas.getBoundingClientRect();
      const cx = r.left + ((c.x + 1) / 2) * r.width;
      const cy = r.top + ((1 - c.y) / 2) * r.height;
      this.drag = { id, kind: p.drag, cx, cy, last: Math.atan2(e.clientY - cy, e.clientX - cx), lastY: e.clientY, moved: 0 };
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.classList.add('turning');
    }
  }

  onMove(e) {
    if (this.drag) {
      const d = this.drag;
      const dist = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
      let da;
      if (dist > 18) {
        const a = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
        da = a - d.last;
        if (da > Math.PI) da -= TAU;
        if (da < -Math.PI) da += TAU;
        d.last = a;
      } else {
        da = (d.lastY - e.clientY) * 0.02; // trop près du centre : glisser vertical
        d.last = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      }
      d.lastY = e.clientY;
      d.moved += Math.abs(da);
      this.turn(d.kind, da);
      return;
    }
    // Survol : un seul lancer de rayon par image
    if (!this._pendingHover) {
      this._pendingHover = e;
      requestAnimationFrame(() => {
        const ev = this._pendingHover;
        this._pendingHover = null;
        if (!this.drag && !(ev.buttons & 1)) this.setHover(this.pick(ev), ev);
      });
    } else this._pendingHover = e;
  }

  onUp(e) {
    const wasDrag = this.drag;
    if (this.drag) {
      this.drag = null;
      this.app.stage.controls.enabled = true;
      this.canvas.classList.remove('turning');
    }
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (e.target !== this.canvas && !wasDrag) return;
    if (moved < 5 && (!wasDrag || wasDrag.moved < 0.05)) this.click(this.pick(e));
  }

  /** Rotation d'un volant (da > 0 : sens horaire à l'écran). */
  turn(kind, da) {
    const m = this.app.machine;
    const rev = da / TAU;
    if (kind === 'carriage') m.move({ dzc: rev * HANDWHEEL.carriage });
    else if (kind === 'cross') m.move({ dr: -rev * HANDWHEEL.cross });
    else if (kind === 'compound') m.move({ dcz: -rev * HANDWHEEL.compound });
    else if (kind === 'tail') m.act('tail', m.s.tailZ - rev * HANDWHEEL.tail);
  }

  click(id) {
    if (!id) {
      this.app.select(null);
      return;
    }
    const p = PARTS[id];
    this.app.select(id);
    if (p.action) this.app.machine.act(p.action);
  }

  setHover(id, e) {
    this.app.model.hover = id;
    this.canvas.classList.toggle('pointer', !!id);
    if (!id || !e) {
      this.tip.hidden = true;
      return;
    }
    const p = PARTS[id];
    this.tip.replaceChildren(document.createTextNode(p.name));
    if (p.hint) {
      const small = document.createElement('small');
      small.textContent = p.hint;
      this.tip.append(small);
    }
    this.tip.style.left = `${e.clientX}px`;
    this.tip.style.top = `${e.clientY}px`;
    this.tip.hidden = false;
  }
}
