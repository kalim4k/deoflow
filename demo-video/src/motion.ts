import { Easing, interpolate } from 'remotion';

const smooth = Easing.bezier(0.33, 0, 0.2, 1);

/** `interpolate` bornée et adoucie — la seule courbe de la vidéo. */
export function tween(
  frame: number,
  [from, to]: readonly [number, number],
  [a, b]: readonly [number, number],
  easing: (t: number) => number = smooth,
): number {
  if (to <= from) return frame < from ? a : b;
  return interpolate(frame, [from, to], [a, b], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/**
 * Valeur pilotée par une suite d'étapes `[image, valeur]` : reste sur chaque
 * valeur, puis glisse vers la suivante en `duration` images. Sert au défilement
 * des écrans, qui enchaîne plusieurs positions.
 */
export function steps(
  frame: number,
  keys: ReadonlyArray<readonly [number, number]>,
  duration = 24,
) {
  let value = keys[0]?.[1] ?? 0;
  for (const [at, target] of keys) {
    if (frame < at) break;
    value = tween(frame, [at, at + duration], [value, target]);
  }
  return value;
}

/** Texte en cours de frappe : `cps` caractères par image à partir de `start`. */
export function typed(text: string, frame: number, start: number, cps: number): string {
  const count = Math.floor(Math.max(0, frame - start) * cps);
  return Array.from(text).slice(0, count).join('');
}

/** Durée de frappe d'un texte, en images. */
export function typingFrames(text: string, cps: number): number {
  return Math.ceil(Array.from(text).length / cps);
}

/** Compteur entier — le solde qui monte ou descend. */
export function counter(frame: number, start: number, duration: number, from: number, to: number) {
  return Math.round(tween(frame, [start, start + duration], [from, to]));
}

/** Apparition d'une page, comme `PageTransition` sur le site : fondu et légère montée. */
export function pageIn(frame: number, start: number) {
  const t = tween(frame, [start, start + 9], [0, 1]);
  return { opacity: t, transform: `translateY(${(1 - t) * 8}px)` };
}

export interface FingerKey {
  /** Image à laquelle le doigt atteint ce point. */
  at: number;
  x: number;
  y: number;
  /** Vrai si le doigt tape à son arrivée. */
  tap?: boolean;
}

/** Durée d'un trajet de doigt entre deux points. */
const TRAVEL = 14;

/**
 * Position du doigt et état de la tape à l'image `frame`.
 *
 * Le doigt rejoint chaque point en `TRAVEL` images et y arrive pile à `at` :
 * on écrit donc le moment de la tape, pas celui du départ — c'est ce qui se
 * synchronise avec l'écran.
 */
export function fingerAt(frame: number, keys: readonly FingerKey[]) {
  const first = keys[0];
  if (!first) return null;

  let x = first.x;
  let y = first.y;
  for (let i = 1; i < keys.length; i++) {
    const key = keys[i]!;
    const prev = keys[i - 1]!;
    const depart = Math.max(prev.at, key.at - TRAVEL);
    if (frame < depart) break;
    x = tween(frame, [depart, key.at], [prev.x, key.x]);
    y = tween(frame, [depart, key.at], [prev.y, key.y]);
  }

  // Tape la plus récente déjà déclenchée.
  let sinceTap = Infinity;
  for (const key of keys) {
    if (key.tap && frame >= key.at) sinceTap = frame - key.at;
  }

  const last = keys[keys.length - 1]!;
  const opacity =
    tween(frame, [first.at - 8, first.at], [0, 1]) *
    tween(frame, [last.at + 10, last.at + 18], [1, 0]);

  return { x, y, sinceTap, opacity };
}
