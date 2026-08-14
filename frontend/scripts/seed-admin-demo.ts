// Jeu de démonstration pour le back-office.
// Usage :  pnpm seed:admin           — sème
//          pnpm seed:admin --clean   — retire exactement ce qui a été semé
//
// Pourquoi ce script existe : la base ne contient aucune commande payée,
// aucune commission et aucun retrait. Tous les écrans financiers de l'admin
// s'afficheraient donc à vide, et un agrégat FAUX serait indiscernable d'un
// agrégat vide. On sème des montants CHOISIS pour être reconnaissables à
// l'œil : si la vue d'ensemble n'affiche pas exactement le total imprimé en
// fin d'exécution, le calcul est faux.
//
// ⚠️ Ne touche QUE les comptes de test (`@test.dev`, `@deoflow.test`). Jamais
// un compte réel, jamais kalim@gmail.com. Une adresse absente est ignorée avec
// un avertissement plutôt que de faire échouer le lot.
//
// Réversibilité : chaque ligne semée porte un marqueur.
//   - Order.metadata.seedTag = 'admin-demo'
//   - Withdrawal.provider    = 'seed-admin-demo'
//   - CreditTransaction / ReferralCommission sont rattachées par `orderId`
// `--clean` supprime sur ces marqueurs, puis REJOUE le journal de crédits de
// chaque compte touché pour restaurer `balanceAfter` et `User.credits`. Le
// journal est la vérité ; le solde n'en est qu'un raccourci de lecture, donc
// le recalculer depuis le journal est exact par construction — et bien plus
// sûr que de tenter un mouvement inverse, qui laisserait des lignes fantômes.

import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { COMMISSION_RATE_BPS, commissionFor } from '../src/lib/deoflow/referrals';
import { findPack } from '../src/lib/deoflow/packs';

const SEED_TAG = 'admin-demo';
const SEED_PROVIDER = 'seed-admin-demo';
const TEST_DOMAINS = ['@test.dev', '@deoflow.test'];

/**
 * Achats semés. Les montants sont fixes et non aléatoires : un jeu de
 * démonstration qui change à chaque exécution ne permet de vérifier aucun
 * agrégat.
 *
 * `daysAgo` étale les achats pour que le sélecteur de période ait quelque
 * chose à trancher — deux achats seulement tombent dans les 7 derniers jours.
 */
const PURCHASES: Array<{ email: string; packId: string; daysAgo: number }> = [
  { email: 'filleul1786655592@test.dev', packId: 'createur', daysAgo: 25 },
  { email: 'filleul1786655592@test.dev', packId: 'starter', daysAgo: 12 },
  { email: 'f21786655667@test.dev', packId: 'createur', daysAgo: 9 },
  { email: 'f21786655667@test.dev', packId: 'starter', daysAgo: 3 },
  { email: 'test-e2e-1786526667@deoflow.test', packId: 'pro', daysAgo: 20 },
  { email: 'nav-1786528847@deoflow.test', packId: 'starter', daysAgo: 1 },
];

/** Demandes de retrait en attente, pour donner du grain à l'écran de versement. */
const WITHDRAWALS: Array<{ email: string; amount: number; method: string; phone: string }> = [
  {
    email: 'parrain1786655592@test.dev',
    amount: 1000,
    method: 'MIXX_BY_YAS',
    phone: '+22890112233',
  },
  { email: 'p21786655667@test.dev', amount: 2000, method: 'MOOV_MONEY', phone: '+22899887766' },
];

function isTestAccount(email: string): boolean {
  return TEST_DOMAINS.some((d) => email.endsWith(d));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function fcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

/**
 * Recalcule `balanceAfter` de chaque ligne puis `User.credits`, en rejouant le
 * journal dans l'ordre chronologique.
 *
 * Indispensable parce qu'on INSÈRE des lignes antidatées : leur `balanceAfter`
 * ne peut pas se déduire du solde courant, et toutes les lignes postérieures
 * deviennent fausses. Rejouer est la seule façon de garder l'invariant du
 * schéma — « additionner la colonne doit toujours redonner User.credits ».
 */
async function replayLedger(prisma: PrismaClient, userId: string): Promise<number> {
  const rows = await prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, credits: true, balanceAfter: true },
  });

  let balance = 0;
  for (const row of rows) {
    balance += row.credits;
    if (row.balanceAfter !== balance) {
      await prisma.creditTransaction.update({
        where: { id: row.id },
        data: { balanceAfter: balance },
      });
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { credits: balance } });
  return balance;
}

async function seed(prisma: PrismaClient): Promise<number> {
  const touched = new Set<string>();
  let revenue = 0;
  let credits = 0;
  let commissions = 0;
  let pending = 0;

  for (const row of PURCHASES) {
    if (!isTestAccount(row.email)) {
      console.error(`✗ ${row.email} n'est pas un compte de test — ignoré.`);
      continue;
    }
    const pack = findPack(row.packId);
    if (!pack) {
      console.error(`✗ pack inconnu : ${row.packId}`);
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true, referredById: true },
    });
    if (!user) {
      console.warn(`… ${row.email} introuvable — achat ignoré.`);
      continue;
    }

    const at = daysAgo(row.daysAgo);
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        amount: pack.priceFcfa,
        currency: 'XOF',
        status: 'PAID',
        provider: SEED_PROVIDER,
        metadata: { packId: pack.id, credits: pack.credits, seedTag: SEED_TAG },
        // `expiresAt` est obligatoire au schéma et n'est pas effacé au
        // paiement (c'est de l'historique) — on le date de la même journée.
        expiresAt: at,
        paidAt: at,
        createdAt: at,
      },
      select: { id: true },
    });

    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        credits: pack.credits,
        movement: 'PURCHASE',
        label: `Achat ${pack.name}`,
        // Corrigé juste après par le rejeu du journal : impossible à connaître
        // à l'insertion d'une ligne antidatée.
        balanceAfter: 0,
        amountFcfa: pack.priceFcfa,
        orderId: order.id,
        createdAt: at,
      },
    });

    // La commission suit la règle de production : elle n'existe que si
    // l'acheteur a un parrain, et se calcule avec le même taux.
    if (user.referredById) {
      const amount = commissionFor(pack.priceFcfa, COMMISSION_RATE_BPS);
      if (amount > 0) {
        await prisma.referralCommission.create({
          data: {
            referrerId: user.referredById,
            refereeId: user.id,
            orderId: order.id,
            orderAmount: pack.priceFcfa,
            rateBps: COMMISSION_RATE_BPS,
            amount,
            status: 'EARNED',
            createdAt: at,
          },
        });
        commissions += amount;
      }
    }

    touched.add(user.id);
    revenue += pack.priceFcfa;
    credits += pack.credits;
    console.log(`✓ ${row.email} — ${pack.name}, ${fcfa(pack.priceFcfa)}, il y a ${row.daysAgo} j`);
  }

  for (const row of WITHDRAWALS) {
    if (!isTestAccount(row.email)) {
      console.error(`✗ ${row.email} n'est pas un compte de test — ignoré.`);
      continue;
    }
    const user = await prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true },
    });
    if (!user) {
      console.warn(`… ${row.email} introuvable — retrait ignoré.`);
      continue;
    }

    await prisma.withdrawal.create({
      data: {
        userId: user.id,
        amount: row.amount,
        currency: 'XOF',
        status: 'PENDING',
        destination: { method: row.method, phone: row.phone },
        provider: SEED_PROVIDER,
        requestedAt: daysAgo(1),
      },
    });
    pending += row.amount;
    console.log(`✓ ${row.email} — demande de retrait de ${fcfa(row.amount)}`);
  }

  for (const userId of touched) await replayLedger(prisma, userId);

  console.log('\n─── à retrouver à l’identique dans le back-office ───');
  console.log(`Chiffre d’affaires (30 j) : ${fcfa(revenue)}`);
  console.log(`Crédits vendus            : ${credits.toLocaleString('fr-FR')}`);
  console.log(`Commissions générées      : ${fcfa(commissions)}`);
  console.log(`Retraits en attente       : ${fcfa(pending)}`);
  return 0;
}

async function clean(prisma: PrismaClient): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { provider: SEED_PROVIDER },
    select: { id: true, userId: true },
  });
  const orderIds = orders.map((o) => o.id);
  const touched = new Set(orders.map((o) => o.userId).filter((id): id is string => id !== null));

  // Ordre imposé par les contraintes : d'abord ce qui référence la commande,
  // la commande ensuite.
  const commissions = await prisma.referralCommission.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  const movements = await prisma.creditTransaction.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  const removed = await prisma.order.deleteMany({ where: { provider: SEED_PROVIDER } });
  const withdrawals = await prisma.withdrawal.deleteMany({ where: { provider: SEED_PROVIDER } });

  for (const userId of touched) await replayLedger(prisma, userId);

  console.log(
    `✓ retiré : ${removed.count} commandes, ${movements.count} mouvements, ` +
      `${commissions.count} commissions, ${withdrawals.count} retraits.`,
  );
  console.log(`✓ solde recalculé depuis le journal pour ${touched.size} compte(s).`);
  return 0;
}

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const prisma = getPrisma();
  try {
    return args.includes('--clean') ? await clean(prisma) : await seed(prisma);
  } finally {
    if (prismaClient) await prismaClient.$disconnect();
  }
}

// Garde d'entrée CLI — `pathToFileURL` et non `file://${argv[1]}` : sous
// Windows argv[1] est un chemin à antislashs qui ne correspond jamais à
// import.meta.url.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
