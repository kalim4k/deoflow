/**
 * POST /api/generations — lance une génération (débite, puis soumet).
 * GET  /api/generations — galerie du créateur, la plus récente d'abord.
 *
 * Le coût n'est jamais lu depuis la requête : il est recalculé côté serveur
 * par `quoteGeneration()`. Le client peut afficher ce qu'il veut, il ne décide
 * pas de ce qu'on lui prend.
 *
 * En-tête `Idempotency-Key` optionnel mais recommandé : un double-clic sur
 * « Générer » rejouerait sinon un appel facturé.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import {
  GenerationRequestError,
  InsufficientCreditsError,
  createGeneration,
} from '@/lib/server/generations/service';
import { serializeGeneration } from '@/lib/server/generations/serialize';

const bodySchema = z.object({
  modelSlug: z.string().min(1).max(64),
  mode: z.string().min(1).max(32).optional(),
  prompt: z.string().max(30_000).default(''),
  ratio: z.string().max(16).nullable().optional(),
  durationSeconds: z.number().int().positive().max(600).nullable().optional(),
  params: z.record(z.string(), z.union([z.string().max(64), z.boolean()])).optional(),
  media: z.record(z.string(), z.array(z.string().url().max(2048)).max(14)).optional(),
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
      const row = await createGeneration({
        userId: auth.user.sub,
        ...parsed.data,
        idempotencyKey: req.headers.get('idempotency-key'),
      });
      return NextResponse.json(serializeGeneration(row), {
        status: 201,
        headers: { 'x-request-id': ctx.requestId },
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            error: err.code,
            message: err.message,
            required: err.required,
            available: err.available,
          },
          { status: 402, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      if (err instanceof GenerationRequestError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.status, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limitRaw = Number(url.searchParams.get('limit') ?? 30);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 60) : 30;
    const kind = url.searchParams.get('kind');

    // Le total consommé accompagne la liste plutôt que d'être recalculé par
    // l'écran : le tableau de bord n'affiche que 5 générations, en additionner
    // les crédits donnait un « consommé » qui n'était le total de rien.
    //
    // Il vit ici, sur la même table et dans la même salve, plutôt que sur
    // `/api/credits` : cet écran ne l'appelle pas, et l'y ajouter rétablirait
    // l'aller-retour supplémentaire qu'on vient de supprimer du chargement.
    //
    // Les visages d'avatars SONT comptés : ils ont été payés. Ils sont écartés
    // de la galerie, pas de la facture.
    const [rows, spent] = await Promise.all([
      prisma.generation.findMany({
        where: {
          userId: auth.user.sub,
          // La galerie est la production PUBLIABLE du créateur. Un visage
          // d'avatar sort du même moteur mais n'en fait pas partie : c'est du
          // matériel de travail, il vit sur /avatars.
          //
          // Le filtre est ici, dans la route, et non dans chaque écran : toute
          // surface future qui listera des générations héritera du bon
          // comportement sans y penser. L'inverse garantit qu'un écran ajouté
          // dans six mois affichera les visages au milieu des créations.
          purpose: 'CREATION',
          // Une génération PENDING n'a pas encore été soumise : l'afficher dans
          // la galerie ferait clignoter une vignette vide à chaque lancement.
          status: { in: ['RUNNING', 'SUCCEEDED', 'FAILED'] },
          ...(kind === 'image' || kind === 'video' ? { kind } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.generation.aggregate({
        _sum: { credits: true },
        // Un échec est remboursé : le compter serait annoncer une dépense qui
        // n'a pas eu lieu.
        where: { userId: auth.user.sub, status: { not: 'FAILED' } },
      }),
    ]);

    return NextResponse.json(
      { items: rows.map(serializeGeneration), spent: spent._sum.credits ?? 0 },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
