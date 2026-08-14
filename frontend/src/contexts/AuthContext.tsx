'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearCsrfToken, storeCsrfToken } from '@/lib/api';
import { invalidateCachePrefix } from '@/lib/useApi';
import { COOKIE_PREFIX } from '@/lib/constants';

export interface User {
  id: string;
  email: string;
  /** Nom d'affichage — issu du profil OAuth, null pour une inscription email. */
  name: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** false when the account was created via OAuth and never set a password. */
  hasPassword: boolean;
  /** Provider names already linked, e.g. ['google']. Empty for pure email/password accounts. */
  linkedProviders: string[];
}

interface AuthContextValue {
  user: User | null;
  /**
   * Solde de crédits, servi par `/api/auth/me` en même temps que le profil.
   *
   * Il vit ici plutôt que dans son propre appel réseau parce que la ligne
   * utilisateur est de toute façon lue à chaque chargement : une colonne de
   * plus ne coûte rien, un appel de plus coûtait trois requêtes SQL et un
   * aller-retour que le navigateur devait attendre. Voir `CreditsContext`,
   * qui n'est plus qu'une vue sur cette valeur.
   *
   * `null` tant que la session n'a pas répondu — à ne pas confondre avec 0.
   */
  credits: number | null;
  loading: boolean;
  loggingOut: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ user: User; credits?: number; csrfToken?: string }>('/api/auth/me');
      setUser(res.user);
      setCredits(res.credits ?? 0);
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        // Session finie : 0 est ici un fait, pas une valeur d'attente.
        setCredits(0);
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many requests. Wait a few minutes and try again.');
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Cannot reach the server. Check your network and try again.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Skip /me for anonymous visitors — the JS-readable CSRF cookie is only
    // set after login, so its absence is a reliable "no session" signal.
    const csrfCookieName = `${COOKIE_PREFIX}-csrf`;
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${csrfCookieName}=`));
    if (!hasCookie) {
      setCredits(0);
      setLoading(false);
      return;
    }
    void fetchUser();
    // Run once on mount; fetchUser is stable.
  }, []);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore — cookie will expire anyway
    }
    clearCsrfToken();
    invalidateCachePrefix('/api/');
    setUser(null);
    setCredits(0);
    setLoggingOut(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, credits, loading, loggingOut, error, refresh: fetchUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const SSR_STUB: AuthContextValue = {
  user: null,
  // `null` et non 0 : le rendu serveur ne sait rien du solde, et afficher un
  // zéro le temps de l'hydratation était exactement le défaut corrigé.
  credits: null,
  loading: true,
  loggingOut: false,
  error: null,
  refresh: async () => {},
  logout: async () => {},
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (typeof window === 'undefined') return SSR_STUB;
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}

/**
 * Auth-required helper — returns the user, or redirects to the configured
 * login path if logged out. Use on pages that require an authenticated
 * session so each page doesn't reimplement the same `if (!user) router.push`.
 *
 *   export default function DashboardPage() {
 *     const user = useUser();         // never null inside the body
 *     if (!user) return null;         // null while redirecting / loading
 *     return <div>Hello {user.email}</div>;
 *   }
 *
 * Default redirect target is `/login`; override via the `redirectTo` arg.
 * Returns `null` while loading OR while the redirect is in flight, so the
 * UI can render a stub. Use the `loading` field of useAuth() if you want
 * to render a spinner explicitly.
 */
export function useUser(redirectTo: string = '/login'): User | null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(redirectTo);
    }
  }, [loading, user, redirectTo, router]);

  if (loading || !user) return null;
  return user;
}
