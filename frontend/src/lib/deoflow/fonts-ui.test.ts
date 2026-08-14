import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * La police doit rester hébergée par nous.
 *
 * `next/font/google` va chercher le `.woff2` sur fonts.gstatic.com **pendant le
 * build**. Le 2026-08-14, ces URL ont renvoyé 404 et le déploiement Vercel a
 * échoué sur six « Module not found », sans qu'une seule ligne de notre code
 * n'ait bougé — seul le cache de build avait été vidé.
 *
 * Le piège est qu'un retour à `next/font/google` a l'air parfaitement innocent :
 * ça compile en local (la fonte est en cache), ça passe la revue, et ça ne
 * casse qu'un jour au hasard, sur une machine de build, chez quelqu'un d'autre.
 * D'où ce test plutôt qu'un commentaire.
 */
const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, '../../app');
const LAYOUT = resolve(APP, 'layout.tsx');
const FONT = resolve(APP, 'fonts/space-grotesk-latin.woff2');

const layout = readFileSync(LAYOUT, 'utf8');

/**
 * Le commentaire de `layout.tsx` explique justement pourquoi on n'utilise plus
 * `next/font/google` — il contient donc la chaîne interdite. Sans ce
 * dépouillement, le garde-fou se déclencherait sur sa propre justification.
 */
const code = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('la police est hébergée localement', () => {
  it('layout.tsx n’importe pas next/font/google', () => {
    expect(code).not.toContain('next/font/google');
  });

  it('layout.tsx charge la police via next/font/local', () => {
    expect(layout).toContain('next/font/local');
    expect(layout).toContain('./fonts/space-grotesk-latin.woff2');
  });

  it('le fichier de police est présent et est bien un WOFF2', () => {
    // Un `git clone` sans Git LFS, un .gitignore trop large, une « purge des
    // binaires » : autant de façons de perdre le fichier. Sans lui le build
    // échoue, mais avec un message qui ne dit pas pourquoi.
    const head = readFileSync(FONT).subarray(0, 4).toString('latin1');
    expect(head).toBe('wOF2');
    expect(statSync(FONT).size).toBeGreaterThan(10_000);
  });

  it('la plage de graisses couvre les 500 et 700 utilisées par l’interface', () => {
    // Fichier variable : une seule ressource pour les deux graisses. Déclarer
    // une graisse fixe ferait synthétiser un faux gras par le navigateur.
    expect(layout).toMatch(/weight:\s*'300 700'/);
  });
});
