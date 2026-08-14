'use client';

// Générations — l'écran de support.
//
// Il existe pour une seule phrase, reçue régulièrement : « ma génération n'a
// rien donné ». Y répondre demande quatre informations — quel modèle, quand,
// quel code d'échec, et si les crédits ont été rendus. Sans cet écran, la
// réponse se cherche dans Prisma Studio.
//
// Le filtre par défaut est donc `FAILED` : on n'ouvre pas cette page pour
// admirer les réussites.
//
// Le prompt n'est pas affiché, et la route ne le renvoie même pas. Le code
// fournisseur suffit à diagnostiquer, et c'est le contenu le plus intime que
// produise le service — une liste d'administration ne doit pas exposer par
// défaut ce qu'on n'a pas besoin de lire.

import { useCallback, useState } from 'react';
import { useAdminList } from '@/components/admin/useAdminList';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { GenerationPreview } from '@/components/admin/GenerationPreview';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { Alert, Badge, EmptyState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/Field';
import { EyeIcon, SparkIcon } from '@/components/icons';
import type { AdminGeneration } from '@/lib/deoflow/adminApi';
import { formatDateTime } from '@/lib/format';

const STATUSES = ['FAILED', 'SUCCEEDED', 'RUNNING', 'PENDING'] as const;

export default function AdminGenerationsPage() {
  const [status, setStatus] = useState<string>('FAILED');
  const [userInput, setUserInput] = useState('');
  const [userId, setUserId] = useState('');
  const [preview, setPreview] = useState<AdminGeneration | null>(null);

  const buildPath = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams({ limit: '50' });
      if (status) params.set('status', status);
      if (userId) params.set('userId', userId);
      if (cursor) params.set('cursor', cursor);
      return `/api/admin/generations?${params.toString()}`;
    },
    [status, userId],
  );

  const { items, cursor, loading, loadingMore, error, loadMore } =
    useAdminList<AdminGeneration>(buildPath);

  return (
    <>
      <AdminPageHeader
        title="Générations"
        description="Le journal du moteur. Une génération échouée est remboursée automatiquement — cet écran sert à expliquer pourquoi elle a échoué."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setUserId(userInput.trim());
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-status" className="text-xs text-ink-500">
              Statut
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${controlClass} cursor-pointer py-2 text-sm sm:w-40`}
            >
              <option value="">Tous</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
          icon={<SparkIcon className="size-8" />}
          title={status === 'FAILED' ? 'Aucun échec' : 'Aucune génération'}
          description={
            status === 'FAILED'
              ? 'Le moteur n’a rien raté sur cette plage — c’est la bonne nouvelle.'
              : 'Aucune génération ne correspond à ces filtres.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TableShell>
            <thead>
              <tr>
                <Th>Quand</Th>
                <Th>Compte</Th>
                <Th>Modèle</Th>
                <Th className="text-right">Crédits</Th>
                <Th>Statut</Th>
                <Th>Échec</Th>
                <Th className="text-right">Voir</Th>
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
                    <span className="font-mono text-xs text-ink-300">{row.id}</span>
                  </Td>
                  <Td>
                    <span className="block text-ink-700">{row.modelName}</span>
                    <span className="text-xs text-ink-300">
                      {row.kind} · {row.mode}
                      {/* Un visage d'avatar n'est pas une création : le dire
                          évite de croire à une anomalie de la galerie. */}
                      {row.purpose === 'AVATAR' ? ' · personnage' : ''}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{row.credits}</Td>
                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>
                  <Td className="max-w-[18rem]">
                    {row.failureCode ? (
                      <>
                        <Badge tone="loss">{row.failureCode}</Badge>
                        {row.failureReason ? (
                          <span className="mt-0.5 block truncate text-xs text-ink-500">
                            {row.failureReason}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setPreview(row)}
                      aria-label={`Voir la génération ${row.modelName} du ${formatDateTime(row.createdAt)}`}
                      title="Voir le rendu et le prompt"
                      className="pressable cursor-pointer rounded-lg p-2 text-ink-500 hover:bg-sunken hover:text-ink-900"
                    >
                      <EyeIcon className="size-4.5" />
                    </button>
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

      <GenerationPreview generation={preview} onClose={() => setPreview(null)} />
    </>
  );
}
