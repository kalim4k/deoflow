// Landing publique Deoflow.
//
// Volontairement courte : hero centré → bandeau de formats → trois bénéfices
// → catalogue → tarifs → un seul CTA. Le brief interdit explicitement « une
// landing qui explique l'IA en 8 sections » et les hero à six boutons.

import Link from 'next/link';
import { SiteHeader } from '@/components/marketing/SiteHeader';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { buttonStyles } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { ArrowRightIcon, CheckIcon, ImageIcon, VideoIcon } from '@/components/icons';
import { AI_MODELS, MODEL_TRAIT_LABELS } from '@/lib/deoflow/catalog';
import { startingPrice } from '@/lib/deoflow/pricing';
import { minBillableSeconds } from '@/lib/deoflow/capabilities';
import { CREDIT_PACKS, pricePerCredit } from '@/lib/deoflow/packs';
import { ModelBanner } from '@/components/app/ModelBanner';
import type { AiModel } from '@/lib/deoflow/types';
import { formatAmount } from '@/lib/format';

export const runtime = 'nodejs';

// Formats natifs de sortie. Ce n'est pas un mur de logos « ils nous font
// confiance » — ce serait faux — mais une information vérifiable : le ratio
// que chaque plateforme attend, et que le catalogue sait produire.
const PLATFORMS: Array<{ name: string; ratio: string; kind: 'image' | 'video' }> = [
  { name: 'TikTok', ratio: '9:16', kind: 'video' },
  { name: 'Instagram Reels', ratio: '9:16', kind: 'video' },
  { name: 'YouTube Shorts', ratio: '9:16', kind: 'video' },
  { name: 'Snapchat', ratio: '9:16', kind: 'video' },
  { name: 'Facebook Reels', ratio: '9:16', kind: 'video' },
  { name: 'Statut WhatsApp', ratio: '9:16', kind: 'image' },
  { name: 'Post Instagram', ratio: '1:1', kind: 'image' },
  { name: 'Miniature YouTube', ratio: '16:9', kind: 'image' },
];

const BENEFITS = [
  {
    title: 'Un seul compte, tous les modèles',
    body: 'Nano Banana 2, GPT Image 2, Veo 3.1, Kling, Seedance — les modèles qui comptent, dans la même interface. Plus besoin de jongler entre cinq outils.',
  },
  {
    title: 'Payable en Mobile Money',
    body: 'Vous rechargez depuis votre téléphone, sans carte bancaire, avec le montant que vous avez. Les crédits n’expirent pas.',
  },
  {
    title: 'Vos créations restent à vous',
    body: 'Chaque génération part dans votre galerie avec son prompt. Vous la retéléchargez ou vous la relancez quand vous voulez, sans filigrane.',
  },
];

export default function Home() {
  // Trois modèles mis en avant : un image, deux vidéo — assez pour montrer
  // l'étendue du catalogue, pas assez pour noyer la page.
  const FEATURED_SLUGS = ['nano-banana-2', 'veo-3-1', 'kling-2-6'];
  const featured: AiModel[] = AI_MODELS.filter((m) => FEATURED_SLUGS.includes(m.slug));

  return (
    <>
      <SiteHeader />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pt-14 pb-14 sm:px-6 sm:pt-20">
        {/* Le discours d'abord, centré et resserré : une seule colonne de
            lecture, un seul CTA. Les aperçus viennent après, en preuve. */}
        <div className="flex flex-col items-center gap-6 text-center">
          <Badge tone="ember" className="rise-in">
            Mobile Money · sans carte bancaire
          </Badge>

          <h1
            className="rise-in max-w-3xl text-4xl leading-[1.05] sm:text-5xl lg:text-6xl"
            style={{ animationDelay: '70ms' }}
          >
            Votre influenceuse IA,
            <br />
            générée ce soir.
          </h1>

          <p className="rise-in max-w-xl text-lg text-ink-500" style={{ animationDelay: '140ms' }}>
            Images et vidéos avec les meilleurs modèles du marché, dans une seule interface, en
            français. Vous rechargez en mobile money, vous générez, vous téléchargez.
          </p>

          <div
            className="rise-in flex flex-col items-center gap-3"
            style={{ animationDelay: '210ms' }}
          >
            <Link href="/signup" className={buttonStyles('primary', 'lg')}>
              Créer mon compte
              <ArrowRightIcon className="size-4" />
            </Link>
            <span className="text-sm text-ink-300">
              À partir de {formatAmount(5000, 'XOF')} les 50 crédits
            </span>
          </div>

          {/* Ici se trouvaient « 4,8/5 » et « 500+ créateurs déjà inscrits »,
              cinq étoiles à l'appui. Ces nombres étaient inventés : Deoflow
              n'avait aucun utilisateur. Une note et une audience fictives sur
              une page de vente, c'est de la publicité trompeuse — retirées
              avant la mise en production. Elles pourront revenir le jour où
              elles seront vraies, et elles viendront alors d'une route
              d'agrégation, jamais d'une constante. */}
        </div>

        {/* Il y avait ici trois « aperçus » en grille. C'étaient des SVG
            dessinés localement, portant la mention « aperçu simulé » incrustée
            dans l'image, présentés comme « des rendus, pas une illustration
            décorative ». Retirés : la section « Les modèles disponibles » plus
            bas montre les VRAIS visuels des six modèles, ce qui rendait cette
            grille redondante autant que fausse. */}
      </section>

      {/* ── Formats de sortie (bandeau défilant) ──────────────────────── */}
      <section className="border-y border-line bg-surface py-6">
        <h2 className="mb-4 text-center text-xs font-medium text-ink-300">
          Des formats prêts à publier, sans recadrage
        </h2>

        <div className="marquee">
          {/* La liste est doublée pour que la boucle soit sans couture ; le
              second exemplaire est masqué aux lecteurs d'écran, sinon chaque
              plateforme serait annoncée deux fois. */}
          <ul className="marquee-track gap-3 px-1.5" aria-label="Formats de sortie disponibles">
            {[...PLATFORMS, ...PLATFORMS].map((platform, i) => {
              const Icon = platform.kind === 'video' ? VideoIcon : ImageIcon;
              return (
                <li
                  key={`${platform.name}-${i}`}
                  aria-hidden={i >= PLATFORMS.length ? true : undefined}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-canvas px-4 py-2 text-sm whitespace-nowrap text-ink-700"
                >
                  <Icon className="size-4 text-ink-300" />
                  {platform.name}
                  <span className="font-display text-xs text-ink-300">{platform.ratio}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── Bénéfices ─────────────────────────────────────────────────── */}
      {/* Pas de bordure haute : celle du bandeau ci-dessus fait déjà la
          séparation, deux filets collés donneraient un trait de 2 px. */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6">
          {BENEFITS.map((b) => (
            <div key={b.title} className="flex flex-col gap-2">
              <h2 className="font-display text-lg">{b.title}</h2>
              <p className="text-sm text-ink-500">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Catalogue ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl sm:text-3xl">Les modèles disponibles</h2>
          <Link
            href="/models"
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
          >
            Voir le catalogue complet
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3">
          {featured.map((model) => (
            <li key={model.slug} className="card overflow-hidden">
              <ModelBanner model={model} />
              <div className="flex flex-col gap-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base">{model.name}</h3>
                  <Badge tone={model.trait === 'quality' ? 'ink' : 'neutral'}>
                    {MODEL_TRAIT_LABELS[model.trait]}
                  </Badge>
                </div>
                <p className="text-sm text-ink-500">{model.tagline}</p>
                <p className="text-sm text-ink-900">
                  {model.kind === 'video' && 'À partir de '}
                  {startingPrice(model.slug, minBillableSeconds(model.slug)) ?? 0} crédits
                  <span className="text-ink-300">{model.kind === 'video' ? '' : ' / image'}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Tarifs ────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="mb-2 text-2xl sm:text-3xl">Vous payez ce que vous consommez</h2>
          <p className="mb-8 text-ink-500">
            Pas d&apos;abonnement. Vous achetez des crédits, ils n&apos;expirent pas.
          </p>

          <ul className="grid gap-4 sm:grid-cols-3">
            {CREDIT_PACKS.map((pack) => (
              <li
                key={pack.id}
                className={pack.badge === 'Populaire' ? 'card border-ink-900 p-6' : 'card p-6'}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base">{pack.name}</h3>
                  {pack.badge ? <Badge tone="ember">{pack.badge}</Badge> : null}
                </div>
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="font-display text-3xl">
                    {formatAmount(pack.priceFcfa, 'XOF')}
                  </span>
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  {pack.credits} crédits — {pricePerCredit(pack)} FCFA le crédit
                </p>
                <p className="mt-4 flex items-start gap-2 text-sm text-ink-500">
                  <CheckIcon className="mt-0.5 size-4 text-gain-600" />
                  {Math.floor(pack.credits / 24)} images, ou {Math.floor(pack.credits / 165)} clips
                  Kling de 5 s
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA final ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
        <h2 className="mx-auto max-w-xl text-3xl sm:text-4xl">
          Le prompt est déjà dans votre tête. Passez à l&apos;image.
        </h2>
        <div className="mt-8 flex justify-center">
          <Link href="/signup" className={buttonStyles('primary', 'lg')}>
            Créer mon compte
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
