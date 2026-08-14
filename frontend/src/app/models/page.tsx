'use client';

// Catalogue (3.5 du PRD). Le filtre est purement client : la liste se met à
// jour instantanément, sans aller-retour réseau — c'est un critère
// d'acceptation explicite d'US2, et la cible est sur une 4G capricieuse.

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { ModelCard } from '@/components/app/ModelCard';
import { Segmented } from '@/components/ui/Segmented';
import { listModels } from '@/lib/deoflow/client';
import type { MediaKind } from '@/lib/deoflow/types';

const FILTERS: ReadonlyArray<{ value: MediaKind | 'all'; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Vidéos' },
];

function ModelsCatalog() {
  const params = useSearchParams();
  // ?kind=image|video — utilisé par les liens « voir les fiches » de l'atelier,
  // pour que le catalogue s'ouvre déjà filtré sur le type qu'on consultait.
  const requested = params.get('kind');
  const initial: MediaKind | 'all' =
    requested === 'image' || requested === 'video' ? requested : 'all';

  const [filter, setFilter] = useState<MediaKind | 'all'>(initial);
  const models = filter === 'all' ? listModels() : listModels(filter);

  return (
    <AppShell
      title="Modèles"
      description="Choisissez selon ce que vous voulez produire — le coût est indiqué sur chaque modèle."
    >
      <div className="flex flex-col gap-5">
        <Segmented label="Filtrer par type" value={filter} onChange={setFilter} options={FILTERS} />

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <li key={model.slug}>
              <ModelCard model={model} />
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}

export default function ModelsPage() {
  return (
    <Suspense fallback={null}>
      <ModelsCatalog />
    </Suspense>
  );
}
