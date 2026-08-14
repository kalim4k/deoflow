'use client';

// Lit `?email=` et `?code=` (le lien de l'email porte les deux). Pas de
// connexion automatique après succès : la réinitialisation invalide toutes
// les sessions existantes, l'utilisateur repasse donc par /login.

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { AuthShell, AuthSwitch } from '@/components/auth/AuthShell';
import { InputField, PasswordField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email, code, newPassword },
      });
      router.push('/login?reset=ok');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Nouveau mot de passe"
      subtitle="Saisissez le code reçu par email puis choisissez un nouveau mot de passe."
      aside={<AuthSwitch href="/login">Se connecter</AuthSwitch>}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <InputField
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <InputField
          label="Code de réinitialisation"
          type="text"
          required
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="XXXXXXXX"
          className="text-center font-mono text-lg tracking-[0.4em] uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
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
          label="Confirmer le mot de passe"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" loading={submitting} size="lg" className="mt-1 w-full">
          {submitting ? 'Enregistrement…' : 'Réinitialiser le mot de passe'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
