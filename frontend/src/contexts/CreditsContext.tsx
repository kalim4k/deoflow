'use client';

// Solde de crédits — vue sur la session, plus une source à part entière.
//
// Le solde vivait dans le `localStorage` tant que la génération était simulée.
// Ce n'est plus tenable dès lors qu'un crédit déclenche un appel facturé :
// n'importe qui pouvait s'attribuer un budget en trois lignes de console. La
// vérité est donc côté serveur, et le navigateur n'en détient qu'une copie
// d'affichage.
//
// Ce module appelait `/api/credits` pour l'obtenir. Il ne le fait plus : la
// valeur arrive avec `/api/auth/me`, qui charge de toute façon la ligne
// utilisateur. L'appel séparé coûtait trois requêtes SQL — dont le contrôle
// d'authentification, refait pour rien — et surtout un aller-retour réseau
// EN SÉRIE derrière la session, puisqu'il attendait de savoir qui demandait.
// Sur une 4G ouest-africaine, cet enchaînement se voyait à l'œil nu.
//
// Le contexte reste en place plutôt que d'être supprimé : c'est lui que
// consomment la pastille, le rail, le catalogue et l'atelier. Le remplacer
// partout par `useAuth()` mêlerait le solde à l'authentification dans chaque
// écran, et rendrait un futur retour à un appel dédié bien plus coûteux.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface CreditsValue {
  credits: number;
  /** Vrai tant que le solde n'est pas connu. Ne pas confondre avec « zéro ». */
  loading: boolean;
  /** Relit le solde — à appeler après toute opération qui le modifie. */
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsValue>({
  credits: 0,
  loading: true,
  refresh: async () => {},
});

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { credits, loading: authLoading, refresh: refreshAuth } = useAuth();

  const value = useMemo(
    () => ({
      // `credits` vaut `null` tant que la session n'a pas répondu. On expose 0
      // pour garder un type simple à l'affichage, mais `loading` reste vrai :
      // c'est lui que les écrans lisent avant d'affirmer quoi que ce soit.
      credits: credits ?? 0,
      loading: authLoading || credits === null,
      // Recharger la session recharge le solde. Un appel dédié serait plus
      // léger, mais il reviendrait à maintenir deux chemins vers la même
      // valeur — et donc à les voir diverger un jour.
      refresh: refreshAuth,
    }),
    [credits, authLoading, refreshAuth],
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCreditsContext(): CreditsValue {
  return useContext(CreditsContext);
}
