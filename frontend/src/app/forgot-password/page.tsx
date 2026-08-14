'use client';

// Résistant à l'énumération : le serveur répond la même chose que l'email
// existe ou non. L'écran de confirmation est donc identique dans les deux cas.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { AuthShell, AuthSwitch } from '@/components/auth/AuthShell';
import { InputField } from '@/components/ui/Field';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { MailIcon } from '@/components/icons';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSubmitted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Vérifiez votre boîte mail"
        subtitle={
          <>
            Si un compte existe pour <strong className="text-ink-700">{email}</strong>, un code de
            réinitialisation arrive dans la minute.
          </>
        }
      >
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-ember-50 text-ember-600">
            <MailIcon className="size-7" />
          </span>
          <p className="text-sm text-ink-500">
            Pensez à regarder dans les spams. Le code expire au bout de 10 minutes.
          </p>
          <Link
            href={`/reset-password?email=${encodeURIComponent(email)}`}
            className={buttonStyles('primary', 'md', 'w-full')}
          >
            J&apos;ai reçu mon code
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Saisissez votre email : nous envoyons un code pour en définir un nouveau."
      aside={<AuthSwitch href="/login">Se connecter</AuthSwitch>}
    >
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

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Envoi…' : 'Envoyer le code'}
        </Button>
      </form>
    </AuthShell>
  );
}
