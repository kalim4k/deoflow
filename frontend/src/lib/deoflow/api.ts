'use client';

// Accès aux routes réelles de génération.
//
// Remplace la couche simulée pour tout ce qui coûte des crédits : le solde,
// les générations et la galerie viennent maintenant du serveur. Ce qui reste
// dans `client.ts` (packs, achats) attend encore un prestataire de paiement
// couvrant le Togo.
//
// Les appels JSON passent par le wrapper maison `api()` — il gère le
// rafraîchissement de session, le jeton CSRF et l'absence de rejeu sur les
// verbes mutants. L'envoi de fichier, lui, ne peut pas y passer : `api()`
// force `Content-Type: application/json`, ce qui casserait la frontière
// multipart. D'où le `fetch` direct plus bas, avec le même en-tête CSRF.

import { api, ApiError } from '@/lib/api';
import { API_URL, COOKIE_PREFIX } from '@/lib/constants';
import type { MediaKind } from './types';

export type GenerationStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface ApiGeneration {
  id: string;
  kind: MediaKind;
  modelSlug: string;
  modelName: string;
  mode: string;
  prompt: string;
  ratio: string | null;
  durationSeconds: number | null;
  credits: number;
  status: GenerationStatus;
  /** URLs Cloudinary, permanentes. Vide tant que la tâche court. */
  urls: string[];
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ApiCreditTransaction {
  id: string;
  credits: number;
  movement: string;
  label: string;
  balanceAfter: number;
  amountFcfa: number | null;
  createdAt: string;
}

/* ── Crédits ───────────────────────────────────────────────────────────── */

/**
 * Solde ET journal des mouvements. N'est plus appelé au chargement des écrans —
 * le solde seul voyage désormais avec `/api/auth/me`. Réservé au portefeuille,
 * qui a réellement besoin de la liste.
 */
export function fetchCredits(): Promise<{
  credits: number;
  transactions: ApiCreditTransaction[];
}> {
  return api('/api/credits');
}

/* ── Achat de crédits (Maketou) ────────────────────────────────────────── */

export interface ApiPurchaseStart {
  orderId: string;
  /** Page hébergée Maketou. À ouvrir par navigation, jamais par `fetch`. */
  paymentUrl: string;
  packId: string;
  credits: number;
  amountFcfa: number;
}

export interface ApiPurchase {
  orderId: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
  amountFcfa: number;
  currency: string;
  packId: string | null;
  credits: number | null;
  /** Solde après ajout — renseigné uniquement au moment où l'achat se règle. */
  balanceAfter: number | null;
  failureCode: string | null;
  createdAt: string;
}

/**
 * Ouvre un paiement. Le corps ne porte qu'un `packId` : c'est le serveur qui
 * décide du montant, à partir du catalogue.
 */
export function startPurchase(packId: string, idempotencyKey: string): Promise<ApiPurchaseStart> {
  return api('/api/credits/purchase', {
    method: 'POST',
    body: { packId },
    // Un double-clic sur « Payer » ouvrirait sinon deux paniers Maketou.
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/**
 * Relit l'état d'un achat. Chaque appel interroge Maketou côté serveur et
 * ajoute les crédits si le paiement est confirmé — d'où le sondage dégressif
 * plutôt qu'une boucle serrée : leur API plafonne à 60 requêtes / 10 s.
 */
export function fetchPurchase(orderId: string): Promise<ApiPurchase> {
  return api(`/api/credits/purchase/${orderId}`);
}

/* ── Avatars ───────────────────────────────────────────────────────────── */

export interface ApiAvatar {
  id: string;
  name: string;
  description: string;
  /** Visage sur fond blanc. `null` tant que la génération n'a pas abouti. */
  faceUrl: string | null;
  modelSlug: string;
  status: 'PENDING' | 'READY' | 'FAILED';
  faceGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAvatarInput {
  name: string;
  description: string;
  modelSlug: string;
  photoUrl?: string | null;
  photoRightsAck?: boolean;
}

export function createAvatar(input: CreateAvatarInput, idempotencyKey: string): Promise<ApiAvatar> {
  return api('/api/avatars', {
    method: 'POST',
    body: input,
    // Un double-clic relancerait sinon une génération facturée.
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export async function listAvatars(): Promise<ApiAvatar[]> {
  const { items } = await api<{ items: ApiAvatar[] }>('/api/avatars');
  return items;
}

export function fetchAvatar(id: string): Promise<ApiAvatar> {
  return api(`/api/avatars/${id}`);
}

/** Nom et description : gratuit. `regenerateFace` : facturé. */
export function updateAvatar(
  id: string,
  input: { name?: string; description?: string; regenerateFace?: boolean; modelSlug?: string },
): Promise<ApiAvatar> {
  return api(`/api/avatars/${id}`, { method: 'PATCH', body: input });
}

export function deleteAvatar(id: string): Promise<void> {
  return api(`/api/avatars/${id}`, { method: 'DELETE' });
}

/* ── Générations ───────────────────────────────────────────────────────── */

export interface StartGenerationInput {
  modelSlug: string;
  mode?: string;
  prompt: string;
  ratio?: string | null;
  durationSeconds?: number | null;
  params?: Record<string, string | boolean>;
  /** Médias indexés par clé d'emplacement de l'API, en URLs publiques. */
  media?: Record<string, string[]>;
  /**
   * Avatar à incarner. Seul l'identifiant transite : le serveur relit la
   * description et l'URL du visage en base, et recompose le prompt lui-même.
   */
  avatarId?: string | null;
}

export function startGeneration(
  input: StartGenerationInput,
  idempotencyKey: string,
): Promise<ApiGeneration> {
  return api('/api/generations', {
    method: 'POST',
    body: input,
    // Un double-clic sur « Générer » relancerait sinon un appel facturé.
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function fetchGeneration(id: string): Promise<ApiGeneration> {
  return api(`/api/generations/${id}`);
}

/**
 * `limit` compte : la route renvoie 30 créations par défaut, alors que le
 * tableau de bord n'en montre que cinq. Rapatrier six fois trop d'octets se
 * paie sur une 4G instable, qui est la connexion de la cible.
 */
export async function listGenerations(
  kind?: MediaKind,
  limit?: number,
): Promise<{ items: ApiGeneration[]; spent: number }> {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (limit) params.set('limit', String(limit));
  const query = params.size > 0 ? `?${params}` : '';
  // `spent` est le total consommé sur TOUTE la vie du compte, calculé côté
  // serveur : l'additionner ici sur les quelques générations affichées donnait
  // un chiffre qui n'était le total de rien.
  const { items, spent } = await api<{ items: ApiGeneration[]; spent?: number }>(
    `/api/generations${query}`,
  );
  return { items, spent: spent ?? 0 };
}

export function deleteGeneration(id: string): Promise<void> {
  return api(`/api/generations/${id}`, { method: 'DELETE' });
}

/**
 * Sonde jusqu'à ce que la génération soit close.
 *
 * L'intervalle s'allonge progressivement : Veo met environ deux minutes, et
 * interroger toutes les secondes pendant ce temps ne renseignerait sur rien
 * tout en consommant la 4G du créateur.
 */
export async function waitForGeneration(
  id: string,
  onProgress?: (row: ApiGeneration) => void,
  signal?: AbortSignal,
): Promise<ApiGeneration> {
  let delay = 2000;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Sondage interrompu', 'AbortError');
    const row = await fetchGeneration(id);
    onProgress?.(row);
    if (row.status === 'SUCCEEDED' || row.status === 'FAILED') return row;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.4, 10_000);
  }
}

/* ── Envoi d'un fichier de référence ───────────────────────────────────── */

/**
 * Le jeton CSRF est relu ici plutôt qu'importé : `api.ts` ne l'expose pas, et
 * ce fichier fait partie des modules protégés du dépôt. Six lignes dupliquées
 * valent mieux qu'une modification d'un fichier dont les invariants
 * (rafraîchissement, rejeu) sont délicats.
 */
function csrfToken(): string | null {
  if (typeof window === 'undefined') return null;
  const name = `${COOKIE_PREFIX}-csrf`;
  const fromStorage = localStorage.getItem(name);
  if (fromStorage) return fromStorage;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Dépose un fichier et renvoie son URL publique.
 *
 * kie.ai télécharge les références depuis SES serveurs : il lui faut une URL
 * joignable, un `blob:` local ne lui dit rien. Ce passage est donc obligatoire
 * dès qu'une génération part d'un fichier.
 */
export async function uploadReference(file: File): Promise<string> {
  const first = await postFile(file);
  if (first.status !== 401) return unwrap(first);

  // Le jeton d'accès ne vit que 15 minutes. Tous les autres appels traversent
  // `api()`, qui le renouvelle tout seul sur un 401 — mais pas celui-ci, qui
  // envoie un `FormData` que `api()` ne sait pas transporter. Sans ce
  // rattrapage, préparer sa génération pendant un quart d'heure suffisait à
  // faire échouer l'envoi, sur un message qui n'expliquait rien.
  //
  // On ne réimplémente pas le renouvellement : un appel anodin passe par
  // `api()`, dont le verrou garantit un seul rafraîchissement même si dix
  // fichiers partent ensemble. Deux rafraîchissements simultanés feraient
  // tourner le jeton deux fois et déconnecteraient l'utilisateur.
  try {
    await api('/api/auth/me');
  } catch {
    // Session réellement finie : on laisse la réponse d'origine parler.
    return unwrap(first);
  }
  return unwrap(await postFile(file));
}

async function postFile(file: File): Promise<Response> {
  const form = new FormData();
  form.append('file', file);
  const token = csrfToken();
  return fetch(`${API_URL}/api/generations/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    ...(token ? { headers: { 'x-csrf-token': token } } : {}),
  });
}

async function unwrap(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof body.message === 'string' ? body.message : 'L’envoi a échoué.',
      body,
    );
  }
  return String(body.url);
}

/* ── Affiliation ────────────────────────────────────────────────────────── */

export interface ApiReferralStats {
  referrals: number;
  buyers: number;
  /** Part des filleuls ayant acheté, en points de base (2500 = 25 %). */
  conversionBps: number;
  volumeFcfa: number;
  earnedFcfa: number;
  /** Demandes de retrait en attente de validation. */
  pendingFcfa: number;
  /** Retraits effectivement versés. */
  paidFcfa: number;
  availableFcfa: number;
}

export interface ApiCommission {
  id: string;
  amount: number;
  orderAmount: number;
  rateBps: number;
  status: string;
  createdAt: string;
  /** Filleul masqué — le parrain n'a pas à connaître son adresse. */
  referee: string;
}

/** Règles de retrait, lues sur le serveur — jamais recopiées dans le formulaire. */
export interface ApiPayoutRules {
  minAmountFcfa: number;
  maxAmountFcfa: number | null;
  requiresPin: boolean;
  /** L'utilisateur a-t-il déjà défini son code de retrait ? */
  hasPin: boolean;
}

export interface ApiReferralDashboard {
  code: string;
  link: string;
  rateBps: number;
  stats: ApiReferralStats;
  commissions: ApiCommission[];
  payout: ApiPayoutRules;
}

export function fetchReferrals(): Promise<ApiReferralDashboard> {
  return api('/api/referrals');
}

/** Crée le code de retrait à 4–6 chiffres. */
export function setWithdrawalPin(newPin: string): Promise<unknown> {
  return api('/api/auth/withdrawal-pin', { method: 'POST', body: { newPin } });
}

/** Demande de versement d'une commission. Traitée manuellement côté admin. */
export function requestWithdrawal(input: {
  amount: number;
  destination: { method: string; phone: string; accountName?: string };
  /** Code de retrait — dans le CORPS, jamais en en-tête (les proxys les journalisent). */
  pin?: string;
}): Promise<{ id: string; status: string }> {
  return api('/api/withdrawals', { method: 'POST', body: { ...input, currency: 'XOF' } });
}
