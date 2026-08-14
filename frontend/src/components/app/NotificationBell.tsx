'use client';

// Cloche de l'en-tête mobile.
//
// Sur téléphone — l'écrasante majorité de la cible — le rail latéral est
// masqué : les notifications n'étaient atteignables qu'en ouvrant le tiroir,
// donc en sachant déjà qu'il fallait y aller. La cloche les remet à un pouce
// de distance, à côté du solde.
//
// Elle n'apparaît qu'en dessous de `lg`, où le rail prend le relais. Afficher
// les deux ferait deux chemins vers le même écran, et deux pastilles à tenir
// synchronisées.

import { AppLink } from '@/components/NavProgress';
import { BellIcon } from '@/components/icons';
import { useNotifications } from '@/contexts/NotificationsContext';

export function NotificationBell() {
  const { unread } = useNotifications();

  return (
    <AppLink
      href="/notifications"
      aria-label={
        unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'
      }
      className="pressable relative grid size-10 cursor-pointer place-items-center rounded-xl text-ink-700 hover:bg-sunken"
    >
      <BellIcon className="size-5" />
      {unread > 0 && (
        // `aria-hidden` : le compte est déjà dans le nom accessible du lien.
        // Le laisser lisible le ferait annoncer deux fois.
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-ember-500 px-1 text-[0.625rem] leading-4 font-medium text-white tabular-nums ring-2 ring-surface"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </AppLink>
  );
}
