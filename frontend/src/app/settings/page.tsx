'use client';

// Profil / paramètres (3.11 du PRD) : mot de passe, comptes liés, historique
// d'achats, déconnexion.
//
// Deux branches pour le mot de passe :
//   - compte créé via Google (hasPassword=false) → POST /api/auth/set-password,
//     sans mot de passe actuel puisqu'il n'y en a pas ;
//   - sinon → PUT /api/auth/change-password avec currentPassword + newPassword.
//
// Pas de déliaison de Google : il faudrait un endpoint dédié avec un garde-fou
// empêchant de supprimer la dernière méthode de connexion.

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { formatAmount, formatDateTime } from '@/lib/format';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AppShell } from '@/components/app/AppShell';
import { PasswordField } from '@/components/ui/Field';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Alert, Badge, Card, Skeleton } from '@/components/ui/Feedback';
import { GoogleIcon } from '@/components/icons';
import { fetchCredits, type ApiCreditTransaction } from '@/lib/deoflow/api';

function PasswordSection({ hasPassword, onDone }: { hasPassword: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length === 0) {
      setError('Saisissez un nouveau mot de passe.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      if (hasPassword) {
        await api('/api/auth/change-password', {
          method: 'PUT',
          body: { currentPassword, newPassword },
        });
        toast('Mot de passe mis à jour.', 'success');
      } else {
        await api('/api/auth/set-password', { method: 'POST', body: { newPassword } });
        toast('Mot de passe défini. Vous pouvez aussi vous connecter par email.', 'success');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg">
          {hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
        </h2>
        <p className="text-sm text-ink-500">
          {hasPassword
            ? 'Les autres sessions seront déconnectées après la modification.'
            : 'Vous vous êtes connecté via Google. Définissez un mot de passe pour pouvoir aussi vous connecter par email.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {hasPassword && (
          <PasswordField
            label="Mot de passe actuel"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        )}
        <PasswordField
          label="Nouveau mot de passe"
          required
          minLength={8}
          autoComplete="new-password"
          hint="8 caractères minimum."
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <PasswordField
          label="Confirmer le nouveau mot de passe"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" loading={submitting} className="self-start">
          {hasPassword ? 'Changer le mot de passe' : 'Définir le mot de passe'}
        </Button>
      </form>
    </Card>
  );
}

/**
 * Historique d'achats — lu sur le serveur.
 *
 * Il venait du `localStorage`, donc ne montrait que les achats faits depuis CE
 * navigateur : un créateur qui rechargeait depuis son téléphone puis ouvrait
 * ses paramètres sur un ordinateur voyait « aucun achat », et pouvait croire
 * son paiement perdu.
 *
 * La source est `CreditTransaction`, filtrée sur les mouvements d'achat. Ces
 * lignes ne sont écrites qu'au moment où la commande est réellement payée
 * (`purchases/service.ts`), donc la liste ne contient QUE des achats aboutis —
 * pas les tentatives abandonnées. C'est ce qu'on veut ici : un historique
 * d'achats, pas un journal de tentatives.
 */
function PurchaseHistory() {
  const [rows, setRows] = useState<ApiCreditTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCredits()
      .then((res) => {
        if (!cancelled) setRows(res.transactions.filter((t) => t.movement === 'PURCHASE'));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg">Historique d&apos;achats</h2>
        <Link href="/wallet" className="text-sm text-ember-600 hover:underline">
          Voir tout le portefeuille
        </Link>
      </div>

      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : rows === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-500">Aucun achat pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-900">{row.label}</p>
                <p className="text-xs text-ink-300">
                  {formatDateTime(row.createdAt)} · +{row.credits.toLocaleString('fr-FR')} crédits
                </p>
              </div>
              {row.amountFcfa !== null ? (
                <span className="text-sm text-ink-700 tabular-nums">
                  {formatAmount(row.amountFcfa, 'XOF')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SettingsBody() {
  const { user, refresh, logout, loggingOut } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const googleLinked = user.linkedProviders.includes('google');

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-900 font-display text-base text-white">
            {user.email.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="truncate font-display text-base">{user.email}</p>
            <p className="text-sm text-ink-500">Connecté sur cet appareil</p>
          </div>
        </div>
        <Badge tone={user.emailVerifiedAt ? 'gain' : 'ember'}>
          {user.emailVerifiedAt ? 'Email vérifié' : 'Email non vérifié'}
        </Badge>
      </Card>

      <PasswordSection hasPassword={user.hasPassword} onDone={() => void refresh()} />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg">Comptes liés</h2>
          <p className="text-sm text-ink-500">Liez un compte pour vous connecter en un geste.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
          <div className="flex items-center gap-3">
            <GoogleIcon className="size-6" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Google</span>
              <span className="text-xs text-ink-500">
                {googleLinked ? 'Connexion via Google active.' : 'Pas encore lié à votre compte.'}
              </span>
            </div>
          </div>
          {googleLinked ? (
            <Badge tone="gain">Lié</Badge>
          ) : (
            <a
              href="/api/auth/oauth/google/start?next=/settings"
              className={buttonStyles('secondary', 'sm')}
            >
              Lier Google
            </a>
          )}
        </div>
      </Card>

      <PurchaseHistory />

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-lg">Se déconnecter</h2>
          <p className="text-sm text-ink-500">
            Vos créations et votre solde restent liés à votre compte.
          </p>
        </div>
        <Button variant="secondary" loading={loggingOut} onClick={() => void onLogout()}>
          Déconnexion
        </Button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell title="Paramètres" description="Votre compte, vos accès, vos achats.">
      <SettingsBody />
    </AppShell>
  );
}
