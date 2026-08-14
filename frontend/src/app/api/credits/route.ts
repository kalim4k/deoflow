/**
 * GET /api/credits — solde du créateur et journal de ses mouvements.
 *
 * Le solde vit désormais côté serveur : c'est cette route qui alimente la
 * pastille de crédits et l'écran portefeuille, pas le `localStorage`.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const limitRaw = Number(req.nextUrl.searchParams.get('limit') ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 30;

    const [user, transactions] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.user.sub }, select: { credits: true } }),
      prisma.creditTransaction.findMany({
        where: { userId: auth.user.sub },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          credits: true,
          movement: true,
          label: true,
          balanceAfter: true,
          amountFcfa: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        credits: user?.credits ?? 0,
        transactions: transactions.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
