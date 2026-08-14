import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

/**
 * Les tâches planifiées, et qui appuie sur le bouton.
 *
 * Deux défauts distincts sont surveillés ici, tous deux invisibles en
 * production — c'est ce qui les rend dangereux.
 *
 * **1. Le verbe.** Un planificateur déclenche en `GET`. Six des sept crons
 * n'exportaient que `POST` : ils répondaient 405 et ne tournaient jamais. Aucune
 * erreur applicative, aucune ligne de log, rien dans les journaux de build — la
 * seule trace est un travail de fond qui n'a pas lieu, constaté des semaines
 * plus tard.
 *
 * **2. Le déclencheur.** Le plan Vercel Hobby refuse toute cadence plus
 * fréquente que quotidienne, et rejette le déploiement entier si `vercel.json`
 * en déclare une. Cinq de nos sept tâches tournent à la minute ou aux cinq
 * minutes ; elles sont donc appelées en HTTP depuis cron-job.org, et ne doivent
 * PAS figurer dans `vercel.json`.
 *
 * L'inventaire vit dans `cron-schedule.json` plutôt que dans `vercel.json`,
 * précisément parce que ce dernier ne connaît plus qu'une partie des tâches.
 * Une tâche externe qu'aucun fichier du dépôt ne mentionne n'existe que dans
 * une interface web tierce : personne ne saurait qu'elle doit tourner.
 */
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(here, '../../../../');
const CRON_DIR = join(FRONTEND_ROOT, 'src', 'app', 'api', 'cron');

interface Job {
  path: string;
  schedule: string;
  trigger: 'vercel' | 'external';
  why: string;
}

const manifest = JSON.parse(readFileSync(join(FRONTEND_ROOT, 'cron-schedule.json'), 'utf8')) as {
  vercelPlan: string;
  jobs: Job[];
};

const vercelCrons = (
  JSON.parse(readFileSync(join(FRONTEND_ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  }
).crons!;

const jobs = manifest.jobs;

const onDisk = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

const nameOf = (path: string) => path.replace('/api/cron/', '');
const source = (path: string) => readFileSync(join(CRON_DIR, nameOf(path), 'route.ts'), 'utf8');

/** `export const GET = handle` ou `export async function GET(`. */
function exportsVerb(src: string, verb: 'GET' | 'POST'): boolean {
  return (
    new RegExp(`export\\s+const\\s+${verb}\\s*=`).test(src) ||
    new RegExp(`export\\s+async\\s+function\\s+${verb}\\s*\\(`).test(src)
  );
}

/**
 * Minute ET heure fixes = au plus une exécution par jour. Une étoile, un pas
 * (« toutes les 5 minutes »), une liste `1,31` ou une plage `9-17` sur l'un ou
 * l'autre de ces deux champs signifient plusieurs passages quotidiens.
 */
function runsAtMostDaily(schedule: string): boolean {
  const [minute, hour] = schedule.trim().split(/\s+/);
  return /^\d+$/.test(minute ?? '') && /^\d+$/.test(hour ?? '');
}

describe('inventaire des tâches planifiées', () => {
  it('le manifeste et le disque décrivent le même ensemble', () => {
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.map((j) => nameOf(j.path)).sort()).toEqual([...onDisk].sort());
  });

  it('chaque tâche déclare pourquoi son arrêt se remarquerait', () => {
    // Le champ qui empêche de supprimer une tâche externe « qui n'a pas l'air
    // de servir ». Sans lui, `purchase-reconcile` ressemble à du ménage.
    for (const job of jobs) {
      expect(job.why.length, `${job.path} sans justification`).toBeGreaterThan(30);
    }
  });
});

describe('les tâches répondent au verbe que le planificateur envoie', () => {
  it.each(jobs.map((j) => j.path))('%s exporte GET', (path) => {
    // LE test. Sans GET, le planificateur reçoit 405 et la tâche ne tourne jamais.
    expect(exportsVerb(source(path), 'GET')).toBe(true);
  });

  it.each(jobs.map((j) => j.path))('%s exporte aussi POST', (path) => {
    // Conservé pour les déclenchements manuels et les tests d'intégration.
    expect(exportsVerb(source(path), 'POST')).toBe(true);
  });

  it.each(jobs.map((j) => j.path))('%s reste protégé par le secret de cron', (path) => {
    // Accepter GET ne doit pas ouvrir la porte : sans ce garde, n'importe qui
    // déclencherait le travail de fond depuis une barre d'adresse.
    expect(source(path)).toContain('verifyCronSecret');
  });
});

describe('le partage entre Vercel et le planificateur externe', () => {
  const vercelJobs = jobs.filter((j) => j.trigger === 'vercel');
  const externalJobs = jobs.filter((j) => j.trigger === 'external');

  it('vercel.json déclare exactement les tâches marquées trigger=vercel', () => {
    expect(vercelCrons.map((c) => c.path).sort()).toEqual(vercelJobs.map((j) => j.path).sort());
  });

  it('les cadences de vercel.json correspondent au manifeste', () => {
    for (const cron of vercelCrons) {
      const job = jobs.find((j) => j.path === cron.path);
      expect(cron.schedule, `${cron.path} a dérivé du manifeste`).toBe(job?.schedule);
    }
  });

  it('aucune tâche externe ne figure dans vercel.json', () => {
    // C'est l'erreur qui a bloqué le déploiement : Vercel rejette le build
    // entier — pas seulement la tâche fautive — si une cadence sous-quotidienne
    // apparaît sur un plan Hobby.
    const declared = new Set(vercelCrons.map((c) => c.path));
    for (const job of externalJobs) {
      expect(declared.has(job.path), `${job.path} doit rester hors de vercel.json`).toBe(false);
    }
  });

  it('sur le plan Hobby, aucune tâche de vercel.json ne tourne plus d’une fois par jour', () => {
    if (manifest.vercelPlan !== 'hobby') return; // sur Pro la contrainte disparaît
    for (const cron of vercelCrons) {
      expect(
        runsAtMostDaily(cron.schedule),
        `${cron.path} (${cron.schedule}) sera refusé au déploiement`,
      ).toBe(true);
    }
  });

  it('les tâches externes sont bien celles qui ne tiennent pas sur Hobby', () => {
    // L'inverse : une tâche quotidienne partie chez le tiers sans raison est une
    // dépendance externe gratuite.
    for (const job of externalJobs) {
      expect(
        runsAtMostDaily(job.schedule),
        `${job.path} est quotidien — il peut revenir dans vercel.json`,
      ).toBe(false);
    }
  });
});
