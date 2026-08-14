/**
 * GET /api/generations/[id] — état d'une génération, avec règlement au passage.
 *
 * C'est le point de sondage du navigateur. Chaque appel interroge le
 * fournisseur si la tâche court encore, puis referme la ligne : recopie du
 * résultat vers Cloudinary en cas de réussite, remboursement en cas d'échec.
 *
 * Faire le règlement ici plutôt que dans un cron dédié garde le parcours
 * simple, mais laisse un trou : un créateur qui ferme son onglet pendant une
 * génération de deux minutes ne sonde plus, et sa ligne reste RUNNING. Un cron
 * de rattrapage viendra la refermer — voir DELETE ci-dessous pour la
 * suppression manuelle, et `settleGeneration()` qui est déjà idempotent et
 * réutilisable tel quel.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { settleGeneration } from '@/lib/server/generations/service';
import { serializeGeneration } from '@/lib/server/generations/serialize';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const row = await prisma.generation.findUnique({ where: { id } });

    // 404 plutôt que 403 pour une génération qui ne vous appartient pas :
    // répondre « interdit » confirmerait son existence.
    if (!row || row.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'GENERATION_NOT_FOUND', message: 'Génération introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const settled = await settleGeneration(row);
    return NextResponse.json(serializeGeneration(settled), {
      headers: { 'x-request-id': ctx.requestId },
    });
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
    const row = await prisma.generation.findUnique({ where: { id } });
    if (!row || row.userId !== auth.user.sub) {
      return NextResponse.json(
        { error: 'GENERATION_NOT_FOUND', message: 'Génération introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    // Une tâche en cours est déjà payée chez le fournisseur : la supprimer
    // ne rend rien. On refuse plutôt que de laisser croire à une annulation.
    if (row.status === 'RUNNING' || row.status === 'PENDING') {
      return NextResponse.json(
        { error: 'GENERATION_RUNNING', message: 'Attendez la fin de la génération.' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.generation.delete({ where: { id } });
    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
