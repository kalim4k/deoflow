/**
 * Génère le visuel de marque d'un modèle du catalogue, via kie.ai.
 *
 *   pnpm --filter frontend run illustration <slug>
 *
 * Produit les deux tailles que `illustrationSrc()` attend, aux dimensions
 * exactes des visuels existants :
 *
 *   public/models/<slug>.webp        1400 × 788  (fiche du modèle)
 *   public/models/<slug>-card.webp    640 × 360  (grille du catalogue)
 *
 * Les deux doivent sortir du MÊME rendu : régénérer la vignette seule donnerait
 * deux visuels différents selon l'écran, et personne ne s'en apercevrait avant
 * longtemps — c'est la même raison qui a fait écrire `generate-icons.mjs`.
 *
 * ⚠️ La cible est sur 4G instable : les visuels existants pèsent de 4 à 20 Ko.
 * La qualité WebP est réglée pour rester dans cette enveloppe — un visuel à
 * 200 Ko ferait tomber la grille du catalogue sur un réseau faible.
 *
 * Demande `KIE_API_KEY`. Chaque appel coûte environ 8 crédits kie.ai.
 */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = resolve(here, '../public/models');

const API = 'https://api.kie.ai/api/v1/jobs';
const POLL_MS = 3000;
const TIMEOUT_MS = 4 * 60 * 1000;

/**
 * Le système visuel du catalogue, relevé sur les six visuels existants :
 * dégradé en diagonale, grands cercles translucides flous, pastille blanche
 * ronde au centre, nom en capitales grasses blanches en dessous.
 *
 * Le dégradé change d'un modèle à l'autre — rose/menthe pour Seedance,
 * bleu/orange pour Veo, indigo/olive pour Kling — c'est ce qui les distingue
 * dans la grille. D'où une paire de teintes propre à chaque entrée.
 */
const STYLE = [
  'Flat vector brand card, 16:9 landscape, minimal modern SaaS aesthetic.',
  'Smooth diagonal gradient background',
  'Scattered large soft translucent circles of varying sizes, slightly lighter than the background, very soft blurred edges, low contrast, bokeh-like, some cropped by the frame edges.',
  'Perfectly centered solid white circle badge with a soft subtle drop shadow.',
  'Clean, uncluttered, flat colors, no photography, no 3D, no gloss, no texture noise.',
].join(' ');

const PROMPTS = {
  'minimax-h3': [
    STYLE.replace(
      'Smooth diagonal gradient background',
      'Smooth diagonal gradient background from deep violet on the left to warm amber orange on the right.',
    ),
    // Un symbole abstrait, PAS le logo de MiniMax : un générateur d'images
    // rendrait une marque déposée de travers, et ce serait une marque déposée
    // quand même. La forme d'onde dit ce que fait le modèle — caler une vidéo
    // sur une voix fournie.
    'Inside the white circle badge: a simple flat audio waveform icon, five vertical rounded bars of different heights, colored with the same violet-to-amber gradient.',
    'Below the badge, the text "MINIMAX H3" in bold uppercase white sans-serif with wide letter spacing, crisp and perfectly legible.',
    'No other text anywhere in the image. No watermark, no logo, no signature.',
  ].join(' '),
};

async function kie(url, init) {
  const key = process.env.KIE_API_KEY?.trim();
  if (!key) throw new Error('KIE_API_KEY absente — ajoutez-la dans frontend/.env');
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  // kie.ai renvoie son vrai statut dans le corps, même sur un HTTP 200.
  const body = await res.json().catch(() => null);
  if (!body) throw new Error(`kie.ai : réponse illisible (HTTP ${res.status})`);
  if (body.code !== 200 || !body.data) throw new Error(`kie.ai : ${body.code} — ${body.msg}`);
  return body.data;
}

async function generate(prompt) {
  const { taskId } = await kie(`${API}/createTask`, {
    method: 'POST',
    body: JSON.stringify({
      model: 'nano-banana-2',
      input: { prompt, aspect_ratio: '16:9', resolution: '2K', output_format: 'png' },
    }),
  });
  process.stdout.write(`… tâche ${taskId}`);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const task = await kie(`${API}/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    if (task.state === 'fail') throw new Error(task.failMsg || 'génération échouée');
    if (task.state !== 'success') {
      process.stdout.write('.');
      continue;
    }
    const url = JSON.parse(task.resultJson).resultUrls?.[0];
    if (!url) throw new Error('aucune image dans la réponse');
    // Les liens de kie.ai expirent : on télécharge tout de suite.
    const img = await fetch(url);
    if (!img.ok) throw new Error(`téléchargement impossible (HTTP ${img.status})`);
    console.log(`\n✔ généré (${task.costTime ?? '?'} ms)`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('délai dépassé');
}

/** Les deux tailles exactes des visuels déjà en place. */
const SIZES = [
  { suffix: '', width: 1400, height: 788, quality: 82 },
  { suffix: '-card', width: 640, height: 360, quality: 80 },
];

async function main() {
  const slug = process.argv[2];
  const prompt = PROMPTS[slug];
  if (!prompt) {
    console.error(`Usage : pnpm --filter frontend run illustration <slug>`);
    console.error(`Slugs décrits : ${Object.keys(PROMPTS).join(', ')}`);
    return 1;
  }

  const source = await generate(prompt);

  for (const { suffix, width, height, quality } of SIZES) {
    const out = resolve(MODELS_DIR, `${slug}${suffix}.webp`);
    const buf = await sharp(source)
      .resize(width, height, { fit: 'cover' })
      .webp({ quality })
      .toBuffer();
    await writeFile(out, buf);
    console.log(
      `  ${width}×${height}  ${(buf.byteLength / 1024).toFixed(1)} Ko  →  ${slug}${suffix}.webp`,
    );
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
