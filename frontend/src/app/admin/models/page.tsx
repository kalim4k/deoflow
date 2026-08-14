'use client';

// Catalogue des modèles — inspecteur en LECTURE SEULE.
//
// L'écran proposait auparavant d'activer et de désactiver un modèle. C'étaient
// de faux interrupteurs : le catalogue vit dans `lib/deoflow/catalog.ts`, un
// fichier statique, et le basculement ne survivait pas au rechargement. Un
// bouton qui ne fait rien est pire qu'un bouton absent — il fait croire qu'un
// modèle défaillant a été coupé alors qu'il continue de facturer.
//
// Le PRD prévoyait aussi de modifier un prix ici. Ce n'est pas souhaitable :
// le prix se DÉDUIT du coût kie.ai (`pricing.ts`), et le saisir à la main
// revient à le décorréler du coût réel — exactement le risque que l'écran
// devait écarter. Ce qu'il faut pouvoir corriger quand kie.ai bouge, c'est le
// coût fournisseur, et ça se fait par déploiement.
//
// Ce que l'écran apporte donc : la marge réelle par modèle, qu'aucune autre
// surface ne montre.

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { TableShell, Td, Th, Tr } from '@/components/ui/Table';
import { Badge, StatusBadge } from '@/components/ui/Feedback';
import { AI_MODELS, MODEL_TRAIT_LABELS } from '@/lib/deoflow/catalog';
import { CREDIT_FCFA, MARGIN, kieCost, startingPrice } from '@/lib/deoflow/pricing';
import { minBillableSeconds } from '@/lib/deoflow/capabilities';
import { formatAmount } from '@/lib/format';

export default function AdminModelsPage() {
  return (
    <>
      <AdminPageHeader
        title="Modèles IA"
        description={`Coût fournisseur, prix de vente (×${MARGIN}) et marge, modèle par modèle.`}
      />

      <TableShell>
        <thead>
          <tr>
            <Th>Modèle</Th>
            <Th>Type</Th>
            <Th>Profil</Th>
            <Th className="text-right">Coût kie.ai</Th>
            <Th className="text-right">Prix de vente</Th>
            <Th className="text-right">Marge</Th>
            <Th>Statut</Th>
          </tr>
        </thead>
        <tbody>
          {AI_MODELS.map((m) => {
            // Cas le moins cher : durée minimale, aucune vidéo jointe. C'est
            // aussi ce que le catalogue annonce au créateur.
            const seconds = minBillableSeconds(m.slug);
            const cost = kieCost(m.slug, { seconds, hasVideoInput: false });
            const price = startingPrice(m.slug, seconds);
            const unit = m.kind === 'video' ? ` (${seconds} s)` : '';
            // Marge en FCFA plutôt qu'en crédits : c'est l'unité dans laquelle
            // on encaisse et dans laquelle on paie kie.ai. En crédits, l'écart
            // se lit mais ne se compare à rien.
            const marginFcfa =
              cost !== null && price !== null ? (price - cost) * CREDIT_FCFA : null;

            return (
              <Tr key={m.slug}>
                <Td>
                  <span className="block font-medium text-ink-900">{m.name}</span>
                  <span className="font-mono text-xs text-ink-300">{m.slug}</span>
                </Td>
                <Td>
                  <Badge tone="neutral">{m.kind === 'video' ? 'Vidéo' : 'Image'}</Badge>
                </Td>
                <Td>
                  <Badge tone={m.trait === 'quality' ? 'ink' : 'neutral'}>
                    {MODEL_TRAIT_LABELS[m.trait]}
                  </Badge>
                </Td>
                <Td className="text-right whitespace-nowrap text-ink-500">{cost ?? '—'} cr.</Td>
                <Td className="text-right font-medium whitespace-nowrap text-ink-900">
                  {price ?? '—'} cr.
                  <span className="text-ink-300">{unit}</span>
                </Td>
                <Td className="text-right font-display whitespace-nowrap tabular-nums text-gain-600">
                  {marginFcfa !== null ? formatAmount(marginFcfa) : '—'}
                </Td>
                <Td>
                  <StatusBadge status={m.active ? 'ACTIVE' : 'INACTIVE'} />
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </TableShell>

      <p className="mt-4 max-w-2xl text-sm text-ink-500">
        Cet écran est en lecture seule, et c’est délibéré. Les prix ne se saisissent pas : ils
        valent {MARGIN} fois le coût kie.ai, arrondi au crédit supérieur. Un tarif fournisseur qui
        change se corrige dans <code className="font-mono text-xs">pricing.ts</code>, et toute la
        grille suit — y compris ce que voient les créateurs. Retirer un modèle du catalogue se fait
        de la même façon, par déploiement.
      </p>
    </>
  );
}
