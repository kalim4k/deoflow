// Contrats de données Deoflow.
//
// ⚠️ Ces types décrivent le domaine du PRD (modèles IA, générations, crédits)
// qui n'existe PAS encore côté serveur : le schéma Prisma s'arrête à
// User / Order / Withdrawal / Notification. Toute la couche `lib/deoflow/`
// est une simulation destinée à être remplacée par de vrais appels — les
// signatures de `client.ts` sont écrites pour que la bascule tienne dans ce
// seul dossier.
//
// Deux règles héritées du dépôt s'appliquent quand même ici :
//   - les montants en FCFA sont des ENTIERS (le franc CFA n'a pas de décimale) ;
//   - les crédits sont des entiers.

export type MediaKind = 'image' | 'video';

/** Étiquette d'aide au choix pour les débutants (F7 du PRD). */
export type ModelTrait = 'fast' | 'quality';

export interface AiModel {
  slug: string;
  name: string;
  provider: string;
  kind: MediaKind;
  /** Résumé d'une ligne, affiché dans la liste du catalogue. */
  tagline: string;
  description: string;
  trait: ModelTrait;
  // Le prix n'est PAS ici : il se déduit du coût kie.ai, qui varie selon le
  // mode et la présence d'une vidéo de référence. Voir `pricing.ts`, et
  // `priceCredits()` pour obtenir le prix d'une génération donnée.
  // La durée n'est PAS ici : elle est parfois choisie, parfois imposée par le
  // fournisseur, parfois mesurée sur le fichier envoyé. Voir `DurationSpec`
  // dans `capabilities.ts`, et `durationLabel()` pour l'affichage.
  /**
   * Formats proposés — sous-ensemble commercial de ce que l'API accepte, le
   * vertical en premier. Vide quand le modèle n'expose aucun réglage de
   * format (Kling reprend celui de la vidéo de référence).
   */
  ratios: string[];
  /** Durée typique d'une génération, en secondes — sert à l'estimation affichée. */
  etaSeconds: number;
  /**
   * Chemin de base du visuel de marque, sans extension ni suffixe de taille —
   * `illustrationSrc()` compose le fichier réel. `null` pour un modèle sans
   * visuel : l'interface retombe alors sur un aperçu généré localement.
   */
  illustration: string | null;
  active: boolean;
}

export type GenerationStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface Generation {
  id: string;
  kind: MediaKind;
  modelSlug: string;
  modelName: string;
  prompt: string;
  /** Ratio pour une image, `null` pour une vidéo. */
  ratio: string | null;
  /** Durée en secondes pour une vidéo, `null` pour une image. */
  durationSeconds: number | null;
  credits: number;
  status: GenerationStatus;
  /** Aperçu simulé (data URI SVG). Aucune ressource externe n'est chargée. */
  previewUrl: string;
  failureReason: string | null;
  createdAt: string;
}

export type CreditMovement = 'PURCHASE' | 'GENERATION' | 'ADMIN_ADJUSTMENT' | 'REFUND';

export interface CreditTransaction {
  id: string;
  movement: CreditMovement;
  /** Positif pour un ajout, négatif pour une consommation. */
  credits: number;
  label: string;
  /** Montant payé en FCFA (entier) — uniquement pour un achat. */
  amountFcfa: number | null;
  createdAt: string;
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  /** Prix payé, en FCFA entier. */
  priceFcfa: number;
  badge: string | null;
}

export type PaymentMethod = 'TMONEY' | 'FLOOZ';

export type PurchaseStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface Purchase {
  id: string;
  packId: string;
  packName: string;
  credits: number;
  amountFcfa: number;
  method: PaymentMethod;
  phone: string;
  status: PurchaseStatus;
  failureReason: string | null;
  createdAt: string;
}

export interface Wallet {
  credits: number;
  transactions: CreditTransaction[];
}

/** Seuil sous lequel on incite à recharger (F21 du PRD). */
export const LOW_BALANCE_THRESHOLD = 5;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TMONEY: 'Tmoney',
  FLOOZ: 'Flooz',
};
