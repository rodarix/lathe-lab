# Lathe Lab — simulateur interactif de tournage

Site pédagogique 100 % client (Three.js + Vite, sans backend) pour apprendre à conduire un
**tour parallèle conventionnel** : séquence de sécurité, rôle des commandes, mouvements du
trainard et des chariots, risques de collision, conditions de coupe (Vc, N, f).

## Démarrer

```bash
npm install
npm run dev       # http://localhost:5173 (exposé sur le réseau local : --host)
npm test          # tests de la simulation d'usinage (Node, sans navigateur)
npm run build     # production → dist/
npm run preview   # sert dist/ en local
```

### Déploiement

| Cible | Réglage |
|---|---|
| **Netlify** | `netlify.toml` fourni (build `npm run build`, publication `dist`). |
| **Vercel** | `vercel.json` fourni (framework Vite, sortie `dist`). |
| **Nginx / Raspberry Pi** | `base: './'` dans `vite.config.js` : copier `dist/` dans n'importe quel sous-dossier (ex. `location /lathe/`). Le lien « ⊞ Portail » n'apparaît que servi depuis `192.168.1.38`. |

## Ce que fait l'application

- **Scène 3D** : tour procédural (bâti bleu, carters blancs, barre de freinage rouge), atelier sombre,
  orbite / déplacement / zoom, marche au clavier (ZQSD ou WASD), vues prédéfinies, vue éclatée avec étiquettes.
- **Manipulation directe** : chaque organe s'éclaire au survol ; clic = fiche + action (retirer la clé,
  fermer le protecteur, bloquer le trainard, interrupteur vert de marche…) ; les **volants se tournent** en glissant
  autour de leur centre (en 3D ou dans la barre du bas), à la molette ou aux flèches.
- **Usinage réel** : le brut est un profil (tranches de 0,25 mm) réellement enlevé par l'arête ;
  surface brute mate / usinée brillante ; copeaux ; avance automatique f × N.
- **Collisions** : talon, corps et queue de l'outil, tourelle, mors, mandrin, contre-poupée.
  Alerte orange sous 2 mm, rouge + mouvement bloqué au contact, explication pédagogique, historique et score.
- **Module A — Sécurité** : 9 étapes évaluées sur l'état réel de la machine, ordre imposé (désactivable),
  l'organe concerné clignote dans la vue 3D ; démarrage refusé avec explication (clé oubliée, protecteur ouvert…).
- **Module B — Commandes** : localisation des 12 commandes, manuel vs automatique, 4 démonstrations
  (chariotage, dressage, dressage trop profond, avance jusqu'au mandrin), contre-poupée, historique.
- **Module C — Vitesses** : matériau / outil / opération / Ø → Vc, N théorique, N de boîte, f, Vf, ap ;
  application à la machine ; jauge de Vc réelle au Ø de l'outil ; montage d'un nouveau brut (règle des 3 × Ø).
- **Leçon guidée** (11 étapes) : prise en main → sécurité → axes Z/X → blocage → passe au chariot supérieur
  → premier dressage → dégagement → bilan chiffré.
- **Vue 2D** du plan XZ à l'échelle : on y voit pourquoi le talon touche la pièce.

### Raccourcis

`← →` trainard · `↑ ↓` transversal · `Maj` fin · `Espace` broche · `Échap` arrêt d'urgence ·
`T` position sûre · `X` éclaté · `R` vue initiale · `F` zone de coupe · `V` changer de vue ·
`P` vue 2D · `N` étiquettes · `H` masquer l'interface · `G` leçon · `1 2 3` modules · `?` aide

## Architecture

```
index.html                 squelette de l'interface (conteneurs vides)
src/
  main.js                  câblage : façade `app`, vues caméra, clavier, boucle de rendu
  config.js                échelle, repères, dimensions mandrin, courses, pas des volants
  styles.css               thème (tokens :root), panneaux flottants, responsive
  core/
    Stage.js               renderer, atelier, lumières, OrbitControls, marche, transitions caméra
    Emitter.js             bus d'événements minimal
  lathe/
    LatheModel.js          tour procédural + « rig » animé + vue éclatée + surbrillances
    builders.js            primitives (boîtes arrondies, cylindres, volants, leviers)
    materials.js           matériaux et textures dessinées au canvas
    gltfAdapter.js         remplacement par un modèle GLTF/GLB (voir ci-dessous)
  sim/
    Machine.js             ÉTAT + RÈGLES : actions opérateur, sécurités, mouvements, avances, alertes
    Stock.js               brut usinable (profil + maillage LatheGeometry)
    ToolGeometry.js        zones de l'outil, obstacles, détection de collision (plan Z-r)
    Chips.js               copeaux (InstancedMesh)
  data/
    parts.js               fiches des organes (id partagé avec les maillages)
    cutting.js             tables Vc / f / ap, vitesses de boîte, formules
  ui/                      Hud, Dock (volants, DRO), Detail, Interaction (3D), ProfileView, Rail
  modules/                 SafetyModule (A), ControlsModule (B), CuttingModule (C), Lesson
tests/sim.test.mjs         15 tests de la simulation (sans rendu)
```

**Principe** : `Machine` ne connaît pas le rendu. L'interface et le modèle 3D lisent `machine.s` à chaque
image et passent par `machine.act(nom)` / `machine.move({dzc, dcz, dr})`. Toute règle pédagogique
(ordre de la séquence, interverrouillages, collisions) est donc testable dans Node (`npm test`).

**Conventions** : 1 unité = 1 m. La simulation travaille en mm : Z = 0 sur la face du brut, négatif vers le
mandrin ; X est stocké en rayon `r` et affiché en diamètre. Monde : `x = faceX + Z·0,001`, `z = r·0,001`.

## Remplacer le tour procédural par un vrai modèle (GLTF)

Le modèle procédural est un *placeholder* ; la simulation ne dépend que du **rig** décrit en tête de
`src/lathe/LatheModel.js` (`carriage`, `crossPos`, `compPos`, `spindleRot`, `tail`, `guardPivot`,
`wheels.*.userData.spin`, `levers.*`).

1. Modéliser en mètres : axe de broche selon +X à `Y = 1,13`, opérateur côté +Z.
2. Nommer les objets comme dans `MAPPING` (`src/lathe/gltfAdapter.js`) : `Saddle`, `CrossSlide`, `Tool`,
   `Chuck`, `Tailstock`… et placer leurs origines comme le placeholder (pointe d'outil à l'origine de `Tool`,
   centre des volants avec leur axe en +Z local).
3. Exporter `public/models/lathe.glb`, puis décommenter dans `src/main.js` :
   ```js
   import { loadLatheGLTF } from './lathe/gltfAdapter.js';
   loadLatheGLTF(model, './models/lathe.glb');
   ```
Chaque nœud trouvé masque le placeholder de l'organe correspondant et reprend son `id` de `data/parts.js`
(survol, clic, surbrillance rouge de collision). Les nœuds absents gardent le placeholder.
Si l'outil réel a d'autres dimensions, ajuster `ZONES` dans `src/sim/ToolGeometry.js`.

## Limites connues

- Valeurs de coupe **indicatives** (pédagogie) : toujours se référer aux fiches fabricant.
- Collisions en 2D (plan Z-r, volume balayé par la rotation) : suffisant pour un tour, pas de 3D fine.
- Le chariot supérieur est modélisé parallèle à l'axe (pas d'orientation pour les cônes).
- Rotation affichée ralentie par défaut (option « vitesse réelle » dans le module C).
