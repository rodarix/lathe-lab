/**
 * Conditions de coupe indicatives pour le tournage (valeurs pédagogiques,
 * à ajuster selon la fiche du fabricant d'outils et la rigidité de la machine).
 *
 * vc : vitesse de coupe (m/min) [ébauche, finition]
 * f  : avance (mm/tr) [ébauche, finition] — outil carbure ; ARS ×0,8
 * ap : profondeur de passe (mm) [ébauche, finition]
 */
export const MATERIALS = {
  acier: { name: 'Acier doux (S235)', vc: { ars: [25, 35], carbure: [160, 220] }, f: [0.25, 0.1], ap: [2, 0.5] },
  c45: { name: 'Acier mi-dur (C45)', vc: { ars: [18, 25], carbure: [120, 170] }, f: [0.2, 0.08], ap: [2, 0.4] },
  inox: { name: 'Inox (X5CrNi18-10)', vc: { ars: [12, 18], carbure: [90, 130] }, f: [0.2, 0.08], ap: [1.5, 0.4] },
  fonte: { name: 'Fonte grise (EN-GJL-250)', vc: { ars: [18, 25], carbure: [90, 130] }, f: [0.25, 0.1], ap: [2, 0.5] },
  laiton: { name: 'Laiton (CuZn39Pb3)', vc: { ars: [60, 90], carbure: [250, 350] }, f: [0.2, 0.08], ap: [2, 0.5] },
  alu: { name: 'Aluminium (2017A)', vc: { ars: [90, 150], carbure: [400, 600] }, f: [0.25, 0.1], ap: [3, 0.5] },
  pom: { name: 'Polyacétal (POM)', vc: { ars: [80, 120], carbure: [200, 300] }, f: [0.2, 0.1], ap: [2, 0.5] },
};

export const TOOLS = { carbure: 'Carbure', ars: 'ARS (acier rapide)' };
export const OPS = { ebauche: 'Ébauche', finition: 'Finition' };

/** Fréquences de rotation disponibles sur la boîte de vitesses (tr/min). */
export const GEARBOX_RPM = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2000];
/** Avances disponibles sur la boîte Norton (mm/tr). */
export const FEEDS = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3];

/** N = 1000·Vc / (π·D) — N en tr/min, Vc en m/min, D en mm. */
export const rpmFor = (vc, d) => (1000 * vc) / (Math.PI * Math.max(d, 1));
/** Vc = π·D·N / 1000 */
export const vcFor = (n, d) => (Math.PI * d * n) / 1000;

/** Vitesse de boîte immédiatement inférieure (on ne dépasse jamais la Vc conseillée). */
export function gearboxBelow(n) {
  let best = GEARBOX_RPM[0];
  for (const v of GEARBOX_RPM) if (v <= n) best = v;
  return best;
}
export function feedBelow(f) {
  let best = FEEDS[0];
  for (const v of FEEDS) if (v <= f + 1e-9) best = v;
  return best;
}

/** Recommandation complète pour un couple matériau / outil / opération / Ø. */
export function recommend({ material = 'acier', tool = 'carbure', op = 'ebauche', d = 50 }) {
  const m = MATERIALS[material] ?? MATERIALS.acier;
  const i = op === 'finition' ? 1 : 0;
  const vc = m.vc[tool][i];
  const n = rpmFor(vc, d);
  const nBox = gearboxBelow(n);
  const f = feedBelow(m.f[i] * (tool === 'ars' ? 0.8 : 1));
  return {
    vc,
    n,
    nBox,
    capped: n > GEARBOX_RPM[GEARBOX_RPM.length - 1],
    f,
    vf: f * nBox,
    ap: m.ap[i],
    vcReal: vcFor(nBox, d),
  };
}
