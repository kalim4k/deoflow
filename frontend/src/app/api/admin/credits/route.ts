/**
 * Le grand livre des crédits, et son seul point d'écriture manuel.
 *
 *   GET  — journal paginé, filtrable par type de mouvement et par compte.
 *   POST — ajustement administrateur (SUPERADMIN).
 *
 * Pourquoi les deux dans le même fichier : c'est une seule ressource. Le
 * journal est la vérité du solde (`User.credits` n'en est qu'un raccourci de
 * lecture), et l'ajustement est la seule façon d'y écrire une ligne à la main.
 *
 * ⚠️ L'ajustement CRÉE de la valeur : les crédits accordés ici n'ont été payés
 * par personne et se consommeront en vrai argent chez kie.ai. D'où trois
 * garde-fous non négociables — SUPERADMIN, motif obligatoire, et passage par
 * `withUserCredits` pour que le solde et le journal ne puissent pas diverger.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import {
  InsufficientCreditsError,
  creditCredits,
  debitCredits,
  withUserCredits,
} from '@/lib/server/credits';

const MOVEMENTS = ['PURCHASE', 'GENERATION', 'REFUND', 'ADMIN_ADJUSTMENT'] as const;

const LEDGER_SELECT = {
  id: true,
  userId: true,
  credits: true,
  movement: true,
  label: true,
  balanceAfter: true,
  amountFcfa: true,
  generationId: true,
  orderId: true,
  createdAt: true,
  // L'administrateur a besoin de savoir DE QUI il lit le portefeuille. Un
  // identifiant opaque l'obligerait à un second aller-retour par ligne.
  user: { select: { email: true, name: true } },
} as const satisfies Prisma.CreditTransactionSelect;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const movement = url.searchParams.get('movement');
    const userId = url.searchParams.get('userId');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.creditTransaction.findMany({
      where: {
        ...(movement && (MOVEMENTS as readonly string[]).includes(movement) ? { movement } : {}),
        ...(userId ? { userId } : {}),
        ...cursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: LEDGER_SELECT,
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId, 'cache-control': 'private, no-store' },
    });
  });
}

const AdjustBody = z.object({
  userId: z.string().min(1),
  /**
   * SIGNÉ : positif pour créditer, négatif pour débiter. Un champ signé plutôt
   * qu'un couple `sens` + `montant` — deux champs pour une information, c'est
   * un jour où l'un contredit l'autre.
   */
  credits: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Un ajustement de 0 crédit ne fait rien.'),
  /** Motif obligatoire : un crédit sans justification est indéfendable
   *  trois mois plus tard, quand plus personne ne se souvient du geste. */
  reason: z.string().trim().min(3).max(500),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = AdjustBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Corps de requête invalide.',
        },
        { status: 400 },
      );
    }
    const { userId, credits, reason } = parsed.data;

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!target) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'Compte introuvable.' },
        { status: 404 },
      );
    }

    try {
      // `withUserCredits` ouvre une transaction sérialisable verrouillée sur le
      // compte : l'ajustement se met en file derrière une génération en cours
      // au lieu de lire un solde périmé. L'audit est écrit DANS cette même
      // transaction — un mouvement d'argent et sa trace sont indissociables.
      const balanceAfter = await withUserCredits(userId, async (tx) => {
        const label = `Ajustement administrateur — ${reason}`;
        const movement = {
          userId,
          credits: Math.abs(credits),
          movement: 'ADMIN_ADJUSTMENT' as const,
          label,
        };
        const balance =
          credits > 0 ? await creditCredits(tx, movement) : await debitCredits(tx, movement);

        await logAdminAction(tx, {
          actorId: auth.admin.id,
          action: 'credits.adjust',
          targetType: 'User',
          targetId: userId,
          metadata: { credits, reason, balanceAfter: balance, targetEmail: target.email },
        });

        return balance;
      });

      return NextResponse.json({ userId, credits, balanceAfter }, { status: 200 });
    } catch (err) {
      // Un débit qui passerait sous zéro : refus explicite, pas un solde négatif.
      if (err instanceof InsufficientCreditsError) {
        // Code DISTINCT de `INSUFFICIENT_CREDITS` : ce dernier est traduit côté
        // créateur par « Rechargez pour lancer cette génération », un conseil
        // absurde pour un administrateur qui débite le compte d'autrui.
        return NextResponse.json(
          {
            error: 'ADJUSTMENT_INSUFFICIENT_CREDITS',
            message: 'Le solde de ce compte ne couvre pas ce débit.',
          },
          { status: 422 },
        );
      }
      throw err;
    }
  });
}
