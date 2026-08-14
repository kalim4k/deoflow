'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from '@/components/icons';

/**
 * Boîte de dialogue modale minimale : fermeture par Échap ou clic sur le fond,
 * focus déplacé sur le panneau à l'ouverture, défilement du corps bloqué.
 * Suffisant pour les confirmations du back-office ; pour des formulaires plus
 * riches, remplacez-la par le composant de votre bibliothèque.
 *
 * ⚠️ L'effet ci-dessous ne doit dépendre QUE de `open`.
 *
 * Il en dépendait aussi de `onClose`, et tous les appelants passent une
 * fonction fléchée en ligne — donc une identité neuve à chaque rendu. Taper une
 * lettre dans un champ provoquait un rendu, l'effet rejouait, et
 * `panelRef.current.focus()` reprenait le curseur au champ : il fallait
 * recliquer entre chaque caractère. Le motif d'un ajustement de crédits
 * devenait impossible à saisir.
 *
 * D'où la référence mutable : le gestionnaire d'Échap lit toujours le dernier
 * `onClose` sans que son identité entre dans les dépendances.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Mise à jour à chaque rendu, hors de tout effet : l'écouteur d'Échap y lit
  // la version courante au moment où la touche est pressée.
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Une seule fois, à l'ouverture : c'est le geste qui amène l'utilisateur
    // dans la boîte, pas quelque chose à refaire pendant qu'il y travaille.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      {/* Voile d'assombrissement : la tâche est modale, on repousse le fond
          (apple-design §12 — « dim to focus »). */}
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="card relative z-10 w-full max-w-md rounded-b-none p-6 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="pressable grid size-9 cursor-pointer place-items-center rounded-lg text-ink-300 hover:bg-sunken hover:text-ink-900"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
