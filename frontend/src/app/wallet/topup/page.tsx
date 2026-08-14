'use client';

// Achat de crédits (3.10 du PRD).
//
// Deux temps seulement : on choisit un pack, on est redirigé vers la page de
// paiement Maketou. Le choix du moyen de paiement et la saisie du numéro s'y
// font — les redemander ici serait mentir sur qui décide, et donnerait deux
// endroits où se tromper de numéro.
//
// On ne nomme aucun opérateur : c'est la page de Maketou qui décide de ce
// qu'elle propose, et cette liste peut changer sans que nous le sachions.
//
// Aucun crédit n'est ajouté avant la confirmation (F26) : le solde ne bouge
// qu'une fois Maketou interrogé par notre serveur.

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/Button';
import { Alert, Badge, Card } from '@/components/ui/Feedback';
import { ArrowLeftIcon, CheckIcon } from '@/components/icons';
import { startPurchase } from '@/lib/deoflow/api';
import { CREDIT_PACKS, pricePerCredit } from '@/lib/deoflow/packs';
import { errorMessage } from '@/lib/errorMessages';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';

export default function TopUpPage() {
  const [packId, setPackId] = useState(CREDIT_PACKS[1]?.id ?? 'createur');
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pack = CREDIT_PACKS.find((p) => p.id === packId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pack) return;
    setError(null);
    setRedirecting(true);

    try {
      const purchase = await startPurchase(pack.id, crypto.randomUUID());
      // Navigation, pas `fetch` : c'est l'acheteur qui doit voir cette page,
      // et une requête depuis le navigateur se heurterait de toute façon à CORS.
      window.location.assign(purchase.paymentUrl);
    } catch (err) {
      setError(errorMessage(err));
      setRedirecting(false);
    }
  }

  return (
    <AppShell title="Acheter des crédits" description="Les crédits n’expirent pas.">
      <div className="flex flex-col gap-6">
        <Link
          href="/wallet"
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
        >
          <ArrowLeftIcon className="size-4" />
          Mon portefeuille
        </Link>

        <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-display text-lg">Choisissez un pack</legend>
            {CREDIT_PACKS.map((p) => {
              const selected = p.id === packId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPackId(p.id)}
                  aria-pressed={selected}
                  // Le panier est déjà ouvert chez Maketou au montant du pack
                  // choisi : changer d'avis pendant la redirection ferait payer
                  // un pack et en afficher un autre.
                  disabled={redirecting}
                  className={cn(
                    'pressable card flex cursor-pointer items-center justify-between gap-4 p-5 text-left',
                    'disabled:pointer-events-none disabled:opacity-50',
                    selected && 'border-ink-900',
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base">{p.name}</span>
                      {p.badge ? <Badge tone="ember">{p.badge}</Badge> : null}
                    </span>
                    <span className="mt-1 block text-sm text-ink-500">
                      {p.credits} crédits — {pricePerCredit(p)} FCFA le crédit
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-300">
                      {Math.floor(p.credits / 24)} images, ou {Math.floor(p.credits / 165)} clips
                      Kling de 5 s
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block font-display text-xl">
                      {formatAmount(p.priceFcfa, 'XOF')}
                    </span>
                  </span>
                </button>
              );
            })}
          </fieldset>

          <Card className="flex flex-col gap-5">
            <h2 className="font-display text-lg">Récapitulatif</h2>

            {pack ? (
              <div className="flex flex-col gap-2 rounded-xl bg-sunken p-4 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-500">À payer</span>
                  <span className="font-display text-base">
                    {formatAmount(pack.priceFcfa, 'XOF')}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-500">Crédits ajoutés</span>
                  <span className="font-display text-base">+{pack.credits}</span>
                </div>
              </div>
            ) : null}

            <p className="text-sm text-ink-500">
              Vous choisirez votre moyen de paiement et saisirez votre numéro sur la page sécurisée,
              puis vous confirmerez depuis votre téléphone.
            </p>

            {error && <Alert tone="error">{error}</Alert>}

            {/*
              L'attente vit dans le bouton, pas sur un écran intermédiaire.
              Remplacer toute la page par un sablier faisait perdre le contexte
              — le pack choisi, le montant — au moment précis où l'on s'apprête
              à payer. Ici, l'écran ne bouge pas : seul le bouton change d'état,
              et il le garde jusqu'à ce que le navigateur parte réellement.
            */}
            <Button type="submit" variant="ember" className="w-full" loading={redirecting}>
              {redirecting
                ? 'Redirection en cours…'
                : `Payer ${pack ? formatAmount(pack.priceFcfa, 'XOF') : ''}`}
            </Button>

            <p className="flex items-start gap-2 text-xs text-ink-500">
              <CheckIcon className="mt-0.5 size-4 text-gain-600" />
              Aucun crédit n&apos;est ajouté tant que le paiement n&apos;est pas confirmé.
            </p>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
