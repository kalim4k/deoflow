import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Marque Deoflow. Le glyphe est un « flux » : deux traits qui s'ouvrent vers
 * la droite, dessinés en trait plein d'encre — pas de dégradé, pas de halo
 * (le brief proscrit explicitement ce registre).
 */
export function Logo({
  className,
  href = '/',
  compact = false,
}: {
  className?: string;
  href?: string;
  /** Glyphe seul, sans le mot — pour le rail latéral replié. */
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'pressable inline-flex cursor-pointer items-center gap-2.5 rounded-lg',
        className,
      )}
    >
      <span className="grid size-9 place-items-center rounded-xl bg-ink-900">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none">
          <path
            d="M5 6.5h9.5a5.5 5.5 0 010 11H8"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path d="M5 12h6" stroke="#FF5A1F" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
      {compact ? (
        <span className="sr-only">Deoflow</span>
      ) : (
        <span className="font-display text-lg font-bold tracking-tight text-ink-900">Deoflow</span>
      )}
    </Link>
  );
}
