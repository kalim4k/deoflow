import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import icon from '@/components/brand/deoflow-icon.png';

/**
 * Marque Deoflow.
 *
 * Le glyphe était auparavant un tracé SVG en aplat, le brief d'art proscrivant
 * dégradés et halos. L'icône fournie par le propriétaire du dépôt s'écarte de
 * ce registre — décision assumée, au même titre que le passage de l'interface
 * en clair. Le brief n'a pas été remis à jour.
 *
 * Aucune classe `rounded-*` ici : l'arrondi (21,9 % du côté) est déjà dans le
 * fichier. À 36 px, `rounded-xl` découperait à 12 px, soit une fois et demie
 * plus profond que le dessin, et rognerait la carte.
 *
 * L'image est importée statiquement : Next en déduit les dimensions, lui donne
 * une empreinte de contenu, et sert un WebP à la taille demandée — le PNG de
 * 39 Ko ne part jamais tel quel sur le réseau.
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
      <Image src={icon} alt="" width={36} height={36} priority className="size-9 shrink-0" />
      {compact ? (
        <span className="sr-only">Deoflow</span>
      ) : (
        <span className="font-display text-lg font-bold tracking-tight text-ink-900">Deoflow</span>
      )}
    </Link>
  );
}
