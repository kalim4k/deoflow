import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Plus aucun écran ne lit le magasin `localStorage`.
 *
 * Le produit a démarré sur une couche simulée : crédits, achats et générations
 * vivaient dans le navigateur, le temps que le serveur existe. Il existe. Le
 * dernier consommateur — l'historique d'achats de `/settings` — est passé sur
 * `/api/credits`.
 *
 * Ce test est là parce que la simulation ÉCHOUE EN SILENCE : un écran qui la
 * lit s'affiche parfaitement, avec des chiffres plausibles. Simplement, ce sont
 * ceux de l'appareil courant. Un créateur qui recharge depuis son téléphone
 * puis ouvre ses paramètres sur un ordinateur voit « aucun achat » et croit son
 * paiement perdu. Rien dans le code, rien dans les tests, rien à l'écran ne
 * signale l'erreur — d'où ce garde-fou.
 */
const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const screens = [...walk(join(ROOT, 'src', 'app')), ...walk(join(ROOT, 'src', 'components'))];

describe('les écrans lisent le serveur, pas le navigateur', () => {
  it('trouve bien les écrans à inspecter', () => {
    // Sans ça, un déplacement de dossier rendrait le test vert en n'inspectant
    // plus rien.
    expect(screens.length).toBeGreaterThan(40);
  });

  it('aucun écran n’est abonné au magasin simulé', () => {
    const guilty = screens.filter((f) => readFileSync(f, 'utf8').includes('useDeoflowState'));
    expect(guilty.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });

  it('la couche simulée n’est importée que pour le catalogue statique', () => {
    // `listModels` / `listPacks` / `findModel` ne simulent rien : ils filtrent
    // le catalogue écrit en dur dans `catalog.ts` et `packs.ts`. Les tolérer
    // évite un déplacement de fichiers sans valeur ; tolérer le RESTE
    // rouvrirait la porte au solde et aux achats fantômes.
    const SIMULATED = ['generate', 'deleteGeneration', 'buyPack', 'adjustCredits', 'quote'];
    for (const file of screens) {
      const src = readFileSync(file, 'utf8');
      const importLine = src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/deoflow\/client'/);
      if (!importLine?.[1]) continue;
      const imported = importLine[1].split(',').map((s) => s.trim());
      for (const name of imported) {
        expect(SIMULATED, `${file.slice(ROOT.length + 1)} importe ${name}`).not.toContain(name);
      }
    }
  });

  it('l’historique d’achats de /settings vient de l’API', () => {
    const src = readFileSync(join(ROOT, 'src', 'app', 'settings', 'page.tsx'), 'utf8');
    expect(src).toContain('fetchCredits');
    expect(src).not.toContain('useDeoflow');
  });
});
