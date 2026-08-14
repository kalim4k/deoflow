// GET /api/auth/me — AUTH-06.
//
// Source: RESEARCH.md Pattern 14.
//
// requireAuth handles the cookie/Bearer lookup, JWT verification, and the
// DB-side tokenVersion re-check (T-1-02 mitigation against stale-JWT bypass
// after change-password bumps tokenVersion). Returns AuthContext on success
// or a 401 NextResponse on failure.
//
// Extra fields beyond { sub, email } (id, emailVerifiedAt, createdAt,
// updatedAt, hasPassword, linkedProviders) are fetched via a second DB hit
// so the AuthContext / settings page can branch on them without an extra
// round-trip. `hasPassword` distinguishes OAuth-only accounts (passwordHash
// is null) — used by /settings to switch between "Set password" and
// "Change password". `linkedProviders` is a string[] of provider names
// already wired (e.g. ['google']).
//
// No CSRF: GET is a safe method; verifyCsrf is a no-op for GET anyway.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import {
  attachPendingReferral,
  clearReferralCookie,
  isWithinAttachWindow,
} from '@/lib/server/referrals/service';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // Defensive shape: tests sometimes stub findUnique with a minimal
    // `{ id, email, tokenVersion }` payload (the requireAuth contract).
    // We only read fields we know are present, and default the rest.
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        // Renseigné depuis le profil OAuth à la première connexion ; null pour
        // une inscription email/mot de passe. L'interface retombe alors sur la
        // partie locale de l'adresse plutôt que d'afficher l'email en entier.
        name: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        // Solde de crédits. Il est lu ICI plutôt que par un appel séparé à
        // `/api/credits` : la ligne utilisateur est déjà chargée, la colonne ne
        // coûte donc rien de plus. Un appel dédié coûtait, lui, trois requêtes
        // SQL (dont le contrôle d'authentification, refait) et un aller-retour
        // réseau que le navigateur devait attendre avant d'afficher quoi que
        // ce soit.
        credits: true,
        // Parrainage — deux colonnes déjà présentes sur la ligne, donc
        // gratuites, qui servent à écarter sans requête le cas courant : un
        // habitué qui se reconnecte n'a rien à rattacher.
        referredById: true,
        oauthAccounts: { select: { provider: true } },
      },
    });

    // Rattrapage du parrainage pour l'inscription via Google.
    //
    // Le gestionnaire de retour OAuth crée le compte, mais c'est un fichier
    // PROTÉGÉ (CLAUDE.md) : on ne s'y branche pas. Le premier `/api/auth/me`
    // suit de quelques secondes, porte le même cookie, et fait le travail.
    //
    // Trois conditions, toutes nécessaires : un compte sans parrain, créé à
    // l'instant, et un cookie de parrainage présent. Un compte ancien qui
    // cliquerait un jour sur le lien d'un ami n'est PAS rattaché — un
    // parrainage récompense un nouveau client, pas la capture d'un client
    // déjà acquis.
    if (dbUser && !dbUser.referredById && isWithinAttachWindow(dbUser.createdAt)) {
      const attached = await attachPendingReferral(dbUser.id);
      // Le cookie n'est effacé qu'en cas de succès : sur un téléphone partagé,
      // un échec ne doit pas consommer le lien du suivant.
      if (attached) await clearReferralCookie();
    }

    const user = {
      // Keep `sub` for back-compat with the AuthContext payload contract
      // (older callers may still read it). New code should use `id`.
      sub: auth.user.sub,
      id: dbUser?.id ?? auth.user.sub,
      email: dbUser?.email ?? auth.user.email,
      name: dbUser?.name ?? null,
      emailVerifiedAt: dbUser?.emailVerifiedAt
        ? dbUser.emailVerifiedAt instanceof Date
          ? dbUser.emailVerifiedAt.toISOString()
          : dbUser.emailVerifiedAt
        : null,
      createdAt: dbUser?.createdAt
        ? dbUser.createdAt instanceof Date
          ? dbUser.createdAt.toISOString()
          : dbUser.createdAt
        : null,
      updatedAt: dbUser?.updatedAt
        ? dbUser.updatedAt instanceof Date
          ? dbUser.updatedAt.toISOString()
          : dbUser.updatedAt
        : null,
      hasPassword: !!dbUser?.passwordHash,
      linkedProviders: (dbUser?.oauthAccounts ?? []).map((a) => a.provider),
    };

    // `credits` voyage à CÔTÉ de `user`, pas dedans : `user` est la forme de la
    // trousse de départ, le solde est une notion propre à Deoflow. Les mélanger
    // rendrait une future mise à jour du starter conflictuelle.
    //
    // `?? 0` par la même prudence que ci-dessus : les tests remplacent parfois
    // `findUnique` par une charge minimale.
    return NextResponse.json(
      { user, credits: dbUser?.credits ?? 0 },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
