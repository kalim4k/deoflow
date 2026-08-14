'use client';

import { cn } from '@/lib/cn';

/**
 * Bascule entre deux ou trois vues d'une même liste (type de média, lu/non lu).
 * Purement client : la liste se met à jour sans aller-retour réseau.
 *
 * `aria-pressed` plutôt que `role="tablist"` : il n'y a pas de panneaux à
 * associer, seulement un filtre appliqué à la liste qui suit.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex w-fit gap-0.5 rounded-full bg-sunken p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'pressable min-h-9 cursor-pointer rounded-full px-4 text-sm',
              active
                ? 'bg-surface font-medium text-ink-900 shadow-[0_1px_2px_rgba(11,11,12,0.08)]'
                : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
