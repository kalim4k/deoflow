import type { AiModel } from './types';

// Catalogue des modèles proposés par Deoflow.
//
// Les noms, fournisseurs, capacités et durées ci-dessous décrivent des modèles
// RÉELS, vérifiés en août 2026 (sources dans les descriptions de commit et la
// conversation d'origine). Les APIs ne sont pas encore branchées : la
// génération reste simulée, mais le catalogue, lui, ne raconte rien de faux.
//
// Les PRIX ne sont pas ici : ils se déduisent du coût kie.ai, qui dépend du
// mode et de la présence d'une vidéo de référence. Voir `pricing.ts`.
//
// Les entrées acceptées et la durée ne sont PAS décrites ici non plus : elles relèvent
// du contrat du fournisseur, tenu dans `capabilities.ts`. Ce fichier ne garde
// que ce qui est une décision Deoflow — nom, promesse, prix, formats proposés.

export const AI_MODELS: AiModel[] = [
  {
    slug: 'nano-banana-2',
    name: 'Nano Banana 2',
    provider: 'Google',
    kind: 'image',
    tagline: 'Qualité haut de gamme à vitesse réduite, et un texte enfin lisible.',
    description:
      'Sorti en février 2026 et bâti sur Gemini 3.1 Flash Image. Il vise la qualité des modèles Pro avec la vitesse et le coût d’un modèle Flash, suit les consignes de près et rend correctement le texte incrusté — le point faible historique des générateurs d’images. Sait aussi chercher des références visuelles sur le web avant de générer.',
    trait: 'fast',
    ratios: ['9:16', '1:1', '16:9'],
    etaSeconds: 6,
    illustration: '/models/nano-banana-2',
    active: true,
  },
  {
    slug: 'gpt-image-2',
    name: 'GPT Image 2',
    provider: 'OpenAI',
    kind: 'image',
    tagline: 'Le plus fidèle quand le prompt enchaîne les contraintes.',
    description:
      'Le modèle image d’OpenAI. Il tient le cap quand la description empile pose, décor, style et texte à la fois. Nettement plus cher en haute définition chez le fournisseur : à réserver aux visuels que vous publiez vraiment, pas aux essais.',
    trait: 'quality',
    ratios: ['9:16', '1:1', '16:9'],
    etaSeconds: 15,
    illustration: '/models/gpt-image-2',
    active: true,
  },
  {
    slug: 'veo-3-1',
    name: 'Veo 3.1',
    provider: 'Google DeepMind',
    kind: 'video',
    tagline: 'Qualité cinéma, avec le son.',
    description:
      'La révision courante de Veo 3, chez Google DeepMind. Plans larges, mouvements de caméra, profondeur de champ et audio natif. Le plus cher du catalogue, et de loin : à réserver aux vidéos que vous comptez publier. La longueur du clip est imposée par le modèle.',
    trait: 'quality',
    // Le vertical d'abord : la cible publie sur TikTok, pas sur YouTube.
    ratios: ['9:16', '16:9'],
    etaSeconds: 120,
    illustration: '/models/veo-3-1',
    active: true,
  },
  {
    slug: 'kling-2-6',
    name: 'Kling 2.6 Motion Control',
    provider: 'Kuaishou',
    kind: 'video',
    tagline: 'Transfère un mouvement filmé sur votre personnage.',
    description:
      'La fonction Motion Control de Kling : vous fournissez une vidéo de référence et l’image d’un personnage, et le mouvement du corps comme les expressions du visage sont reportés dessus. Le visage reste stable en rotation et en plan long. C’est l’outil pour faire bouger une influenceuse IA sans qu’elle change de tête en cours de plan. La vidéo produite dure aussi longtemps que celle que vous déposez : jusqu’à 30 secondes quand le personnage suit l’orientation de la vidéo, 10 secondes quand il garde celle de l’image.',
    trait: 'quality',
    ratios: [],
    etaSeconds: 90,
    illustration: '/models/kling-2-6',
    active: true,
  },
  {
    slug: 'seedance-2-5',
    name: 'Seedance 2.5',
    provider: 'ByteDance',
    kind: 'video',
    tagline: 'Jusqu’à 30 secondes d’un seul tenant.',
    description:
      'Le modèle de ByteDance ouvert aux développeurs début août 2026. Il produit jusqu’à 30 secondes en une seule passe là où les autres plafonnent autour de 10, et c’est le seul du catalogue à accepter des images, des vidéos ET des sons en référence — ou une première et une dernière image entre lesquelles composer. Il génère l’audio avec l’image. Attention à la facture : c’est de loin le plus cher à la seconde, et 30 secondes dépassent le Pack Pro à elles seules.',
    trait: 'quality',
    ratios: ['9:16', '16:9', '1:1'],
    etaSeconds: 100,
    illustration: '/models/seedance-2-5',
    active: true,
  },
  {
    slug: 'gemini-omni-flash',
    name: 'Gemini Omni Flash',
    provider: 'Google',
    kind: 'video',
    tagline: 'Le brouillon rapide — texte, image, vidéo ou voix.',
    description:
      'Sorti fin juin 2026, taillé pour la cadence plutôt que pour la perfection : moins juste que Veo sur les scènes physiques complexes, mais bien plus rapide et bien moins cher. Il accepte quatre natures d’entrée — texte, image, vidéo et voix — et sait retoucher un clip existant : changer le décor, l’action ou le point de vue en gardant la scène cohérente. Clips d’une dizaine de secondes à partir d’un texte ; avec une vidéo en entrée, il en reprend la longueur.',
    trait: 'fast',
    ratios: ['9:16', '16:9'],
    etaSeconds: 45,
    illustration: '/models/gemini-omni-flash',
    active: true,
  },
];

export const MODEL_TRAIT_LABELS = {
  fast: 'Rapide',
  quality: 'Haute qualité',
} as const;

/**
 * Fichier réel du visuel de marque d'un modèle.
 *
 * Deux tailles pré-encodées en WebP dans `public/models` : `card` (640 px)
 * pour les grilles, `full` (1400 px) pour la fiche. Servir la grande version
 * dans une vignette ferait télécharger dix fois trop d'octets — la cible est
 * sur une 4G instable.
 *
 * Renvoie `null` quand le modèle n'a pas de visuel ; l'appelant retombe alors
 * sur `previewDataUri()`.
 */
export function illustrationSrc(model: AiModel, size: 'card' | 'full' = 'card'): string | null {
  if (!model.illustration) return null;
  return size === 'card' ? `${model.illustration}-card.webp` : `${model.illustration}.webp`;
}

export function findModel(slug: string): AiModel | undefined {
  return AI_MODELS.find((m) => m.slug === slug);
}
