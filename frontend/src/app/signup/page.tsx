'use client';

// Deux parcours, selon la configuration du serveur. L'écran ne choisit pas :
// il lit la réponse, ce qui lui permet de suivre un changement de
// configuration sans être reconstruit.
//
//   - Vérification désactivée (le défaut sur Deoflow) : l'inscription ouvre la
//     session immédiatement. La réponse porte `session: true` et on file au
//     tableau de bord. Si elle porte `session: false`, l'email a déjà un
//     compte — on oriente vers la connexion.
//   - AUTH_REQUIRE_EMAIL_VERIFICATION="1" : inscription → /verify-email
//     (code de 8 caractères) → cookies.
//     L'endpoint étant résistant à l'énumération, la réponse est alors
//     identique que l'email soit libre ou pris, et on redirige toujours vers
//     la saisie du code sans jamais confirmer l'existence d'un compte.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell, AuthSwitch } from '@/components/auth/AuthShell';
import { AuthDivider, GoogleButton } from '@/components/auth/GoogleButton';
import { InputField, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ ok: boolean; session?: boolean }>('/api/auth/signup', {
        method: 'POST',
        body: { email, password },
      });

      // Session ouverte d'emblée : le serveur a posé les cookies.
      if (res.session === true) {
        await refresh();
        router.push('/dashboard');
        return;
      }

      // Email déjà pris (vérification désactivée) : la connexion est la bonne
      // porte, pas un code qui n'existe pas.
      if (res.session === false) {
        router.push(`/login?exists=1&email=${encodeURIComponent(email)}`);
        return;
      }

      // Vérification activée : on passe par la saisie du code.
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Deux minutes suffisent. Aucune carte bancaire demandée."
      aside={<AuthSwitch href="/login">Se connecter</AuthSwitch>}
      footer={
        <p className="text-xs text-ink-300">
          En créant un compte, vous acceptez les conditions d&apos;utilisation du service.
        </p>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Google d'abord, comme à la connexion : un seul appui, et aucun mot
            de passe à inventer puis à retenir. */}
        <GoogleButton next="/dashboard" label="S’inscrire avec Google" />
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
            minLength={8}
            autoComplete="new-password"
            hint="8 caractères minimum. Les mots de passe trop courants sont refusés."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" loading={submitting} size="lg" className="mt-1 w-full">
            {submitting ? 'Création…' : 'Créer mon compte'}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
