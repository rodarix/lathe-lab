/**
 * Fiches des organes du tour. La clé (id) est posée sur les maillages 3D via
 * `userData.part` : un modèle GLTF de remplacement doit réutiliser ces mêmes ids.
 *
 *  name   : nom affiché
 *  code   : repère court (étiquettes de vue éclatée)
 *  desc   : rôle de l'organe
 *  safety : point de vigilance (optionnel)
 *  action : action machine déclenchée au clic (voir Machine.act)
 *  drag   : organe manipulable par glisser (volants)
 *  hint   : consigne affichée au survol
 */
export const PARTS = {
  headstock: {
    name: 'Poupée fixe', code: 'PF',
    desc: 'Carter en fonte qui contient la broche et la boîte de vitesses. La broche entraîne le mandrin et la pièce en rotation.',
    safety: 'Ne jamais ouvrir un carter ni intervenir sur la broche en rotation.',
  },
  speedLevers: {
    name: 'Leviers de vitesse de broche', code: 'LV',
    desc: 'Sélectionnent la fréquence de rotation N (tr/min) par combinaison d’engrenages. La plaque indique les vitesses disponibles.',
    safety: 'Changer de vitesse uniquement broche ARRÊTÉE : sinon casse des engrenages.',
    hint: 'Réglage de la vitesse : module C',
  },
  gearbox: {
    name: 'Boîte des avances (Norton)', code: 'BA',
    desc: 'Règle l’avance automatique f (mm/tr) et le pas de filetage. Elle entraîne la barre de chariotage et la vis mère.',
  },
  estop: {
    name: 'Arrêt d’urgence', code: 'AU', action: 'estop',
    desc: 'Coup-de-poing rouge : coupe immédiatement tous les mouvements. Il reste enclenché jusqu’à son déverrouillage (rotation).',
    safety: 'À utiliser au moindre doute. Réarmer uniquement une fois la cause identifiée.',
    hint: 'Cliquer : enclencher / déverrouiller (Échap)',
  },
  mainSwitch: {
    name: 'Interrupteur général', code: 'IG', action: 'power',
    desc: 'Met la machine sous tension (I) ou hors tension (0). Cadenassable en position 0 pour la maintenance (consignation).',
    hint: 'Cliquer : I / 0',
  },
  spindle: {
    name: 'Mandrin 3 mors', code: 'MA',
    desc: 'Maintient la pièce par trois mors concentriques à serrage simultané, actionnés par la clé de mandrin.',
    safety: 'Pièce serrée sur au moins 1/3 de la hauteur des mors. Ne pas dépasser la vitesse maxi gravée sur le mandrin.',
  },
  chuckKey: {
    name: 'Clé de mandrin', code: 'CL', action: 'key',
    desc: 'Clé en T qui serre et desserre les mors.',
    safety: 'Ne JAMAIS laisser la clé sur le mandrin : au démarrage elle est projetée vers l’opérateur. La retirer aussitôt le serrage fini.',
    hint: 'Cliquer : retirer / remettre la clé',
  },
  workpiece: {
    name: 'Pièce (brut)', code: 'PI', action: 'checkWorkpiece',
    desc: 'Barre cylindrique à usiner. La surface mate est brute ; la surface brillante vient d’être usinée.',
    safety: 'Porte-à-faux maxi ≈ 3 × Ø sans contre-pointe, sinon la pièce fléchit ou s’arrache.',
    hint: 'Cliquer : vérifier le serrage',
  },
  guard: {
    name: 'Protecteur', code: 'PR', action: 'guard',
    desc: 'Carter articulé sur toute la longueur du tour, avec une vitre transparente : il protège des projections de copeaux et du contact avec le mandrin tout en laissant voir l’usinage. Un contact de sécurité empêche le démarrage s’il est ouvert.',
    hint: 'Cliquer : ouvrir / fermer',
  },
  carriage: {
    name: 'Trainard', code: 'TR',
    desc: 'Chariot longitudinal : il glisse sur le banc selon l’axe Z et porte le chariot transversal, le chariot supérieur et la tourelle.',
  },
  carriageWheel: {
    name: 'Volant du trainard', code: 'VT', drag: 'carriage',
    desc: 'Déplacement manuel longitudinal (axe Z) par pignon et crémaillère. 1 tour ≈ 30 mm. Sens horaire : vers la contre-poupée ; anti-horaire : vers le mandrin.',
    hint: 'Glisser en tournant autour du volant',
  },
  carriageLock: {
    name: 'Vis de blocage du trainard', code: 'BT', action: 'lock',
    desc: 'Immobilise le trainard sur le banc. On la serre pour le dressage : l’effort de coupe ne peut plus faire reculer l’outil.',
    hint: 'Cliquer : bloquer / débloquer',
  },
  apron: {
    name: 'Tablier', code: 'TA',
    desc: 'Face avant du trainard. Il contient les mécanismes d’avance automatique et l’écrou de filetage.',
  },
  feedLever: {
    name: 'Levier d’embrayage des avances', code: 'EA', action: 'feedCycle',
    desc: 'Embraye l’avance automatique : longitudinale (chariotage, vers le mandrin) ou transversale (dressage, vers le centre). Position centrale : débrayé.',
    safety: 'Garder la main près du levier pour débrayer avant la fin de course : l’avance ne s’arrête pas toute seule.',
    hint: 'Cliquer : débrayé → chariotage → dressage',
  },
  halfNut: {
    name: 'Levier d’écrou de filetage', code: 'EF', action: 'halfNut',
    desc: 'Embraye le trainard directement sur la vis mère pour le filetage (ici pas de 1,5 mm/tr).',
    safety: 'Mouvement très rapide vers le mandrin. Verrouillé mécaniquement avec l’avance automatique.',
    hint: 'Cliquer : embrayer / débrayer',
  },
  spindleLever: {
    name: 'Interrupteur de marche broche', code: 'MB', action: 'spindleCycle',
    desc: 'Bouton vert sur le dessus de la poupée fixe : un appui met la broche en rotation (le bouton reste enfoncé et s’allume), un nouvel appui l’arrête.',
    safety: 'Avant d’appuyer : clé retirée, protecteur fermé, outil dégagé de la pièce.',
    hint: 'Cliquer : marche / arrêt',
  },
  crossSlide: {
    name: 'Chariot transversal', code: 'CT',
    desc: 'Déplace l’outil perpendiculairement à l’axe (axe X) : dressage des faces et prise de passe en chariotage.',
  },
  crossWheel: {
    name: 'Volant transversal', code: 'VX', drag: 'cross',
    desc: 'Tambour gradué : 1 tour = 4 mm au rayon (8 mm au Ø). Sens horaire : l’outil avance vers le centre de la pièce.',
    hint: 'Glisser en tournant autour du volant',
  },
  compound: {
    name: 'Chariot supérieur', code: 'CS',
    desc: 'Petit chariot orientable. Ici parallèle à l’axe : il règle finement la profondeur de dressage quand le trainard est bloqué, ou usine des cônes courts.',
  },
  compoundWheel: {
    name: 'Volant du chariot supérieur', code: 'VS', drag: 'compound',
    desc: '1 tour = 2,5 mm le long de l’axe Z. Sens horaire : l’outil avance vers le mandrin.',
    hint: 'Glisser en tournant',
  },
  toolpost: {
    name: 'Tourelle porte-outil', code: 'TO',
    desc: 'Tourelle carrée indexable à 4 postes. L’outil doit être serré par au moins 2 vis, avec un porte-à-faux court et la pointe à hauteur d’axe.',
  },
  toolClamp: {
    name: 'Levier de bridage de la tourelle', code: 'BR', action: 'toolClamp',
    desc: 'Serre la tourelle sur le chariot supérieur et immobilise l’outil.',
    hint: 'Cliquer : brider / débrider',
  },
  tool: {
    name: 'Outil à charioter-dresser', code: 'OU',
    desc: 'Seule l’arête de la plaquette carbure (dorée) coupe. Talon, corps et queue de l’outil ne doivent jamais toucher la pièce.',
    safety: 'Longueur d’arête ≈ 7 mm, hauteur ≈ 9 mm : au-delà, c’est le corps de l’outil qui frotte (collision).',
  },
  tailstock: {
    name: 'Contre-poupée', code: 'CP',
    desc: 'Soutient l’extrémité des pièces longues avec une pointe, ou porte un foret pour le perçage axial. L’opérateur la fait glisser à la main le long du banc pour l’amener près de la pièce, puis approche la pointe au volant.',
    hint: 'Glisser le long du banc pour la déplacer',
  },
  tailWheel: {
    name: 'Volant de contre-poupée', code: 'VC', drag: 'tail',
    desc: 'Fait sortir ou rentrer le fourreau et sa pointe (1 tour = 5 mm, course 100 mm). Le corps de la contre-poupée ne bouge pas. Sens horaire : la pointe avance vers la pièce.',
    hint: 'Glisser en tournant : avancer / reculer la pointe',
  },
  bed: {
    name: 'Banc', code: 'BN',
    desc: 'Bâti rigide en fonte. Ses glissières prismatiques guident le trainard et la contre-poupée.',
  },
  leadscrew: {
    name: 'Vis mère & barre de chariotage', code: 'VM',
    desc: 'La barre de chariotage entraîne les avances automatiques ; la vis mère sert uniquement au filetage.',
  },
  brakeBar: {
    name: 'Barre de freinage', code: 'FR', action: 'brake',
    desc: 'Barre rouge actionnée au pied ou au genou : elle freine et arrête la broche immédiatement, sans lâcher les volants.',
    hint: 'Cliquer : freiner la broche',
  },
  pedestal: {
    name: 'Socle et armoire électrique', code: 'SO',
    desc: 'Supporte le banc. L’armoire de gauche contient l’appareillage électrique (accès réservé aux personnes habilitées).',
  },
  chipTray: {
    name: 'Bac à copeaux', code: 'BC',
    desc: 'Récupère copeaux et lubrifiant.',
    safety: 'Ne jamais retirer les copeaux à la main : crochet ou balayette, machine arrêtée.',
  },
  splash: {
    name: 'Écran arrière', code: 'EC',
    desc: 'Protège l’atelier des projections de copeaux et de lubrifiant.',
  },
  lamp: {
    name: 'Lampe de travail', code: 'LA',
    desc: 'Éclaire la zone de coupe (très basse tension).',
  },
};
