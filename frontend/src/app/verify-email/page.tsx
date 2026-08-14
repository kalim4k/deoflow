'use client';

// Lit `?email=` et `?code=` (le lien de l'email pré-remplit les deux). Si les
// deux sont présents on vérifie automatiquement ; sinon l'utilisateur saisit
// le code à 8 caractères. En cas de succès le serveur pose les cookies et on
// bascule sur le tableau de bord.

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, storeCsrfToken } from '@/lib/api';
import { errorMessage } from '@/lib/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AuthShell } from '@/components/auth/AuthShell';
import { InputField } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

const RESEND_COOLDOWN_S = 60;

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState(params.get('code') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // `verify` est stable pour l'effet de montage : on la garde dans une ref
  // pour ne pas relancer la vérification à chaque rendu.
  const verifyRef = useRef<((email: string, code: string) => Promise<void>) | null>(null);

  async function verify(emailValue: string, codeValue: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }
  verifyRef.current = verify;

  // Vérification automatique quand le lien de l'email porte les deux valeurs.
  useEffect(() => {
    const qEmail = params.get('email');
    const qCode = params.get('code');
    if (qEmail && qCode) void verifyRef.current?.(qEmail, qCode);
    // Au montage uniquement : `params` et la ref sont volontairement hors des
    // dépendances — une re-vérification en boucle serait absurde.
  }, []);

  // Décompte du bouton « renvoyer ».
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function onResend() {
    if (!email) {
      setError('Saisissez votre email avant de demander un nouveau code.');
      return;
    }
    setResending(true);
    setError(null);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email } });
      // Réponse volontairement identique que le compte existe ou non.
      toast('Si un compte existe pour cet email, un nouveau code vient de partir.', 'success');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      title="Vérifiez votre email"
      subtitle="Nous avons envoyé un code de 8 caractères dans votre boîte de réception. Il expire au bout de 10 minutes."
      footer={
        <>
          Mauvaise adresse ?{' '}
          <Link href="/signup" className="cursor-pointer text-ember-600 hover:underline">
            Recommencer l&apos;inscription
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void verify(email, code);
        }}
        className="flex flex-col gap-4"
      >
        <InputField
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <InputField
          label="Code de vérification"
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

        {error && <Alert tone="error">{error}</Alert>}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Vérification…' : 'Vérifier mon email'}
        </Button>

        <Button
          variant="ghost"
          onClick={() => void onResend()}
          loading={resending}
          disabled={cooldown > 0}
          className="w-full"
        >
          {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
