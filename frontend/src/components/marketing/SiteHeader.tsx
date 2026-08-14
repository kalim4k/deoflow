'use client';

import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { buttonStyles } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

/**
 * En-tête public. Volontairement sans menu : la landing tient en un écran et
 * demi et ne propose qu'une seule action — le brief interdit les hero à six
 * CTA. Rien à replier sur mobile, donc rien à ouvrir.
 */
export function SiteHeader() {
  const { user, loading } = useAuth();

  return (
    <header className="chrome sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />

        {loading ? (
          <span className="h-9 w-24" aria-hidden />
        ) : user ? (
          <Link href="/dashboard" className={buttonStyles('primary', 'sm')}>
            Ouvrir Deoflow
          </Link>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/login" className={buttonStyles('ghost', 'sm')}>
              Connexion
            </Link>
            <Link href="/signup" className={buttonStyles('primary', 'sm')}>
              Commencer
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
