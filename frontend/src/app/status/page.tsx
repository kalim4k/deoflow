// /status — diagnostic de configuration (anciennement la page d'accueil).
//
// Server component : lit process.env à la requête et indique quels
// fournisseurs optionnels sont branchés. Les absents restent inertes — les
// routes correspondantes répondent 404/503 et le reste de l'app fonctionne.
//
// Aucune valeur de variable n'est affichée, seulement sa présence.

import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/marketing/SiteFooter';
import { Logo } from '@/components/Logo';
import { Badge } from '@/components/ui/Feedback';
import { buttonStyles } from '@/components/ui/Button';
import { ArrowLeftIcon, CheckCircleIcon, AlertIcon } from '@/components/icons';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'État de la configuration',
  description: 'Quels fournisseurs sont branchés sur cette instance.',
};

interface Row {
  label: string;
  ok: boolean;
  hint: string;
}

function ConfigList({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-wrap items-center gap-3 py-3">
          {row.ok ? (
            <CheckCircleIcon className="size-5 text-gain-600" />
          ) : (
            <AlertIcon className="size-5 text-ember-600" />
          )}
          <span className="font-mono text-sm text-ink-900">{row.label}</span>
          <span className="text-sm text-ink-500">— {row.hint}</span>
          <span className="ml-auto">
            <Badge tone={row.ok ? 'gain' : 'ember'}>{row.ok ? 'Configuré' : 'Absent'}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Group({ title, description, rows }: { title: string; description: string; rows: Row[] }) {
  return (
    <section className="card p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
      <div className="mt-4">
        <ConfigList rows={rows} />
      </div>
    </section>
  );
}

export default function StatusPage() {
  const env = process.env;

  const required: Row[] = [
    { label: 'DATABASE_URL', ok: !!env.DATABASE_URL, hint: 'Postgres (obligatoire)' },
    { label: 'JWT_SECRET', ok: !!env.JWT_SECRET, hint: 'Clé de signature des sessions' },
  ];

  const recommended: Row[] = [
    { label: 'ENCRYPTION_KEY', ok: !!env.ENCRYPTION_KEY, hint: 'Chiffrement AES-256-GCM' },
    { label: 'CRON_SECRET', ok: !!env.CRON_SECRET, hint: 'Jeton des tâches planifiées' },
    { label: 'DIRECT_URL', ok: !!env.DIRECT_URL, hint: 'Migrations Prisma en production' },
  ];

  const optional: Row[] = [
    {
      label: 'UPSTASH_REDIS_REST_URL',
      ok: !!env.UPSTASH_REDIS_REST_URL,
      hint: 'Cache, rate-limit, verrous',
    },
    { label: 'GOOGLE_CLIENT_ID', ok: !!env.GOOGLE_CLIENT_ID, hint: 'Connexion avec Google' },
    { label: 'RESEND_API_KEY', ok: !!env.RESEND_API_KEY, hint: 'Envoi des emails' },
    { label: 'EMAIL_FROM', ok: !!env.EMAIL_FROM, hint: 'Adresse expéditrice vérifiée' },
    {
      label: 'CLOUDINARY_CLOUD_NAME',
      ok: !!env.CLOUDINARY_CLOUD_NAME,
      hint: 'Stockage des fichiers et médias',
    },
    { label: 'BICTORYS_API_KEY', ok: !!env.BICTORYS_API_KEY, hint: 'Paiements mobile money' },
    {
      label: 'MAKETOU_API_KEY',
      ok: !!env.MAKETOU_API_KEY,
      hint: 'Achat de crédits par mobile money',
    },
    {
      label: 'MAKETOU_PRODUCT_ID',
      ok: !!(
        env.MAKETOU_PRODUCT_ID ||
        env.MAKETOU_PRODUCT_STARTER ||
        env.MAKETOU_PRODUCT_CREATEUR ||
        env.MAKETOU_PRODUCT_PRO
      ),
      hint: 'Produit Maketou — sans lui, aucun panier ne peut être créé',
    },
    {
      label: 'CRON_SECRET → purchase-reconcile',
      ok: !!env.CRON_SECRET,
      // Maketou n'a pas de webhook : sans ce cron, un acheteur qui ferme son
      // onglet après avoir payé n'est jamais crédité, et rien ne le signale.
      hint: 'Sans ce cron, les paiements confirmés hors ligne ne sont pas crédités',
    },
    { label: 'SENTRY_DSN', ok: !!env.SENTRY_DSN, hint: 'Suivi des erreurs' },
  ];

  return (
    <>
      <div>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <Logo />
            <Link
              href="/"
              className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
            >
              <ArrowLeftIcon className="size-4" />
              Accueil
            </Link>
          </div>

          <header className="mb-10 flex flex-col gap-3">
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">
              État de la configuration
            </h1>
            <p className="text-ink-500">
              Lu à chaque requête depuis les variables d&apos;environnement. Seule la présence est
              affichée, jamais la valeur.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/health"
                target="_blank"
                rel="noreferrer"
                className={buttonStyles('secondary', 'sm')}
              >
                Sonde /api/health
              </a>
              <a
                href="/api/readyz"
                target="_blank"
                rel="noreferrer"
                className={buttonStyles('secondary', 'sm')}
              >
                Sonde /api/readyz
              </a>
            </div>
          </header>

          <div className="flex flex-col gap-4">
            <Group
              title="Obligatoire"
              description="Sans ces variables, l’application refuse de démarrer."
              rows={required}
            />
            <Group
              title="Recommandé"
              description="L’application démarre, mais casse dès la première utilisation concernée."
              rows={recommended}
            />
            <Group
              title="Fournisseurs optionnels"
              description="Absents, ils restent inertes : les routes concernées répondent 404 ou 503."
              rows={optional}
            />
          </div>
        </div>
      </div>

      <SiteFooter />
    </>
  );
}
