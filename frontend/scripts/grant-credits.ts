// Crédite (ou débite) un compte en ligne de commande.
// Usage : pnpm db:grant-credits <email> <crédits> [motif]
//
// Sert à amorcer un compte de test : sans crédits, aucune génération ne peut
// partir, et le paiement mobile money n'est pas encore branché.
//
// Le mouvement passe par la même couche que le reste de l'application — donc
// journal `CreditTransaction` écrit, solde recalculé, verrou par utilisateur.
// Écrire `User.credits` à la main ferait diverger le solde du journal, et la
// divergence ne se verrait qu'au moment d'un litige.
//
// ⚠️ Un crédit accordé ici n'a été payé par personne. À réserver au
// développement et au dépannage, jamais à un geste commercial en production —
// pour ça, la voie auditée est l'ajustement administrateur (F34 du PRD), qui
// passe par `logAdminAction`.

import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { creditCredits, debitCredits, withUserCredits } from '../src/lib/server/credits';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const email = args[0]?.trim().toLowerCase();
  const amount = Number(args[1]);
  const reason = args.slice(2).join(' ').trim() || 'Attribution en ligne de commande';

  if (!email || !Number.isInteger(amount) || amount === 0) {
    console.error('Usage : pnpm db:grant-credits <email> <crédits ≠ 0> [motif]');
    return 1;
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, credits: true },
  });
  if (!user) {
    console.error(`Aucun compte pour ${email}`);
    return 1;
  }

  try {
    const balance = await withUserCredits(user.id, (tx) => {
      const input = {
        userId: user.id,
        credits: Math.abs(amount),
        movement: 'ADMIN_ADJUSTMENT' as const,
        label: reason,
      };
      return amount > 0 ? creditCredits(tx, input) : debitCredits(tx, input);
    });

    console.log(`${email} : ${user.credits} → ${balance} crédits (${reason})`);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().then((code) => process.exit(code));
}
