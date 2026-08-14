import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deux invariants d'interface signalés par le propriétaire du produit, et qui
 * ne se voient que sur un écran — donc jamais dans une revue de code.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
}

/** Le fichier privé de ses commentaires : une explication n'est pas un rendu. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

describe('champs mot de passe', () => {
  const PAGES = [
    ['connexion', ['app', 'login', 'page.tsx']],
    ['inscription', ['app', 'signup', 'page.tsx']],
    ['réinitialisation', ['app', 'reset-password', 'page.tsx']],
    ['réglages', ['app', 'settings', 'page.tsx']],
  ] as const;

  it.each(PAGES)('%s : passe par PasswordField', (_name, parts) => {
    const src = read(...parts);
    // Un `<input type="password">` posé à la main perd le bouton d'affichage —
    // et sur téléphone, saisir à l'aveugle est la première cause d'échec de
    // connexion : l'utilisateur croit avoir oublié son mot de passe.
    expect(codeOnly(src)).not.toContain('type="password"');
    expect(src).toContain('PasswordField');
  });

  it('le bouton d’affichage est annoncé aux lecteurs d’écran', () => {
    const field = read('components', 'ui', 'Field.tsx');
    expect(field).toContain('Afficher le mot de passe');
    expect(field).toContain('Masquer le mot de passe');
    // Il change d'état : sans `aria-pressed`, rien ne dit s'il est actif.
    expect(field).toContain('aria-pressed={revealed}');
  });

  it('chaque champ garde un vrai libellé visible', () => {
    // Le libellé est porté par `FieldShell`, jamais par un placeholder — un
    // placeholder disparaît dès la première frappe.
    const field = read('components', 'ui', 'Field.tsx');
    expect(field).toMatch(/<FieldShell\s+label=\{label\}/);
  });
});

describe('écrans d’identification', () => {
  const shell = read('components', 'auth', 'AuthShell.tsx');

  it('le logo ramène à l’accueil', () => {
    // `Logo` pointe sur « / » par défaut : le rendre ici sans `href` EST le
    // chemin du retour.
    expect(shell).toContain('<Logo />');
    expect(read('components', 'Logo.tsx')).toMatch(/href = '\/'/);
  });

  it('ne double pas ce chemin d’un second lien', () => {
    // Deux chemins pour la même chose, c'est un de trop — et c'est ce qui
    // encombrait le bas de ces écrans.
    expect(codeOnly(shell)).not.toContain('Retour à l’accueil');
    expect(codeOnly(shell)).not.toContain("Retour à l'accueil");
  });
});

describe('page publique', () => {
  const surfaces = [
    ['accueil', read('app', 'page.tsx')],
    ['métadonnées', read('app', 'layout.tsx')],
  ] as const;

  it.each(surfaces)('%s : ne nomme aucun opérateur', (_name, src) => {
    // Décision produit : « Mobile Money » plutôt que la liste des opérateurs.
    // Elle change avec les pays et les partenariats, et Maketou ne rapporte
    // de toute façon jamais lequel a servi.
    const code = codeOnly(src);
    expect(code).not.toMatch(/Tmoney/i);
    expect(code).not.toMatch(/Flooz/i);
  });

  it('annonce bien le mobile money', () => {
    expect(read('app', 'page.tsx')).toMatch(/Mobile Money/i);
  });
});
