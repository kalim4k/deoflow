'use client';

// Versements — la file d'attente de l'argent à sortir.
//
// C'est le seul écran du back-office qui soit URGENT : une demande en attente
// est un créateur qui attend son argent. L'onglet « En attente » est donc
// sélectionné par défaut, et le total dû s'affiche en tête plutôt qu'au fond
// d'un tableau.
//
// Aucune action n'est exposée sur une demande close. Un versement terminé ne
// se rouvre pas : la correction passe par une nouvelle demande, qui laisse une
// trace au lieu d'en effacer une.

import { useCallback, useState } from 'react';
import { useAdminList } from '@/components/admin/useAdminList';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PayoutModal } from '@/components/admin/PayoutModal';
import { useAdmin } from '@/components/admin/AdminContext';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { Alert, Badge, EmptyState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { WalletIcon } from '@/components/icons';
import { payoutMethodLabel, type AdminWithdrawal } from '@/lib/deoflow/adminApi';
import { formatAmount, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'PENDING', label: 'En attente' },
  { id: 'PROCESSING', label: 'En cours' },
  { id: 'COMPLETED', label: 'Versés' },
  { id: 'FAILED', label: 'Échecs' },
  { id: '', label: 'Tous' },
] as const;

export default function AdminWithdrawalsPage() {
  const admin = useAdmin();
  const [status, setStatus] = useState<string>('PENDING');
  const [selected, setSelected] = useState<AdminWithdrawal | null>(null);

  const buildPath = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      if (cursor) params.set('cursor', cursor);
      return `/api/admin/withdrawals?${params.toString()}`;
    },
    [status],
  );

  const { items, cursor, loading, loadingMore, error, loadMore, reload } =
    useAdminList<AdminWithdrawal>(buildPath);

  // Total de l'onglet courant. Une addition d'affichage sur la page visible —
  // pas un solde : le chiffre qui fait autorité est celui de la vue d'ensemble,
  // calculé en base sur TOUTES les lignes, pas sur les cinquante chargées ici.
  const pageTotal = items.reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <AdminPageHeader
        title="Versements"
        description="Les demandes de retrait des affiliés. Le paiement se fait à la main dans votre application mobile money ; cet écran en tient le registre."
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrer par statut">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={status === tab.id}
              onClick={() => setStatus(tab.id)}
              className={cn(
                'pressable min-h-9 cursor-pointer rounded-xl px-3 text-sm',
                status === tab.id
                  ? 'bg-ink-900 font-medium text-white'
                  : 'bg-sunken text-ink-500 hover:text-ink-900',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!loading && items.length > 0 && (
          <p className="text-sm text-ink-500">
            {items.length} demande{items.length > 1 ? 's' : ''} ·{' '}
            <span className="font-display text-ink-900 tabular-nums">
              {formatAmount(pageTotal)}
            </span>
          </p>
        )}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<WalletIcon className="size-8" />}
          title={status === 'PENDING' ? 'Aucune demande en attente' : 'Aucune demande'}
          description={
            status === 'PENDING'
              ? 'Rien à verser pour le moment. Les nouvelles demandes apparaîtront ici.'
              : 'Aucune demande ne correspond à ce filtre.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TableShell>
            <thead>
              <tr>
                <Th>Demandé le</Th>
                <Th>Créateur</Th>
                <Th>Montant</Th>
                <Th>Destination</Th>
                <Th>Statut</Th>
                <Th className="text-right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const open = row.status === 'PENDING' || row.status === 'PROCESSING';
                return (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap text-ink-500">
                      {formatDateTime(row.requestedAt)}
                    </Td>
                    <Td className="max-w-[14rem]">
                      <span className="block truncate text-ink-700">{row.user?.email ?? '—'}</span>
                      <span className="font-mono text-xs text-ink-300">{row.userId}</span>
                    </Td>
                    <Td className="font-display whitespace-nowrap tabular-nums">
                      {formatAmount(row.amount, row.currency)}
                    </Td>
                    <Td>
                      {row.destination?.method ? (
                        <Badge tone="neutral">{payoutMethodLabel(row.destination.method)}</Badge>
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
                      {row.destination?.phone ? (
                        <span className="mt-0.5 block font-mono text-xs text-ink-500">
                          {row.destination.phone}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        variant={open ? 'ember' : 'ghost'}
                        onClick={() => setSelected(row)}
                      >
                        {open ? 'Traiter' : 'Détail'}
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </TableShell>

          {cursor && (
            <Button
              variant="secondary"
              size="sm"
              loading={loadingMore}
              onClick={loadMore}
              className="self-start"
            >
              Charger plus
            </Button>
          )}
        </div>
      )}

      <PayoutModal
        withdrawal={selected}
        canSettle={admin?.role === 'SUPERADMIN'}
        onClose={() => setSelected(null)}
        onDone={reload}
      />
    </>
  );
}
