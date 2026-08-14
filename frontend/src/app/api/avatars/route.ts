/**
 * POST /api/avatars — crée un influenceur et lance la génération de son visage.
 * GET  /api/avatars — la liste du créateur, la plus récente d'abord.
 *
 * Le prompt de portrait est composé côté serveur (`avatars/portrait.ts`) : le
 * cadrage tête-épaules et le fond blanc sont des contraintes système, pas des
 * préférences. Un visage pris dans un décor traînerait ce décor dans toutes les
 * scènes suivantes.
 *
 * La génération du visage est facturée comme n'importe quelle image — elle
 * passe par `createGeneration`, seule porte vers les crédits.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  AvatarError,
  GenerationRequestError,
  createAvatar,
  listAvatars,
} from '@/lib/server/avatars/service';
import { InsufficientCreditsError } from '@/lib/server/credits';

const bodySchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(4_000).default(''),
  modelSlug: z.string().min(1).max(64),
  photoUrl: z.string().url().max(2_048).nullable().optional(),
  photoRightsAck: z.boolean().optional(),
});

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
        {
          error: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message ?? 'Requête invalide',
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    try {
      const avatar = await createAvatar({
        userId: auth.user.sub,
        ...parsed.data,
        idempotencyKey: req.headers.get('idempotency-key'),
      });
      return NextResponse.json(avatar, {
        status: 201,
        headers: { 'x-request-id': ctx.requestId },
      });
    } catch (err) {
      return translate(err, ctx.requestId);
    }
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    return NextResponse.json(
      { items: await listAvatars(auth.user.sub) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

/**
 * Trois familles d'erreur convergent ici — l'avatar, la génération, le solde —
 * parce que créer un avatar EST une génération. Les traduire au même endroit
 * évite qu'une route en oublie une et renvoie un 500 sur un solde insuffisant.
 */
export function translate(err: unknown, requestId: string): NextResponse {
  const headers = { 'x-request-id': requestId };

  if (err instanceof InsufficientCreditsError) {
    return NextResponse.json(
      { error: err.code, message: err.message, required: err.required, available: err.available },
      { status: 402, headers },
    );
  }
  if (err instanceof AvatarError || err instanceof GenerationRequestError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status, headers },
    );
  }
  throw err;
}
