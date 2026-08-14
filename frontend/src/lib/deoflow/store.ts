import type { CreditTransaction, Generation, Purchase } from './types';

// État simulé de l'utilisateur courant.
//
// La partie « arithmétique » (créditer / débiter) est écrite en fonctions
// PURES, sans localStorage ni React : c'est elle qui porte la règle métier
// sensible — on ne débite jamais un solde insuffisant — et c'est elle qui est
// couverte par les tests. La classe en bas n'ajoute que la persistance et
// la notification des composants.

export interface DeoflowState {
  credits: number;
  transactions: CreditTransaction[];
  generations: Generation[];
  purchases: Purchase[];
}

/** Un nouvel inscrit arrive à 0 crédit (US1 du PRD). */
export const INITIAL_STATE: DeoflowState = Object.freeze({
  credits: 0,
  transactions: [],
  generations: [],
  purchases: [],
}) as DeoflowState;

export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';
  readonly missing: number;

  constructor(missing: number) {
    super(`Solde insuffisant : il manque ${missing} crédit(s).`);
    this.name = 'InsufficientCreditsError';
    this.missing = missing;
  }
}

/* ── Arithmétique du solde (pure) ──────────────────────────────────────── */

export interface CreditEntry {
  id: string;
  credits: number;
  movement: CreditTransaction['movement'];
  label: string;
  amountFcfa?: number | null;
  createdAt: string;
}

/** Ajoute des crédits (achat, geste commercial, remboursement). */
export function applyCredit(state: DeoflowState, entry: CreditEntry): DeoflowState {
  if (entry.credits <= 0) {
    throw new Error('applyCredit attend un nombre de crédits strictement positif.');
  }
  return {
    ...state,
    credits: state.credits + entry.credits,
    transactions: [toTransaction(entry, entry.credits), ...state.transactions],
  };
}

/**
 * Retire des crédits. Lève `InsufficientCreditsError` si le solde ne couvre
 * pas la dépense — c'est le garde-fou qui empêche un solde négatif, et il est
 * volontairement ici plutôt que dans les composants, pour qu'aucun écran ne
 * puisse l'oublier.
 */
export function applyDebit(state: DeoflowState, entry: CreditEntry): DeoflowState {
  if (entry.credits <= 0) {
    throw new Error('applyDebit attend un nombre de crédits strictement positif.');
  }
  if (entry.credits > state.credits) {
    throw new InsufficientCreditsError(entry.credits - state.credits);
  }
  return {
    ...state,
    credits: state.credits - entry.credits,
    transactions: [toTransaction(entry, -entry.credits), ...state.transactions],
  };
}

function toTransaction(entry: CreditEntry, signedCredits: number): CreditTransaction {
  return {
    id: entry.id,
    movement: entry.movement,
    credits: signedCredits,
    label: entry.label,
    amountFcfa: entry.amountFcfa ?? null,
    createdAt: entry.createdAt,
  };
}

export function upsertGeneration(state: DeoflowState, generation: Generation): DeoflowState {
  const index = state.generations.findIndex((g) => g.id === generation.id);
  if (index === -1) {
    return { ...state, generations: [generation, ...state.generations] };
  }
  const generations = [...state.generations];
  generations[index] = generation;
  return { ...state, generations };
}

export function removeGeneration(state: DeoflowState, id: string): DeoflowState {
  return { ...state, generations: state.generations.filter((g) => g.id !== id) };
}

export function upsertPurchase(state: DeoflowState, purchase: Purchase): DeoflowState {
  const index = state.purchases.findIndex((p) => p.id === purchase.id);
  if (index === -1) {
    return { ...state, purchases: [purchase, ...state.purchases] };
  }
  const purchases = [...state.purchases];
  purchases[index] = purchase;
  return { ...state, purchases };
}

/* ── Persistance + abonnement ──────────────────────────────────────────── */

const STORAGE_KEY = 'deoflow:state:v1';

function isState(value: unknown): value is DeoflowState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<DeoflowState>;
  return (
    typeof v.credits === 'number' &&
    Array.isArray(v.transactions) &&
    Array.isArray(v.generations) &&
    Array.isArray(v.purchases)
  );
}

/**
 * Conteneur d'état simulé. Compatible `useSyncExternalStore` : `subscribe` +
 * `getSnapshot` renvoient une référence stable tant que rien ne change, donc
 * pas de rendu en boucle.
 */
class DeoflowStore {
  private state: DeoflowState = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private hydrated = false;

  /** Lit le localStorage au premier accès côté navigateur seulement. */
  private hydrate(): void {
    if (this.hydrated || typeof window === 'undefined') return;
    this.hydrated = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) this.state = parsed;
    } catch {
      // Données corrompues ou stockage indisponible (navigation privée) :
      // on repart de l'état initial plutôt que de casser l'application.
    }
  }

  getSnapshot = (): DeoflowState => {
    this.hydrate();
    return this.state;
  };

  /** Le serveur ne connaît jamais l'état simulé : il rend toujours le vide. */
  getServerSnapshot = (): DeoflowState => INITIAL_STATE;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  update(mutate: (state: DeoflowState) => DeoflowState): DeoflowState {
    this.hydrate();
    this.state = mutate(this.state);
    this.persist();
    for (const listener of this.listeners) listener();
    return this.state;
  }

  reset(): void {
    this.update(() => INITIAL_STATE);
  }

  private persist(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota dépassé ou stockage bloqué : l'app continue en mémoire.
    }
  }
}

export const deoflowStore = new DeoflowStore();
