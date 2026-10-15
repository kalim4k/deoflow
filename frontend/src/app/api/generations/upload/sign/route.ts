/**
 * POST /api/generations/upload/sign — autorise un envoi DIRECT vers Cloudinary.
 *
 * Pour les fichiers que la plateforme refuserait en transit (plus de 4,5 Mo sur
 * Vercel). Le serveur contrôle le type et la taille annoncés, choisit
 * l'identifiant et signe ; le fichier part ensuite du navigateur, puis
 * `POST /api/generations/upload/complete` le relit et l'enregistre.
 * Le détail du parcours et de ses contrôles : `lib/server/upload/direct.ts`.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { StorageNotConfiguredError } from '@/lib/server/upload/cloudinary-client';
import { DirectUploadError, signDirectUpload } from '@/lib/server/upload/direct';

const Body = z.object({
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Requête invalide.' },
        { status: 400, headers },
      );
    }

    try {
      const signed = signDirectUpload({ userId: auth.user.sub, ...parsed.data });
      return NextResponse.json(signed, { status: 200, headers });
    } catch (err) {
      if (err instanceof DirectUploadError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.status, headers },
        );
      }
      if (err instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { error: 'STORAGE_NOT_CONFIGURED', message: 'Le stockage n’est pas configuré.' },
          { status: 503, headers },
        );
      }
      throw err;
    }
  });
}
