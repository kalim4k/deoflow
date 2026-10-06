/**
 * Extrait du catalogue les chiffres affichés dans la vidéo de démonstration.
 *
 *   pnpm --filter frontend run demo:facts
 *
 * Écrit `demo-video/src/facts.json`. La vidéo montre des prix, un pack, un
 * solde qui descend : tapés à la main dans la composition, ils divergeraient
 * du site au premier changement de grille, et la page d'accueil afficherait un
 * tarif que l'atelier ne pratique pas. Ils sortent donc des mêmes fonctions que
 * l'application — `priceCredits`, `startingPrice`, `inputSummary`.
 *
 * `demo-video/scripts/render.mjs` relance ce script avant chaque rendu.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_MODELS, MODEL_TRAIT_LABELS } from '../src/lib/deoflow/catalog';
import { inputSummary, minBillableSeconds } from '../src/lib/deoflow/capabilities';
import { CREDIT_PACKS, pricePerCredit } from '../src/lib/deoflow/packs';
import { priceCredits, startingPrice } from '../src/lib/deoflow/pricing';
import { formatAmount } from '../src/lib/format';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../demo-video/src/facts.json');

function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Introuvable : ${what}`);
  return value;
}

const packs = CREDIT_PACKS.map((p) => ({
  name: p.name,
  badge: p.badge,
  credits: p.credits,
  price: formatAmount(p.priceFcfa, 'XOF'),
  perCredit: pricePerCredit(p),
  // Mêmes divisions que la page de recharge — voir `wallet/topup/page.tsx`.
  images: Math.floor(p.credits / 24),
  klingClips: Math.floor(p.credits / 165),
}));

const videoModels = AI_MODELS.filter((m) => m.kind === 'video' && m.active).map((m) => {
  const shortest = minBillableSeconds(m.slug);
  return {
    slug: m.slug,
    name: m.name,
    provider: m.provider,
    tagline: m.tagline,
    trait: m.trait,
    traitLabel: MODEL_TRAIT_LABELS[m.trait],
    etaSeconds: m.etaSeconds,
    shortest,
    startingPrice: must(startingPrice(m.slug, shortest), `prix de ${m.slug}`),
    inputSummary: inputSummary(m.slug, 'video'),
  };
});

const faceModel = (slug: string) => ({
  slug,
  name: must(
    AI_MODELS.find((m) => m.slug === slug),
    slug,
  ).name,
  cost: must(priceCredits(slug), `prix de ${slug}`),
});

const facts = {
  $comment:
    'Généré par frontend/scripts/demo-facts.ts à partir du catalogue — ne pas éditer à la main.',
  starterPack: must(packs[0], 'pack de départ'),
  packs,
  faceModels: [faceModel('nano-banana-2'), faceModel('gpt-image-2')],
  videoModels,
  veo: {
    seconds: 8,
    cost720: must(priceCredits('veo-3-1', { params: { resolution: '720p' } }), 'Veo 720p'),
    cost1080: must(priceCredits('veo-3-1', { params: { resolution: '1080p' } }), 'Veo 1080p'),
  },
};

// Pas d'`await` au niveau racine : `frontend` est un paquet CommonJS.
writeFile(OUT, JSON.stringify(facts, null, 2) + '\n')
  .then(() => console.log(`→ ${OUT}`))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
