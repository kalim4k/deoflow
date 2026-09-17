// Récupère les générations refermées à tort en `PROVIDER_EMPTY_RESULT`.
// Usage : pnpm db:recover-generations [--apply]
//
// Contexte — pourquoi ce script existe :
//
// `getTask()` lisait les URLs de Veo à plat sur `data`, alors que kie.ai les
// range dans `data.response.resultUrls`. Toute génération Veo revenait donc
// avec zéro URL malgré un `successFlag: 1`, et `settleGeneration()` la
// refermait en échec. La vidéo existait chez kie.ai, déjà facturée sur notre
// compte, et le créateur voyait une erreur. Le correctif est dans
// `lib/server/ai/kie.ts` ; ce script rattrape ce que le bug a laissé derrière.
//
// ⚠️ Les URLs de kie.ai expirent (~24 h). Passé ce délai la vidéo est perdue :
// le script le signale et laisse la ligne en l'état plutôt que de la marquer
// réussie sans fichier.
//
// LES CRÉDITS NE SONT PAS RE-DÉBITÉS. `failGeneration()` a déjà remboursé le
// créateur au moment de l'échec ; la panne venant de notre code, la décision
// du propriétaire (2026-09-16) est de livrer la vidéo sans reprendre les
// crédits. Le script ne touche donc jamais au solde ni au journal
// `CreditTransaction` — il ne fait que rouvrir la génération.
//
// À blanc par défaut : sans `--apply`, il montre ce qu'il ferait et n'écrit rien.

import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import { getTask, tryCreateKieProvider } from '../src/lib/server/ai/kie';
import { copyResultsToStorage } from '../src/lib/server/generations/assets';

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const apply = args.includes('--apply');
  const prisma = getPrisma();

  const provider = tryCreateKieProvider();
  if (!provider) {
    console.error('KIE_API_KEY absente — impossible de re-sonder le fournisseur.');
    return 1;
  }

  const rows = await prisma.generation.findMany({
    where: {
      status: 'FAILED',
      failureCode: 'PROVIDER_EMPTY_RESULT',
      providerTaskId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (rows.length === 0) {
    console.log('Aucune génération à récupérer.');
    return 0;
  }

  console.log(
    `${rows.length} génération(s) à examiner.${apply ? '' : ' Mode simulation — ajoutez --apply pour écrire.'}\n`,
  );

  let recovered = 0;
  let expired = 0;

  for (const row of rows) {
    const label = `${row.id} (${row.modelSlug}, ${row.createdAt.toISOString().slice(0, 16)})`;

    let state;
    try {
      state = await getTask(provider, {
        taskId: row.providerTaskId!,
        family: row.providerFamily === 'veo' ? 'veo' : 'jobs',
      });
    } catch (err) {
      console.log(`✗ ${label} — sondage impossible : ${err instanceof Error ? err.message : err}`);
      continue;
    }

    if (state.status !== 'SUCCEEDED' || state.urls.length === 0) {
      console.log(`✗ ${label} — le fournisseur ne rend toujours pas de fichier (${state.status}).`);
      continue;
    }

    // Une URL expirée répond 404 : la recopie échouerait de toute façon, mais
    // la tester d'abord permet de le dire clairement plutôt que d'empiler des
    // erreurs de téléchargement dans les logs.
    const head = await fetch(state.urls[0]!, { method: 'HEAD' }).catch(() => null);
    if (!head?.ok) {
      expired += 1;
      console.log(
        `✗ ${label} — URL expirée chez kie.ai (${head?.status ?? 'injoignable'}). Perdue.`,
      );
      continue;
    }

    if (!apply) {
      recovered += 1;
      console.log(`→ ${label} — récupérable (${state.urls.length} fichier(s)).`);
      continue;
    }

    const { stored } = await copyResultsToStorage(
      state.urls,
      `generations/${row.userId}/${row.id}`,
    );
    if (stored.length === 0) {
      console.log(`✗ ${label} — recopie vers Cloudinary impossible.`);
      continue;
    }

    await prisma.generation.update({
      where: { id: row.id },
      data: {
        status: 'SUCCEEDED',
        sourceUrls: state.urls,
        assetUrls: stored,
        // L'échec n'a jamais eu lieu : on efface le motif pour que la galerie
        // et le back-office ne gardent pas la trace d'une panne qui n'en
        // était pas une.
        failureCode: null,
        failureReason: null,
        completedAt: new Date(),
      },
    });

    recovered += 1;
    console.log(`✓ ${label} — restaurée (${stored.length} fichier(s)).`);
  }

  console.log(
    `\n${apply ? 'Restaurées' : 'Récupérables'} : ${recovered} | Perdues (URL expirée) : ${expired}`,
  );
  if (!apply && recovered > 0) console.log('Relancez avec --apply pour écrire.');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(async (code) => {
      await prismaClient?.$disconnect();
      process.exit(code);
    })
    .catch(async (err: unknown) => {
      console.error(err);
      await prismaClient?.$disconnect();
      process.exit(1);
    });
}
