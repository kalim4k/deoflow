/**
 * Tarification — dérivée du coût fournisseur, jamais saisie à la main.
 *
 * Le crédit Deoflow **est** le crédit kie.ai : même valeur d'achat, 1000
 * crédits pour 3000 FCFA (≈ 5 $), exactement le tarif du fournisseur. Ce qui
 * diffère est la consommation : une génération qui coûte 8 crédits chez kie.ai
 * en coûte 24 chez nous. La marge est donc lisible d'un coup d'œil par le
 * créateur comme par le propriétaire, et tient dans une seule constante.
 *
 * Les prix ne sont pas recopiés modèle par modèle : on décrit le **coût**
 * kie.ai, et le prix s'en déduit. Recopier un prix, c'est accepter qu'il se
 * désynchronise le jour où le fournisseur bouge — et une grille désynchronisée
 * ne se remarque qu'en lisant le relevé bancaire.
 *
 * Coûts relevés sur les fiches modèles de kie.ai le 13/08/2026, aux réglages
 * que l'application verrouille : images en 1K, vidéo en 720p sauf chez Veo, où
 * la définition est proposée au créateur. Recoupés par la
 * mesure : deux images Nano Banana ont fait passer le solde kie.ai de 1844,8 à
 * 1828,8 — 8 crédits l'image, soit le tarif publié au chiffre près.
 */

/** Ce que le créateur paie pour ce que le fournisseur nous coûte. */
export const MARGIN = 3;

/** Valeur d'un crédit en FCFA — identique à l'achat chez kie.ai (5 $ = 1000). */
export const CREDIT_FCFA = 3;

export interface PriceContext {
  /** Durée facturée du rendu. Ignorée pour une image ou un clip imposé. */
  seconds?: number;
  /**
   * Une vidéo figure-t-elle parmi les références ? Change le mode de calcul
   * chez Seedance et chez Gemini Omni, dans des directions opposées.
   */
  hasVideoInput?: boolean;
  /**
   * Réglages choisis par le créateur. Seuls comptent ici ceux qui changent le
   * coût — aujourd'hui la définition de Veo. Un réglage affiché qui ne se
   * répercuterait pas sur le prix ferait payer autre chose que ce qui est
   * montré.
   */
  params?: Record<string, string | boolean>;
}

/**
 * Coût kie.ai, en crédits kie.ai. Une variante par forme de facturation :
 * les aplatir en un « prix à la seconde » unique était précisément le défaut
 * de la première grille — il surfacturait les modes simples et sous-facturait
 * ceux à vidéo, les seuls que nos créateurs utiliseront vraiment.
 */
type KieCost =
  /** Prix fixe par image. */
  | { kind: 'image'; credits: number }
  /**
   * Prix fixe par clip — la durée est imposée — mais variable selon un
   * réglage choisi par le créateur (la définition, chez Veo).
   */
  | { kind: 'clip'; key: string; credits: Record<string, number>; fallback: string }
  /** Prix linéaire à la seconde. */
  | { kind: 'perSecond'; credits: number }
  /**
   * Seedance : `withoutVideo` × sortie, ou `withVideo` × (entrée + sortie).
   * L'unité paraît moins chère avec une vidéo, mais elle porte deux fois la
   * durée — donc coûte plus cher en pratique.
   */
  | { kind: 'seedance'; withoutVideo: number; withVideo: number }
  /**
   * Gemini Omni : une part fixe plus une part à la seconde tant qu'aucune
   * vidéo n'est fournie, et un forfait dès qu'il y en a une.
   */
  | { kind: 'gemini'; base: number; perSecond: number; withVideo: number };

const KIE_COSTS: Record<string, KieCost> = {
  // 8 crédits en 1K (12 en 2K, 18 en 4K — nous verrouillons le 1K).
  'nano-banana-2': { kind: 'image', credits: 8 },
  // 6 crédits en 1K : moins cher que Nano Banana, ce que l'ancienne grille
  // ignorait en le facturant deux fois plus.
  'gpt-image-2': { kind: 'image', credits: 6 },
  // Mode **Lite** (`model: 'veo3_lite'`), facturé au clip quelle que soit sa
  // durée. Fast coûterait 60 et Quality 250 — voir la note en bas de fichier.
  'veo-3-1': {
    kind: 'clip',
    key: 'resolution',
    credits: { '720p': 30, '1080p': 35 },
    fallback: '720p',
  },
  // Tarif propre à Motion Control, confirmé par la fiche du modèle.
  'kling-2-6': { kind: 'perSecond', credits: 11 },
  'seedance-2-5': { kind: 'seedance', withoutVideo: 63, withVideo: 38 },
  // 4 s → 63, 6 s → 84, 8 s → 105, 10 s → 126 : 21 de part fixe, 10,5 par
  // seconde. Avec une vidéo, 168 quelle que soit la durée.
  'gemini-omni-flash': { kind: 'gemini', base: 21, perSecond: 10.5, withVideo: 168 },
};

/** Coût fournisseur d'une génération, en crédits kie.ai. */
export function kieCost(slug: string, ctx: PriceContext = {}): number | null {
  const cost = KIE_COSTS[slug];
  if (!cost) return null;

  const seconds = Math.max(1, Math.ceil(ctx.seconds ?? 1));

  switch (cost.kind) {
    case 'image':
      return cost.credits;
    case 'clip': {
      const chosen = ctx.params?.[cost.key];
      const key = typeof chosen === 'string' && chosen in cost.credits ? chosen : cost.fallback;
      // `?? 0` est inatteignable — `fallback` est une clé de la table — mais le
      // typage l'exige, et renvoyer 0 vaudrait mieux que planter en pleine
      // page de tarifs.
      return cost.credits[key] ?? 0;
    }
    case 'perSecond':
      return cost.credits * seconds;
    case 'seedance':
      // La durée de la vidéo de référence n'est pas connue du serveur, et une
      // valeur annoncée par le navigateur ne se facture pas. On retient donc
      // l'hypothèse défavorable — référence aussi longue que le rendu — plutôt
      // que de risquer de vendre à perte.
      return ctx.hasVideoInput ? cost.withVideo * seconds * 2 : cost.withoutVideo * seconds;
    case 'gemini':
      return ctx.hasVideoInput ? cost.withVideo : cost.base + cost.perSecond * seconds;
  }
}

/**
 * Prix d'une génération, en crédits Deoflow. `null` si le modèle est inconnu —
 * l'appelant doit refuser plutôt que d'inventer un prix.
 */
export function priceCredits(slug: string, ctx: PriceContext = {}): number | null {
  const cost = kieCost(slug, ctx);
  if (cost === null) return null;
  // Arrondi au crédit supérieur : le fournisseur facture des dixièmes, pas
  // nous. Arrondir vers le bas rognerait la marge sur chaque génération.
  return Math.ceil(cost * MARGIN);
}

/** Une vidéo de référence est-elle jointe ? Vrai dès qu'une URL est une vidéo. */
export function hasVideoInput(media: Record<string, string[]> | undefined): boolean {
  if (!media) return false;
  // Nos références passent toutes par notre route d'envoi, donc par Cloudinary,
  // qui range les vidéos sous `/video/upload/`. Le type vient ainsi du stockage
  // et non d'une déclaration du navigateur.
  return Object.values(media)
    .flat()
    .some((url) => url.includes('/video/upload/'));
}

/**
 * Prix plancher affiché sur les cartes du catalogue (« à partir de N crédits »).
 * Toujours le cas le moins cher : durée minimale, aucune vidéo jointe.
 */
export function startingPrice(slug: string, minSeconds: number): number | null {
  return priceCredits(slug, { seconds: minSeconds, hasVideoInput: false });
}

/**
 * ⚠️ Veo tourne en mode **Lite**, décidé par le propriétaire : 30 crédits
 * kie.ai le clip en 720p, contre 60 en Fast et 250 en Quality. C'est huit fois
 * moins cher que Quality pour un format vertical où l'écart de rendu se voit
 * peu. Remonter en gamme se fait en deux endroits — l'identifiant dans
 * `lib/server/ai/kie.ts` et le coût ci-dessus — et les deux doivent bouger
 * ensemble, sinon on vend un rendu au prix d'un autre.
 */
export const VEO_MODE_NOTE = 'veo3_lite = Lite, 30 crédits kie.ai en 720p';
