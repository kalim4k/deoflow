// Retour de paiement échoué — cible par défaut du `failureUrl` de /api/orders.
// Aucun crédit n'a été ajouté et aucun montant n'a été débité.

import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { buttonStyles } from '@/components/ui/Button';
import { XCircleIcon } from '@/components/icons';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Paiement non abouti',
};

interface PageProps {
  searchParams: Promise<{ o?: string }>;
}

export default async function PaymentFailurePage({ searchParams }: PageProps) {
  const { o } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <Logo />

        <div className="card flex w-full flex-col items-center gap-4 p-8 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-loss-50 text-loss-600">
            <XCircleIcon className="size-8" />
          </span>

          <h1 className="font-display text-2xl">Paiement non abouti</h1>
          <p className="text-sm text-ink-500">
            La confirmation n&apos;est pas arrivée. Aucun montant n&apos;a été débité et votre solde
            est inchangé — vous pouvez réessayer.
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
            <Link href="/wallet/topup" className={buttonStyles('ember', 'md', 'w-full')}>
              Réessayer
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
