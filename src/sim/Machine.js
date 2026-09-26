import { Emitter } from '../core/Emitter.js';
import { evaluate, obstacles } from './ToolGeometry.js';
import {
  MM, TAU, LIMITS, JOG, WARN_CLEARANCE, SPINDLE_NOSE_X, JAW_FACE_LOCAL,
  JAW_LEN, JAW_H, CHUCK_BODY_LEN, CHUCK_R,
} from '../config.js';
import { recommend, GEARBOX_RPM, FEEDS } from '../data/cutting.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DIMS = { JAW_LEN, JAW_H, CHUCK_BODY_LEN, CHUCK_R };
const THREAD_PITCH = 1.5; // mm/tr

/**
 * État et règles du tour. Aucune dépendance au rendu : le modèle 3D et l'interface
 * lisent `machine.s` à chaque image et appellent `machine.act(...)` / `machine.move(...)`.
 *
 * Événements émis :
 *   'change'    — un état discret a changé (rafraîchir l'interface)
 *   'toast'     — { level: 'info'|'ok'|'warn'|'danger', title, text }
 *   'collision' — { hit, title, text }
 *   'cut'       — { z, r, vol } matière enlevée (copeaux)
 *   'stock'     — nouveau brut monté
 *   'log'       — l'historique a changé
 */
export class Machine extends Emitter {
  constructor(stock) {
    super();
    this.stock = stock;
    this.s = {
      // Sécurité
      power: false,
      estop: false,
      ppe: false,
      workpieceChecked: false,
      keyIn: true,
      toolClamped: false,
      guardClosed: false,
      carriageLocked: false,
      halfNut: false,
      // Broche & avances
      spindleDir: 0, // 1 avant, 0 arrêt, −1 arrière
      rpm: 1600,
      feed: 0.2,
      autoFeed: null, // 'z-' chariotage, 'x-' dressage
      material: 'acier',
      toolType: 'carbure',
      op: 'ebauche',
      // Positions (mm) : trainard zc, chariot supérieur cz, rayon r ; outil Z = zc + cz
      zc: 40,
      cz: 0,
      r: 60,
      tailZ: 650,
      // Divers
      exploded: false,
      simSpeed: 1,
      realSpeed: false,
    };
    this.spindleAngle = 0;
    this.jog = { z: 0, x: 0, fine: false };
    this.path = []; // mouvements scriptés (position sûre, démos)
    this.alert = { level: 'ok', info: null, hitUntil: 0, hit: null };
    this.log = [];
    this.gate = null; // fonction (action, args) => message | null, posée par le module Sécurité
    this.demo = false;
    this._toastAt = {};
    this._lastHitAt = -Infinity;
    this.refresh();
  }

  /* ------------------------------------------------------------------ lecture */

  get z() {
    return this.s.zc + this.s.cz;
  }
  get running() {
    return this.s.spindleDir !== 0 && this.s.power && !this.s.estop;
  }
  /** Position monde (m) de la face Z = 0 du brut. */
  get faceX() {
    return SPINDLE_NOSE_X + JAW_FACE_LOCAL + this.stock.L * MM;
  }
  zcLimits() {
    const min = (SPINDLE_NOSE_X + 0.035 - this.faceX) / MM; // flanc gauche du trainard contre la poupée
    const max = Math.min(LIMITS.zMax, this.s.tailZ - 170, (0.72 - this.faceX) / MM);
    return [min, max];
  }
  tailLimits() {
    return [Math.max(this.stock.faceZ(), this.s.zc + 170), (0.56 - this.faceX) / MM];
  }
  recommendation() {
    const s = this.s;
    return recommend({ material: s.material, tool: s.toolType, op: s.op, d: this.stock.maxRadius() * 2 || this.stock.d0 });
  }
  speedOK() {
    const rec = this.recommendation();
    return this.s.rpm <= rec.n * 1.1 && this.s.rpm >= Math.min(rec.nBox, rec.n / 1.8);
  }
  carriageSafe() {
    return this.ev.workClear >= 5 && !this.ev.hit;
  }
  score() {
    const c = this.log.filter((e) => e.kind === 'collision').length;
    const v = this.log.filter((e) => e.kind === 'violation').length;
    return { collisions: c, violations: v, score: Math.max(0, 100 - 10 * c - 5 * v) };
  }

  /* ------------------------------------------------------------------ messages */

  toast(key, level, title, text = '', cooldown = 1200) {
    const now = performance.now();
    if (now - (this._toastAt[key] ?? -Infinity) < cooldown) return;
    this._toastAt[key] = now;
    this.emit('toast', { level, title, text });
  }
  record(kind, title) {
    this.log.unshift({ kind, title, t: new Date() });
    if (this.log.length > 50) this.log.pop();
    this.emit('log');
  }
  changed() {
    this.refresh();
    this.emit('change');
  }

  /* ------------------------------------------------------------------ actions */

  /** Point d'entrée unique des actions « opérateur » (boutons, clics 3D, raccourcis). */
  act(name, ...args) {
    const fn = this.actions[name];
    if (!fn) return false;
    const block = this.gate?.(name, args);
    if (block) {
      this.toast('gate', 'warn', 'Respectez l’ordre de la séquence', block);
      this.record('violation', 'Ordre de la séquence de démarrage non respecté');
      return false;
    }
    const res = fn.apply(this, args);
    this.changed();
    return res;
  }

  actions = {
    ppe() {
      this.s.ppe = true;
      this.toast('ppe', 'ok', 'EPI confirmés', 'Lunettes, cheveux attachés, pas de gants ni de bijoux.');
      return true;
    },
    checkWorkpiece() {
      const st = this.stock;
      this.s.workpieceChecked = true;
      const ratio = st.L / st.d0;
      if (ratio > 3) {
        this.toast('work', 'warn', 'Porte-à-faux trop important',
          `${st.L} mm pour Ø ${st.d0} mm (${ratio.toFixed(1)} × Ø). Au-delà de 3 × Ø : contre-pointe obligatoire.`);
      } else {
        this.toast('work', 'ok', 'Serrage vérifié',
          `Pièce serrée sur 30 mm, porte-à-faux ${st.L} mm (${ratio.toFixed(1).replace('.', ',')} × Ø) : correct.`);
      }
      return true;
    },
    key() {
      const s = this.s;
      if (!s.keyIn) {
        if (this.running) {
          this.toast('key', 'danger', 'Jamais broche en rotation !', 'On ne met la clé qu’une fois la broche arrêtée et la machine consignée.');
          this.record('violation', 'Tentative de mise en place de la clé broche en rotation');
          return false;
        }
        if (s.guardClosed) {
          this.toast('key', 'warn', 'Protecteur fermé', 'Ouvrez le protecteur pour accéder au mandrin.');
          return false;
        }
        s.keyIn = true;
        s.workpieceChecked = false;
        this.toast('key', 'warn', 'Clé en place sur le mandrin', 'Ne jamais lâcher la clé : retirez-la dès le serrage terminé.');
        return true;
      }
      s.keyIn = false;
      this.toast('key', 'ok', 'Clé retirée', 'Elle est rangée sur la poupée, hors du mandrin.');
      return true;
    },
    toolClamp() {
      const s = this.s;
      if (s.toolClamped && this.running) {
        this.toast('clamp', 'danger', 'Broche en rotation', 'Arrêtez la broche avant de débrider l’outil.');
        this.record('violation', 'Débridage de l’outil broche en rotation');
        return false;
      }
      s.toolClamped = !s.toolClamped;
      this.toast('clamp', s.toolClamped ? 'ok' : 'info', s.toolClamped ? 'Outil bridé' : 'Outil débridé');
      return true;
    },
    safePos() {
      const s = this.s;
      const rSafe = Math.max(this.stock.maxRadius() + 12, s.r);
      this.path = [{ r: rSafe, v: 60 }];
      if (!s.carriageLocked) this.path.push({ zc: Math.max(s.zc, this.stock.faceZ() + 15 - s.cz), v: 60 });
      else this.toast('safe', 'info', 'Trainard bloqué', 'Seul le recul transversal est possible. Débloquez-le pour dégager en Z.');
      s.autoFeed = null;
      return true;
    },
    guard() {
      const s = this.s;
      if (s.guardClosed && this.running) {
        s.spindleDir = 0;
        s.autoFeed = null;
        this.toast('guard', 'warn', 'Interverrouillage', 'Ouverture du protecteur : la broche s’arrête automatiquement.');
      }
      s.guardClosed = !s.guardClosed;
      return true;
    },
    rpm(n) {
      const s = this.s;
      if (this.running) {
        this.toast('rpm', 'danger', 'Arrêtez la broche d’abord', 'Changer de vitesse en rotation casse les engrenages de la boîte.');
        this.record('violation', 'Changement de vitesse broche en rotation');
        return false;
      }
      s.rpm = GEARBOX_RPM.includes(n) ? n : s.rpm;
      return true;
    },
    applyRecommended() {
      const rec = this.recommendation();
      if (!this.actions.rpm.call(this, rec.nBox)) return false;
      this.s.feed = rec.f;
      this.toast('rec', 'ok', 'Conditions appliquées', `N = ${rec.nBox} tr/min · f = ${String(rec.f).replace('.', ',')} mm/tr`);
      return true;
    },
    feed(f) {
      if (FEEDS.includes(f)) this.s.feed = f;
      return true;
    },
    power() {
      const s = this.s;
      s.power = !s.power;
      if (!s.power) {
        s.spindleDir = 0;
        s.autoFeed = null;
        s.halfNut = false;
      }
      this.toast('power', s.power ? 'ok' : 'info', s.power ? 'Machine sous tension' : 'Machine hors tension');
      return true;
    },
    estop() {
      const s = this.s;
      s.estop = !s.estop;
      if (s.estop) {
        s.spindleDir = 0;
        s.autoFeed = null;
        s.halfNut = false;
        this.path = [];
        this.jog.z = this.jog.x = 0;
        this.toast('estop', 'danger', 'ARRÊT D’URGENCE', 'Tous les mouvements sont coupés. Recliquez pour déverrouiller.', 0);
      } else this.toast('estop', 'info', 'Arrêt d’urgence déverrouillé', 'La broche ne redémarre pas seule : relancez-la volontairement.', 0);
      return true;
    },
    brake() {
      if (this.s.spindleDir !== 0) {
        this.s.spindleDir = 0;
        this.s.autoFeed = null;
        this.s.halfNut = false;
        this.toast('brake', 'info', 'Frein actionné', 'La barre rouge arrête la broche sans lâcher les volants.');
      } else this.toast('brake', 'info', 'Barre de freinage', 'Broche déjà arrêtée.');
      return true;
    },
    lock() {
      const s = this.s;
      s.carriageLocked = !s.carriageLocked;
      if (s.carriageLocked && (s.autoFeed === 'z-' || s.halfNut)) {
        s.autoFeed = null;
        s.halfNut = false;
      }
      this.toast('lock', 'info', s.carriageLocked ? 'Trainard bloqué' : 'Trainard débloqué',
        s.carriageLocked ? 'Seuls le chariot transversal et le chariot supérieur bougent.' : '');
      return true;
    },
    spindle(dir) {
      return this._setSpindle(dir);
    },
    spindleCycle() {
      return this._setSpindle(this.s.spindleDir === 0 ? 1 : 0);
    },
    autoFeed(mode) {
      return this._setAutoFeed(mode);
    },
    feedCycle() {
      const order = [null, 'z-', 'x-'];
      return this._setAutoFeed(order[(order.indexOf(this.s.autoFeed) + 1) % order.length]);
    },
    halfNut() {
      const s = this.s;
      if (s.halfNut) {
        s.halfNut = false;
        return true;
      }
      if (s.autoFeed) {
        this.toast('nut', 'warn', 'Verrouillage mécanique', 'Débrayez l’avance automatique avant d’embrayer l’écrou de filetage.');
        return false;
      }
      if (s.carriageLocked) {
        this.toast('nut', 'warn', 'Trainard bloqué', 'Débloquez le trainard avant d’embrayer l’écrou.');
        return false;
      }
      s.halfNut = true;
      this.toast('nut', 'warn', 'Écrou de filetage embrayé',
        `Le trainard avance de ${String(THREAD_PITCH).replace('.', ',')} mm par tour vers le mandrin : préparez-vous à débrayer !`);
      return true;
    },
    tail(z) {
      const [a, b] = this.tailLimits();
      this.s.tailZ = clamp(z, a, b);
      return true;
    },
    simSpeed(v) {
      this.s.simSpeed = v;
      return true;
    },
    realSpeed(v) {
      this.s.realSpeed = !!v;
      return true;
    },
    cutting(params) {
      Object.assign(this.s, params);
      return true;
    },
    newStock(d, L) {
      if (this.running) {
        this.toast('stock', 'danger', 'Broche en rotation', 'Arrêtez la broche avant de changer de pièce.');
        return false;
      }
      const s = this.s;
      this.stock.reset(d, L);
      Object.assign(s, {
        keyIn: true, guardClosed: false, workpieceChecked: false, carriageLocked: false,
        zc: 40, cz: 0, r: this.stock.R0 + 30, autoFeed: null, halfNut: false,
      });
      s.tailZ = clamp(s.tailZ, ...this.tailLimits());
      this.path = [];
      this.emit('stock');
      this.toast('stock', 'info', 'Nouveau brut monté',
        `Ø ${d} × ${L} mm. Clé en place, protecteur ouvert : refaites la séquence de démarrage.`);
      return true;
    },
  };

  _setSpindle(dir) {
    const s = this.s;
    if (dir === 0) {
      if (s.spindleDir !== 0) this.toast('spindle', 'info', 'Broche arrêtée');
      s.spindleDir = 0;
      s.autoFeed = null;
      s.halfNut = false;
      return true;
    }
    const fail = (level, title, text, violation = true) => {
      this.toast('spindle', level, title, text, 400);
      if (violation) this.record('violation', title);
      return false;
    };
    if (!this.demo) {
      if (!s.power) return fail('warn', 'Machine hors tension', 'Tournez l’interrupteur général sur « I ».', false);
      if (s.estop) return fail('warn', 'Arrêt d’urgence enclenché', 'Déverrouillez le coup-de-poing avant de redémarrer.', false);
      if (s.keyIn) return fail('danger', 'Accident évité : clé dans le mandrin',
        'Au démarrage, la clé aurait été projetée vers vous. Retirez-la toujours dès le serrage terminé.');
      if (!s.guardClosed) return fail('warn', 'Interverrouillage : protecteur ouvert',
        'La broche ne peut pas démarrer tant que le protecteur de mandrin est ouvert.');
      if (!s.toolClamped) return fail('danger', 'Outil non bridé',
        'L’effort de coupe arracherait l’outil. Serrez la tourelle avant de démarrer.');
      if (!s.ppe) return fail('warn', 'EPI non vérifiés', 'Confirmez le port des EPI (module A, étape 1).');
      if (this.ev.workClear < 1) return fail('danger', 'Outil en contact avec la pièce',
        'Démarrer outil engagé casse la plaquette. Dégagez l’outil (touche T).');
      if (!this.speedOK()) {
        const rec = this.recommendation();
        return fail('warn', 'Vitesse de broche inadaptée',
          `${s.rpm} tr/min sélectionnés, ≈ ${Math.round(rec.n)} tr/min conseillés pour ce matériau et ce Ø. Voir module C.`);
      }
    }
    s.spindleDir = dir;
    this.toast('spindle', dir > 0 ? 'ok' : 'warn', dir > 0 ? 'Broche en marche avant' : 'Broche en marche arrière',
      dir > 0 ? `${s.rpm} tr/min` : 'L’outil à droite ne coupe pas en rotation inverse.');
    return true;
  }

  _setAutoFeed(mode) {
    const s = this.s;
    if (!mode) {
      s.autoFeed = null;
      return true;
    }
    if (!this.running) {
      this.toast('feed', 'warn', 'Broche à l’arrêt', 'L’avance automatique est entraînée par la broche : démarrez-la d’abord.');
      return false;
    }
    if (s.halfNut) {
      this.toast('feed', 'warn', 'Verrouillage mécanique', 'Débrayez l’écrou de filetage d’abord.');
      return false;
    }
    if (mode === 'z-' && s.carriageLocked) {
      this.toast('feed', 'warn', 'Trainard bloqué', 'Débloquez le trainard pour charioter.');
      return false;
    }
    s.autoFeed = mode;
    return true;
  }

  /* ------------------------------------------------------------------ mouvements */

  refresh() {
    this.obs = obstacles(this.stock, this.s.tailZ, DIMS);
    this.ev = evaluate(this.z, this.s.r, this.stock, this.obs);
  }

  /**
   * Déplace l'outil de façon incrémentale (pas de 0,1 mm) en vérifiant à chaque pas
   * collisions et engagement de l'arête. Retourne true si le mouvement est complet.
   */
  move({ dzc = 0, dcz = 0, dr = 0 } = {}, source = 'manual') {
    const s = this.s;
    if (s.exploded) {
      this.toast('explode', 'info', 'Vue éclatée', 'Revenez en vue assemblée (X) pour manœuvrer la machine.');
      return false;
    }
    // Les volants sont mécaniques : seuls les mouvements motorisés sont coupés par l'AU
    if (s.estop && (source === 'auto' || source === 'path')) return false;
    if (dzc && s.carriageLocked) {
      this.toast('locked', 'warn', 'Trainard bloqué', 'Desserrez la vis de blocage du trainard (ou utilisez le chariot supérieur).');
      dzc = 0;
      if (!dcz && !dr) return false;
    }
    const [zmin, zmax] = this.zcLimits();
    const tzc = clamp(s.zc + dzc, zmin, zmax);
    const tcz = clamp(s.cz + dcz, LIMITS.czMin, LIMITS.czMax);
    const tr = clamp(s.r + dr, LIMITS.rMin, LIMITS.rMax);
    const Dzc = tzc - s.zc;
    const Dcz = tcz - s.cz;
    const Dr = tr - s.r;
    const n = Math.ceil(Math.max(Math.abs(Dzc + Dcz), Math.abs(Dr)) / 0.1);
    if (n === 0) return Math.abs(dzc) + Math.abs(dcz) + Math.abs(dr) < 1e-6;

    const zc0 = s.zc;
    const cz0 = s.cz;
    const r0 = s.r;
    let prev = this.ev;
    let cutVol = 0;
    let ok = true;
    for (let k = 1; k <= n; k++) {
      const zc = zc0 + (Dzc * k) / n;
      const cz = cz0 + (Dcz * k) / n;
      const r = r0 + (Dr * k) / n;
      const e = evaluate(zc + cz, r, this.stock, this.obs);
      // On autorise un mouvement qui éloigne d'une collision déjà présente
      if (e.hit && !(prev.hit && e.bodyClear > prev.bodyClear)) {
        this._collide(e.hit);
        ok = false;
        break;
      }
      if (e.cutting) {
        let block = null;
        if (!this.running) block = ['spindle', 'L’outil bute contre la pièce', 'La broche est à l’arrêt : l’outil ne peut pas couper. Démarrez la broche ou reculez.'];
        else if (s.spindleDir < 0) block = ['reverse', 'Rotation inverse', 'L’outil à droite talonne en marche arrière : repassez en marche avant.'];
        else if (!s.toolClamped) block = ['clamp', 'Outil non bridé', 'L’outil a glissé dans la tourelle au contact de la pièce.'];
        if (block) {
          this.toast(block[0], 'warn', block[1], block[2]);
          ok = false;
          break;
        }
        cutVol += this.stock.cut(zc + cz, r);
      }
      s.zc = zc;
      s.cz = cz;
      s.r = r;
      prev = e;
    }
    this.ev = evaluate(this.z, s.r, this.stock, this.obs);
    if (cutVol > 0) this.emit('cut', { z: this.z, r: s.r, vol: cutVol });
    return ok;
  }

  _collide(hit) {
    const s = this.s;
    const now = performance.now();
    this.alert.hitUntil = now + 1800;
    this.alert.hit = hit;
    s.autoFeed = null;
    s.halfNut = false;
    this.jog.z = this.jog.x = 0;
    const { title, text } = describeHit(hit);
    if (now - this._lastHitAt > 1500) {
      if (!this.demo) this.record('collision', title); // les démos ne comptent pas dans le score
      this.emit('collision', { hit, title, text });
    }
    this._lastHitAt = now;
    this.emit('change');
  }

  /* ------------------------------------------------------------------ boucle */

  update(dt) {
    const s = this.s;
    const dtS = Math.min(dt, 0.05);

    if (this.running) {
      const visual = s.realSpeed ? s.rpm : s.rpm * 0.04 + 8; // ralenti lisible par défaut
      this.spindleAngle = (this.spindleAngle + (s.spindleDir * visual * TAU * dtS) / 60) % TAU;
    }

    if (this.jog.z || this.jog.x) {
      const v = this.jog.fine ? JOG.fine : JOG.fast;
      this.move({ dzc: this.jog.z * v * dtS, dr: this.jog.x * v * dtS }, 'jog');
    }

    if (s.autoFeed || s.halfNut) {
      if (!this.running) {
        s.autoFeed = null;
        s.halfNut = false;
        this.emit('change');
      } else {
        const rate = s.halfNut ? (THREAD_PITCH * s.rpm) / 60 : (s.feed * s.rpm) / 60;
        const d = rate * dtS * s.simSpeed;
        const before = [s.zc, s.r];
        if (s.halfNut || s.autoFeed === 'z-') this.move({ dzc: -d }, 'auto');
        else this.move({ dr: -d }, 'auto');
        const stuck = Math.abs(before[0] - s.zc) + Math.abs(before[1] - s.r) < 1e-7;
        if (stuck && (s.autoFeed || s.halfNut)) {
          s.autoFeed = null;
          s.halfNut = false;
          this.toast('feedend', 'info', 'Avance débrayée', 'Fin de course ou obstacle : l’avance automatique est coupée.');
          this.emit('change');
        }
      }
    }

    this._runPath(dtS);
    this._updateAlert();
  }

  /** Exécute la file de mouvements scriptés : { zc?, cz?, r?, v } | { wait } | { fn } */
  _runPath(dt) {
    let budget = dt;
    while (this.path.length && budget > 1e-6) {
      const step = this.path[0];
      if (step.fn) {
        this.path.shift();
        step.fn(this);
        continue;
      }
      if (step.wait != null) {
        step.wait -= budget;
        budget = 0;
        if (step.wait <= 0) this.path.shift();
        break;
      }
      const s = this.s;
      const tgt = { zc: step.zc ?? s.zc, cz: step.cz ?? s.cz, r: step.r ?? s.r };
      const dist = Math.hypot(tgt.zc - s.zc, tgt.cz - s.cz, tgt.r - s.r);
      const v = step.v * (step.scaled ? s.simSpeed : 1);
      const d = Math.min(dist, v * budget);
      if (dist < 1e-6) {
        this.path.shift();
        continue;
      }
      const f = d / dist;
      const [zc0, cz0, r0] = [s.zc, s.cz, s.r];
      const ok = this.move({ dzc: (tgt.zc - s.zc) * f, dcz: (tgt.cz - s.cz) * f, dr: (tgt.r - s.r) * f }, this.demo ? 'demo' : 'path');
      const moved = Math.abs(s.zc - zc0) + Math.abs(s.cz - cz0) + Math.abs(s.r - r0);
      // « Bloqué » seulement si un déplacement significatif était demandé (reliquat de temps minuscule sinon)
      if (!ok || (d > 1e-4 && moved < d * 0.5)) {
        // Obstacle : on abandonne ce segment ; les démos « danger » continuent (expectHit)
        if (step.expectHit) this.path.shift();
        else this.path = [];
        break;
      }
      budget -= d / v;
      if (d >= dist - 1e-6) this.path.shift();
    }
    // Fin (ou interruption) d'une démo : on revient aux règles normales
    if (!this.path.length && this.demo) {
      this.demo = false;
      this.emit('change');
    }
  }

  _updateAlert() {
    const now = performance.now();
    const a = this.alert;
    let level = 'ok';
    let info = null;
    if (now < a.hitUntil) {
      level = 'hit';
      info = a.hit;
    } else if (!this.s.exploded && this.ev.bodyClear < WARN_CLEARANCE) {
      level = 'warn';
      info = this.ev.near;
    }
    if (level !== a.level || info?.zone?.id !== a.info?.zone?.id || info?.obstacle?.id !== a.info?.obstacle?.id) {
      a.level = level;
      a.info = info;
      this.emit('alert', a);
    }
  }
}

/** Texte pédagogique d'une collision. */
export function describeHit(hit) {
  const zone = hit.zone;
  const o = hit.obstacle;
  if (o.id === 'work') {
    if (zone.id === 'heel')
      return {
        title: 'Collision : le talon de l’outil heurte la pièce',
        text: 'La prise de passe en Z dépasse la longueur d’arête (≈ 7 mm) ou l’outil plonge latéralement. En dressage, prenez 0,5 à 2 mm par passe.',
      };
    if (zone.id === 'top')
      return {
        title: 'Collision : profondeur de passe trop grande',
        text: 'La matière dépasse la hauteur de l’arête (9 mm) : le corps du porte-outil frotte sur la pièce. Réduisez la passe.',
      };
    return { title: `Collision : ${zone.label} heurte la pièce`, text: 'Seule l’arête de la plaquette doit toucher la matière.' };
  }
  if (o.part === 'spindle')
    return {
      title: `Collision : ${zone.label} percute ${o.label}`,
      text: 'Arrêtez l’avance au moins 3 mm avant les mors. Sur une vraie machine : casse d’outil et projection de débris.',
    };
  return { title: `Collision avec ${o.label}`, text: `${cap(zone.label)} touche ${o.label}. Reculez la contre-poupée ou l’outil.` };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
