import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vercel Cron déclenche ses tâches en **GET**.
 *
 * Six des sept crons n'exportaient que `POST`. En production ils répondaient
 * 405 et ne tournaient jamais : les e-mails et notifications restaient en
 * file, les commandes n'expiraient pas, les purges ne passaient pas.
 *
 * Ce défaut est particulièrement traître parce qu'il **ne produit aucun
 * signal** : pas d'erreur applicative, pas de ligne de log, rien dans les
 * journaux de build. La seule trace est un travail de fond qui n'a pas lieu,
 * et on ne le découvre qu'en constatant l'effet des semaines plus tard.
 *
 * Le test lit `vercel.json` plutôt qu'une liste écrite à la main : une tâche
 * ajoutée à la planification est automatiquement couverte, ce qui est le seul
 * moyen que ce garde-fou reste vrai.
 */
const ROOT = process.cwd();
const CRON_DIR = join(ROOT, 'src', 'app', 'api', 'cron');

const scheduled: string[] = (
  JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string }>;
  }
).crons!.map((c) => c.path);

const onDisk = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const source = (name: string) => readFileSync(join(CRON_DIR, name, 'route.ts'), 'utf8');

/** `export const GET = handle` ou `export async function GET(`. */
function exportsVerb(src: string, verb: 'GET' | 'POST'): boolean {
  return (
    new RegExp(`export\\s+const\\s+${verb}\\s*=`).test(src) ||
    new RegExp(`export\\s+async\\s+function\\s+${verb}\\s*\\(`).test(src)
  );
}

describe('les tâches planifiées répondent au verbe que Vercel envoie', () => {
  it('chaque tâche de vercel.json a bien un gestionnaire sur le disque', () => {
    expect(scheduled.length).toBeGreaterThan(0);
    for (const path of scheduled) {
      const name = path.replace('/api/cron/', '');
      expect(onDisk, `${path} n’a pas de gestionnaire`).toContain(name);
    }
  });

  it.each(scheduled)('%s exporte GET', (path) => {
    // LE test. Sans GET, Vercel reçoit 405 et la tâche ne tourne jamais.
    expect(exportsVerb(source(path.replace('/api/cron/', '')), 'GET')).toBe(true);
  });

  it.each(scheduled)('%s exporte aussi POST', (path) => {
    // Conservé pour les déclenchements manuels et les tests d'intégration.
    expect(exportsVerb(source(path.replace('/api/cron/', '')), 'POST')).toBe(true);
  });

  it.each(scheduled)('%s reste protégé par le secret de cron', (path) => {
    // Accepter GET ne doit pas ouvrir la porte : sans ce garde, n'importe qui
    // pourrait déclencher le travail de fond depuis une barre d'adresse.
    expect(source(path.replace('/api/cron/', ''))).toContain('verifyCronSecret');
  });

  it('aucun cron du disque n’est oublié dans vercel.json', () => {
    // L'inverse du premier test : un gestionnaire jamais planifié est du code
    // mort qu'on croit actif.
    for (const name of onDisk) {
      expect(scheduled, `/api/cron/${name} n’est pas planifié`).toContain(`/api/cron/${name}`);
    }
  });
});
