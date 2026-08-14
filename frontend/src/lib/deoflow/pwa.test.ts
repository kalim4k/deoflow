import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import manifest from '@/app/manifest';

/**
 * Application installable — les trois pièces doivent rester cohérentes :
 * le manifeste, le service worker, et les fichiers d'icônes qu'ils désignent.
 *
 * Le mode de panne dominant ici est le silence. Une icône absente, une clé
 * manquante, et Chrome cesse simplement de proposer l'installation : pas
 * d'erreur en console, pas d'échec de build, rien dans les journaux. On ne
 * s'en aperçoit qu'en constatant que le bouton n'apparaît plus — sur un
 * téléphone, des semaines après.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../..');

const sw = readFileSync(resolve(FRONTEND, 'public/sw.js'), 'utf8');
/** Le fichier privé de ses commentaires : ils citent les règles qu'on teste. */
const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const m = manifest();

describe('le service worker ne met jamais en cache ce qui appartient à quelqu’un', () => {
  it('sort immédiatement sur toute requête /api/', () => {
    // LA règle. Le cache d'un service worker est partagé par ORIGINE, pas par
    // utilisateur : un solde de crédits mis en cache pour un compte serait
    // servi au suivant sur un téléphone prêté.
    expect(swCode).toMatch(/pathname\.startsWith\('\/api\/'\)\s*\)\s*return/);
  });

  it('ignore les requêtes non-GET', () => {
    // Rejouer un POST depuis un worker, c'est débiter deux fois.
    expect(swCode).toMatch(/request\.method !== 'GET'\s*\)\s*return/);
  });

  it('ne met en cache que des ressources publiques et immuables', () => {
    const fn = swCode.slice(
      swCode.indexOf('function isImmutableAsset'),
      swCode.indexOf('}', swCode.indexOf('function isImmutableAsset')),
    );
    expect(fn).toContain('/_next/static/');
    expect(fn).toContain('/icons/');
    // Toute autre entrée mérite d'être relue : ces deux-là sont sûres parce
    // que leur nom porte une empreinte de contenu ou qu'elles sont publiques.
    expect(fn.match(/pathname\.startsWith/g)).toHaveLength(2);
  });

  it('sert le réseau d’abord pour les navigations', () => {
    // Une page authentifiée servie depuis le cache montrerait le compte
    // précédent. Le cache n'intervient qu'après un échec réseau.
    const nav = swCode.slice(swCode.indexOf("request.mode === 'navigate'"));
    expect(nav.indexOf('await fetch(request)')).toBeLessThan(nav.indexOf('caches.open'));
  });

  it('déclare les trois écouteurs attendus', () => {
    // Sans écouteur `fetch`, Chrome ne propose pas l'installation, même avec
    // un manifeste parfait.
    for (const evt of ['install', 'activate', 'fetch']) {
      expect(swCode).toContain(`self.addEventListener('${evt}'`);
    }
  });
});

describe('le manifeste remplit les conditions d’installabilité', () => {
  it('porte un nom, un nom court et une identité stable', () => {
    expect(m.name).toBe('Deoflow');
    expect(m.short_name).toBe('Deoflow');
    // Sans `id`, changer `start_url` ferait apparaître une deuxième
    // application installée à côté de la première.
    expect(m.id).toBeTruthy();
  });

  it('s’ouvre en mode autonome sur une route de l’application', () => {
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBeTruthy();
    const page = resolve(FRONTEND, `src/app${m.start_url}/page.tsx`);
    expect(existsSync(page), `start_url ${m.start_url} ne correspond à aucune page`).toBe(true);
  });

  it('fournit les tailles 192 et 512 exigées par Chrome', () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('fournit une icône maskable — c’est elle qui donne les bords arrondis', () => {
    // Sans elle, Android pose l'icône dans un carré blanc avec une marge.
    const maskable = (m.icons ?? []).filter((i) => i.purpose === 'maskable');
    expect(maskable).toHaveLength(1);
    expect(maskable[0]?.sizes).toBe('512x512');
  });

  it('chaque icône déclarée existe réellement sur le disque', () => {
    // Le test le plus utile de la série : un manifeste qui pointe vers un
    // fichier absent rend l'application non installable, en silence.
    for (const i of m.icons ?? []) {
      const file = resolve(FRONTEND, 'public', i.src.replace(/^\//, ''));
      expect(existsSync(file), `${i.src} est déclaré mais absent de public/`).toBe(true);
    }
  });
});

describe('câblage dans le layout', () => {
  const layout = readFileSync(resolve(FRONTEND, 'src/app/layout.tsx'), 'utf8');

  it('monte l’enregistrement du worker et l’invite d’installation', () => {
    expect(layout).toContain('<ServiceWorkerRegistrar />');
    expect(layout).toContain('<InstallPrompt />');
  });

  it('n’interdit pas le zoom', () => {
    // `maximum-scale` / `user-scalable=no` empêchent d'agrandir le texte :
    // échec WCAG 1.4.4, et une gêne réelle pour qui lit mal les petits corps.
    expect(layout).not.toMatch(/maximumScale|userScalable/);
  });

  it('la page hors ligne reste statique', () => {
    // Elle est mise en cache à l'installation du worker. Si elle lisait une
    // session, cette session serait servie au propriétaire suivant du téléphone.
    const page = readFileSync(resolve(FRONTEND, 'src/app/offline/page.tsx'), 'utf8');
    expect(page).not.toContain('use client');
    expect(page).not.toMatch(/useAuth|from '@\/lib\/api'|fetch\(/);
  });
});
