'use client';

// Journal d'audit — la trace de « qui a fait quoi, quand ».
// Chaque mutation du back-office passe par logAdminAction côté serveur ; cet
// écran ne fait que lire /api/admin/audit-log (filtres : actor, action,
// targetType, since, until).

import { useCallback, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useAdminList } from '@/components/admin/useAdminList';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { Alert, Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { controlClass } from '@/components/ui/Field';
import { ClipboardIcon } from '@/components/icons';

interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

function metadataPreview(metadata: unknown): string | null {
  if (metadata === null || metadata === undefined) return null;
  try {
    const text = JSON.stringify(metadata);
    if (text === '{}' || text === 'null') return null;
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  } catch {
    return null;
  }
}

export default function AdminAuditLogPage() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [actor, setActor] = useState('');
  const [filters, setFilters] = useState({ action: '', targetType: '', actor: '' });

  const buildPath = useCallback(
    (cursor: string | null) => {
      const params = new URLSearchParams({ limit: '50' });
      if (filters.action) params.set('action', filters.action);
      if (filters.targetType) params.set('targetType', filters.targetType);
      if (filters.actor) params.set('actor', filters.actor);
      if (cursor) params.set('cursor', cursor);
      return `/api/admin/audit-log?${params.toString()}`;
    },
    [filters],
  );

  const { items, cursor, loading, loadingMore, error, loadMore } =
    useAdminList<AuditEntry>(buildPath);

  return (
    <>
      <AdminPageHeader
        title="Journal d’audit"
        description="Chaque mutation administrative y laisse une trace immuable."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({
              action: action.trim(),
              targetType: targetType.trim(),
              actor: actor.trim(),
            });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-action" className="text-xs text-ink-500">
              Action
            </label>
            <input
              id="filter-action"
              type="search"
              placeholder="user.role.change"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className={`${controlClass} py-2 text-sm sm:w-48`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-target" className="text-xs text-ink-500">
              Type de cible
            </label>
            <input
              id="filter-target"
              type="search"
              placeholder="User"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className={`${controlClass} py-2 text-sm sm:w-36`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-actor" className="text-xs text-ink-500">
              Auteur (id)
            </label>
            <input
              id="filter-actor"
              type="search"
              placeholder="cuid…"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className={`${controlClass} py-2 text-sm sm:w-40`}
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
          icon={<ClipboardIcon className="size-8" />}
          title="Aucune entrée"
          description="Aucune action administrative ne correspond à ces filtres."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TableShell>
            <thead>
              <tr>
                <Th>Quand</Th>
                <Th>Action</Th>
                <Th>Cible</Th>
                <Th>Auteur</Th>
                <Th>Détails</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => {
                const preview = metadataPreview(entry.metadata);
                return (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap text-ink-500">
                      {formatDateTime(entry.createdAt)}
                    </Td>
                    <Td>
                      <Badge tone="ink">{entry.action}</Badge>
                    </Td>
                    <Td>
                      <span className="block text-ink-700">{entry.targetType ?? '—'}</span>
                      {entry.targetId ? (
                        <span className="font-mono text-xs text-ink-300">{entry.targetId}</span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="block font-mono text-xs text-ink-500">{entry.actorId}</span>
                      {entry.ip ? (
                        <span className="font-mono text-xs text-ink-300">{entry.ip}</span>
                      ) : null}
                    </Td>
                    <Td className="max-w-xs">
                      {preview ? (
                        <code className="block truncate font-mono text-xs text-ink-500">
                          {preview}
                        </code>
                      ) : (
                        <span className="text-xs text-ink-300">—</span>
                      )}
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
    </>
  );
}
