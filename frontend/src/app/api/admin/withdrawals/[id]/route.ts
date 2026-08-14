/**
 * PATCH /api/admin/withdrawals/[id] — traiter une demande de versement.
 *
 * MakeTou n'encaisse que dans un sens : aucun virement automatique n'existe.
 * L'administrateur paie à la main depuis son application mobile money, puis
 * enregistre ici la référence de la transaction. Cette route ne déplace donc
 * pas d'argent — elle enregistre qu'il a été déplacé, ce qui est justement la
 * raison pour laquelle elle doit être infalsifiable.
 *
 * Deux protections, chacune contre un accident réel :
 *
 *   1. **Le verrou consultatif + relecture sous verrou.** Même construction
 *      que la route d'annulation et que la demande côté créateur. Sans lui,
 *      deux onglets ouverts sur la même demande la marquent « versée » deux
 *      fois, chacun ayant lu `PENDING`.
 *
 *   2. **`providerPayoutId` est `@unique` au schéma.** C'est le garde-fou
 *      contre le double paiement : rejouer la référence d'un versement déjà
 *      enregistré est refusé par la base, pas par une vérification applicative
 *      qu'une course pourrait franchir.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { lockUserTx } from '@/lib/server/withdrawals/lock';
import {
  ADMIN_WITHDRAWAL_TARGETS,
  canTransition,
  requiredFieldFor,
  requiresSuperadmin,
} from '@/lib/server/admin/withdrawal-transitions';

const Body = z.object({
  status: z.enum(ADMIN_WITHDRAWAL_TARGETS),
  /** Référence de la transaction mobile money — obligatoire pour COMPLETED. */
  providerPayoutId: z.string().trim().min(3).max(120).optional(),
  /** Motif d'échec — obligatoire pour FAILED. */
  failureReason: z.string().trim().min(3).max(500).optional(),
});

type Outcome =
  | { kind: 'NOT_FOUND' }
  | { kind: 'INVALID_TRANSITION'; from: string }
  | { kind: 'OK'; withdrawal: { id: string; status: string; amount: number } };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Corps de requête invalide.' },
        { status: 400 },
      );
    }
    const { status: target, providerPayoutId, failureReason } = parsed.data;

    if (requiresSuperadmin(target) && auth.admin.role !== 'SUPERADMIN') {
      return NextResponse.json(
        {
          error: 'SUPERADMIN_REQUIRED',
          message: 'Seul un SUPERADMIN peut solder une demande de versement.',
        },
        { status: 403 },
      );
    }

    // Le champ obligatoire dépend de la cible — Zod ne peut pas l'exprimer
    // sans un `superRefine` qui rendrait le schéma illisible.
    const required = requiredFieldFor(target);
    if (required === 'providerPayoutId' && !providerPayoutId) {
      return NextResponse.json(
        {
          error: 'PAYOUT_REF_REQUIRED',
          message: 'La référence de la transaction est obligatoire pour marquer un versement.',
        },
        { status: 400 },
      );
    }
    if (required === 'failureReason' && !failureReason) {
      return NextResponse.json(
        { error: 'FAILURE_REASON_REQUIRED', message: 'Un motif d’échec est obligatoire.' },
        { status: 400 },
      );
    }

    // Phase 1 — le propriétaire hors verrou : `lockUserTx` est indexé sur
    // `userId`, il faut donc la valeur avant d'entrer dans la région
    // verrouillée. `Withdrawal.userId` est immuable (aucune route ne transfère
    // une demande d'un compte à l'autre), la lecture ne peut donc pas être
    // périmée. Même hypothèse que la route d'annulation.
    const owner = await prisma.withdrawal.findUnique({ where: { id }, select: { userId: true } });
    if (!owner) {
      return NextResponse.json(
        { error: 'WITHDRAWAL_NOT_FOUND', message: 'Demande introuvable.' },
        { status: 404 },
      );
    }

    let outcome: Outcome;
    try {
      outcome = await prisma.$transaction(
        async (tx) => {
          await lockUserTx(tx, owner.userId);

          // Relecture SOUS le verrou : le statut a pu changer pendant l'attente.
          const w = await tx.withdrawal.findUnique({ where: { id } });
          if (!w) return { kind: 'NOT_FOUND' as const };
          if (!canTransition(w.status, target)) {
            return { kind: 'INVALID_TRANSITION' as const, from: w.status };
          }

          const now = new Date();
          const updated = await tx.withdrawal.update({
            where: { id },
            data: {
              status: target,
              // Horodaté par le serveur, jamais par le client : une date de
              // versement fournie par l'appelant ne prouve rien.
              processedAt: w.processedAt ?? now,
              ...(target === 'PROCESSING' ? {} : { completedAt: now }),
              ...(providerPayoutId ? { providerPayoutId } : {}),
              ...(failureReason ? { failureReason } : {}),
            },
          });

          await logAdminAction(tx, {
            actorId: auth.admin.id,
            action: `withdrawal.${target.toLowerCase()}`,
            targetType: 'Withdrawal',
            targetId: id,
            metadata: {
              withdrawalId: id,
              amount: w.amount,
              currency: w.currency,
              previousStatus: w.status,
              ...(providerPayoutId ? { providerPayoutId } : {}),
              ...(failureReason ? { failureReason } : {}),
            },
          });

          return { kind: 'OK' as const, withdrawal: updated };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      // P2002 sur `providerPayoutId` : cette référence est déjà enregistrée sur
      // une autre demande. C'est le signal d'un double paiement évité, pas une
      // panne — on le dit précisément plutôt que de renvoyer un 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json(
          {
            error: 'PAYOUT_REF_DUPLICATE',
            message: 'Cette référence de transaction est déjà enregistrée sur une autre demande.',
          },
          { status: 409 },
        );
      }
      throw err;
    }

    if (outcome.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'WITHDRAWAL_NOT_FOUND', message: 'Demande introuvable.' },
        { status: 404 },
      );
    }
    if (outcome.kind === 'INVALID_TRANSITION') {
      return NextResponse.json(
        {
          error: 'WITHDRAWAL_TRANSITION_INVALID',
          message: `Une demande « ${outcome.from} » ne peut pas passer à « ${target} ».`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ withdrawal: outcome.withdrawal }, { status: 200 });
  });
}
