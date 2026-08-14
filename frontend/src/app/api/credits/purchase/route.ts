/**
 * POST /api/credits/purchase — ouvre un paiement Maketou pour un pack.
 *
 * Le corps ne porte qu'un `packId`. Le prix est lu dans le catalogue serveur
 * (`lib/deoflow/packs.ts`) : le navigateur n'annonce jamais ce qu'il va payer.
 *
 * La réponse ne contient pas de crédits — elle contient une URL. C'est
 * l'acheteur qui doit s'y rendre, et seule la confirmation de Maketou,
 * relue par notre serveur, déclenche l'ajout au solde.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { PurchaseError, startPurchase } from '@/lib/server/purchases/service';

const bodySchema = z.object({ packId: z.string().min(1).max(64) });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Pack manquant ou invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const result = await startPurchase({
        userId: auth.user.sub,
        packId: parsed.data.packId,
        idempotencyKey: req.headers.get('idempotency-key'),
      });
      return NextResponse.json(result, {
        status: 201,
        headers: { 'x-request-id': ctx.requestId },
      });
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
