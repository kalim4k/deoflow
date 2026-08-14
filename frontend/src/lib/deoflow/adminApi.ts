'use client';

/**
 * Couche client du back-office : les formes de fil et les appels, en un seul
 * endroit.
 *
 * Les écrans d'administration existants déclaraient leurs interfaces à
 * l'intérieur de chaque page. Ça tenait tant que chaque écran lisait sa propre
 * route ; ça ne tient plus dès que deux écrans lisent la même — la vue
 * d'ensemble et l'écran de retraits parlent tous deux de versements, et deux
 * copies d'un type divergent toujours dans le même sens : celle qu'on oublie
 * de corriger.
 *
 * Aucun calcul ici. Le serveur renvoie des montants déjà faits ; refaire une
 * addition côté navigateur, c'est se donner une seconde réponse possible à une
 * question d'argent.
 */

import { api } from '@/lib/api';

/* ── Agrégats ───────────────────────────────────────────────────────────── */

export type StatsPeriod = '7d' | '30d' | 'all';

export interface AdminStats {
  period: StatsPeriod;
  since: string | null;
  revenue: { grossFcfa: number; orders: number; averageFcfa: number };
  credits: {
    sold: number;
    consumed: number;
    refunded: number;
    adjusted: number;
    outstanding: number;
  };
  generations: {
    total: number;
    succeeded: number;
    failed: number;
    running: number;
    failureRateBps: number;
  };
  economics: { providerCostFcfa: number; marginFcfa: number };
  users: { total: number; new: number; buyers: number; active: number };
  withdrawals: {
    pendingCount: number;
    pendingFcfa: number;
    processingFcfa: number;
    paidFcfa: number;
  };
  commissions: { earnedFcfa: number; referrals: number };
}

export function fetchAdminStats(period: StatsPeriod): Promise<AdminStats> {
  return api<AdminStats>(`/api/admin/stats?period=${period}`);
}

/* ── Versements ─────────────────────────────────────────────────────────── */

/** Destination d'un versement, telle que le créateur l'a saisie. */
export interface PayoutDestination {
  method?: string;
  phone?: string;
  accountName?: string;
}

export interface AdminWithdrawal {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  destination: PayoutDestination | null;
  provider: string;
  providerPayoutId: string | null;
  failureReason: string | null;
  requestedAt: string;
  processedAt: string | null;
  completedAt: string | null;
  user: { email: string; name: string | null } | null;
}

export type WithdrawalTarget = 'PROCESSING' | 'COMPLETED' | 'FAILED';

// ⚠️ `body` est passé en OBJET, jamais en chaîne : le wrapper `api()` fait
// lui-même le `JSON.stringify`. Le sérialiser ici l'envoie une seconde fois,
// et le serveur reçoit une chaîne JSON là où il attend un objet — Zod la
// rejette avec « corps de requête invalide », ce qui se lit comme un champ
// manquant alors que tous sont là.
export function updateWithdrawal(
  id: string,
  body: { status: WithdrawalTarget; providerPayoutId?: string; failureReason?: string },
): Promise<{ withdrawal: AdminWithdrawal }> {
  return api<{ withdrawal: AdminWithdrawal }>(`/api/admin/withdrawals/${id}`, {
    method: 'PATCH',
    body,
  });
}

export function cancelWithdrawal(id: string, reason: string): Promise<unknown> {
  return api(`/api/admin/withdrawals/${id}/cancel`, { method: 'POST', body: { reason } });
}

/* ── Grand livre des crédits ────────────────────────────────────────────── */

export type CreditMovement = 'PURCHASE' | 'GENERATION' | 'REFUND' | 'ADMIN_ADJUSTMENT';

export interface AdminCreditRow {
  id: string;
  userId: string;
  credits: number;
  movement: string;
  label: string;
  balanceAfter: number;
  amountFcfa: number | null;
  generationId: string | null;
  orderId: string | null;
  createdAt: string;
  user: { email: string; name: string | null } | null;
}

export function adjustCredits(body: {
  userId: string;
  credits: number;
  reason: string;
}): Promise<{ userId: string; credits: number; balanceAfter: number }> {
  return api('/api/admin/credits', { method: 'POST', body });
}

/* ── Générations ────────────────────────────────────────────────────────── */

export interface AdminGeneration {
  id: string;
  userId: string;
  modelSlug: string;
  modelName: string;
  kind: string;
  mode: string;
  purpose: string;
  credits: number;
  status: string;
  provider: string;
  providerTaskId: string | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { email: string } | null;
  prompt: string;
  ratio: string | null;
  durationSeconds: number | null;
  /** URLs Cloudinary, permanentes. Vide tant que la tâche court ou si elle a échoué. */
  urls: string[];
}

/* ── Comptes ────────────────────────────────────────────────────────────── */

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  credits: number;
}

/* ── Libellés partagés ──────────────────────────────────────────────────── */

export const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: 'Achat',
  GENERATION: 'Génération',
  REFUND: 'Remboursement',
  ADMIN_ADJUSTMENT: 'Ajustement admin',
};

/**
 * Libellés des moyens de versement, repris de `payout.ts` côté créateur.
 * Réimportés plutôt que recopiés : ce que l'administrateur lit doit être
 * exactement ce que le créateur a choisi.
 */
export { payoutMethodLabel } from '@/lib/deoflow/payout';
