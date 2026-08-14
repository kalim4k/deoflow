'use client';

// Confirmation d'achat (F25/F26) — écran de retour depuis Maketou.
//
// Le retour n'est PAS une preuve de paiement : l'URL est rejouable et peut
// arriver avant que l'acheteur ait confirmé sur son téléphone. Cet écran ne
// fait donc qu'interroger notre serveur, qui lit lui-même le panier chez
// Maketou. Rien n'est affiché comme acquis avant cette réponse.
//
// Le sondage s'espace (3 s → 10 s) : leur API plafonne à 60 requêtes / 10 s,
// et une confirmation mobile money prend souvent plus d'une minute.

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { buttonStyles } from '@/components/ui/Button';
import { Alert, Card, EmptyState } from '@/components/ui/Feedback';
import { CheckCircleIcon, CoinsIcon, SpinnerIcon, XCircleIcon } from '@/components/icons';
import { fetchPurchase, type ApiPurchase } from '@/lib/deoflow/api';
import { findPack } from '@/lib/deoflow/packs';
import { useCreditsContext } from '@/contexts/CreditsContext';
import { errorMessage } from '@/lib/errorMessages';
import { formatAmount, formatDateTime } from '@/lib/format';

/**
 * Au-delà, on cesse de sonder et on le dit honnêtement.
 *
 * Ce n'est pas un échec : le cron `purchase-reconcile` reprend la main toutes
 * les cinq minutes. Continuer à faire tourner un sablier indéfiniment ferait
 * craindre une perte d'argent là où il n'y en a pas.
 */
const POLL_BUDGET_MS = 3 * 60 * 1000;

function ConfirmationBody() {
  const orderId = useSearchParams().get('order');
  const { refresh } = useCreditsContext();

  const [purchase, setPurchase] = useState<ApiPurchase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stillWaiting, setStillWaiting] = useState(false);

  // `refresh` change d'identité à chaque rendu du contexte ; le garder dans une
  // ref évite de relancer le sondage depuis le début à chaque fois.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();
    let delay = 3000;

    async function tick(id: string) {
      try {
        const row = await fetchPurchase(id);
        if (cancelled) return;
        setPurchase(row);

        if (row.status === 'PAID') {
          // Le solde vient d'augmenter côté serveur : le relire met à jour la
          // pastille et le rail sans rechargement.
          void refreshRef.current();
          return;
        }
        if (row.status === 'FAILED') return;

        if (Date.now() - startedAt > POLL_BUDGET_MS) {
          setStillWaiting(true);
          return;
        }
        timer = window.setTimeout(() => void tick(id), delay);
        delay = Math.min(delay * 1.4, 10_000);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    }

    void tick(orderId);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId]);

  if (!orderId) {
    return (
      <EmptyState
        icon={<CoinsIcon className="size-8" />}
        title="Achat introuvable"
        description="Cette adresse ne référence aucun achat."
        action={
          <Link href="/wallet" className={buttonStyles('secondary', 'sm')}>
            Retour au portefeuille
          </Link>
        }
      />
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <Alert tone="error">{error}</Alert>
        <Link href="/wallet" className={buttonStyles('secondary', 'md', 'w-full')}>
          Mon portefeuille
        </Link>
      </div>
    );
  }

  if (!purchase) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
        <SpinnerIcon className="size-10 text-ink-300" />
        <h1 className="font-display text-2xl">Vérification du paiement</h1>
        <p className="text-sm text-ink-500">Un instant, nous interrogeons le prestataire.</p>
      </div>
    );
  }

  const paid = purchase.status === 'PAID';
  const failed = purchase.status === 'FAILED';
  const packName = findPack(purchase.packId ?? '')?.name ?? 'Crédits Deoflow';

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
      <span
        className={
          failed
            ? 'grid size-16 place-items-center rounded-2xl bg-loss-50 text-loss-600'
            : paid
              ? 'grid size-16 place-items-center rounded-2xl bg-gain-50 text-gain-600'
              : 'grid size-16 place-items-center rounded-2xl bg-sunken text-ink-500'
        }
      >
        {failed ? (
          <XCircleIcon className="size-8" />
        ) : paid ? (
          <CheckCircleIcon className="size-8" />
        ) : (
          <SpinnerIcon className="size-8" />
        )}
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl">
          {failed
            ? 'Paiement non abouti'
            : paid
              ? `+${purchase.credits} crédits ajoutés`
              : 'Paiement en attente de confirmation'}
        </h1>
        <p className="text-sm text-ink-500">
          {failed
            ? 'Le paiement n’a pas été confirmé. Aucun montant ne vous a été prélevé.'
            : paid
              ? purchase.balanceAfter !== null
                ? `Votre nouveau solde est de ${purchase.balanceAfter} crédits.`
                : 'Ces crédits étaient déjà à votre solde.'
              : stillWaiting
                ? 'Si vous avez validé sur votre téléphone, vos crédits arriveront automatiquement dans les minutes qui suivent — vous pouvez fermer cette page.'
                : 'Validez la demande sur votre téléphone. Cet écran se met à jour tout seul.'}
        </p>
      </div>

      <Card className="w-full">
        <dl className="flex flex-col gap-2.5 text-left text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">Pack</dt>
            <dd className="text-ink-900">{packName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">Montant</dt>
            <dd className="text-ink-900">{formatAmount(purchase.amountFcfa, 'XOF')}</dd>
          </div>
          {/*
            Pas de ligne « moyen de paiement » : la lecture du panier ne renvoie
            ni l'opérateur ni le montant réellement payé. Afficher « Tmoney ou
            Flooz » serait une supposition présentée comme un reçu.
          */}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">Date</dt>
            <dd className="text-ink-900">{formatDateTime(purchase.createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500">Référence</dt>
            <dd className="font-mono text-xs text-ink-500">{purchase.orderId}</dd>
          </div>
        </dl>
      </Card>

      <div className="flex w-full flex-col gap-3 sm:flex-row">
        {failed ? (
          <Link href="/wallet/topup" className={buttonStyles('ember', 'md', 'w-full')}>
            Réessayer
          </Link>
        ) : paid ? (
          <Link href="/create/image" className={buttonStyles('primary', 'md', 'w-full')}>
            Générer maintenant
          </Link>
        ) : null}
        <Link href="/wallet" className={buttonStyles('secondary', 'md', 'w-full')}>
          Mon portefeuille
        </Link>
      </div>
    </div>
  );
}

export default function TopUpConfirmationPage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ConfirmationBody />
      </Suspense>
    </AppShell>
  );
}
