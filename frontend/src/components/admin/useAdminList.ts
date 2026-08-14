'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Liste paginée par curseur, partagée par les quatre écrans du back-office.
 *
 * `buildPath` doit être mémoïsé par l'appelant (useCallback sur ses filtres) :
 * c'est le changement d'identité de cette fonction qui déclenche le rechargement
 * de la première page quand un filtre bouge.
 */
export function useAdminList<T>(buildPath: (cursor: string | null) => string) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextCursor: string | null) => {
      if (nextCursor) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api<Page<T>>(buildPath(nextCursor));
        setItems((prev) => (nextCursor ? [...prev, ...res.items] : res.items));
        setCursor(res.nextCursor);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildPath],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return {
    items,
    cursor,
    loading,
    loadingMore,
    error,
    loadMore: () => void load(cursor),
    reload: () => void load(null),
  };
}
