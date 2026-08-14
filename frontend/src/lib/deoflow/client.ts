'use client';

// Surface publique de la couche simulée — LE seul fichier à réécrire quand le
// backend Deoflow existera. Les signatures sont volontairement asynchrones et
// « API-like » : chaque méthode deviendra un `api('/api/…')` du wrapper maison
// (frontend/src/lib/api.ts) sans que les écrans changent d'une ligne.
//
// Ce qui est simulé : catalogue, générations, crédits, achats.
// Ce qui est réel   : l'authentification (AuthContext + /api/auth/*).

import { AI_MODELS, findModel } from './catalog';
import { priceCredits } from './pricing';
import { minBillableSeconds, type ParamValues } from './capabilities';
import { CREDIT_PACKS, findPack } from './packs';
import { previewDataUri } from './placeholder';
import {
  applyCredit,
  applyDebit,
  deoflowStore,
  removeGeneration,
  upsertGeneration,
  upsertPurchase,
  type DeoflowState,
} from './store';
import type { AiModel, CreditPack, Generation, MediaKind, PaymentMethod, Purchase } from './types';

function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── Catalogue ─────────────────────────────────────────────────────────── */

export function listModels(kind?: MediaKind): AiModel[] {
  const active = AI_MODELS.filter((m) => m.active);
  return kind ? active.filter((m) => m.kind === kind) : active;
}

export { findModel, findPack };

export function listPacks(): CreditPack[] {
  return CREDIT_PACKS;
}

/* ── Coût d'une génération ─────────────────────────────────────────────── */

export interface GenerationRequest {
  modelSlug: string;
  prompt: string;
  /** Mode d'entrée retenu — voir `capabilities.ts` (`text`, `image`, `motion`…). */
  mode?: string | null;
  ratio?: string | null;
  durationSeconds?: number | null;
  /** Réglages déclarés par le modèle (orientation, son généré…). */
  params?: ParamValues;
  /**
   * Médias de référence, indexés par CLÉ D'EMPLACEMENT de l'API
   * (`first_frame_url`, `reference_video_urls`…). Ici ce sont des aperçus
   * locaux (object URLs) ; le vrai backend recevra des URLs PUBLIQUES — les
   * fournisseurs téléchargent les références depuis leurs serveurs, un `blob:`
   * local ne leur dit rien. Le téléversement s'intercalera donc entre l'écran
   * et l'appel de génération.
   */
  media?: Record<string, string[]>;
}

/**
 * Coût annoncé AVANT lancement (F10/F16). Une image coûte le tarif du modèle ;
 * une vidéo coûte ce tarif multiplié par la durée choisie, ce qui rend le
 * total réactif au sélecteur de durée.
 */
export function quote(model: AiModel, durationSeconds: number | null): number {
  return (
    priceCredits(model.slug, {
      seconds: durationSeconds ?? minBillableSeconds(model.slug),
      hasVideoInput: false,
    }) ?? 0
  );
}

/* ── Générations ───────────────────────────────────────────────────────── */

/**
 * Lance une génération : débit du solde d'abord (il échoue si le solde est
 * insuffisant, avant toute écriture), puis attente simulée, puis résultat.
 * L'appelant reçoit la génération en cours et peut suivre son statut via le
 * store — le même contrat qu'aurait une vraie file d'attente serveur.
 */
export async function generate(request: GenerationRequest): Promise<Generation> {
  const model = findModel(request.modelSlug);
  if (!model) throw new Error('Modèle introuvable.');

  const duration =
    model.kind === 'video' ? (request.durationSeconds ?? minBillableSeconds(model.slug)) : null;
  const credits = quote(model, duration);
  const id = newId('gen');
  const now = new Date().toISOString();

  const pending: Generation = {
    id,
    kind: model.kind,
    modelSlug: model.slug,
    modelName: model.name,
    prompt: request.prompt,
    // Les modèles vidéo exposent eux aussi un format (9:16 pour TikTok) :
    // le ratio n'est nul que là où le fournisseur n'offre aucun réglage.
    ratio: request.ratio ?? model.ratios[0] ?? null,
    durationSeconds: duration,
    credits,
    status: 'RUNNING',
    previewUrl: '',
    failureReason: null,
    createdAt: now,
  };

  // Débit AVANT la mise en file : applyDebit lève si le solde ne couvre pas,
  // et rien n'est écrit dans ce cas.
  deoflowStore.update((state: DeoflowState) => {
    const debited = applyDebit(state, {
      id: newId('tx'),
      credits,
      movement: 'GENERATION',
      label: `${model.name} · ${model.kind === 'video' ? `${duration}s` : (pending.ratio ?? '')}`,
      createdAt: now,
    });
    return upsertGeneration(debited, pending);
  });

  // Latence simulée, bornée pour ne pas rendre la démo pénible.
  await wait(Math.min(model.etaSeconds, 6) * 1000);

  const done: Generation = {
    ...pending,
    status: 'SUCCEEDED',
    previewUrl: previewDataUri(`${id}-${request.prompt}`, model.kind, pending.ratio),
  };
  deoflowStore.update((state) => upsertGeneration(state, done));
  return done;
}

export async function deleteGeneration(id: string): Promise<void> {
  await wait(200);
  deoflowStore.update((state) => removeGeneration(state, id));
}

/* ── Achat de crédits ──────────────────────────────────────────────────── */

export interface PurchaseRequest {
  packId: string;
  method: PaymentMethod;
  phone: string;
}

/**
 * Achat de crédits en mobile money. Le flux réel est asynchrone (l'utilisateur
 * confirme sur son téléphone, un webhook signé crédite le compte) : on
 * reproduit ici les deux temps — PENDING puis PAID — pour que l'écran
 * d'attente soit conçu dès maintenant.
 *
 * Aucun crédit n'est ajouté tant que le paiement n'est pas confirmé (F26).
 */
export async function buyPack(request: PurchaseRequest): Promise<Purchase> {
  const pack = findPack(request.packId);
  if (!pack) throw new Error('Pack introuvable.');

  const now = new Date().toISOString();
  const pending: Purchase = {
    id: newId('pur'),
    packId: pack.id,
    packName: pack.name,
    credits: pack.credits,
    amountFcfa: pack.priceFcfa,
    method: request.method,
    phone: request.phone,
    status: 'PENDING',
    failureReason: null,
    createdAt: now,
  };
  deoflowStore.update((state) => upsertPurchase(state, pending));

  await wait(3000);

  const paid: Purchase = { ...pending, status: 'PAID' };
  deoflowStore.update((state) => {
    const credited = applyCredit(state, {
      id: newId('tx'),
      credits: pack.credits,
      movement: 'PURCHASE',
      label: pack.name,
      amountFcfa: pack.priceFcfa,
      createdAt: new Date().toISOString(),
    });
    return upsertPurchase(credited, paid);
  });
  return paid;
}

/* ── Ajustement administrateur ─────────────────────────────────────────── */

/**
 * Crédit / débit manuel par l'administrateur, motif obligatoire (F34). Côté
 * réel, cette opération devra passer par `logAdminAction` pour rester
 * auditable — la règle du dépôt est explicite là-dessus.
 */
export async function adjustCredits(delta: number, reason: string): Promise<void> {
  if (delta === 0) throw new Error('Le nombre de crédits doit être différent de zéro.');
  if (reason.trim().length === 0) throw new Error('Le motif est obligatoire.');

  await wait(400);
  const entry = {
    id: newId('tx'),
    credits: Math.abs(delta),
    movement: 'ADMIN_ADJUSTMENT' as const,
    label: `Ajustement administrateur — ${reason.trim()}`,
    createdAt: new Date().toISOString(),
  };
  deoflowStore.update((state) =>
    delta > 0 ? applyCredit(state, entry) : applyDebit(state, entry),
  );
}
