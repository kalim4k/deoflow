'use client';

import { useSyncExternalStore } from 'react';
import { useCreditsContext } from '@/contexts/CreditsContext';
import { deoflowStore, type DeoflowState } from './store';
import { LOW_BALANCE_THRESHOLD } from './types';

/**
 * Abonnement à l'état simulé. `getServerSnapshot` renvoie l'état initial :
 * le rendu serveur ne connaît pas le localStorage, React réconcilie au montage.
 */
export function useDeoflowState(): DeoflowState {
  return useSyncExternalStore(
    deoflowStore.subscribe,
    deoflowStore.getSnapshot,
    deoflowStore.getServerSnapshot,
  );
}

/**
 * Solde + indicateur « solde bas » (F21), partagés par l'en-tête, la barre
 * latérale, le catalogue et l'atelier.
 *
 * Le solde vient du SERVEUR depuis que la génération est réelle : un crédit
 * déclenche un appel facturé, il ne peut pas être décidé par le navigateur.
 * `loading` sert à ne pas afficher « 0 crédit » — donc « rechargez » — pendant
 * la première requête.
 */
export function useCredits(): { credits: number; low: boolean; loading: boolean } {
  const { credits, loading } = useCreditsContext();
  return { credits, low: !loading && credits < LOW_BALANCE_THRESHOLD, loading };
}
