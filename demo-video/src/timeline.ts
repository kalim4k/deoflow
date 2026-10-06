/**
 * Géométrie et chronologie de la vidéo.
 *
 * L'interface est dessinée à sa taille RÉELLE de téléphone — 14 px pour le
 * corps de texte, 44 px pour un bouton — sur une scène logique de 400 × 500,
 * puis agrandie d'un bloc à 1080 × 1350. On recopie ainsi les mesures du site
 * telles quelles (`p-5` = 20, `text-sm` = 14) au lieu de tout multiplier à la
 * main, et Chrome redessine le texte à la taille finale : il reste net.
 *
 * Le format 4:5 est un choix de lisibilité : la cible regarde la page
 * d'accueil sur un téléphone, où un 16:9 ramènerait l'interface filmée à des
 * caractères de 6 px. En 4:5, le texte courant reste au-dessus de 12 px sur un
 * écran de 360 px de large.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1350;

export const STAGE_W = 400;
export const STAGE_H = 500;
export const SCALE = WIDTH / STAGE_W;

/** L'écran de l'app : posé sous les légendes, il déborde par le bas. */
export const DEVICE = { x: 22, y: 138, w: 356, h: 400 } as const;
/** Hauteur de l'en-tête mobile de l'AppShell (`py-2.5` + bouton de 40 + filet). */
export const HEADER_H = 61;
/** Partie de l'écran visible au-dessus du bord de la vidéo. */
export const DEVICE_VISIBLE_H = STAGE_H - DEVICE.y;

/** Début de chaque partie, en images. */
export const T = {
  intro: 0,
  ch1: 75,
  ch2: 410,
  ch3: 890,
  outro: 1470,
  end: 1580,
} as const;

export const TOTAL = T.end;

/**
 * Les trois chapitres, repris tels quels par la page d'accueil pour ses
 * boutons de navigation — voir `scripts/render.mjs`.
 */
export const CHAPTERS = [
  { id: 'principe', label: 'Le principe', start: T.ch1 },
  { id: 'personnage', label: 'Créer un personnage', start: T.ch2 },
  { id: 'video', label: 'Générer une vidéo', start: T.ch3 },
] as const;

/** Image retenue comme affiche : le clip réel, en grand. */
export const POSTER_FRAME = T.ch3 + 500;
