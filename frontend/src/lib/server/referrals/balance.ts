/**
 * Solde retirable de Deoflow — les commissions de parrainage, et rien d'autre.
 *
 * ⚠️ Corrige un défaut hérité du starter. `createDefaultBalanceComputer`
 * (`withdrawals/balance.ts`) additionne les commandes `PAID` de l'utilisateur
 * et les compte comme des GAINS. C'est juste pour une marketplace, où une
 * commande payée est de l'argent qui entre chez le vendeur. Chez Deoflow, une
 * commande payée est un ACHAT DE CRÉDITS : de l'argent qui sort de la poche de
 * l'utilisateur. Branché tel quel, n'importe quel compte pouvait demander le
 * retrait de ce qu'il venait de dépenser.
 *
 * La seule créance qu'un utilisateur détient sur Deoflow est sa commission de
 * parrainage. C'est donc la seule chose retirable.
 */
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import type { BalanceComputer } from '@/lib/server/withdrawals/balance';
import type { TxClient } from '@/lib/server/withdrawals/lock';

/**
 * `tx` n'est pas optionnel par confort : la route de retrait le transmet pour
 * que la lecture se fasse SOUS le verrou consultatif. Sans ça, deux demandes
 * simultanées liraient toutes deux le solde d'avant la réservation de l'autre
 * et le compte partirait en négatif.
 */
export function createCommissionBalanceComputer(prisma: PrismaClient): BalanceComputer {
  return async function computeBalance(userId: string, tx?: TxClient): Promise<number> {
    const client: PrismaClient | TxClient = tx ?? prisma;

    const [commissions, withdrawals] = await Promise.all([
      // `PAID` est compté avec `EARNED` : une commission versée a pour
      // contrepartie un retrait `COMPLETED`, soustrait juste après. L'exclure
      // reviendrait à retrancher deux fois le même versement.
      client.referralCommission.aggregate({
        where: { referrerId: userId, status: { in: ['EARNED', 'PAID'] } },
        _sum: { amount: true },
      }),
      // `PENDING` et `PROCESSING` sont des RÉSERVATIONS : l'argent n'est pas
      // encore parti mais il est promis. Les ignorer laisserait demander deux
      // fois le même retrait avant que le premier ne soit traité.
      client.withdrawal.aggregate({
        where: { userId, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] } },
        _sum: { amount: true },
      }),
    ]);

    const earned = commissions._sum.amount ?? 0;
    const reserved = withdrawals._sum.amount ?? 0;
    return Math.max(0, earned - reserved);
  };
}
