/**
 * GET /api/admin/generations — l'écran de support.
 *
 * Quand un créateur écrit « ma génération n'a rien donné », il faut pouvoir
 * répondre sans ouvrir Prisma Studio : quel modèle, combien de crédits, quel
 * code d'échec, et si le remboursement a bien eu lieu.
 *
 * `assetUrls` et `prompt` en sortent aussi, pour que l'administrateur puisse
 * REGARDER ce qui a été produit — c'est la seule façon de traiter un
 * signalement. Ils ne sont pas affichés dans la liste : il faut ouvrir la
 * fiche, un geste délibéré. Juger une image sans savoir ce qui a été demandé
 * n'a pas de sens, donc les deux vont ensemble ou pas du tout.
 *
 * `sourceUrls` en revanche ne sort JAMAIS : ce sont les URLs kie.ai,
 * temporaires, qui afficheraient des images disparues et exposeraient le
 * fournisseur. Seules les copies Cloudinary sont permanentes.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';

const STATUSES = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] as const;

const GENERATION_SELECT = {
  id: true,
  userId: true,
  modelSlug: true,
  modelName: true,
  kind: true,
  mode: true,
  purpose: true,
  credits: true,
  status: true,
  provider: true,
  providerTaskId: true,
  failureCode: true,
  failureReason: true,
  createdAt: true,
  completedAt: true,
  prompt: true,
  ratio: true,
  durationSeconds: true,
  assetUrls: true,
  user: { select: { email: true } },
} as const satisfies Prisma.GenerationSelect;

/**
 * `assetUrls` est du JSON libre côté base : il peut contenir n'importe quoi si
 * une écriture a mal tourné. On filtre plutôt que de faire confiance — une
 * valeur non-chaîne finirait dans un `src` d'image.
 */
function asUrlList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string') : [];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const userId = url.searchParams.get('userId');
    const since = url.searchParams.get('since');
    const sinceDate = since ? new Date(since) : null;
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await prisma.generation.findMany({
      where: {
        ...(status && (STATUSES as readonly string[]).includes(status) ? { status } : {}),
        ...(userId ? { userId } : {}),
        ...(sinceDate && !Number.isNaN(sinceDate.getTime())
          ? { createdAt: { gte: sinceDate } }
          : {}),
        ...cursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: GENERATION_SELECT,
    });

    // `assetUrls` (JSON brut) devient `urls` (liste de chaînes) — même forme
    // que celle servie au créateur par `generations/serialize.ts`, pour que les
    // deux surfaces n'aient pas à interpréter le JSON différemment.
    const page = buildPage(rows, limit);
    const items = page.items.map(({ assetUrls, ...row }) => ({
      ...row,
      urls: asUrlList(assetUrls),
    }));

    return NextResponse.json(
      { items, nextCursor: page.nextCursor },
      { headers: { 'x-request-id': ctx.requestId, 'cache-control': 'private, no-store' } },
    );
  });
}
