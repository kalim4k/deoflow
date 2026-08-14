/**
 * GET /api/credits/purchase/[id] — état d'un achat, avec règlement au passage.
 *
 * Point de sondage du navigateur pendant que l'acheteur revient de Maketou.
 * Chaque appel relit le panier chez le fournisseur et, si le paiement est
 * confirmé, ajoute les crédits — une fois et une seule, y compris si le cron
 * de rattrapage tombe sur la même commande au même instant.
 *
 * Le retour depuis Maketou n'est PAS une preuve : l'URL est rejouable et peut
 * arriver avant le paiement. Rien n'est accordé sur sa seule foi.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { PURCHASE_PROVIDER, PurchaseError, settlePurchase } from '@/lib/server/purchases/service';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        provider: true,
        amount: true,
        currency: true,
        metadata: true,
        createdAt: true,
      },
    });

    // 404 plutôt que 403 pour la commande d'un autre : répondre « interdit »
    // confirmerait son existence.
    if (!order || order.provider !== PURCHASE_PROVIDER || order.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'ORDER_NOT_FOUND', message: 'Achat introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const outcome = await settlePurchase(id);
      const meta = (order.metadata ?? {}) as Record<string, unknown>;

      return NextResponse.json(
        {
          orderId: order.id,
          status: outcome.status,
          amountFcfa: order.amount,
          currency: order.currency,
          packId: typeof meta.packId === 'string' ? meta.packId : null,
          credits: outcome.status === 'PAID' ? outcome.credits : (meta.credits ?? null),
          balanceAfter: outcome.status === 'PAID' ? outcome.balanceAfter : null,
          failureCode: outcome.status === 'FAILED' ? outcome.code : null,
          createdAt: order.createdAt.toISOString(),
        },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof PurchaseError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.status, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
