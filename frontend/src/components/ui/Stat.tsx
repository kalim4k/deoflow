import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Feedback';
import { cn } from '@/lib/cn';

/**
 * Chiffre-clé. Partagé par le tableau de bord, le portefeuille et le
 * back-office pour que « un nombre important » ait la même forme partout.
 *
 * Le libellé est en casse normale — les petites capitales espacées coûtent en
 * lisibilité pour ne gagner qu'un effet de style.
 */
export function Stat({
  label,
  value,
  hint,
  icon,
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('card flex flex-col gap-1 p-5', className)}>
      <span className="flex items-center gap-2 text-sm text-ink-500">
        {icon ? <span className="text-ink-300">{icon}</span> : null}
        {label}
      </span>
      {loading ? (
        <Skeleton className="mt-1.5 h-8 w-24" />
      ) : (
        <span className="font-display text-[1.75rem] leading-tight tabular-nums">{value}</span>
      )}
      {hint ? <span className="text-xs text-ink-300">{hint}</span> : null}
    </div>
  );
}
