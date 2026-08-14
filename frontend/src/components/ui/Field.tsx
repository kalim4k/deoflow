'use client';

import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { EyeIcon, EyeOffIcon } from '@/components/icons';
import { cn } from '@/lib/cn';

const CONTROL_BASE =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink-900 ' +
  'transition-colors duration-200 placeholder:text-ink-300 ' +
  'hover:border-line-strong focus:border-ink-900 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-70';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  /** Contenu aligné à droite du libellé (compteur de caractères, coût…). */
  aside?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/**
 * Libellé + contrôle + aide/erreur, reliés par `htmlFor` / `id` /
 * `aria-describedby`. Tous les champs de l'app passent par ici : aucun input
 * ne part sans vrai <label>.
 */
function FieldShell({ label, hint, error, aside, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink-700">
          {label}
        </label>
        {aside ? <span className="text-xs text-ink-300">{aside}</span> : null}
      </div>
      {children(id, describedBy)}
      {error ? (
        <p id={errorId} className="text-sm text-loss-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  aside?: ReactNode;
}

export function InputField({ label, hint, error, aside, className, ...props }: InputFieldProps) {
  return (
    <FieldShell
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(aside ? { aside } : {})}
    >
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(CONTROL_BASE, error && 'border-loss-600', className)}
          {...props}
        />
      )}
    </FieldShell>
  );
}

/**
 * Champ mot de passe, avec bouton d'affichage.
 *
 * Un mot de passe masqué se saisit à l'aveugle. Sur téléphone, clavier
 * approximatif et doigt pressé, c'est la première cause d'échec de connexion —
 * l'utilisateur conclut qu'il a oublié son mot de passe alors qu'il l'a mal
 * tapé. Pouvoir relire ce qu'on vient d'écrire évite ce faux négatif.
 *
 * L'état repart toujours masqué : c'est une relecture ponctuelle, pas un
 * réglage. Et le bouton reste atteignable au clavier — le masquer à la
 * tabulation le rendrait inutilisable à ceux qui en ont le plus besoin.
 */
export function PasswordField({
  label,
  hint,
  error,
  aside,
  className,
  ...props
}: Omit<InputFieldProps, 'type'>) {
  const [revealed, setRevealed] = useState(false);

  return (
    <FieldShell
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(aside ? { aside } : {})}
    >
      {(id, describedBy) => (
        <div className="relative">
          <input
            id={id}
            type={revealed ? 'text' : 'password'}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            // `pr-12` : la place du bouton est réservée dans le champ, sinon la
            // fin d'un mot de passe long passerait dessous.
            className={cn(CONTROL_BASE, 'pr-12', error && 'border-loss-600', className)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={revealed}
            className="pressable absolute inset-y-1 right-1 grid w-11 cursor-pointer place-items-center rounded-lg text-ink-300 transition-colors duration-200 hover:text-ink-700"
          >
            {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
          </button>
        </div>
      )}
    </FieldShell>
  );
}

interface TextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  aside?: ReactNode;
}

export function TextareaField({
  label,
  hint,
  error,
  aside,
  className,
  ...props
}: TextareaFieldProps) {
  return (
    <FieldShell
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(aside ? { aside } : {})}
    >
      {(id, describedBy) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            CONTROL_BASE,
            'resize-y leading-relaxed',
            error && 'border-loss-600',
            className,
          )}
          {...props}
        />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <FieldShell label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {(id, describedBy) => (
        <select
          id={id}
          aria-describedby={describedBy}
          className={cn(CONTROL_BASE, 'cursor-pointer', className)}
          {...props}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}

/** Classes brutes du contrôle, pour les rares champs hors FieldShell. */
export const controlClass = CONTROL_BASE;
