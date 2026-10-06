/**
 * Rend quelques images fixes de la vidéo, pour vérifier un cadrage sans
 * relancer tout le rendu.
 *
 *   npm run stills -- 111 145 193        # images globales, dans out/stills/
 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const frames = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (frames.length === 0) {
  console.error('Usage : npm run stills -- <image> [<image>…]');
  process.exit(1);
}

const out = resolve('out/stills');
await mkdir(out, { recursive: true });

const serveUrl = await bundle({ entryPoint: resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'deoflow-demo' });

for (const frame of frames) {
  const output = resolve(out, `${String(frame).padStart(4, '0')}.png`);
  // Taille réelle, jamais réduite : à une autre échelle, Chrome ne coupe pas
  // les lignes de texte au même endroit, et tout ce qui suit se décale — un
  // cadrage juste en aperçu réduit tombe à côté dans la vidéo.
  await renderStill({ composition, serveUrl, frame, output, scale: 1 });
  console.log(`✔ ${frame}`);
}
