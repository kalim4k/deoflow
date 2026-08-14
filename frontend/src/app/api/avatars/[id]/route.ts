/**
 * GET    /api/avatars/[id] — fiche, avec résolution de l'état au passage.
 * PATCH  /api/avatars/[id] — nom et description (GRATUIT), ou régénération du
 *                            visage (PAYANTE, `regenerateFace: true`).
 * DELETE /api/avatars/[id] — suppression.
 *
 * L'avatar d'un autre créateur renvoie 404, pas 403 : répondre « interdit »
 * confirmerait son existence.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  deleteAvatar,
  getAvatar,
  regenerateFace,
  updateAvatar,
} from '@/lib/server/avatars/service';
import { translate } from '../route';

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(4_000).optional(),
  /** Relance une génération de visage — facturée au tarif du modèle. */
  regenerateFace: z.boolean().optional(),
  modelSlug: z.string().min(1).max(64).optional(),
});

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    try {
      return NextResponse.json(await getAvatar(auth.user.sub, id), {
        headers: { 'x-request-id': ctx.requestId },
      });
    } catch (err) {
      return translate(err, ctx.requestId);
    }
  });
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Requête invalide' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const { id } = await params;
    const { regenerateFace: regen, modelSlug, ...fields } = parsed.data;

    try {
      // Le texte d'abord : régénérer doit partir de la description à jour,
      // sinon le créateur qui corrige puis relance paie pour l'ancienne.
      if (fields.name !== undefined || fields.description !== undefined) {
        await updateAvatar(auth.user.sub, id, fields);
      }
      const result = regen
        ? await regenerateFace(auth.user.sub, id, modelSlug)
        : await getAvatar(auth.user.sub, id);

      return NextResponse.json(result, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      return translate(err, ctx.requestId);
    }
  });
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    try {
      await deleteAvatar(auth.user.sub, id);
      return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      return translate(err, ctx.requestId);
    }
  });
}
