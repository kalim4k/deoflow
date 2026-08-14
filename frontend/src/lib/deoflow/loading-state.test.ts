import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un état « pas encore su » ne doit jamais se présenter comme un état « su ».
 *
 * Le défaut d'origine : `useAuth()` renvoie `user === null` PENDANT le
 * chargement autant qu'une fois déconnecté. Les sources de données ne
 * regardaient que `user`, concluaient « aucun utilisateur » et posaient
 * `loading = false` avec un solde de 0 et une galerie vide. Au rafraîchissement,
 * le créateur voyait donc s'afficher — non pas un squelette, mais l'affirmation
 * tranquille qu'il n'avait ni crédits ni créations, suivie d'une invitation à
 * recharger. Puis tout se corrigeait.
 *
 * L'architecture a changé depuis : le solde voyage avec la session, et la
 * galerie ne l'attend plus. Mais l'invariant, lui, est le même — et c'est
 * exactement au moment d'une refonte qu'un invariant se perd.
 *
 * Ces vérifications portent sur le texte des fichiers plutôt que sur un rendu :
 * les composants React ne sont pas montés dans cette suite (pas de jsdom).
 * C'est grossier, mais ça tient la garantie là où elle se relâche.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');
}

/**
 * Le fichier privé de ses commentaires. Sans ça, une vérification d'absence
 * échouerait sur la phrase qui EXPLIQUE pourquoi la chose est absente — et on
 * finirait par écrire des commentaires en fonction des tests.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}

describe('solde', () => {
  const credits = read('contexts', 'CreditsContext.tsx');

  it('distingue « solde inconnu » de « solde à zéro »', () => {
    // `credits === null` est le seul marqueur de l'ignorance : sans lui,
    // l'ancien défaut revient tel quel.
    expect(credits).toMatch(/loading:\s*authLoading \|\| credits === null/);
  });

  it('n’ouvre plus d’appel réseau à lui seul', () => {
    // Le solde arrive avec `/api/auth/me`. Un appel dédié rétablirait
    // l'enchaînement — session, PUIS solde — que cette refonte a supprimé.
    const code = codeOnly(credits);
    expect(code).not.toContain('fetchCredits');
    expect(code).not.toContain('/api/credits');
  });
});

describe('galerie', () => {
  const generations = read('lib', 'deoflow', 'useGenerations.ts');

  it('ne s’enchaîne pas derrière la session', () => {
    // C'est le cookie qui authentifie la requête, pas l'état React. Réintroduire
    // `useAuth` ici doublerait le temps d'affichage sans rien garantir.
    expect(codeOnly(generations)).not.toContain('useAuth');
  });

  it('traite le 401 comme une réponse, pas comme une panne', () => {
    // `lib/api.ts` a déjà renouvelé la session et rejoué l'appel : un 401 qui
    // survit signifie « déconnecté ». L'afficher comme une erreur réseau
    // ferait craindre une perte de contenu.
    const index = generations.indexOf('err.status === 401');
    expect(index, 'traitement du 401 absent').toBeGreaterThan(-1);
    expect(generations.slice(index, index + 200)).toMatch(/setError\(false\)/);
  });

  it('conclut tout de suite pour un visiteur sans session', () => {
    // Montrer des squelettes qui ne se rempliront jamais est une autre façon
    // de mentir sur l'état.
    expect(generations).toMatch(/useState\(\(\) => maybeSignedIn\(\)\)/);
  });
});

describe('écrans qui affichent solde et créations', () => {
  const dashboard = read('app', 'dashboard', 'page.tsx');

  it('n’invite jamais à recharger tant que le solde est inconnu', () => {
    // Le pire cas de ce bug : proposer d'acheter des crédits à quelqu'un qui
    // en a déjà.
    // Insensible à la mise en forme : Prettier coupe cette condition sur
    // plusieurs lignes dès qu'elle s'allonge.
    const condensed = dashboard.replace(/\s+/g, ' ');
    expect(condensed).toContain('!creditsLoading && !generationsLoading && credits === 0');
  });

  it('transmet le chargement aux trois chiffres-clés', () => {
    const count = (dashboard.match(/loading=\{(creditsLoading|generationsLoading)\}/g) ?? [])
      .length;
    expect(count).toBe(3);
  });

  it('montre un squelette de galerie au lieu de « aucune création »', () => {
    const skeleton = dashboard.indexOf('generationsLoading ? (');
    const empty = dashboard.indexOf('recent.length === 0');
    expect(skeleton).toBeGreaterThan(-1);
    expect(skeleton).toBeLessThan(empty);
  });

  it('compte les crédits consommés sur le total renvoyé par le serveur', () => {
    // Deux corrections successives sur ce chiffre. D'abord il lisait le journal
    // simulé du navigateur, qui ne reçoit plus rien : il restait à zéro. Puis
    // il additionnait les générations affichées — c'est-à-dire cinq — ce qui
    // n'était le total de rien, et serait devenu franchement faux en écartant
    // les visages d'avatars de la galerie.
    expect(dashboard).not.toContain('useDeoflowState');
    expect(dashboard.replace(/\s+/g, ' ')).toContain('spent,');
  });
});

describe('fiche d’un personnage', () => {
  const page = read('app', 'avatars', '[id]', 'page.tsx');
  const skeleton = read('components', 'app', 'AvatarDetailSkeleton.tsx');

  it('attend sur un squelette, pas sur un indicateur tournant', () => {
    // Un « Chargement… » centré laisse l'écran vide puis fait tout surgir d'un
    // coup. Le squelette, lui, est déjà la page.
    expect(page).toContain('<AvatarDetailSkeleton />');
    expect(codeOnly(page)).not.toMatch(/Chargement…/);
  });

  it('couvre aussi la transition de route', () => {
    // Sans `loading.tsx`, l'écran précédent reste figé pendant que Next charge
    // le code du segment — le clic paraît sans effet.
    const loading = read('app', 'avatars', '[id]', 'loading.tsx');
    expect(loading).toContain('AvatarDetailSkeleton');
  });

  it('respecte la géométrie de la fiche', () => {
    // Un squelette aux mauvaises proportions déplace tout à l'arrivée des
    // données : il ne vaut alors pas mieux que l'indicateur qu'il remplace.
    for (const shape of ['lg:grid-cols-[1fr_1.4fr]', 'aspect-square']) {
      expect(page, `fiche : ${shape}`).toContain(shape);
      expect(skeleton, `squelette : ${shape}`).toContain(shape);
    }
  });

  it('réserve la hauteur du titre inconnu', () => {
    // Le nom du personnage arrive avec la donnée. Sans réservation, le <h1>
    // apparaît après coup et pousse la page entière vers le bas.
    expect(skeleton).toMatch(/title=\{<Skeleton/);
  });
});

describe('solde affiché en permanence', () => {
  it.each([
    ['pastille', read('components', 'app', 'CreditPill.tsx')],
    ['rail latéral', read('components', 'app', 'Sidebar.tsx')],
  ])('%s : masque le chiffre pendant le chargement', (_name, src) => {
    expect(src).toMatch(/loading/);
    expect(src).toMatch(/animate-pulse/);
  });

  it('catalogue : ne déclare rien inabordable avant de connaître le solde', () => {
    const picker = read('components', 'app', 'ModelPicker.tsx');
    expect(picker).toMatch(/const affordable = loading \|\| entryCost <= credits/);
  });
});
