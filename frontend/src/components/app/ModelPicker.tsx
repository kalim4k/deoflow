'use client';

// Première étape de la création : choisir avec quoi on génère.
//
// Le PRD demande que le coût soit lisible sans clic (US2) ; le mettre dans un
// écran dédié permet en plus de comparer les modèles côte à côte au lieu de
// les découvrir dans une liste coincée au-dessus du prompt. La sélection
// n'ouvre pas de modale : elle navigue vers /create/<type>?model=<slug>, donc
// l'URL décrit l'état et le retour arrière du navigateur ramène au choix.

import { useLinkStatus } from 'next/link';
import { AppLink } from '@/components/NavProgress';
import { Badge } from '@/components/ui/Feedback';
import { ModelBanner } from '@/components/app/ModelBanner';
import { ArrowRightIcon, ClockIcon, SpinnerIcon } from '@/components/icons';
import { listModels } from '@/lib/deoflow/client';
import { MODEL_TRAIT_LABELS } from '@/lib/deoflow/catalog';
import { inputSummary, minBillableSeconds } from '@/lib/deoflow/capabilities';
import { startingPrice } from '@/lib/deoflow/pricing';
import { useCredits } from '@/lib/deoflow/useDeoflow';
import type { MediaKind } from '@/lib/deoflow/types';
import { cn } from '@/lib/cn';

/**
 * Appel à l'action de la carte. Rendu à l'intérieur du lien, il sait donc si
 * la navigation qu'il vient de déclencher est encore en cours — c'est le
 * clic le plus lent de l'application, l'atelier chargeant derrière.
 */
function ChooseCta() {
  const { pending } = useLinkStatus();

  return (
    <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-ember-600">
      {pending ? (
        <>
          <SpinnerIcon className="size-4" />
          Ouverture…
        </>
      ) : (
        <>
          Choisir ce modèle
          <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </>
      )}
    </span>
  );
}

export function ModelPicker({ kind }: { kind: MediaKind }) {
  const models = listModels(kind);
  const { credits, loading } = useCredits();

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => {
          // Un modèle vidéo facture à la seconde : on annonce le coût de la
          // durée la plus courte possible, sinon le chiffre affiché serait faux.
          const shortest = minBillableSeconds(model.slug);
          const entryCost = startingPrice(model.slug, shortest) ?? 0;
          // Tant que le solde est inconnu, on ne déclare rien inabordable :
          // marquer tout le catalogue « solde insuffisant » pendant une
          // seconde décourage avant même d'avoir regardé.
          const affordable = loading || entryCost <= credits;

          return (
            <li key={model.slug}>
              <AppLink
                href={`/create/${kind}?model=${model.slug}`}
                className="pressable card card-link group flex h-full cursor-pointer flex-col overflow-hidden p-0"
              >
                <ModelBanner model={model} />

                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-base">{model.name}</h3>
                      <p className="text-xs text-ink-300">{model.provider}</p>
                    </div>
                    <Badge tone={model.trait === 'quality' ? 'ink' : 'neutral'}>
                      {MODEL_TRAIT_LABELS[model.trait]}
                    </Badge>
                  </div>

                  <p className="line-clamp-2 flex-1 text-sm text-ink-500">{model.tagline}</p>

                  {/* Ce que le modèle réclame en entrée. Le découvrir sur la
                      carte évite d'ouvrir un atelier qu'on ne peut pas
                      remplir — Kling exige une vidéo, pas seulement un texte. */}
                  <p className="text-xs text-ink-300">{inputSummary(model.slug, kind)}</p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span
                      className={cn('font-medium', affordable ? 'text-ink-900' : 'text-ink-300')}
                    >
                      {entryCost} crédit{entryCost > 1 ? 's' : ''}
                      <span className="font-normal text-ink-500">
                        {kind === 'video' ? ` à partir de ${shortest} s` : ' par image'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-ink-300">
                      <ClockIcon className="size-3.5" />~{model.etaSeconds} s
                    </span>
                  </div>

                  <ChooseCta />
                </div>
              </AppLink>
            </li>
          );
        })}
      </ul>

      <AppLink
        href={`/models?kind=${kind}`}
        className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
      >
        Comparer les modèles en détail
        <ArrowRightIcon className="size-4" />
      </AppLink>
    </div>
  );
}
