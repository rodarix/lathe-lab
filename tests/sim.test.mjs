// Tests de la simulation d'usinage (sans rendu) : `npm test`
import assert from 'node:assert/strict';
import { Stock } from '../src/sim/Stock.js';
import { Machine } from '../src/sim/Machine.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('  ✓', name);
};

/** Machine prête à usiner (séquence de sécurité faite). */
function ready(d = 50, L = 80) {
  const m = new Machine(new Stock(d, L));
  Object.assign(m.s, { power: true, ppe: true, keyIn: false, guardClosed: true, toolClamped: true, rpm: 1000 });
  m.refresh();
  const hits = [];
  m.on('collision', (c) => hits.push(c));
  return { m, hits };
}
const place = (m, zc, r, cz = 0) => {
  Object.assign(m.s, { zc, r, cz });
  m.refresh();
};

test('démarrage refusé tant que la clé est dans le mandrin', () => {
  const { m } = ready();
  m.s.keyIn = true;
  assert.equal(m.act('spindle', 1), false);
  assert.equal(m.s.spindleDir, 0);
  assert.ok(m.log.some((e) => e.kind === 'violation'));
});

test('démarrage accepté quand toutes les conditions sont réunies', () => {
  const { m } = ready();
  assert.equal(m.act('spindle', 1), true);
  assert.equal(m.running, true);
});

test('chariotage : Ø réduit sur la longueur, sans collision', () => {
  const { m, hits } = ready();
  place(m, 3, 23);
  m.act('spindle', 1);
  assert.equal(m.move({ dzc: -43 }), true);
  assert.equal(hits.length, 0);
  assert.ok(Math.abs(m.stock.radiusAt(-20) - 23) < 0.05, `R(-20) = ${m.stock.radiusAt(-20)}`);
  assert.equal(m.stock.radiusAt(-60), 25); // pas encore usiné
});

test('dressage 0,5 mm jusqu’au centre : la face recule', () => {
  const { m, hits } = ready();
  place(m, -0.5, 30);
  m.act('spindle', 1);
  assert.equal(m.move({ dr: -30 }), true);
  assert.equal(hits.length, 0);
  assert.ok(m.stock.faceZ() <= -0.25, `faceZ = ${m.stock.faceZ()}`);
});

test('chariotage ap = 2 mm : aucune alerte sur le corps d’outil', () => {
  const { m, hits } = ready();
  place(m, 3, 23);
  m.act('spindle', 1);
  let worst = Infinity;
  for (let i = 0; i < 400; i++) {
    m.move({ dzc: -0.1 });
    worst = Math.min(worst, m.ev.bodyClear);
  }
  assert.equal(hits.length, 0);
  assert.ok(worst >= 2, `alerte corps d’outil à ${worst.toFixed(2)} mm`);
});

test('dressage 0,8 mm à Z non aligné sur la grille : ni collision ni alerte', () => {
  const { m, hits } = ready();
  place(m, -0.7999999999999998, 30); // valeur réellement obtenue au chariot supérieur
  m.act('spindle', 1);
  let worst = Infinity;
  for (let i = 0; i < 300; i++) {
    m.move({ dr: -0.1 });
    worst = Math.min(worst, m.ev.bodyClear);
  }
  assert.equal(hits.length, 0);
  assert.ok(worst >= 2, `alerte corps d’outil à ${worst.toFixed(2)} mm`);
  assert.ok(m.stock.faceZ() <= -0.5);
});

test('dressage trop profond (10 mm) : le talon heurte la pièce', () => {
  const { m, hits } = ready();
  place(m, -10, 30);
  m.act('spindle', 1);
  assert.equal(m.move({ dr: -30 }), false);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].hit.zone.id, 'heel');
  assert.ok(m.s.r > 20 && m.s.r < 25, `arrêt à r = ${m.s.r}`);
});

test('passe de chariotage de 10 mm : le corps de l’outil frotte', () => {
  const { m, hits } = ready();
  place(m, 3, 15);
  m.act('spindle', 1);
  assert.equal(m.move({ dzc: -20 }), false);
  assert.equal(hits[0].hit.zone.id, 'top');
});

test('chariotage jusqu’au mandrin : collision avec les mors', () => {
  const { m, hits } = ready();
  place(m, 3, 24);
  m.act('spindle', 1);
  m.move({ dzc: -200 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].hit.obstacle.id, 'jaws');
  assert.ok(m.z > -81 && m.z < -79, `arrêt à Z = ${m.z}`);
});

test('broche arrêtée : l’outil bute sans couper', () => {
  const { m } = ready();
  place(m, 3, 23);
  assert.equal(m.move({ dzc: -10 }), false);
  assert.ok(m.z > -0.3, `Z = ${m.z}`); // arrêt au contact (résolution 0,25 mm)
  assert.equal(m.stock.radiusAt(-1), 25);
});

test('trainard bloqué : Z impossible au volant, possible au chariot supérieur', () => {
  const { m } = ready();
  place(m, 20, 40);
  m.act('lock');
  m.move({ dzc: -5 });
  assert.equal(m.s.zc, 20);
  m.move({ dcz: -5 });
  assert.equal(m.z, 15);
});

test('séquence imposée : bloque une étape en avance', () => {
  const { m } = ready();
  m.s.power = false;
  m.gate = (a) => (a === 'power' ? 'Pas encore' : null);
  assert.equal(m.act('power'), false);
  assert.equal(m.s.power, false);
});

test('avance automatique de dressage via update()', () => {
  const { m } = ready();
  place(m, -0.5, 27);
  m.act('spindle', 1);
  m.act('autoFeed', 'x-');
  for (let i = 0; i < 400; i++) m.update(0.05);
  assert.ok(m.s.r < 27, `r = ${m.s.r}`);
});

test('file de mouvements : les segments s’enchaînent (démos)', () => {
  const { m } = ready();
  place(m, -7.7, 35, -2.3);
  m.act('spindle', 1);
  m.move({ dr: -30 }); // talon contre la pièce, comme dans le navigateur
  const logged = m.log.length;
  m.demo = true;
  m.path = [{ r: 31, v: 60 }, { cz: 0, v: 60 }, { zc: 3, v: 60 }, { r: 24, v: 30 }, { zc: -200, v: 25, expectHit: true }, { r: 40, v: 30 }];
  for (let i = 0; i < 1500 && m.path.length; i++) m.update(0.02);
  assert.equal(m.path.length, 0);
  assert.equal(m.s.r, 40);
  assert.ok(m.z > -81 && m.z < -79, `arrêt contre les mors à Z = ${m.z}`);
  assert.equal(m.demo, false);
  assert.equal(m.log.length, logged, 'une démo ne compte pas dans le score');
});

test('reconstruction du maillage après usinage', () => {
  const { m } = ready();
  place(m, -1, 30);
  m.act('spindle', 1);
  m.move({ dr: -30 });
  m.stock.rebuild();
  const pos = m.stock.mesh.geometry.attributes.position;
  assert.ok(pos.count > 100);
  for (let i = 0; i < pos.array.length; i++) assert.ok(Number.isFinite(pos.array[i]));
  const nrm = m.stock.mesh.geometry.attributes.normal.array;
  for (let i = 0; i < nrm.length; i++) assert.ok(Number.isFinite(nrm[i]), 'normale NaN');
});

test('volant de contre-poupée : seul le fourreau avance, le corps reste en place', () => {
  const { m } = ready();
  m.act('tail', 300);
  const body = m.s.tailZ + m.s.quill;
  m.act('quill', 40);
  assert.equal(m.s.quill, 40);
  assert.equal(m.s.tailZ + m.s.quill, body, 'le corps n’a pas bougé');
  assert.equal(m.s.tailZ, body - 40, 'la pointe a avancé de 40 mm');
  m.act('quill', 1000); // butée : la pointe s'arrête sur la face de la pièce
  assert.ok(m.s.tailZ >= m.stock.faceZ() - 1e-9);
  assert.ok(m.s.quill <= 100);
});

test('déplacer la contre-poupée sur le banc garde la sortie du fourreau', () => {
  const { m } = ready();
  m.act('tail', 400);
  m.act('quill', 20);
  m.act('tail', 350);
  assert.equal(m.s.quill, 20);
  assert.equal(m.s.tailZ, 350);
});

console.log(`\n${passed} tests OK`);
