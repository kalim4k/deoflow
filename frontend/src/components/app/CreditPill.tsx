'use client';

import Link from 'next/link';
import { CoinsIcon } from '@/components/icons';
import { useCredits } from '@/lib/deoflow/useDeoflow';
import { cn } from '@/lib/cn';

/**
 * Solde de crédits, visible en permanence dans l'en-tête mobile (F19 du PRD).
 * Sous le seuil bas (F21) il vire à l'accent chaud et pulse : sur mobile le
 * rail latéral est fermé, cette pastille porte donc seule l'alerte de solde.
 * Elle mène toujours au portefeuille — la commande est placée à côté de ce
 * qu'elle affecte.
 */
export function CreditPill({ className }: { className?: string }) {
  const { credits, low, loading } = useCredits();

  return (
    <Link
      href="/wallet"
      aria-label={
        loading
          ? 'Chargement du solde. Ouvrir le portefeuille.'
          : `Solde : ${credits} crédits.${low ? ' Solde bas.' : ''} Ouvrir le portefeuille.`
      }
      className={cn(
        'pressable inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
        low
          ? 'attention border-ember-500/30 bg-ember-50 text-ember-700'
          : 'border-line bg-surface text-ink-900 hover:border-line-strong',
        className,
      )}
    >
      <CoinsIcon className="size-4" />
      {loading ? (
        // Un « 0 » affiché le temps d'une requête est un mensonge bref mais
        // alarmant : le créateur croit son solde vide.
        <span className="h-4 w-14 animate-pulse rounded bg-line" aria-hidden="true" />
      ) : (
        <>
          <span className="font-display tabular-nums">{credits}</span>
          <span className="text-ink-500">{credits > 1 ? 'crédits' : 'crédit'}</span>
        </>
      )}
    </Link>
  );
}
