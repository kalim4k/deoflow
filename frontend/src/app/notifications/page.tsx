'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { formatRelative } from '@/lib/format';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/Button';
import { Alert, Card, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import { BellIcon } from '@/components/icons';
import { useToast } from '@/contexts/ToastContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { cn } from '@/lib/cn';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: Notification[];
  nextCursor: string | null;
}

function NotificationsBody() {
  const { toast } = useToast();
  const { refresh: refreshUnread } = useNotifications();
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor: string | null, onlyUnread: boolean) => {
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (onlyUnread) params.set('unread', 'true');
      if (nextCursor) params.set('cursor', nextCursor);
      const res = await api<ListResponse>(`/api/notifications?${params.toString()}`);
      setItems((prev) => (nextCursor ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(null, unreadOnly);
  }, [load, unreadOnly]);

  async function markAll() {
    setMarking(true);
    try {
      const res = await api<{ updated: number }>('/api/notifications', {
        method: 'PATCH',
        body: { ids: 'all' },
      });
      toast(
        res.updated > 0
          ? `${res.updated} notification${res.updated > 1 ? 's' : ''} marquée${res.updated > 1 ? 's' : ''} comme lue${res.updated > 1 ? 's' : ''}.`
          : 'Aucune notification non lue.',
        'success',
      );
      // Sans ça la pastille garderait son ancien chiffre jusqu'au prochain
      // sondage : on aurait tout lu et le menu continuerait d'annoncer des
      // non-lues. C'est le détail qui décide si la pastille est crédible.
      await refreshUnread();
      await load(null, unreadOnly);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setMarking(false);
    }
  }

  async function markOne(id: string) {
    // Optimiste : la pastille disparaît immédiatement, l'API confirme après.
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    try {
      await api('/api/notifications', { method: 'PATCH', body: { ids: [id] } });
      await refreshUnread();
    } catch (err) {
      toast(errorMessage(err), 'error');
      // L'optimisme est annulé des deux côtés : la ligne ET le compteur.
      await refreshUnread();
      await load(null, unreadOnly);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Filtrer les notifications"
          value={unreadOnly ? 'unread' : 'all'}
          onChange={(v) => setUnreadOnly(v === 'unread')}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'unread', label: 'Non lues' },
          ]}
        />

        <Button variant="secondary" size="sm" loading={marking} onClick={() => void markAll()}>
          Tout marquer comme lu
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BellIcon className="size-8" />}
          title={unreadOnly ? 'Tout est lu' : 'Aucune notification'}
          description="Les confirmations de paiement et les mises à jour de retrait arrivent ici."
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((n) => {
              const unread = n.readAt === null;
              return (
                <li key={n.id}>
                  <Card
                    className={cn(
                      'flex items-start gap-4 p-5 transition-colors duration-200',
                      unread && 'border-ember-500/40 bg-ember-50',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        unread ? 'bg-ember-500' : 'bg-line-strong',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-medium">{n.title}</p>
                      <p className="mt-0.5 text-sm text-ink-500">{n.body}</p>
                      <p className="mt-1 text-xs text-ink-300">
                        {formatRelative(n.createdAt)}
                        {unread ? ' · non lue' : ''}
                      </p>
                    </div>
                    {unread && (
                      <Button size="sm" variant="ghost" onClick={() => void markOne(n.id)}>
                        Marquer lue
                      </Button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>

          {cursor && (
            <Button
              variant="secondary"
              size="sm"
              loading={loadingMore}
              onClick={() => void load(cursor, unreadOnly)}
              className="self-start"
            >
              Charger plus
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AppShell title="Notifications" description="Vos alertes de paiement, retrait et compte.">
      <NotificationsBody />
    </AppShell>
  );
}
