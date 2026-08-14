import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { SpinnerIcon } from '@/components/icons';

export type ButtonVariant = 'primary' | 'ember' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  // Encre pleine — l'action principale de l'écran. Une seule par vue.
  primary: 'bg-ink-900 text-white font-medium hover:bg-ink-700 active:bg-ink-900',
  // Accent chaud — réservé à ce qui touche aux crédits (recharger, générer).
  ember: 'bg-ember-500 text-white font-medium hover:bg-ember-600 active:bg-ember-700',
  secondary:
    'bg-surface text-ink-900 font-medium border border-line hover:border-line-strong hover:bg-sunken',
  ghost: 'text-ink-500 hover:bg-sunken hover:text-ink-900',
  danger: 'bg-loss-50 text-loss-700 font-medium border border-loss-600/25 hover:bg-loss-600/10',
};

const SIZES: Record<ButtonSize, string> = {
  // md et lg tiennent la cible tactile de 44 px ; sm est réservé aux lignes
  // de tableau denses, où la ligne elle-même porte la zone de clic.
  sm: 'min-h-8 px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'min-h-11 px-5 py-2.5 text-sm gap-2 rounded-xl',
  lg: 'min-h-13 px-6 py-3.5 text-base gap-2.5 rounded-2xl',
};

export function buttonStyles(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'pressable inline-flex cursor-pointer items-center justify-center whitespace-nowrap',
    'disabled:pointer-events-none disabled:opacity-45',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Affiche un indicateur et bloque les clics — pour tout envoi asynchrone. */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles(variant, size, className)}
      {...props}
    >
      {loading && <SpinnerIcon className="size-4" />}
      {children}
    </button>
  );
}
