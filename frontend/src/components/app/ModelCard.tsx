'use client';

import { AppLink } from '@/components/NavProgress';
import { Badge } from '@/components/ui/Feedback';
import { ModelBanner } from '@/components/app/ModelBanner';
import { MODEL_TRAIT_LABELS } from '@/lib/deoflow/catalog';
import { startingPrice } from '@/lib/deoflow/pricing';
import { minBillableSeconds } from '@/lib/deoflow/capabilities';
import type { AiModel } from '@/lib/deoflow/types';

/**
 * Carte du catalogue. Le coût est visible SANS clic (US2) et le libellé dit
 * l'unité de facturation — « par image » ou « par seconde » — parce que c'est
 * exactement là que se joue la mauvaise surprise.
 */
export function ModelCard({ model }: { model: AiModel }) {
  return (
    <AppLink
      href={`/models/${model.slug}`}
      className="pressable card card-link block cursor-pointer overflow-hidden p-0"
    >
      <ModelBanner model={model} />

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-display text-base">{model.name}</h3>
            <p className="text-xs text-ink-300">{model.provider}</p>
          </div>
          <Badge tone={model.trait === 'quality' ? 'ink' : 'neutral'}>
            {MODEL_TRAIT_LABELS[model.trait]}
          </Badge>
        </div>

        <p className="line-clamp-2 text-sm text-ink-500">{model.tagline}</p>

        {/* « à partir de » et non un prix ferme : chez Seedance et Gemini
            Omni, joindre une vidéo change la façon dont le fournisseur
            facture. Annoncer un tarif unique à la seconde serait faux. */}
        <p className="text-sm font-medium text-ink-900">
          {model.kind === 'video' && 'À partir de '}
          {startingPrice(model.slug, minBillableSeconds(model.slug)) ?? 0} crédits
          <span className="font-normal text-ink-500">
            {model.kind === 'video' ? '' : ' par image'}
          </span>
        </p>
      </div>
    </AppLink>
  );
}
