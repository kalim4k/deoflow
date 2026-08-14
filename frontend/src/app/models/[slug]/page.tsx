'use client';

// Fiche modèle (3.6 du PRD) : description complète, exemples, paramètres
// disponibles et coût détaillé. Le bouton mène à l'écran de génération
// correspondant, modèle pré-sélectionné.

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app/AppShell';
import { buttonStyles } from '@/components/ui/Button';
import { Badge, Card } from '@/components/ui/Feedback';
import { ModelBanner } from '@/components/app/ModelBanner';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons';
import { findModel, MODEL_TRAIT_LABELS } from '@/lib/deoflow/catalog';
import { capabilitiesFor, durationLabel, minBillableSeconds } from '@/lib/deoflow/capabilities';
import { startingPrice } from '@/lib/deoflow/pricing';

export default function ModelDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const model = findModel(slug);
  if (!model) notFound();

  const createHref = `/create/${model.kind === 'video' ? 'video' : 'image'}?model=${model.slug}`;
  const modes = capabilitiesFor(model.slug)?.modes ?? [];
  const duration = durationLabel(model.slug);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link
          href="/models"
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
        >
          <ArrowLeftIcon className="size-4" />
          Tous les modèles
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl sm:text-3xl">{model.name}</h1>
              <Badge tone={model.trait === 'quality' ? 'ink' : 'neutral'}>
                {MODEL_TRAIT_LABELS[model.trait]}
              </Badge>
              <Badge tone="neutral">{model.kind === 'video' ? 'Vidéo' : 'Image'}</Badge>
            </div>
            <p className="text-sm text-ink-500">{model.provider}</p>
          </div>

          <Link href={createHref} className={buttonStyles('primary', 'md')}>
            Utiliser ce modèle
            <ArrowRightIcon className="size-4" />
          </Link>
        </header>

        {/* Visuel de marque du modèle : il sert à le reconnaître, pas à
            montrer un rendu. */}
        <ModelBanner model={model} size="full" className="rounded-2xl border border-line" />

        {/* Il y avait ici une grille de trois « aperçus » : des SVG générés
            localement, portant la mention « aperçu simulé » incrustée dans
            l'image. Retirés — la génération réelle tourne, et montrer de faux
            exemples sur la fiche d'un modèle payant est une promesse qu'on ne
            tient pas. Le jour où de vrais rendus de référence existent, ils
            viendront d'une table, pas d'une fonction de dessin. */}

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-3">
              <h2 className="font-display text-lg">Ce que fait ce modèle</h2>
              <p className="text-sm text-ink-500">{model.description}</p>
            </Card>

            {/* Les entrées attendues, mode par mode. C'est la question à
                laquelle il faut répondre AVANT d'ouvrir l'atelier : inutile
                d'y arriver pour découvrir qu'il manque une vidéo. */}
            {modes.length > 0 && (
              <Card className="flex flex-col gap-4">
                <h2 className="font-display text-lg">Ce dont il a besoin</h2>
                <ul className="flex flex-col gap-4">
                  {modes.map((mode) => (
                    <li key={mode.id} className="flex flex-col gap-1.5">
                      <p className="text-sm font-medium text-ink-900">{mode.label}</p>
                      <p className="text-sm text-ink-500">{mode.description}</p>
                      <ul className="flex flex-wrap gap-2 pt-0.5">
                        {mode.slots.map((slot) => (
                          <li key={slot.key}>
                            <Badge tone={slot.requirement === 'required' ? 'ink' : 'neutral'}>
                              {slot.label}
                              {slot.requirement === 'optional' && ' (optionnel)'}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-lg">Coût et paramètres</h2>

            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-500">Tarif</dt>
                <dd className="font-display text-ink-900">
                  {model.kind === 'video' && 'à partir de '}
                  {startingPrice(model.slug, minBillableSeconds(model.slug)) ?? 0} crédits
                  <span className="text-ink-500">{model.kind === 'video' ? '' : ' / image'}</span>
                </dd>
              </div>

              {model.kind === 'video' && duration && (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-500">Durée</dt>
                    <dd className="text-right text-ink-900">{duration}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-500">À partir de</dt>
                    <dd className="text-ink-900">
                      {startingPrice(model.slug, minBillableSeconds(model.slug)) ?? 0} crédits
                      <span className="text-ink-500"> ({minBillableSeconds(model.slug)} s)</span>
                    </dd>
                  </div>
                </>
              )}

              {model.ratios.length > 0 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-500">Formats</dt>
                  <dd className="text-ink-900">{model.ratios.join(' · ')}</dd>
                </div>
              )}

              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-500">Temps habituel</dt>
                <dd className="text-ink-900">~{model.etaSeconds} s</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
