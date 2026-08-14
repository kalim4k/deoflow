/**
 * Garde-fous de forme du back-office.
 *
 * Ce sont des tests de SOURCE, pas de comportement. Ils existent parce que les
 * défauts qu'ils attrapent ne se voient qu'à l'écran, et seulement si on pense
 * à regarder le bon écran : un tableau de bord qui affiche les chiffres du
 * navigateur, un versement enregistré sans verrou, une mutation non auditée.
 * Aucun test unitaire classique ne les rattrape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ADMIN_PAGES = join(ROOT, 'src', 'app', 'admin');
const ADMIN_API = join(ROOT, 'src', 'app', 'api', 'admin');

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, match));
    else if (match(entry)) out.push(full);
  }
  return out;
}

const pages = walk(ADMIN_PAGES, (f) => f.endsWith('.tsx'));
const routes = walk(ADMIN_API, (f) => f === 'route.ts');

describe('le back-office ne lit que la base', () => {
  it('trouve bien les écrans à inspecter', () => {
    // Sans cette assertion, un déplacement de dossier rendrait toute la série
    // verte en n'inspectant plus rien.
    expect(pages.length).toBeGreaterThanOrEqual(7);
  });

  it.each(pages.map((p) => [p.slice(ROOT.length + 1), p] as const))(
    '%s n’importe pas la couche simulée',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      // `useDeoflow` / `deoflow/client` persistent dans le localStorage : ils
      // ne connaissent QUE le navigateur courant. Un écran d'administration
      // qui les lit affiche les chiffres de l'administrateur avec l'autorité
      // d'un back-office — un chiffre d'affaires faux et crédible, ce qui est
      // pire qu'un écran absent.
      expect(src).not.toMatch(/from\s+'@\/lib\/deoflow\/useDeoflow'/);
      expect(src).not.toMatch(/from\s+'@\/lib\/deoflow\/client'/);
    },
  );
});

describe('chaque route d’administration porte ses gardes', () => {
  it.each(routes.map((r) => [r.slice(ROOT.length + 1), r] as const))(
    '%s exige nodejs, un rôle et le contexte de requête',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
      expect(src).toMatch(/requireAdmin\(|requireSuperadmin\(/);
      expect(src).toContain('withRequestContext');
      expect(src).toContain('enforceAdminRateLimit');
    },
  );

  it.each(routes.map((r) => [r.slice(ROOT.length + 1), r] as const))(
    '%s audite et protège ses mutations',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      const mutates = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)/.test(src);
      if (!mutates) return;
      // Une écriture non auditée est une régression de conformité : on ne peut
      // plus répondre à « qui a fait quoi, quand » pendant un incident.
      expect(src, 'mutation sans logAdminAction').toContain('logAdminAction');
      // Et une mutation sans CSRF est déclenchable depuis un autre site.
      expect(src, 'mutation sans verifyCsrf').toContain('verifyCsrf');
    },
  );
});

describe('l’argent passe par les primitives verrouillées', () => {
  it('le traitement d’un versement prend le verrou et relit sous le verrou', () => {
    const src = readFileSync(join(ADMIN_API, 'withdrawals', '[id]', 'route.ts'), 'utf8');
    // Sans le verrou, deux onglets ouverts sur la même demande l'enregistrent
    // « versée » deux fois — chacun ayant lu PENDING avant l'autre.
    expect(src).toContain('lockUserTx');
    expect(src).toContain('Serializable');
    // La relecture SOUS le verrou est le point crucial : verrouiller puis agir
    // sur la ligne lue AVANT ne protège de rien.
    expect(src).toMatch(/lockUserTx[\s\S]{0,400}?tx\.withdrawal\.findUnique/);
  });

  it('l’ajustement de crédits n’écrit jamais User.credits en direct', () => {
    const src = readFileSync(join(ADMIN_API, 'credits', 'route.ts'), 'utf8');
    expect(src).toContain('withUserCredits');
    expect(src).toMatch(/creditCredits|debitCredits/);
    // Le journal est la vérité du solde ; écrire la colonne à la main les fait
    // diverger, et la divergence ne se voit qu'au moment d'un litige.
    expect(src).not.toMatch(/user\.update\([\s\S]{0,200}credits\s*:/);
  });

  it('solder un versement et ajuster des crédits sont réservés au SUPERADMIN', () => {
    const withdrawals = readFileSync(join(ADMIN_API, 'withdrawals', '[id]', 'route.ts'), 'utf8');
    const credits = readFileSync(join(ADMIN_API, 'credits', 'route.ts'), 'utf8');
    expect(withdrawals).toContain('requiresSuperadmin');
    expect(credits).toContain('requireSuperadmin()');
  });
});

describe('la couche client parle le même langage que api()', () => {
  const clients = [
    join(ROOT, 'src', 'lib', 'deoflow', 'adminApi.ts'),
    join(ROOT, 'src', 'lib', 'deoflow', 'api.ts'),
  ];

  it.each(clients.map((c) => [c.slice(ROOT.length + 1), c] as const))(
    '%s ne sérialise pas le corps une seconde fois',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      // `api()` fait lui-même le JSON.stringify (lib/api.ts). Le refaire ici
      // envoie une CHAÎNE JSON là où le serveur attend un objet : Zod la
      // rejette, et le message « corps de requête invalide » se lit comme un
      // champ manquant alors que tous sont présents.
      //
      // C'est une faute invisible à la relecture et invisible à un test qui
      // appelle l'API en curl — seul le passage par le navigateur la révèle.
      expect(src).not.toMatch(/body:\s*JSON\.stringify/);
    },
  );
});

describe('la navigation ne pointe que sur des écrans existants', () => {
  it('chaque entrée du menu a sa page', () => {
    const layout = readFileSync(join(ADMIN_PAGES, 'layout.tsx'), 'utf8');
    const hrefs = [...layout.matchAll(/href:\s*'(\/admin[^']*)'/g)].map((m) => m[1] ?? '');
    expect(hrefs.length).toBeGreaterThanOrEqual(7);

    for (const href of hrefs) {
      const rel = href.replace('/admin', '').replace(/^\//, '');
      const page = rel ? join(ADMIN_PAGES, rel, 'page.tsx') : join(ADMIN_PAGES, 'page.tsx');
      expect(pages, `${href} n’a pas de page`).toContain(page);
    }
  });

  it('les versements sont dans le menu — c’est le seul écran qui fait attendre quelqu’un', () => {
    const layout = readFileSync(join(ADMIN_PAGES, 'layout.tsx'), 'utf8');
    expect(layout).toContain("'/admin/withdrawals'");
  });
});
