'use client';

// Générations du créateur, lues sur le serveur.
//
// Elles vivaient dans le `localStorage` tant que la génération était simulée.
// Maintenant qu'elles coûtent des crédits et produisent de vrais fichiers,
// elles appartiennent à la base : un créateur qui change de téléphone doit
// retrouver sa galerie.
//
// ⚠️ Cette requête ne s'enchaîne PAS derrière `/api/auth/me`. Elle attendait
// autrefois que `user` soit connu, ce qui doublait le temps d'affichage sans
// rien apporter : c'est le cookie qui authentifie la requête, pas l'état React.
// Les deux appels partent donc ensemble, et le serveur tranche.

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { COOKIE_PREFIX } from '@/lib/constants';
import { listGenerations, type ApiGeneration } from './api';
import type { MediaKind } from './types';

/**
 * Une session a-t-elle une chance d'exister ?
 *
 * Le cookie CSRF est le seul lisible en JavaScript, et il n'est posé qu'après
 * connexion : son absence est un « non » fiable. Même signal que celui utilisé
 * par `AuthProvider` pour ne pas appeler `/api/auth/me` chez un visiteur
 * anonyme — ça évite une requête vouée au 401.
 */
function maybeSignedIn(): boolean {
  if (typeof document === 'undefined') return false;
  const name = `${COOKIE_PREFIX}-csrf`;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${name}=`));
}

export function useGenerations(
  kind?: MediaKind,
  limit?: number,
): {
  items: ApiGeneration[];
  /** Crédits consommés sur toute la vie du compte, calculé par le serveur. */
  spent: number;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
} {
  const [items, setItems] = useState<ApiGeneration[]>([]);
  const [spent, setSpent] = useState(0);
  // Un visiteur anonyme n'a rien à attendre : autant conclure tout de suite
  // plutôt que lui montrer des squelettes qui ne se rempliront jamais.
  const [loading, setLoading] = useState(() => maybeSignedIn());
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!maybeSignedIn()) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const result = await listGenerations(kind, limit);
      setItems(result.items);
      setSpent(result.spent);
      setError(false);
    } catch (err) {
      // Un 401 est une réponse DÉFINITIVE — `lib/api.ts` a déjà tenté de
      // renouveler la session et rejoué l'appel. Une galerie vide est donc ici
      // la vérité, pas une supposition.
      if (err instanceof ApiError && err.status === 401) {
        setItems([]);
        setError(false);
      } else {
        // Tout le reste est une panne. Distinguer les deux compte : afficher
        // « votre galerie est vide » sur une coupure réseau ferait croire à
        // une perte de contenu.
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [kind, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, spent, loading, error, refresh };
}
