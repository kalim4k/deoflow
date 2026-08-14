'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, storeCsrfToken } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell, AuthSwitch } from '@/components/auth/AuthShell';
import { AuthDivider, GoogleButton } from '@/components/auth/GoogleButton';
import { InputField, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Le retour de /reset-password ajoute ?reset=ok pour confirmer le changement.
  const justReset = params.get('reset') === 'ok';
  // L'inscription renvoie ici quand l'adresse a déjà un compte.
  const alreadyRegistered = params.get('exists') === '1';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      // Un compte non vérifié n'est pas une impasse : on emmène l'utilisateur
      // saisir son code plutôt que de lui afficher un mur d'erreur.
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Content de vous revoir"
      subtitle="Connectez-vous pour retrouver vos personnages et vos créations."
      aside={<AuthSwitch href="/signup">Créer un compte</AuthSwitch>}
    >
      <div className="flex flex-col gap-5">
        {justReset && (
          <Alert tone="success">Mot de passe modifié. Vous pouvez vous connecter.</Alert>
        )}

        {alreadyRegistered && (
          <Alert tone="info">
            Cette adresse a déjà un compte. Connectez-vous, ou{' '}
            <Link href="/forgot-password" className="cursor-pointer underline underline-offset-2">
              réinitialisez votre mot de passe
            </Link>
            .
          </Alert>
        )}

        {/* Google d'abord : c'est un seul appui, contre deux champs et un mot
            de passe à retrouver. Mettre le chemin le plus court en second
            revient à le cacher. */}
        <GoogleButton next="/dashboard" />
        <AuthDivider />

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <InputField
            label="Email"
            type="email"
            required
            autoComplete="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PasswordField
            label="Mot de passe"
            required
            autoComplete="current-password"
            // Le lien d'oubli vit sur la ligne du libellé : il concerne CE
            // champ, et il occupait une rangée entière pour six mots.
            aside={
              <Link
                href="/forgot-password"
                className="cursor-pointer text-ink-500 transition-colors duration-200 hover:text-ember-600"
              >
                Mot de passe oublié ?
              </Link>
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" loading={submitting} size="lg" className="mt-1 w-full">
            {submitting ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
