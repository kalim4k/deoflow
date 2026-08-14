'use client';

import { AppLink } from '@/components/NavProgress';
import { AppShell } from '@/components/app/AppShell';
import { GenerationCard } from '@/components/app/GenerationCard';
import { buttonStyles } from '@/components/ui/Button';
import { Alert, Card, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Stat } from '@/components/ui/Stat';
import {
  ArrowRightIcon,
  ImageIcon,
  VideoIcon,
  CoinsIcon,
  SparkIcon,
  PlusIcon,
} from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/lib/deoflow/useDeoflow';
import { useGenerations } from '@/lib/deoflow/useGenerations';
import { displayName } from '@/lib/displayName';
import { formatAmount } from '@/lib/format';
import { CREDIT_PACKS } from '@/lib/deoflow/packs';

// Deux actions, pas plus : c'est ce que l'utilisateur vient faire.
const ACTIONS = [
  {
    href: '/create/image',
    icon: ImageIcon,
    title: 'Générer une image',
    body: 'Un prompt, un modèle, un ratio. Prêt en quelques secondes.',
  },
  {
    href: '/create/video',
    icon: VideoIcon,
    title: 'Générer une vidéo',
    body: 'Animez votre personnage en 3, 5 ou 10 secondes.',
  },
];

function DashboardBody() {
  const { user } = useAuth();
  // `loading` n'est pas un détail d'affichage ici : sans lui, l'écran annonce
  // « 0 crédit » et « aucune création » pendant la première requête, c'est-à-dire
  // qu'il affirme une chose fausse avant de se corriger. Un solde inconnu et un
  // solde vide ne se ressemblent pas — le second appelle à recharger.
  const { credits, loading: creditsLoading } = useCredits();
  // Cinq vignettes affichées, cinq demandées.
  const { items: generations, spent, loading: generationsLoading } = useGenerations(undefined, 5);
  const recent = generations.slice(0, 5);
  const starter = CREDIT_PACKS[0];
  // `spent` vient du serveur, qui agrège TOUTES les générations du compte.
  // L'additionner ici sur les cinq vignettes affichées donnait un chiffre qui
  // n'était le total de rien — et exclure les visages d'avatars de la galerie
  // l'aurait rendu franchement faux.

  return (
    <div className="flex flex-col gap-8">
      {user && !user.emailVerifiedAt && (
        <Alert tone="warning">
          Votre email n&apos;est pas encore vérifié.{' '}
          <AppLink
            href={`/verify-email?email=${encodeURIComponent(user.email)}`}
            className="cursor-pointer underline underline-offset-2"
          >
            Saisir mon code
          </AppLink>
        </Alert>
      )}

      {/* Premier pas : un compte neuf arrive à 0 crédit (US1). Jamais pendant
          le chargement — inviter à recharger quelqu'un qui a des crédits est
          la pire des méprises. */}
      {!creditsLoading &&
        !generationsLoading &&
        credits === 0 &&
        generations.length === 0 &&
        starter && (
          <Card className="flex flex-col gap-4 border-ink-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-lg">Rechargez pour commencer</h2>
              <p className="text-sm text-ink-500">
                Le {starter.name.toLowerCase()} donne {starter.credits} crédits pour{' '}
                {formatAmount(starter.priceFcfa, 'XOF')} — de quoi générer {starter.credits} images.
              </p>
            </div>
            <AppLink href="/wallet/topup" className={buttonStyles('ember', 'md')}>
              <CoinsIcon className="size-4" />
              Acheter des crédits
            </AppLink>
          </Card>
        )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Solde"
          icon={<CoinsIcon className="size-4" />}
          value={credits}
          loading={creditsLoading}
          hint={
            creditsLoading
              ? undefined
              : `${Math.floor(credits / 24)} image${credits >= 48 ? 's' : ''} Nano Banana`
          }
        />
        <Stat
          label="Créations"
          icon={<SparkIcon className="size-4" />}
          value={generations.length}
          loading={generationsLoading}
          hint="Images et vidéos produites"
        />
        <Stat
          label="Crédits consommés"
          icon={<ImageIcon className="size-4" />}
          value={spent}
          loading={generationsLoading}
          hint="Depuis la création du compte"
        />
      </div>

      {/* Accès rapide à la création */}
      <section className="grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <AppLink
              key={action.href}
              href={action.href}
              className="pressable card card-link group flex cursor-pointer items-start gap-4 p-5"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sunken text-ink-900">
                <Icon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-display text-base font-bold">
                  {action.title}
                  <ArrowRightIcon className="size-4 text-ink-300 transition-colors duration-200 group-hover:text-ember-500" />
                </span>
                <span className="mt-1 block text-sm text-ink-500">{action.body}</span>
              </span>
            </AppLink>
          );
        })}
      </section>

      {/* Dernières générations */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg">Vos dernières créations</h2>
          {!generationsLoading && generations.length > 0 && (
            <AppLink
              href="/gallery"
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-500 transition-colors duration-200 hover:text-ink-900"
            >
              Toute la galerie
              <ArrowRightIcon className="size-4" />
            </AppLink>
          )}
        </div>

        {generationsLoading ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
              </li>
            ))}
          </ul>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<SparkIcon className="size-8" />}
            title="Aucune création pour l’instant"
            description="Vos images et vidéos générées apparaîtront ici, avec leur prompt."
            action={
              <AppLink href="/create/image" className={buttonStyles('primary', 'md')}>
                <PlusIcon className="size-4" />
                Générer ma première image
              </AppLink>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {recent.map((g) => (
              <li key={g.id}>
                <GenerationCard generation={g} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const name = user ? displayName(user) : '';

  return (
    <AppShell
      title={name ? `Bonjour ${name}` : 'Tableau de bord'}
      description="Votre solde, vos créations, et de quoi en lancer une autre."
      actions={
        <AppLink href="/wallet/topup" className={buttonStyles('secondary', 'md')}>
          <CoinsIcon className="size-4" />
          Recharger
        </AppLink>
      }
    >
      <DashboardBody />
    </AppShell>
  );
}
