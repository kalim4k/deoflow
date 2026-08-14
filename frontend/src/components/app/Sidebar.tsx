'use client';

// Navigation latérale de l'espace connecté.
//
// Un seul composant sert deux contenants : le rail permanent en ≥ lg et le
// tiroir mobile. Dupliquer la liste des liens serait la garantie qu'elle
// diverge à la première évolution.
//
// Le solde vit ici en permanence (F19 du PRD) : c'est la donnée qui décide si
// l'utilisateur peut lancer une génération, elle ne doit jamais demander un
// clic pour être lue. Sous le seuil bas, il s'annonce sur place — pastille
// d'alerte et bouton de recharge qui pulse — plutôt que par un bandeau qui
// pousse tout le contenu vers le bas à chaque page.

import { usePathname, useRouter } from 'next/navigation';
import { AppLink, LinkIcon } from '@/components/NavProgress';
import { Logo } from '@/components/Logo';
import { buttonStyles } from '@/components/ui/Button';
import {
  AlertIcon,
  BellIcon,
  CloseIcon,
  CoinsIcon,
  GalleryIcon,
  HomeIcon,
  ImageIcon,
  LogoutIcon,
  PanelIcon,
  SettingsIcon,
  ShieldIcon,
  SparkIcon,
  SpinnerIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
} from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useCredits } from '@/lib/deoflow/useDeoflow';
import { cn } from '@/lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof HomeIcon;
  /** Actif uniquement sur l'URL exacte — pour les racines comme /dashboard. */
  exact?: boolean;
  /** Préfixe d'activation quand il diffère du href (ex. /create/image → /create). */
  match?: string;
}

const GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  {
    label: null,
    items: [{ href: '/dashboard', label: 'Tableau de bord', icon: HomeIcon, exact: true }],
  },
  {
    label: 'Créer',
    items: [
      { href: '/create/image', label: 'Image', icon: ImageIcon },
      { href: '/create/video', label: 'Vidéo', icon: VideoIcon },
      // Les personnages sont ici et NULLE PART ailleurs : un visage d'avatar
      // est du matériel de travail, pas une création publiable, et il n'a rien
      // à faire dans la galerie.
      { href: '/avatars', label: 'Personnages', icon: UserIcon },
    ],
  },
  {
    label: 'Explorer',
    items: [
      { href: '/models', label: 'Modèles', icon: SparkIcon },
      { href: '/gallery', label: 'Galerie', icon: GalleryIcon },
    ],
  },
  {
    label: 'Gagner',
    // Groupe à part et non rangé sous « Compte » : parrainer n'est pas un
    // réglage, c'est une activité. Enterré dans les paramètres, un programme
    // d'affiliation ne se découvre jamais.
    items: [{ href: '/affiliation', label: 'Affiliation', icon: UsersIcon }],
  },
];

/** Destinations du rail mobile — les quatre gestes les plus fréquents. */
export const PRIMARY_TABS: NavItem[] = [
  { href: '/dashboard', label: 'Accueil', icon: HomeIcon, exact: true },
  { href: '/create/image', label: 'Créer', icon: ImageIcon, match: '/create' },
  { href: '/gallery', label: 'Galerie', icon: GalleryIcon },
  { href: '/settings', label: 'Compte', icon: SettingsIcon },
];

export function isNavActive(pathname: string, item: NavItem): boolean {
  const base = item.match ?? item.href;
  if (item.exact) return pathname === base;
  return pathname === base || pathname.startsWith(base + '/');
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
  badge = 0,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
  /** Compteur affiché à droite du libellé. 0 = rien. */
  badge?: number;
}) {
  // Le nom accessible porte le compte : un lecteur d'écran annonce
  // « Notifications, 3 non lues », pas un « 3 » orphelin après le libellé.
  const label = badge > 0 ? `${item.label}, ${badge} non lue${badge > 1 ? 's' : ''}` : item.label;

  return (
    <AppLink
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      // Replié, l'icône reste seule : le libellé passe en infobulle native et
      // en nom accessible, sinon le lien deviendrait muet pour un lecteur
      // d'écran comme pour un utilisateur qui hésite.
      title={collapsed ? label : undefined}
      aria-label={collapsed || badge > 0 ? label : undefined}
      className={cn(
        'pressable relative flex min-h-10 cursor-pointer items-center gap-3 rounded-xl text-sm',
        collapsed ? 'justify-center px-0' : 'px-3',
        active
          ? 'bg-sunken font-medium text-ink-900'
          : 'text-ink-500 hover:bg-sunken/60 hover:text-ink-900',
      )}
    >
      <LinkIcon
        icon={item.icon}
        className={cn('size-4.5', active ? 'text-ember-500' : 'text-ink-300')}
      />
      {collapsed ? null : item.label}

      {badge > 0 &&
        (collapsed ? (
          // Replié, il n'y a pas la place d'un nombre : un point suffit à dire
          // « il y a quelque chose », et le compte reste dans l'infobulle.
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-ember-500 ring-2 ring-surface"
          />
        ) : (
          <span
            aria-hidden="true"
            className="ml-auto grid min-w-5 place-items-center rounded-full bg-ember-500 px-1.5 text-[0.6875rem] font-medium text-white tabular-nums"
          >
            {/* Au-delà de 99 le nombre exact n'aide plus à décider, et il
                casserait la largeur du rail. */}
            {badge > 99 ? '99+' : badge}
          </span>
        ))}
    </AppLink>
  );
}

/**
 * @param isAdmin  ajoute l'entrée back-office ; la sonde est faite par AppShell.
 * @param collapsed  rail réduit aux icônes (jamais vrai dans le tiroir mobile).
 * @param onToggleCollapse  absent dans le tiroir, où replier n'a pas de sens.
 * @param onNavigate  ferme le tiroir mobile après un clic (absent sur le rail).
 * @param onClose  affiche le bouton de fermeture (tiroir uniquement).
 */
export function Sidebar({
  isAdmin,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  onClose,
}: {
  isAdmin: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();
  const { unread } = useNotifications();
  const { credits, low, loading: creditsLoading } = useCredits();
  // Le rail permanent n'a rien à fermer : un no-op vaut mieux qu'un prop
  // optionnel à propager jusque dans les <Link>.
  const navigate = onNavigate ?? (() => {});

  const account: NavItem[] = [
    { href: '/notifications', label: 'Notifications', icon: BellIcon },
    { href: '/settings', label: 'Paramètres', icon: SettingsIcon },
    ...(isAdmin ? [{ href: '/admin', label: 'Back-office', icon: ShieldIcon }] : []),
  ];

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-6 overflow-x-hidden overflow-y-auto py-5',
        collapsed ? 'px-3' : 'px-4',
      )}
    >
      <div
        className={cn(
          'flex gap-2',
          collapsed ? 'flex-col items-center' : 'items-center justify-between',
        )}
      >
        <Logo href="/dashboard" compact={collapsed} />

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le menu"
            className="pressable grid size-9 cursor-pointer place-items-center rounded-xl text-ink-500 hover:bg-sunken hover:text-ink-900"
          >
            <CloseIcon className="size-5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-5">
        {GROUPS.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="flex flex-col gap-0.5">
            {group.label ? (
              collapsed ? (
                <span aria-hidden="true" className="mx-auto mb-1 h-px w-6 bg-line" />
              ) : (
                <p className="px-3 pb-1.5 text-xs font-medium text-ink-300">{group.label}</p>
              )
            ) : null}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isNavActive(pathname, item)}
                collapsed={collapsed}
                onNavigate={navigate}
              />
            ))}
          </div>
        ))}

        <div className="flex flex-col gap-0.5">
          {collapsed ? (
            <span aria-hidden="true" className="mx-auto mb-1 h-px w-6 bg-line" />
          ) : (
            <p className="px-3 pb-1.5 text-xs font-medium text-ink-300">Compte</p>
          )}
          {account.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item)}
              collapsed={collapsed}
              onNavigate={navigate}
              badge={item.href === '/notifications' ? unread : 0}
            />
          ))}
        </div>
      </nav>

      <div className="flex flex-col gap-2">
        {/* Solde. Replié, il se réduit au chiffre : c'est l'information, le
            reste est du décor. */}
        {collapsed ? (
          <AppLink
            href="/wallet"
            onClick={navigate}
            title={creditsLoading ? 'Chargement du solde' : `Solde : ${credits} crédits`}
            aria-label={
              creditsLoading
                ? 'Chargement du solde. Ouvrir le portefeuille.'
                : `Solde : ${credits} crédits. Ouvrir le portefeuille.`
            }
            className={cn(
              'pressable flex cursor-pointer flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5',
              low ? 'border-ember-500/50 bg-ember-50' : 'border-line',
            )}
          >
            <CoinsIcon className={cn('size-4', low ? 'text-ember-600' : 'text-ink-300')} />
            {creditsLoading ? (
              <span className="h-4 w-6 animate-pulse rounded bg-line" aria-hidden="true" />
            ) : (
              <span className="font-display text-sm tabular-nums">{credits}</span>
            )}
          </AppLink>
        ) : (
          <div className={cn('card p-3.5', low && 'border-ember-500/50 bg-ember-50')}>
            <AppLink
              href="/wallet"
              onClick={navigate}
              className="flex cursor-pointer items-baseline justify-between gap-2"
            >
              <span
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  low ? 'text-ember-700' : 'text-ink-500',
                )}
              >
                {low ? <AlertIcon className="size-3.5" /> : null}
                Solde
              </span>
              {creditsLoading ? (
                // Le rail est visible sur toutes les pages : c'est l'endroit
                // où un faux « 0 crédit » se voit le plus.
                <span className="h-6 w-20 animate-pulse rounded bg-line" aria-hidden="true" />
              ) : (
                <span className="font-display text-lg tabular-nums">
                  {credits}
                  <span className="ml-1 text-xs font-normal text-ink-500">
                    {credits > 1 ? 'crédits' : 'crédit'}
                  </span>
                </span>
              )}
            </AppLink>

            {low ? (
              <p className="mt-1 text-xs text-ember-700">
                {credits === 0 ? 'Vide — rechargez pour générer.' : 'Bientôt épuisé.'}
              </p>
            ) : null}

            <AppLink
              href="/wallet/topup"
              onClick={navigate}
              className={buttonStyles('ember', 'sm', cn('mt-3 w-full', low && 'attention'))}
            >
              Recharger
            </AppLink>
          </div>
        )}

        {/* Réglage du rail puis sortie. Les deux commandes qui ne sont pas des
            destinations vivent ensemble, en bas, séparées de la navigation. */}
        <div className="flex flex-col gap-0.5 border-t border-line pt-3">
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-expanded={!collapsed}
              title={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
              aria-label={collapsed ? 'Déplier le menu' : 'Réduire le menu'}
              className={cn(
                'pressable flex min-h-10 cursor-pointer items-center gap-3 rounded-xl text-sm text-ink-500 hover:bg-sunken hover:text-ink-900',
                collapsed ? 'justify-center px-0' : 'px-3',
              )}
            >
              <PanelIcon className={cn('size-4.5 text-ink-300', collapsed && 'rotate-180')} />
              {collapsed ? null : 'Réduire le menu'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => void onLogout()}
            disabled={loggingOut}
            title="Se déconnecter"
            aria-label="Se déconnecter"
            className={cn(
              'pressable flex min-h-10 cursor-pointer items-center gap-3 rounded-xl text-sm text-ink-500 hover:bg-sunken hover:text-ink-900 disabled:pointer-events-none disabled:opacity-45',
              collapsed ? 'justify-center px-0' : 'px-3',
            )}
          >
            {loggingOut ? (
              <SpinnerIcon className="size-4.5" />
            ) : (
              <LogoutIcon className="size-4.5 text-ink-300" />
            )}
            {collapsed ? null : 'Déconnexion'}
          </button>
        </div>
      </div>
    </div>
  );
}
