import { GoogleIcon } from '@/components/icons';
import { buttonStyles } from '@/components/ui/Button';

/**
 * La connexion Google est une navigation de premier niveau — PAS un fetch —
 * pour que le navigateur porte les cookies et reçoive le Set-Cookie de la
 * redirection de callback. Ne pas transformer en navigation client.
 */
export function GoogleButton({
  next = '/dashboard',
  label = 'Continuer avec Google',
}: {
  next?: string;
  label?: string;
}) {
  return (
    // Même gabarit que le bouton d'envoi du formulaire (`lg`) : les deux
    // chemins de connexion se valent, ils doivent peser pareil à l'œil.
    <a
      href={`/api/auth/oauth/google/start?next=${encodeURIComponent(next)}`}
      className={buttonStyles('secondary', 'lg', 'w-full')}
    >
      <GoogleIcon />
      {label}
    </a>
  );
}

/** Séparateur « ou » entre la connexion externe et le formulaire. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 text-xs tracking-wider text-ink-300 uppercase">
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
