/**
 * Produit les deux rendus RÉELS montrés dans la vidéo de démonstration.
 *
 *   pnpm --filter frontend run demo:assets            # visage, puis clip
 *   pnpm --filter frontend run demo:assets -- video   # clip seul (visage déjà fait)
 *
 * La vidéo de la page d'accueil montre un personnage créé, puis animé. Ces deux
 * résultats ne sont pas dessinés : ils sortent de `createTask` / `getTask`, le
 * même code que l'application, avec les mêmes gabarits de prompt
 * (`buildPortraitPrompt`, `composePrompt`) et les mêmes réglages verrouillés.
 * La page d'accueil a déjà été purgée une fois de ses « aperçus simulés » ; une
 * démonstration qui montrerait un résultat que le produit ne sait pas faire
 * serait la même faute, en animé.
 *
 * Écrit dans `demo-video/public/` :
 *   awa.jpg          le visage, tel que Nano Banana 2 l'a rendu (réduit à 800 px)
 *   awa-lome.mp4     le clip Veo 3.1, tel quel
 *   provenance.json  prompts envoyés, identifiants de tâche, date — de quoi
 *                    prouver que ces deux fichiers sont de vrais rendus.
 *
 * Coût : 8 + 30 crédits kie.ai, débités sur le compte du propriétaire et non
 * sur un compte créateur — ce script ne passe pas par la base.
 */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, getTask, tryCreateKieProvider } from '../src/lib/server/ai/kie';
import type { GenerateRequest, KieProvider, TaskHandle } from '../src/lib/server/ai/kie';
import { buildPortraitPrompt, PORTRAIT_RATIO } from '../src/lib/server/avatars/portrait';
import { composePrompt } from '../src/lib/deoflow/avatarPrompt';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../../demo-video/public');
const PROVENANCE = resolve(OUT, 'provenance.json');

/**
 * Le personnage de la démonstration. La description est mot pour mot
 * l'exemple affiché dans le champ du formulaire de création : la vidéo montre
 * ce texte se taper, le visage doit donc en être le résultat.
 */
const AVATAR = {
  name: 'Awa',
  description:
    'Jeune femme togolaise de 24 ans, mince, 1m68, tresses longues, style afro-urbain, grandes boucles d’oreilles dorées',
};

/** La scène tapée dans l'atelier vidéo, à l'écran comme ici. */
const SCENE =
  'Elle marche dans un marché coloré de Lomé, sourit et salue la caméra, lumière dorée de fin d’après-midi.';

const POLL_MS = 5_000;
const TIMEOUT_MS = 10 * 60 * 1000;

interface Provenance {
  generatedAt: string;
  portrait?: { taskId: string; model: string; prompt: string; sourceUrl: string };
  video?: { taskId: string; model: string; prompt: string; sourceUrl: string };
}

async function waitFor(provider: KieProvider, handle: TaskHandle): Promise<string> {
  const deadline = Date.now() + TIMEOUT_MS;
  process.stdout.write(`  tâche ${handle.taskId} `);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const state = await getTask(provider, handle);
    if (state.status === 'RUNNING') {
      process.stdout.write('.');
      continue;
    }
    if (state.status === 'FAILED') {
      throw new Error(`\n  échec chez kie.ai : ${state.code ?? '?'} — ${state.message}`);
    }
    const url = state.urls[0];
    if (!url) throw new Error('\n  tâche réussie sans URL');
    console.log(' ✔');
    return url;
  }
  throw new Error('\n  délai dépassé');
}

/** Les liens de kie.ai expirent : on télécharge tout de suite. */
async function download(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`téléchargement impossible (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function readProvenance(): Promise<Provenance> {
  try {
    return JSON.parse(await readFile(PROVENANCE, 'utf8')) as Provenance;
  } catch {
    return { generatedAt: new Date().toISOString() };
  }
}

async function makePortrait(provider: KieProvider, record: Provenance): Promise<string> {
  console.log('1/2  Visage — Nano Banana 2');
  const request: GenerateRequest = {
    modelSlug: 'nano-banana-2',
    mode: 'text',
    prompt: buildPortraitPrompt(AVATAR.description),
    aspectRatio: PORTRAIT_RATIO,
  };
  const handle = await createTask(provider, request);
  const url = await waitFor(provider, handle);

  const jpg = await sharp(await download(url))
    .resize(800, 800, { fit: 'cover' })
    .jpeg({ quality: 86 })
    .toBuffer();
  await writeFile(resolve(OUT, 'awa.jpg'), jpg);
  console.log(`  → awa.jpg (${(jpg.byteLength / 1024).toFixed(0)} Ko)`);

  record.portrait = {
    taskId: handle.taskId,
    model: 'nano-banana-2',
    prompt: request.prompt,
    sourceUrl: url,
  };
  return url;
}

async function makeVideo(provider: KieProvider, portraitUrl: string, record: Provenance) {
  console.log('2/2  Clip — Veo 3.1, personnage en référence');
  // Exactement ce que l'atelier envoie quand un avatar est choisi sur Veo :
  // mode « références », visage dans `imageUrls`, description de l'avatar
  // placée avant la scène.
  const request: GenerateRequest = {
    modelSlug: 'veo-3-1',
    mode: 'references',
    prompt: composePrompt(AVATAR, SCENE),
    aspectRatio: '9:16',
    params: { resolution: '720p' },
    media: { imageUrls: [portraitUrl] },
  };
  const handle = await createTask(provider, request);
  const url = await waitFor(provider, handle);

  const mp4 = await download(url);
  await writeFile(resolve(OUT, 'awa-lome.mp4'), mp4);
  console.log(`  → awa-lome.mp4 (${(mp4.byteLength / 1024 / 1024).toFixed(1)} Mo)`);

  record.video = {
    taskId: handle.taskId,
    model: 'veo-3-1',
    prompt: request.prompt,
    sourceUrl: url,
  };
}

async function main(): Promise<number> {
  const provider = tryCreateKieProvider();
  if (!provider) {
    console.error('KIE_API_KEY absente — ajoutez-la dans frontend/.env');
    return 1;
  }
  await mkdir(OUT, { recursive: true });

  const videoOnly = process.argv.includes('video');
  const record = await readProvenance();

  let portraitUrl: string;
  if (videoOnly) {
    // L'URL de kie.ai reste lisible ~24 h : au-delà, il faut refaire le visage.
    if (!record.portrait) {
      console.error('Aucun visage enregistré — lancez d’abord le script sans argument.');
      return 1;
    }
    portraitUrl = record.portrait.sourceUrl;
  } else {
    portraitUrl = await makePortrait(provider, record);
    await writeFile(PROVENANCE, JSON.stringify(record, null, 2) + '\n');
  }

  await makeVideo(provider, portraitUrl, record);
  record.generatedAt = new Date().toISOString();
  await writeFile(PROVENANCE, JSON.stringify(record, null, 2) + '\n');
  console.log('Terminé.');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
