/**
 * GET /api/admin/stats — les agrégats du back-office.
 *
 * Une seule route pour toute la vue d'ensemble : un aller-retour, pas onze.
 * Le calcul vit dans `lib/server/admin/stats.ts`, testable sans HTTP.
 *
 * Lecture seule, donc pas de `logAdminAction` : consulter n'est pas muter, et
 * journaliser chaque affichage noierait les vraies écritures dans le bruit.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { computeAdminStats, parsePeriod } from '@/lib/server/admin/stats';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    // Une période inconnue retombe sur 30 jours plutôt que de renvoyer 400 :
    // un paramètre d'affichage mal formé ne doit pas casser un tableau de bord.
    const stats = await computeAdminStats(
      prisma,
      parsePeriod(req.nextUrl.searchParams.get('period')),
    );

    return NextResponse.json(stats, {
      headers: {
        'x-request-id': ctx.requestId,
        // Chiffres d'argent : aucun cache partagé, jamais servis à un autre
        // compte par un intermédiaire.
        'cache-control': 'private, no-store',
      },
    });
  });
}
