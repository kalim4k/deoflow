// Retour de paiement réussi.
//
// C'est la cible par défaut du `successUrl` de /api/orders, la route de
// paiement héritée du starter. Quand Tmoney/Flooz seront branchés sur cette
// route, l'utilisateur atterrira ici puis sera renvoyé vers son portefeuille,
// où le solde fait foi — pas cette page, qui ne prouve rien : seul le webhook
// signé du prestataire crédite le compte.

import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { buttonStyles } from '@/components/ui/Button';
import { CheckCircleIcon } from '@/components/icons';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Paiement confirmé',
};

interface PageProps {
  searchParams: Promise<{ o?: string }>;
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const { o } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <Logo />

        <div className="card flex w-full flex-col items-center gap-4 p-8 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-gain-50 text-gain-600">
            <CheckCircleIcon className="size-8" />
          </span>

          <h1 className="font-display text-2xl">Paiement confirmé</h1>
          <p className="text-sm text-ink-500">
            Vos crédits sont ajoutés à votre solde. Vous pouvez lancer une génération.
          </p>

          {o ? (
            <p className="text-sm text-ink-300">
              Référence :{' '}
              <code className="rounded-md bg-sunken px-2 py-1 font-mono text-xs text-ink-700">
                {o}
              </code>
            </p>
          ) : null}

          <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row">
            <Link href="/create/image" className={buttonStyles('primary', 'md', 'w-full')}>
              Générer maintenant
            </Link>
            <Link href="/wallet" className={buttonStyles('secondary', 'md', 'w-full')}>
              Mon portefeuille
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
