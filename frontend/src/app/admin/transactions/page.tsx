'use client';

// Grand livre des crédits — tous les mouvements, dans l'ordre.
//
// Cet écran s'appelait « Transactions » et ne listait que les achats, depuis la
// couche simulée du navigateur. Il lit désormais `CreditTransaction`, qui est
// la VÉRITÉ du solde : additionner sa colonne `credits` redonne `User.credits`
// par construction. Tout ce qui bouge un portefeuille passe par une ligne
// d'ici — achat, génération, remboursement, ajustement administrateur.
//
// C'est donc l'écran à ouvrir quand un créateur conteste son solde : la
// réponse est forcément dans cette liste, filtrée sur son compte.

import { useCallback, useState } from 'react';
import { useAdminList } from '@/components/admin/useAdminList';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/Field';
import { CoinsIcon } from '@/components/icons';
import { MOVEMENT_LABELS, type AdminCreditRow, type CreditMovement } from '@/lib/deoflow/adminApi';
import { formatAmount, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const MOVEMENTS: CreditMovement[] = ['PURCHASE', 'GENERATION', 'REFUND', 'ADMIN_ADJUSTMENT'];

const MOVEMENT_TONES: Record<string, 'gain' | 'loss' | 'info' | 'neutral'> = {
  PURCHASE: 'gain',
  GENERATION: 'loss',
  REFUND: 'info',
  ADMIN_ADJUSTMENT: 'neutral',
};

export default function AdminLedgerPage() {
  const [movement, setMovement] = useState('');
  const [userInput, setUserInput] = useState('');
  const [userId, setUserId] = useState('');

  const buildPath = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams({ limit: '50' });
      if (movement) params.set('movement', movement);
      if (userId) params.set('userId', userId);
      if (cursor) params.set('cursor', cursor);
      return `/api/admin/credits?${params.toString()}`;
    },
    [movement, userId],
  );

  const { items, cursor, loading, loadingMore, error, loadMore } =
    useAdminList<AdminCreditRow>(buildPath);

  return (
    <>
      <AdminPageHeader
        title="Grand livre"
        description="Tous les mouvements de crédits. La somme de cette colonne est le solde — c’est ici que se tranche un litige."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setUserId(userInput.trim());
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-movement" className="text-xs text-ink-500">
              Type
            </label>
            <select
              id="filter-movement"
              value={movement}
              onChange={(e) => setMovement(e.target.value)}
              className={`${controlClass} cursor-pointer py-2 text-sm sm:w-44`}
            >
              <option value="">Tous</option>
              {MOVEMENTS.map((m) => (
                <option key={m} value={m}>
                  {MOVEMENT_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-user" className="text-xs text-ink-500">
              Compte (id)
            </label>
            <input
              id="filter-user"
              type="search"
              placeholder="cuid…"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              className={`${controlClass} py-2 text-sm sm:w-44`}
            />
          </div>
          <Button type="submit" size="sm">
            Filtrer
          </Button>
        </form>
      </AdminPageHeader>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CoinsIcon className="size-8" />}
          title="Aucun mouvement"
          description="Aucune écriture ne correspond à ces filtres."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TableShell>
            <thead>
              <tr>
                <Th>Quand</Th>
                <Th>Compte</Th>
                <Th>Type</Th>
                <Th>Libellé</Th>
                <Th className="text-right">Crédits</Th>
                <Th className="text-right">Solde après</Th>
                <Th className="text-right">Payé</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <Tr key={row.id}>
                  <Td className="whitespace-nowrap text-ink-500">
                    {formatDateTime(row.createdAt)}
                  </Td>
                  <Td className="max-w-[13rem]">
                    <span className="block truncate text-ink-700">{row.user?.email ?? '—'}</span>
                    <span className="font-mono text-xs text-ink-300">{row.userId}</span>
                  </Td>
                  <Td>
                    <Badge tone={MOVEMENT_TONES[row.movement] ?? 'neutral'}>
                      {MOVEMENT_LABELS[row.movement] ?? row.movement}
                    </Badge>
                  </Td>
                  <Td className="max-w-[16rem]">
                    <span className="block truncate text-ink-500">{row.label}</span>
                  </Td>
                  <Td
                    className={cn(
                      'text-right font-display whitespace-nowrap tabular-nums',
                      row.credits < 0 ? 'text-loss-600' : 'text-gain-600',
                    )}
                  >
                    {/* Le signe est porté par le chiffre, pas seulement par la
                        couleur : la couleur seule ne se lit pas en daltonisme. */}
                    {row.credits > 0 ? '+' : ''}
                    {row.credits.toLocaleString('fr-FR')}
                  </Td>
                  <Td className="text-right tabular-nums text-ink-500">
                    {row.balanceAfter.toLocaleString('fr-FR')}
                  </Td>
                  <Td className="text-right whitespace-nowrap text-ink-500">
                    {row.amountFcfa !== null ? formatAmount(row.amountFcfa) : '—'}
                  </Td>
                </Tr>
              ))}
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
    </>
  );
}
