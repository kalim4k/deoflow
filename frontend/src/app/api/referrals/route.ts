/**
 * GET /api/referrals — le tableau de bord d'affiliation d'un créateur.
 *
 * Une seule route, un seul aller-retour : le lien, les statistiques et les
 * dernières commissions arrivent ensemble. Sur une 4G instable, trois appels
 * en cascade donneraient trois occasions d'échouer.
 *
 * Le code public est attribué à la demande, ici : la majorité des comptes ne
 * parrainent jamais, il n'y a aucune raison d'en créer un pour tout le monde à
 * l'inscription.
 */
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { loadGuardConfigFromEnv } from '@/lib/server/withdrawals/guards';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  ensureReferralCode,
  getReferralStats,
  listCommissions,
} from '@/lib/server/referrals/service';
import { COMMISSION_RATE_BPS, referralLink } from '@/lib/deoflow/referrals';

/**
 * Origine du lien partagé.
 *
 * `APP_URL` d'abord — c'est la seule valeur que NOUS contrôlons. Les en-têtes
 * `x-forwarded-*` viennent du client et peuvent être forgés : un lien construit
 * dessus enverrait les filleuls d'un créateur sur le domaine d'un attaquant.
 * L'en-tête n'est consulté qu'en dernier recours, en développement, où
 * `APP_URL` peut manquer.
 */
function resolveOrigin(req: NextRequest): string {
  const configured = (process.env.APP_URL ?? '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return req.nextUrl.origin;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const userId = auth.user.sub;
    const code = await ensureReferralCode(userId);

    const [stats, commissions, account] = await Promise.all([
      getReferralStats(userId),
      listCommissions(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { withdrawalPinHash: true } }),
    ]);

    // Les règles du retrait viennent du serveur, pas d'une constante recopiée
    // dans le formulaire. Sans ça, un créateur demande 500 F, remplit tout, et
    // se fait refuser par un minimum de 1 000 F que l'écran ne lui a jamais
    // dit — et il ne peut pas deviner que le blocage vient de là.
    const guards = loadGuardConfigFromEnv(process.env);

    return NextResponse.json(
      {
        code,
        link: referralLink(resolveOrigin(req), code),
        rateBps: COMMISSION_RATE_BPS,
        stats,
        commissions,
        payout: {
          minAmountFcfa: guards.minAmount,
          maxAmountFcfa: guards.maxAmount,
          requiresPin: guards.requirePin,
          // Le HACHÉ ne sort jamais : seule son existence est utile à l'écran,
          // pour savoir s'il faut demander le code ou proposer de le créer.
          hasPin: account?.withdrawalPinHash != null,
        },
      },
      {
        headers: {
          'x-request-id': ctx.requestId,
          // Chiffres d'argent : jamais de cache partagé, jamais de réponse
          // servie à un autre compte par un intermédiaire.
          'cache-control': 'private, no-store',
        },
      },
    );
  });
}
