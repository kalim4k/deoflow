'use client';

// Compteur de notifications non lues.
//
// La route `/api/notifications/count` existait depuis le début — elle a été
// écrite pour une pastille que personne n'a jamais affichée. Résultat : une
// notification arrivait, et le créateur n'avait aucun moyen de l'apprendre
// sans aller ouvrir la page au hasard. Un système de notification qu'on ne
// voit pas n'existe pas.
//
// **Pourquoi un sondage et pas du temps réel.** Le dépôt recommande Ably dès
// qu'il s'agit de pousser vers le navigateur, et c'est juste pour un fil de
// discussion ou une présence. Ici l'enjeu est un nombre qui change quelques
// fois par jour : ouvrir une connexion permanente pour ça coûterait plus de
// données à un créateur en 4G instable que les quelques octets d'un sondage
// espacé. Le jour où les notifications deviennent conversationnelles, Ably
// remplacera ce module sans que les écrans changent — ils lisent `unread`.
//
// Trois précautions pour ne pas gaspiller de forfait :
//   - rien tant que la session n'est pas connue (inutile de sonder un visiteur) ;
//   - rien quand l'onglet est masqué, et relecture immédiate au retour ;
//   - un échec est silencieux : une pastille est un confort, pas une raison
//     d'afficher une erreur en travers de l'écran.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

/** Intervalle de sondage, onglet visible uniquement. */
const POLL_MS = 60_000;

interface NotificationsValue {
  /** Nombre de non-lues. 0 tant que la session n'a pas répondu. */
  unread: number;
  /** Relit le compteur — à appeler après avoir marqué comme lu. */
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue>({
  unread: 0,
  refresh: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  // `user.id` plutôt que l'objet : `useAuth` renvoie un nouvel objet à chaque
  // rafraîchissement de session, ce qui relancerait l'effet pour rien.
  const userId = user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnread(0);
      return;
    }
    try {
      const res = await api<{ count: number }>('/api/notifications/count');
      setUnread(res.count);
    } catch {
      // Silencieux : voir l'en-tête. On garde la dernière valeur connue plutôt
      // que de remettre à zéro, qui ferait disparaître une pastille légitime
      // sur un simple créneau réseau.
    }
  }, [userId]);

  // La référence évite que `refresh` — dont l'identité change avec `userId` —
  // entre dans les dépendances de l'effet de sondage et le fasse redémarrer.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return;
    }

    void refreshRef.current();

    const tick = () => {
      if (document.visibilityState === 'visible') void refreshRef.current();
    };
    const timer = window.setInterval(tick, POLL_MS);
    // Au retour sur l'onglet, on relit tout de suite : c'est le moment où
    // l'écart entre l'affichage et la réalité est le plus grand.
    document.addEventListener('visibilitychange', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [userId]);

  return (
    <NotificationsContext.Provider value={{ unread, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext);
}
