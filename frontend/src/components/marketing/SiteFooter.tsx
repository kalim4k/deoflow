import Link from 'next/link';
import { Logo } from '@/components/Logo';

const LINKS = [
  { href: '/signup', label: 'Créer un compte' },
  { href: '/login', label: 'Connexion' },
  { href: '/status', label: 'État des services' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-sm text-ink-500">
            Génération d&apos;images et de vidéos IA, payable en mobile money.
          </p>
        </div>

        <nav aria-label="Liens de pied de page" className="flex flex-wrap gap-x-6 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="cursor-pointer text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-line">
        <p className="mx-auto max-w-5xl px-4 py-5 text-xs text-ink-300 sm:px-6">
          © {new Date().getFullYear()} Deoflow — Lomé, Togo.
        </p>
      </div>
    </footer>
  );
}
