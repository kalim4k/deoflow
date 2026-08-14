'use client';

// Galerie personnelle (3.8 du PRD) : toutes les générations, les plus
// récentes d'abord, filtrables par type. Le filtre est client — instantané,
// sans requête.

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app/AppShell';
import { GenerationCard } from '@/components/app/GenerationCard';
import { buttonStyles } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import { ImageIcon } from '@/components/icons';
import { useGenerations } from '@/lib/deoflow/useGenerations';
import type { MediaKind } from '@/lib/deoflow/types';

const FILTERS: ReadonlyArray<{ value: MediaKind | 'all'; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Vidéos' },
];

export default function GalleryPage() {
  const { items: generations, loading, error } = useGenerations();
  const [filter, setFilter] = useState<MediaKind | 'all'>('all');
  const items = filter === 'all' ? generations : generations.filter((g) => g.kind === filter);

  return (
    <AppShell title="Galerie" description="Vos créations, avec le prompt qui les a produites.">
      <div className="flex flex-col gap-5">
        <Segmented label="Filtrer par type" value={filter} onChange={setFilter} options={FILTERS} />

        {loading ? (
          // Grille fantôme aux mêmes proportions que les vignettes : rien ne
          // se déplace quand les vraies arrivent.
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-sunken" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="size-8" />}
            title={
              error
                ? 'Galerie indisponible'
                : generations.length === 0
                  ? 'Votre galerie est vide'
                  : 'Rien de ce type pour l’instant'
            }
            description={
              error
                ? 'Vos créations sont bien enregistrées — seul l’affichage a échoué. Réessayez dans un instant.'
                : 'Chaque génération est enregistrée ici automatiquement, prompt compris.'
            }
            action={
              <Link href="/create/image" className={buttonStyles('primary', 'sm')}>
                Générer ma première image
              </Link>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((g) => (
              <li key={g.id}>
                <GenerationCard generation={g} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
