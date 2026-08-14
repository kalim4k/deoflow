'use client';

// Vue d'ensemble du back-office.
//
// Tous les chiffres viennent de `GET /api/admin/stats`, calculés en SQL sur la
// base entière. Aucun n'est additionné ici : une seconde addition côté
// navigateur, c'est une seconde réponse possible à une question d'argent.
//
// La hiérarchie de l'écran suit l'urgence, pas la logique comptable. Ce qui
// demande une action — des versements en attente — passe AVANT les indicateurs,
// parce qu'un tableau de bord qu'on parcourt de haut en bas doit livrer d'abord
// ce qui ne peut pas attendre.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Alert } from '@/components/ui/Feedback';
import { Stat } from '@/components/ui/Stat';
import { buttonStyles } from '@/components/ui/Button';
import { ChartIcon, CoinsIcon, SparkIcon, UsersIcon, WalletIcon } from '@/components/icons';
import { fetchAdminStats, type AdminStats, type StatsPeriod } from '@/lib/deoflow/adminApi';
import { errorMessage } from '@/lib/errorMessages';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';

const PERIODS: Array<{ id: StatsPeriod; label: string }> = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: 'all', label: 'Tout' },
];

/** Nombre avec séparateurs de milliers — jamais de chiffre nu à quatre chiffres. */
function count(n: number): string {
  return n.toLocaleString('fr-FR');
}

function percent(bps: number): string {
  return `${(bps / 100).toFixed(1).replace('.0', '')} %`;
}

export default function AdminOverviewPage() {
  const [period, setPeriod] = useState<StatsPeriod>('30d');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((next: StatsPeriod) => {
    setStats(null);
    setError(null);
    return fetchAdminStats(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load(period)
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [period, load]);

  const loading = stats === null && error === null;
  const windowLabel =
    period === 'all' ? 'depuis le début' : `sur ${PERIODS.find((p) => p.id === period)?.label}`;

  return (
    <>
      <AdminPageHeader
        title="Vue d’ensemble"
        description="Chiffres calculés sur la base entière, à l’instant où vous ouvrez cette page."
      >
        <div className="flex gap-1.5" role="tablist" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                'pressable min-h-9 cursor-pointer rounded-xl px-3 text-sm',
                period === p.id
                  ? 'bg-ink-900 font-medium text-white'
                  : 'bg-sunken text-ink-500 hover:text-ink-900',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </AdminPageHeader>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Ce qui attend une action, avant tout le reste. */}
      {stats && stats.withdrawals.pendingCount > 0 && (
        <Alert tone="warning" className="mb-5">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>
                {stats.withdrawals.pendingCount} demande
                {stats.withdrawals.pendingCount > 1 ? 's' : ''} de versement
              </strong>{' '}
              en attente, pour {formatAmount(stats.withdrawals.pendingFcfa)}.
            </span>
            <Link href="/admin/withdrawals" className={buttonStyles('ember', 'sm')}>
              Traiter
            </Link>
          </span>
        </Alert>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-500">Argent {windowLabel}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<CoinsIcon className="size-4" />}
            label="Chiffre d’affaires"
            value={stats ? formatAmount(stats.revenue.grossFcfa) : '—'}
            hint={
              stats
                ? `${count(stats.revenue.orders)} achat${stats.revenue.orders > 1 ? 's' : ''} · panier moyen ${formatAmount(stats.revenue.averageFcfa)}`
                : undefined
            }
            loading={loading}
          />
          <Stat
            icon={<ChartIcon className="size-4" />}
            label="Coût kie.ai"
            value={stats ? formatAmount(stats.economics.providerCostFcfa) : '—'}
            hint="Crédits consommés, au tarif fournisseur"
            loading={loading}
          />
          <Stat
            icon={<ChartIcon className="size-4" />}
            label="Marge"
            value={stats ? formatAmount(stats.economics.marginFcfa) : '—'}
            // Le crédit est prépayé : ce qui est vendu ce mois-ci se consomme
            // le suivant. La marge d'une fenêtre est donc une réalité de
            // trésorerie, pas un résultat comptable — l'écran le dit.
            hint="Encaissé moins coût fournisseur sur la même fenêtre"
            loading={loading}
          />
          <Stat
            icon={<WalletIcon className="size-4" />}
            label="Commissions dues"
            value={stats ? formatAmount(stats.commissions.earnedFcfa) : '—'}
            hint={
              stats
                ? `${count(stats.commissions.referrals)} parrainage${stats.commissions.referrals > 1 ? 's' : ''} · ${formatAmount(stats.withdrawals.paidFcfa)} déjà versés`
                : undefined
            }
            loading={loading}
          />
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-500">Crédits</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Vendus"
            value={stats ? count(stats.credits.sold) : '—'}
            hint={windowLabel}
            loading={loading}
          />
          <Stat
            label="Consommés"
            value={stats ? count(stats.credits.consumed) : '—'}
            hint={windowLabel}
            loading={loading}
          />
          <Stat
            label="Remboursés"
            value={stats ? count(stats.credits.refunded) : '—'}
            hint="Générations échouées"
            loading={loading}
          />
          <Stat
            label="En circulation"
            value={stats ? count(stats.credits.outstanding) : '—'}
            // Sans période : c'est une dette envers les créateurs à l'instant T,
            // pas un flux. La restreindre à 30 jours ne voudrait rien dire.
            hint="Payés et pas encore dépensés — toutes périodes"
            loading={loading}
          />
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-500">Activité {windowLabel}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={<UsersIcon className="size-4" />}
            label="Inscrits"
            value={stats ? count(stats.users.total) : '—'}
            hint={stats ? `dont ${count(stats.users.new)} nouveaux ${windowLabel}` : undefined}
            loading={loading}
          />
          <Stat
            icon={<UsersIcon className="size-4" />}
            label="Acheteurs"
            value={stats ? count(stats.users.buyers) : '—'}
            hint={stats ? `${count(stats.users.active)} comptes actifs ${windowLabel}` : undefined}
            loading={loading}
          />
          <Stat
            icon={<SparkIcon className="size-4" />}
            label="Générations"
            value={stats ? count(stats.generations.total) : '—'}
            hint={
              stats
                ? `${count(stats.generations.succeeded)} réussies · ${count(stats.generations.running)} en cours`
                : undefined
            }
            loading={loading}
          />
          <Stat
            icon={<SparkIcon className="size-4" />}
            label="Taux d’échec"
            // « — » et non « 0 % » quand rien n'est encore terminé : le taux
            // n'est pas nul, il n'est pas mesurable.
            value={
              stats
                ? stats.generations.succeeded + stats.generations.failed > 0
                  ? percent(stats.generations.failureRateBps)
                  : '—'
                : '—'
            }
            hint={
              stats
                ? `${count(stats.generations.failed)} échecs, remboursés automatiquement`
                : undefined
            }
            loading={loading}
          />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/admin/withdrawals" className={buttonStyles('secondary', 'md')}>
          Versements
        </Link>
        <Link href="/admin/transactions" className={buttonStyles('secondary', 'md')}>
          Grand livre
        </Link>
        <Link href="/admin/generations" className={buttonStyles('secondary', 'md')}>
          Générations
        </Link>
        <Link href="/admin/users" className={buttonStyles('secondary', 'md')}>
          Utilisateurs
        </Link>
      </div>
    </>
  );
}
