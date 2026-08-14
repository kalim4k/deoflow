import { NextResponse, type NextRequest } from 'next/server';
import {
  REFERRAL_COOKIE_MAX_AGE_S,
  REFERRAL_PARAM,
  isReferralCodeShaped,
  normalizeReferralCode,
} from '@/lib/deoflow/referrals';

// ⚠️ EMPLACEMENT : ce fichier DOIT rester dans `src/`, à côté de `app/`.
//
// Il a longtemps vécu à la racine de `frontend/`, où Next.js ne le charge pas
// quand le projet utilise un dossier `src/`. Il n'a donc jamais tourné — sans
// que rien ne le signale, puisqu'il était configuré pour être inerte par
// défaut (`AUTH_PROTECTED_PREFIXES` vide). Le déplacer l'a réveillé.
// `middleware-location.test.ts` tient désormais cette contrainte.

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This middleware catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this middleware is a no-op.
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const REFRESH_COOKIE = `${COOKIE_PREFIX}-refresh`;
const REFERRAL_COOKIE = `${COOKIE_PREFIX}-ref`;
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH || '/login';

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Capture d'un lien de parrainage.
 *
 * Le code voyage dans `?ref=`, il est déposé en cookie httpOnly, puis RETIRÉ
 * de l'URL par une redirection. Trois conséquences, toutes voulues :
 *
 *   - le formulaire d'inscription n'a aucun champ de parrainage, et n'en aura
 *     jamais besoin : c'est le serveur qui lit le cookie au moment de créer le
 *     compte. Rien à remplir, rien à masquer, rien à falsifier depuis la page ;
 *   - `httpOnly` met le code hors de portée du JavaScript de la page — donc
 *     hors de portée d'un script tiers qui voudrait le lire ou le réécrire ;
 *   - l'URL nettoyée est celle que le nouveau venu verra, partagera et mettra
 *     en favori. Il ne se promène pas avec le code de son parrain collé
 *     derrière chaque adresse.
 *
 * La redirection ne boucle pas : le paramètre a disparu au second passage.
 */
function captureReferral(req: NextRequest): NextResponse | null {
  const raw = req.nextUrl.searchParams.get(REFERRAL_PARAM);
  if (!raw) return null;

  const url = req.nextUrl.clone();
  url.searchParams.delete(REFERRAL_PARAM);
  const res = NextResponse.redirect(url, 302);

  // Premier contact gagne : un filleul déjà porteur d'un code ne change pas de
  // parrain parce qu'il a cliqué sur un second lien.
  if (req.cookies.get(REFERRAL_COOKIE)?.value) return res;

  const code = normalizeReferralCode(raw);
  // Forme vérifiée AVANT d'écrire : un lien forgé ne dépose pas 4 000
  // caractères dans un cookie qui repartira à chaque requête.
  if (!isReferralCodeShaped(code)) return res;

  res.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax', // doit survivre à l'arrivée depuis TikTok, WhatsApp…
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: REFERRAL_COOKIE_MAX_AGE_S,
  });
  return res;
}

export function middleware(req: NextRequest): NextResponse {
  const referral = captureReferral(req);
  if (referral) return referral;

  if (AUTHED_PREFIXES.length === 0) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (!isAuthedPath(pathname)) return NextResponse.next();

  if (req.cookies.get(ACCESS_COOKIE)?.value) return NextResponse.next();

  const target = pathname + search;

  if (!req.cookies.get(REFRESH_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url, 303);
  }

  const url = req.nextUrl.clone();
  url.pathname = '/api/auth/refresh-and-return';
  url.search = `?next=${encodeURIComponent(target)}`;
  return NextResponse.redirect(url, 303);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
