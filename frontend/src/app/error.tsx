'use client';

import Link from 'next/link';
import { Button, buttonStyles } from '@/components/ui/Button';
import { XCircleIcon } from '@/components/icons';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="card flex w-full max-w-lg flex-col items-center gap-5 p-8 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-loss-50 text-loss-600">
          <XCircleIcon className="size-7" />
        </span>

        <h1 className="font-display text-2xl">Une erreur est survenue</h1>
        <p className="text-sm text-ink-500">
          {error.message || 'Le chargement de cette page a échoué.'}
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-ink-300">référence : {error.digest}</p>
        ) : null}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Button onClick={reset}>Réessayer</Button>
          <Link href="/" className={buttonStyles('secondary', 'md')}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </main>
  );
}
