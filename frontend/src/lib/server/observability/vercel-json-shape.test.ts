// frontend/src/lib/server/observability/vercel-json-shape.test.ts — Phase 5 D-20.
//
// Tripwire d'inventaire : garantit que les 7 tâches planifiées canoniques
// existent toujours, avec une cadence valide et un route.ts en face.
//
// L'inventaire a déménagé de `vercel.json` vers `cron-schedule.json` : le plan
// Vercel Hobby n'accepte que des cadences quotidiennes, donc `vercel.json` ne
// déclare plus que 2 des 7 tâches — les 5 autres sont appelées en HTTP depuis
// cron-job.org (voir CRON.md). Continuer à compter les entrées de `vercel.json`
// laisserait 5 tâches sans aucune surveillance.
//
// Ce test garde contre la dérive route-renommée / manifeste-oublié. Le partage
// vercel↔externe et les verbes HTTP sont couverts par
// src/lib/server/cron/vercel-verb.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';

// frontend/src/lib/server/observability/ → frontend/ is 4 levels up.
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(here, '../../../../');
const VERCEL_JSON = resolve(FRONTEND_ROOT, 'vercel.json');
const CRON_MANIFEST = resolve(FRONTEND_ROOT, 'cron-schedule.json');
const APP_API_CRON = resolve(FRONTEND_ROOT, 'src/app/api/cron');

const PATH_RE = /^\/api\/cron\/[a-z][a-z0-9-]*$/;
// Permissive cron-format: 5 fields, each containing only digits, *, /, ,, -, or whitespace
const SCHED_RE = /^[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/;

interface Job {
  path: string;
  schedule: string;
  trigger: 'vercel' | 'external';
}

const manifest = JSON.parse(readFileSync(CRON_MANIFEST, 'utf8')) as {
  vercelPlan: string;
  jobs: Job[];
};

describe('inventaire des tâches planifiées (CRON-07, D-20)', () => {
  it('frontend/vercel.json existe', () => {
    expect(existsSync(VERCEL_JSON)).toBe(true);
  });

  it('frontend/cron-schedule.json existe', () => {
    expect(existsSync(CRON_MANIFEST)).toBe(true);
  });

  it('le manifeste déclare exactement 7 tâches', () => {
    expect(manifest.jobs.length).toBe(7);
  });

  it('chaque chemin respecte /^\\/api\\/cron\\/[a-z-]+$/ et chaque cadence est un cron 5 champs', () => {
    for (const job of manifest.jobs) {
      expect(job.path).toMatch(PATH_RE);
      expect(job.schedule).toMatch(SCHED_RE);
      expect(['vercel', 'external']).toContain(job.trigger);
    }
  });

  it('chaque chemin correspond à un app/api/cron/<name>/route.ts existant', async () => {
    const routeFiles = await fg('*/route.ts', { cwd: APP_API_CRON, onlyFiles: true });
    const routeNames = new Set(routeFiles.map((f) => f.split('/')[0]));
    for (const job of manifest.jobs) {
      const name = job.path.replace('/api/cron/', '');
      expect(
        routeNames.has(name),
        `le manifeste déclare /api/cron/${name} mais aucun route.ts n'existe`,
      ).toBe(true);
    }
  });

  it('déclare les 7 tâches canoniques (Phase 5 + post-audit + Maketou)', () => {
    const paths = manifest.jobs.map((j) => j.path).sort();
    expect(paths).toEqual([
      '/api/cron/email-job-purge',
      '/api/cron/email-queue-drain',
      '/api/cron/order-expiration',
      '/api/cron/outbox-drain',
      // Maketou n'a pas de webhook : sans ce cron, un acheteur qui confirme son
      // paiement après avoir quitté l'onglet n'est jamais crédité. Le retirer
      // du manifeste ne casse rien de visible — c'est bien le problème.
      '/api/cron/purchase-reconcile',
      '/api/cron/verification-cleanup',
      '/api/cron/webhook-log-purge',
    ]);
  });
});
