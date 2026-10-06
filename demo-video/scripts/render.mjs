/**
 * Rend la vidéo de démonstration et la pose sur le site.
 *
 *   npm run render
 *
 * Dans l'ordre :
 *   1. régénère `src/facts.json` depuis le catalogue du site — un prix changé
 *      depuis le dernier rendu se retrouve donc à l'écran ;
 *   2. rend le MP4 (H.264, sans piste son) et l'image d'affiche ;
 *   3. les copie dans `frontend/public/demo/` ;
 *   4. écrit `frontend/src/lib/deoflow/demoVideo.ts` : chemins, dimensions et
 *      début des chapitres, que la page d'accueil lit pour ses boutons.
 *
 * Ce dernier fichier est GÉNÉRÉ : le modifier à la main, c'est désynchroniser
 * les boutons de chapitre de la vidéo au prochain rendu.
 */
import { execSync } from 'node:child_process';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Node ≥ 22.18 lit le TypeScript sans étape de compilation.
import { CHAPTERS, FPS, HEIGHT, POSTER_FRAME, TOTAL, WIDTH } from '../src/timeline.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const repo = resolve(root, '..');
const site = resolve(repo, 'frontend');

const run = (command, cwd = root) => execSync(command, { cwd, stdio: 'inherit' });

console.log('1/4  Chiffres du catalogue');
run('pnpm --filter frontend run demo:facts', repo);

console.log('2/4  Rendu');
await mkdir(resolve(root, 'out'), { recursive: true });
// CRF 26 + preset lent : l'interface est faite d'aplats, elle se compresse
// très bien. La cible charge la page d'accueil en 4G : chaque Mo compte.
run(
  'npx remotion render src/index.ts deoflow-demo out/deoflow-demo.mp4 ' +
    '--codec=h264 --crf=26 --x264-preset=slow --pixel-format=yuv420p --muted --concurrency=50% ' +
    // Le clip Veo est décodé image par image pendant le rendu : sur une machine
    // chargée, le délai par défaut (30 s) ne suffit pas toujours.
    '--timeout=120000',
);
run(
  `npx remotion still src/index.ts deoflow-demo out/deoflow-demo-poster.jpg ` +
    `--frame=${POSTER_FRAME} --image-format=jpeg --jpeg-quality=80 --scale=0.75`,
);

console.log('3/4  Copie dans le site');
const publicDir = resolve(site, 'public/demo');
await mkdir(publicDir, { recursive: true });
await copyFile(resolve(root, 'out/deoflow-demo.mp4'), resolve(publicDir, 'deoflow-demo.mp4'));
await copyFile(
  resolve(root, 'out/deoflow-demo-poster.jpg'),
  resolve(publicDir, 'deoflow-demo-poster.jpg'),
);
for (const name of ['deoflow-demo.mp4', 'deoflow-demo-poster.jpg']) {
  const { size } = await stat(resolve(publicDir, name));
  console.log(`  ${name}  ${(size / 1024 / 1024).toFixed(2)} Mo`);
}

console.log('4/4  Chapitres');
const seconds = (frames) => Math.round((frames / FPS) * 100) / 100;
const chapters = CHAPTERS.map(
  (c) => `    { id: '${c.id}', label: '${c.label}', start: ${seconds(c.start)} },`,
);
const module = `// GÉNÉRÉ par demo-video/scripts/render.mjs — ne pas modifier à la main.
// Relancer \`npm run render\` dans demo-video/ après tout changement de la vidéo.

export const DEMO_VIDEO = {
  src: '/demo/deoflow-demo.mp4',
  poster: '/demo/deoflow-demo-poster.jpg',
  width: ${WIDTH},
  height: ${HEIGHT},
  durationSeconds: ${seconds(TOTAL)},
  chapters: [
${chapters.join('\n')}
  ],
} as const;
`;
const target = resolve(site, 'src/lib/deoflow/demoVideo.ts');
await writeFile(target, module);
run(`pnpm exec prettier --write "${target}"`, repo);
console.log('Terminé.');
