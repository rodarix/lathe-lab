/**
 * Constantes partagées entre le modèle 3D et la simulation.
 *
 * Échelle : 1 unité Three.js = 1 mètre.
 * La simulation d'usinage travaille en MILLIMÈTRES, avec la convention d'atelier :
 *   - Z : axe de la broche, Z = 0 sur la face avant du brut, Z négatif vers le mandrin ;
 *   - X : exprimé en RAYON dans le code (r), affiché en DIAMÈTRE (Ø = 2r) à l'écran.
 *
 * Correspondance monde : x_monde = faceX + Z·MM ; y_monde = Y_AX ; z_monde = r·MM
 * (l'outil arrive par l'avant, côté opérateur, z_monde > 0).
 */
export const MM = 0.001;
export const TAU = Math.PI * 2;

/** Hauteur de l'axe de broche au-dessus du sol (m). */
export const Y_AX = 1.13;
/** Position du nez de broche (m, monde). */
export const SPINDLE_NOSE_X = -0.45;
/** Face avant des mors, mesurée depuis le nez de broche (m). */
export const JAW_FACE_LOCAL = 0.074;

/** Mandrin (mm). */
export const CHUCK_R = 80;
export const CHUCK_BODY_LEN = 60;
export const JAW_LEN = 14;
export const JAW_H = 24;
/** Longueur de brut serrée dans les mors (mm). */
export const GRIP_LEN = 30;

/** Déplacement par tour de volant (mm). Transversal : au rayon (8 mm au Ø). */
export const HANDWHEEL = { carriage: 30, cross: 4, compound: 2.5, tail: 20 };

/** Courses (mm). */
export const LIMITS = { rMin: 0, rMax: 170, zMax: 420, czMin: -40, czMax: 60 };

/** Vitesses de déplacement au clavier (mm/s). */
export const JOG = { fast: 18, fine: 2 };

/** Distance (mm) en dessous de laquelle le corps de l'outil est signalé « à risque ». */
export const WARN_CLEARANCE = 2;
