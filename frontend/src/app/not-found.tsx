import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { buttonStyles } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <Logo />

        <p className="font-display text-6xl text-ink-300">404</p>
        <h1 className="font-display text-2xl">Cette page n&apos;existe pas</h1>
        <p className="text-sm text-ink-500">
          Le lien est peut-être obsolète, ou la page a été déplacée.
        </p>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className={buttonStyles('primary', 'md')}>
            Retour à l&apos;accueil
          </Link>
          <Link href="/dashboard" className={buttonStyles('secondary', 'md')}>
            Mon espace
          </Link>
        </div>
      </div>
    </main>
  );
}
