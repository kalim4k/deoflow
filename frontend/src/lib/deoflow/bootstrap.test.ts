import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Budget du premier affichage : quatre requêtes SQL, une salve réseau.
 *
 * Ce plafond n'existe pas par élégance. La base est à Ohio ; depuis une machine
 * en Afrique de l'Ouest, une requête Prisma coûte environ 1,1 seconde (mesuré,
 * pas estimé — la connexion TCP seule prend 245 ms). Le temps d'affichage est
 * donc, très exactement, un nombre de requêtes multiplié par une latence.
 *
 * L'état d'origine : `/api/auth/me` (2 requêtes) PUIS `/api/credits` (3) et
 * `/api/generations` (2) — sept requêtes réparties sur trois appels HTTP
 * enchaînés, parce que les deux derniers attendaient de savoir qui demandait.
 * Environ sept secondes avant que l'écran soit complet.
 *
 * Ce que ces vérifications tiennent :
 *   - le solde ne coûte AUCUNE requête de plus (il est lu sur la ligne
 *     utilisateur déjà chargée) ;
 *   - `/api/auth/me` ne relit pas cette ligne deux fois ;
 *   - la galerie ne s'enchaîne pas derrière la session.
 *
 * Chacune se perd de la même façon : par un ajout raisonnable pris isolément.
 * « J'ajoute juste un findUnique » coûte une seconde à chaque créateur.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
}

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

const me = read('app', 'api', 'auth', 'me', 'route.ts');

describe('/api/auth/me', () => {
  it('ne lit la ligne utilisateur qu’une fois', () => {
    // `requireAuth` en fait déjà une (contrôle du jeton, invariant de sécurité
    // dans un fichier protégé). Une seconde ici porterait le coût de la route
    // à trois requêtes au lieu de deux.
    const lookups = codeOnly(me).match(/prisma\.user\.find/g) ?? [];
    expect(lookups).toHaveLength(1);
  });

  it('rapporte le solde depuis cette même lecture', () => {
    // `credits: true` dans le `select` ne coûte rien : la ligne est déjà
    // chargée. C'est ce qui a permis de supprimer un appel réseau entier.
    expect(me).toMatch(/credits:\s*true/);
    expect(me).toMatch(/credits:\s*dbUser\?\.credits \?\? 0/);
  });

  it('garde le solde hors de l’objet `user`', () => {
    // `user` est la forme de la trousse de départ ; le solde est une notion
    // Deoflow. Les mélanger rendrait une mise à jour du starter conflictuelle.
    expect(me).toMatch(/\{ user, credits:/);
  });
});

describe('salve initiale', () => {
  it('le solde ne déclenche aucun appel', () => {
    expect(codeOnly(read('contexts', 'CreditsContext.tsx'))).not.toMatch(/api\(|fetch\(/);
  });

  it('la galerie n’attend pas la session', () => {
    const generations = codeOnly(read('lib', 'deoflow', 'useGenerations.ts'));
    expect(generations).not.toContain('useAuth');
    expect(generations).not.toContain('authLoading');
  });

  it('le tableau de bord ne demande que ce qu’il affiche', () => {
    // La route sert 30 créations par défaut ; l'écran en montre 5.
    const dashboard = read('app', 'dashboard', 'page.tsx');
    expect(dashboard).toMatch(/useGenerations\(undefined, 5\)/);
    expect(dashboard).toMatch(/recent = generations\.slice\(0, 5\)/);
  });

  it('la galerie complète garde la page entière', () => {
    // Elle affiche tout : lui imposer la limite du tableau de bord amputerait
    // silencieusement l'historique du créateur.
    expect(read('app', 'gallery', 'page.tsx')).toMatch(/useGenerations\(\)/);
  });
});
