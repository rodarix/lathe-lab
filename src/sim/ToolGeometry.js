/**
 * Géométrie de l'outil et détection de collision dans le plan (Z, r).
 *
 * Tout est exprimé en mm, relativement à la POINTE de l'outil (zt, rt).
 * L'outil arrive côté opérateur : ses zones s'étendent vers +r (vers l'opérateur)
 * et vers +Z (vers la contre-poupée), la pointe étant le coin « bas-gauche ».
 *
 *        r ↑ (opérateur)
 *          │   ┌──────── queue (shank) ───────┐
 *          │   │                              │
 *     25 ──┤   ├──────┬───────────────────────┤
 *          │   │ corps│        talon          │
 *      9 ──┤   ├──────┤                       │
 *      4 ──┤   │arête │───────────────────────┘
 *      0 ──┼───●──────┘  ← seule l'ARÊTE (plaquette) a le droit de couper
 *          0          7                     20,5   → Z
 *
 * Un GLTF de remplacement n'a pas besoin de toucher à ce fichier tant que
 * l'outil conserve à peu près ces dimensions.
 */
export const TOOL = {
  edgeW: 7, // longueur utile de l'arête le long de Z (mm)
  edgeH: 9, // hauteur de plaquette (mm)
  wiper: 0.8, // méplat de pointe qui coupe « à plat » (mm)
  clearTan: Math.tan((5 * Math.PI) / 180), // angle de dépouille secondaire
};

export const ZONES = [
  { id: 'edge', label: 'l’arête de coupe', part: 'tool', z0: 0, z1: TOOL.edgeW, r0: 0, r1: TOOL.edgeH, edge: true },
  // Même étendue en Z que l'arête : la matière plus haute que la plaquette est vue AVANT d'être coupée
  { id: 'top', label: 'le corps du porte-outil', part: 'tool', z0: 0, z1: TOOL.edgeW, r0: TOOL.edgeH, r1: 25 },
  { id: 'heel', label: 'le talon de l’outil', part: 'tool', z0: TOOL.edgeW, z1: 20.5, r0: 4, r1: 25 },
  { id: 'shank', label: 'la queue de l’outil', part: 'tool', z0: 0.5, z1: 20.5, r0: 25, r1: 160 },
  { id: 'holder', label: 'la tourelle porte-outil', part: 'toolpost', z0: -10, z1: 70, r0: 55, r1: 135 },
];

/** Rayon laissé par l'arête à la position Z (zc) quand la pointe est en (zt, rt). */
export function edgeLimit(zc, zt, rt) {
  if (rt <= 0.02) return 0; // outil au centre : tout ce qui est sous l'arête est enlevé
  return rt + Math.max(0, zc - zt - TOOL.wiper) * TOOL.clearTan;
}

/** Obstacles fixes (rectangles Z×[0, rMax]) — le mandrin tourne : on prend son volume balayé. */
export function obstacles(stock, tailZ, dims) {
  const L = stock.L;
  const { JAW_LEN, JAW_H, CHUCK_BODY_LEN, CHUCK_R } = dims;
  return [
    { id: 'jaws', label: 'les mors du mandrin', part: 'spindle', z0: -L - JAW_LEN, z1: -L, rMax: stock.R0 + JAW_H },
    { id: 'chuck', label: 'le mandrin', part: 'spindle', z0: -L - JAW_LEN - CHUCK_BODY_LEN, z1: -L - JAW_LEN, rMax: CHUCK_R },
    { id: 'center', label: 'la pointe de contre-poupée', part: 'tailstock', z0: tailZ, z1: tailZ + 22, rMax: 9 },
    { id: 'quill', label: 'le fourreau de contre-poupée', part: 'tailstock', z0: tailZ + 22, z1: tailZ + 110, rMax: 24 },
    { id: 'tailBody', label: 'la contre-poupée', part: 'tailstock', z0: tailZ + 100, z1: tailZ + 420, rMax: 100 },
  ];
}

export const WORKPIECE = { id: 'work', label: 'la pièce', part: 'workpiece' };

/**
 * Évalue la position (zt, rt) :
 *  - hit       : première zone NON coupante en interpénétration (ou arête contre mandrin / contre-poupée)
 *  - near      : zone non coupante la plus proche d'un obstacle, et sa distance (bodyClear)
 *  - workClear : distance mini de tout l'outil (arête incluse) à la pièce
 *  - cutting   : l'arête est engagée dans la matière
 * Les distances sont signées : négatives = interpénétration.
 */
export function evaluate(zt, rt, stock, obs) {
  let hit = null;
  let near = null;
  let bodyClear = Infinity;
  let workClear = Infinity;

  const track = (c, zone, obstacle) => {
    if (c < bodyClear) {
      bodyClear = c;
      near = { zone, obstacle, clearance: c };
    }
    if (c < -0.01 && (!hit || c < hit.clearance)) hit = { zone, obstacle, clearance: c };
  };

  for (const zone of ZONES) {
    const a0 = zt + zone.z0;
    const a1 = zt + zone.z1;
    const b0 = rt + zone.r0;

    // Zones situées à droite de la pointe : seule la matière devant la pointe compte
    const cw = stock.clearance(a0, a1, b0, 4, zone.z0 >= 0 ? zt : -Infinity);
    if (cw < workClear) workClear = cw;
    if (!zone.edge) track(cw, zone, WORKPIECE);

    for (const o of obs) {
      // Distance de Tchebychev entre deux rectangles alignés (suffisant à cette échelle)
      const gz = Math.max(o.z0 - a1, a0 - o.z1);
      const gr = b0 - o.rMax;
      track(Math.max(gz, gr), zone, o);
    }
  }

  return { hit, near, bodyClear, workClear, cutting: stock.engaged(zt, rt) };
}
