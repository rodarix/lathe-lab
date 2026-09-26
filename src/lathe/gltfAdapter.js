import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Remplacer le tour procédural par un vrai modèle GLTF / GLB
 * ────────────────────────────────────────────────────────────────────────────
 * Principe : on NE remplace PAS le rig (les groupes animés de LatheModel), on
 * remplace seulement les maillages qu'ils contiennent. La simulation continue
 * donc de piloter carriage / crossPos / compPos / spindleRot / tail / volants.
 *
 * 1. Dans Blender, modéliser le tour en mètres, axe de broche selon +X,
 *    opérateur côté +Z, axe à Y = 1.13 (voir src/config.js).
 * 2. Nommer les objets (ou collections) comme dans MAPPING ci-dessous et
 *    placer leur origine selon la même convention que le placeholder :
 *      - Outil : pointe de plaquette à l'origine du nœud « Tool » (x=0, z=0) ;
 *      - Volants : centre du volant, axe du volant selon +Z local ;
 *      - Mandrin : centre du nez de broche, axe X.
 * 3. Exporter en .glb dans /public/models/lathe.glb puis, dans main.js :
 *
 *      import { loadLatheGLTF } from './lathe/gltfAdapter.js';
 *      loadLatheGLTF(model, './models/lathe.glb');
 *
 * Tout nœud absent du fichier laisse simplement le placeholder en place.
 */
export const MAPPING = {
  // nom du nœud GLTF : { slot: groupe du rig, part: id de data/parts.js }
  Bed: { slot: 'root', part: 'bed' },
  Headstock: { slot: 'root', part: 'headstock' },
  Chuck: { slot: 'spindleRot', part: 'spindle' },
  ChuckKey: { slot: 'key', part: 'chuckKey' },
  Guard: { slot: 'guardPivot', part: 'guard' },
  Saddle: { slot: 'carriage', part: 'carriage' },
  Apron: { slot: 'carriage', part: 'apron' },
  CarriageWheel: { slot: 'wheels.carriage.spin', part: 'carriageWheel' },
  CrossSlide: { slot: 'crossPos', part: 'crossSlide' },
  CrossWheel: { slot: 'wheels.cross.spin', part: 'crossWheel' },
  Compound: { slot: 'compPos', part: 'compound' },
  ToolPost: { slot: 'compPos', part: 'toolpost' },
  Tool: { slot: 'tool', part: 'tool' },
  Tailstock: { slot: 'tail', part: 'tailstock' },
};

/** Résout un chemin « wheels.cross.spin » dans le modèle. */
function resolve(model, path) {
  let o = model;
  for (const k of path.split('.')) o = k === 'spin' ? o.userData.spin : o[k];
  return o;
}

export async function loadLatheGLTF(model, url, mapping = MAPPING) {
  const gltf = await new GLTFLoader().loadAsync(url);
  for (const [name, { slot, part }] of Object.entries(mapping)) {
    const node = gltf.scene.getObjectByName(name);
    if (!node) continue;
    const target = resolve(model, slot);
    // Masque les maillages placeholder de cet organe…
    for (const m of model.parts[part] || []) m.visible = false;
    // …et accroche le nœud GLTF en conservant sa position monde
    node.traverse((o) => {
      if (o.isMesh) {
        o.userData.part = part;
        o.castShadow = o.receiveShadow = true;
      }
    });
    target.updateWorldMatrix(true, false);
    target.attach(node);
  }
  model.indexParts();
  model.pickables = model.pickables.filter((m) => m.visible);
  return gltf;
}
