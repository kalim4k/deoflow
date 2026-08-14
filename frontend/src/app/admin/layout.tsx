'use client';

// Toutes les routes /admin/* passent par ce garde : GET /api/admin/me répond
// 200 (avec l'administrateur et ses capacités) ou 403 ADMIN_REQUIRED. Tant que
// l'aller-retour n'a pas répondu on affiche un état d'attente, et tout échec
// renvoie vers l'accueil — on échoue côté « accès refusé ».

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { ShellSkeleton } from '@/components/app/ShellSkeleton';
import { Badge } from '@/components/ui/Feedback';
import { AdminProvider, type Admin } from '@/components/admin/AdminContext';
import { cn } from '@/lib/cn';
import {
  ArrowLeftIcon,
  ChartIcon,
  ClipboardIcon,
  CoinsIcon,
  GridIcon,
  PanelIcon,
  SparkIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/icons';

// Ordre voulu : ce qui appelle une action d'abord (les versements font
// attendre quelqu'un), la consultation ensuite, la référence en dernier.
const NAV = [
  { href: '/admin', label: 'Vue d’ensemble', icon: ChartIcon, exact: true },
  { href: '/admin/withdrawals', label: 'Versements', icon: WalletIcon },
  { href: '/admin/users', label: 'Utilisateurs', icon: UsersIcon },
  { href: '/admin/transactions', label: 'Grand livre', icon: CoinsIcon },
  { href: '/admin/generations', label: 'Générations', icon: SparkIcon },
  { href: '/admin/models', label: 'Modèles IA', icon: GridIcon },
  { href: '/admin/audit-log', label: 'Journal d’audit', icon: ClipboardIcon },
];

/** Même clé de préférence que l'espace créateur ? Non : replier le back-office
 *  et replier son espace de travail sont deux gestes différents, faits pour des
 *  raisons différentes. Une clé commune ferait basculer l'un en réglant l'autre. */
const COLLAPSE_KEY = 'deoflow:admin-sidebar-collapsed';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checked, setChecked] = useState(false);
  // Lu APRÈS le montage, jamais pendant le rendu serveur : `localStorage`
  // n'existe pas côté serveur, et le lire au premier rendu ferait diverger le
  // HTML des deux côtés.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await api<{ admin: Admin }>('/api/admin/me');
        if (!cancelled) setAdmin(res.admin);
      } catch {
        // 401, 403 ou erreur inattendue : dans tous les cas, pas d'accès.
        if (!cancelled) router.replace('/');
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Même parti pris que l'espace créateur : la coquille est peinte
  // immédiatement, seules les données inconnues sont grisées.
  if (!checked || !admin) return <ShellSkeleton />;

  return (
    <AdminProvider admin={admin}>
      {/* Même grammaire que l'espace créateur : rail latéral en ≥ lg, barre
          horizontale défilante en dessous. */}
      <div
        className={cn(
          'min-h-screen lg:grid',
          collapsed ? 'lg:grid-cols-[4.75rem_1fr]' : 'lg:grid-cols-[16.5rem_1fr]',
        )}
      >
        <aside className="border-b border-line bg-surface lg:border-r lg:border-b-0">
          <div className="flex flex-col gap-6 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:py-5">
            {/* Replié, le logo se centre et le badge de rôle disparaît : dans
                4,75 rem il ne resterait de « SUPERADMIN » qu'un fragment. */}
            <div
              className={cn(
                'flex items-center gap-3',
                collapsed ? 'lg:justify-center' : 'justify-between',
              )}
            >
              <Logo href="/admin" />
              {/* Masqué au niveau du conteneur, pas du texte : sinon il
                  resterait une pastille vide. Et seulement en ≥ lg — sous
                  cette largeur la barre est horizontale et toujours dépliée. */}
              <span className={collapsed ? 'lg:hidden' : undefined}>
                <Badge tone={admin.role === 'SUPERADMIN' ? 'ink' : 'neutral'}>{admin.role}</Badge>
              </span>
            </div>

            <nav
              aria-label="Navigation du back-office"
              className="flex flex-1 gap-0.5 overflow-x-auto lg:flex-col lg:overflow-visible"
            >
              {NAV.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    // Replié, l'icône reste seule : le libellé passe en
                    // infobulle et en nom accessible, sinon le lien devient
                    // muet pour un lecteur d'écran comme pour qui hésite.
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={cn(
                      'pressable inline-flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm whitespace-nowrap',
                      collapsed ? 'lg:justify-center lg:px-0' : '',
                      active
                        ? 'bg-sunken font-medium text-ink-900'
                        : 'text-ink-500 hover:bg-sunken/60 hover:text-ink-900',
                    )}
                  >
                    <Icon className={cn('size-4.5', active ? 'text-ember-500' : 'text-ink-300')} />
                    <span className={collapsed ? 'lg:hidden' : undefined}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* L'adresse de l'administrateur n'est plus affichée : elle
                n'apprend rien à qui est déjà connecté avec, et un back-office
                s'ouvre souvent devant quelqu'un — écran partagé, capture
                d'écran, démonstration. Le rôle suffit à savoir où l'on est. */}
            <div className="hidden flex-col gap-0.5 border-t border-line pt-3 lg:flex">
              <Link
                href="/dashboard"
                title={collapsed ? 'Retour à mon espace' : undefined}
                aria-label={collapsed ? 'Retour à mon espace' : undefined}
                className={cn(
                  'pressable inline-flex min-h-10 cursor-pointer items-center gap-3 rounded-xl text-sm text-ink-500 hover:bg-sunken hover:text-ink-900',
                  collapsed ? 'justify-center px-0' : 'px-3',
                )}
              >
                <ArrowLeftIcon className="size-4.5 text-ink-300" />
                {collapsed ? null : 'Retour à mon espace'}
              </Link>

              <button
                type="button"
                onClick={toggleCollapsed}
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
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</main>
      </div>
    </AdminProvider>
  );
}
