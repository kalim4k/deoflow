import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le vol de curseur des modales.
 *
 * Test de SOURCE et non de comportement : reproduire la perte de focus
 * demanderait un DOM, un rendu React et une simulation de frappe pour observer
 * un `document.activeElement` — beaucoup de machinerie pour vérifier une seule
 * ligne, celle des dépendances de l'effet. C'est là que le défaut vit, c'est là
 * qu'on le surveille.
 *
 * Le défaut : `onClose` dans les dépendances. Tous les appelants passent une
 * fonction fléchée en ligne, donc une identité neuve à chaque rendu ; l'effet
 * rejouait à chaque frappe et `panel.focus()` reprenait le curseur au champ en
 * cours de saisie. Symptôme à l'écran — « il faut recliquer entre chaque
 * lettre » — qui ne désigne en rien sa cause.
 */
const RAW = readFileSync(join(process.cwd(), 'src', 'components', 'ui', 'Modal.tsx'), 'utf8');
// Commentaires retirés : la docstring cite le code fautif pour l'expliquer, et
// gonflerait les comptages.
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('la modale ne reprend pas le curseur pendant la saisie', () => {
  it('l’effet ne dépend que de `open`', () => {
    const deps = SRC.match(/\}, \[([^\]]*)\]\);/g) ?? [];
    expect(deps.length).toBeGreaterThan(0);
    for (const dep of deps) {
      expect(dep, 'une dépendance change d’identité à chaque rendu').not.toContain('onClose');
    }
  });

  it('le focus n’est posé qu’une fois, dans l’effet d’ouverture', () => {
    expect((SRC.match(/\.focus\(\)/g) ?? []).length).toBe(1);
  });

  it('Échap passe par une référence mutable, pas par la valeur capturée', () => {
    // C'est ce qui permet de sortir `onClose` des dépendances sans que
    // l'écouteur clavier ne se fige sur une version périmée.
    expect(SRC).toContain('onCloseRef.current()');
  });
});
