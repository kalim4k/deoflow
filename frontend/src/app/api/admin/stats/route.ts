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
import { computeAdminStats, resolveStatsRange, StatsRangeError } from '@/lib/server/admin/stats';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const q = req.nextUrl.searchParams;

    // `from` / `to` (YYYY-MM-DD) l'emportent sur `period` et ouvrent la fenêtre
    // personnalisée. Une période inconnue retombe sur 30 jours — un nom de
    // préréglage mal orthographié ne doit pas casser un tableau de bord — mais
    // une DATE explicite invalide renvoie 400 : l'administrateur a désigné une
    // fenêtre précise, lui en servir une autre en silence fausserait des
    // chiffres d'argent sans que rien ne le signale.
    let range;
    try {
      range = resolveStatsRange({
        period: q.get('period'),
        from: q.get('from'),
        to: q.get('to'),
      });
    } catch (err) {
      if (err instanceof StatsRangeError) {
        return NextResponse.json(
          { error: err.code, message: err.message },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const stats = await computeAdminStats(prisma, range);

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
