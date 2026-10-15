/**
 * POST /api/generations/upload/complete — enregistre un envoi direct.
 *
 * Le navigateur n'annonce qu'un identifiant et un type. Taille, format et
 * adresse sont relus chez Cloudinary (`completeDirectUpload`) ; un fichier non
 * conforme est supprimé au lieu d'être enregistré.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { log } from '@/lib/server/observability/log';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { StorageNotConfiguredError } from '@/lib/server/upload/cloudinary-client';
import { DirectUploadError, completeDirectUpload } from '@/lib/server/upload/direct';
import { sanitizeFilename } from '@/lib/server/upload/sanitize-filename';

const Body = z.object({
  publicId: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  filename: z.string().max(255).default('fichier'),
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

    let done;
    try {
      done = await completeDirectUpload({ userId: auth.user.sub, ...parsed.data });
    } catch (err) {
      if (err instanceof DirectUploadError) {
        log.warn('upload direct refusé', { code: err.code, publicId: parsed.data.publicId });
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

    // `upsert` : un second appel pour le même fichier (double-clic, reprise
    // réseau) ne doit pas buter sur l'unicité de `key`.
    await prisma.fileUpload.upsert({
      where: { key: done.publicId },
      create: {
        userId: auth.user.sub,
        key: done.publicId,
        filename: sanitizeFilename(parsed.data.filename),
        mimeType: parsed.data.mimeType,
        sizeBytes: done.sizeBytes,
      },
      update: {},
    });

    return NextResponse.json(
      {
        url: done.url,
        mimeType: parsed.data.mimeType,
        sizeBytes: done.sizeBytes,
        durationSeconds: done.durationSeconds,
      },
      { status: 201, headers },
    );
  });
}
