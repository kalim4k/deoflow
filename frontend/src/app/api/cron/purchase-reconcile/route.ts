/**
 * Rattrapage des achats de crédits — le chemin principal, pas un secours.
 *
 * Maketou n'a pas de webhook. Un acheteur confirme son paiement Tmoney dans
 * l'application de son opérateur, et rien ne le ramène automatiquement à notre
 * onglet : la plupart des paiements sont donc confirmés APRÈS que le navigateur
 * a cessé de sonder. Sans ce cron, ces achats ne seraient jamais crédités.
 *
 * `settlePurchase()` est idempotent : il peut croiser le sondage du navigateur
 * sur la même commande sans jamais créditer deux fois.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { reconcilePurchases, type ReconcileResult } from '@/lib/server/purchases/service';

const log = createLogger();
const LEASE_TTL_MS = 120_000; // ~2 × maxDuration

async function handle(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let result: ReconcileResult = { scanned: 0, settled: 0, failed: 0, skipped: 0 };

    await withLease(redis ?? undefined, 'purchase-reconcile', LEASE_TTL_MS, async () => {
      result = await reconcilePurchases({});
      log.info('purchase-reconcile tick', { ...result, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, ...result },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

/**
 * Vercel Cron déclenche ses tâches en **GET**. Les six crons hérités de la
 * trousse de départ n'exposent que POST — un choix à revoir de leur côté.
 * Celui-ci est sur le chemin de l'argent : un 405 silencieux signifierait des
 * crédits payés et jamais livrés, donc il répond aux deux verbes.
 *
 * Aucun risque à accepter GET : `verifyCronSecret` garde l'entrée, et la
 * fonction est idempotente par construction.
 */
export const GET = handle;
export const POST = handle;
