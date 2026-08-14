// AUTH-01 — POST /api/auth/signup
//
// Enumeration-resistant: returns identical 201 { ok: true } whether the email
// is new or already exists (D-22). Genuinely new users get a User row, an
// EMAIL_VERIFY VerificationCode, and an outbox email event — all in one tx.
// Existing-email branch runs `dummyBcryptCompare` so the request takes
// ~the same time as the new-user branch (timing parity).
//
// CSRF carve-out: signup is a pre-session route — no CSRF cookie exists yet,
// so calling verifyCsrf would 403 every legitimate request. The CSRF cookie is
// set on session establishment (verify-email / login / refresh).
//
// AUTH_REQUIRE_EMAIL_VERIFICATION="0" — opt-out documented in
// `lib/server/auth/email-verification.ts`. In that mode the new user is created
// already verified, no code is generated, no email is enqueued, and the session
// cookies are issued right here. The response then carries `session: true`.
//
// ⚠️ That mode BREAKS the enumeration resistance described above: a brand-new
// email gets cookies, an existing one does not, and the difference is
// observable. It is a development convenience, not a production posture.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { attachPendingReferral } from '@/lib/server/referrals/service';
import {
  hashPassword,
  generateVerificationCode,
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '@/lib/server/auth';
import { requiresEmailVerification } from '@/lib/server/auth/email-verification';
import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { enqueueOutbox } from '@/lib/server/outbox';

const PASSWORD_MIN = Number(process.env.AUTH_PASSWORD_MIN_LENGTH ?? 10);
const VERIFICATION_TTL_MS = Number(process.env.AUTH_VERIFICATION_TTL_MIN ?? 15) * 60 * 1000;

const Body = z.object({
  email: zEmail,
  password: z.string().min(1),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'auth:signup',
  windowMs: 60 * 60 * 1000, // 1 hour (D-08)
  max: Number(process.env.AUTH_SIGNUP_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_SIGNUP_ATTEMPTS',
  message: 'Too many signup attempts. Try again later.',
});

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    // 1. Body parse + Zod validation.
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { email, password } = parsed.data;

    // 2. Password policy gates BEFORE looking up user (D-22 — keep the no-user
    //    and existing-user branches symmetric below).
    //    Banned check runs before length so a common short password ("password")
    //    surfaces the more specific PASSWORD_BANNED code rather than TOO_SHORT.
    if (isBanned(password)) {
      const res = NextResponse.json(
        { error: 'PASSWORD_BANNED', message: 'This password is too common.' },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (password.length < PASSWORD_MIN) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_TOO_SHORT',
          message: `Password must be at least ${PASSWORD_MIN} characters`,
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    if (process.env.PASSWORD_HIBP_CHECK === '1' && (await isPwned(password))) {
      const res = NextResponse.json(
        {
          error: 'PASSWORD_PWNED',
          message: 'This password appeared in a known data breach.',
        },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 3. Per-email rate limit.
    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    // 4. Existing-email branch — return identical 201 with timing parity (D-22).
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      await dummyBcryptCompare(password);
      log.info('signup duplicate (enumeration-resist)');
      // Sans vérification d'email, l'absence de cookies trahit déjà l'existence
      // du compte : autant le dire au client pour l'envoyer se connecter plutôt
      // que sur un écran de code qui n'aboutira jamais. Aucune fuite
      // supplémentaire — voir l'avertissement en tête de fichier.
      const body = requiresEmailVerification() ? { ok: true } : { ok: true, session: false };
      const res = NextResponse.json(body, { status: 201 });
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 5. New-user branch — hash + create User (+ VerificationCode + outbox
    //    only when the verification step is enabled).
    const passwordHash = await hashPassword(password);

    // 5a. Verification disabled — create the user already verified and open
    //     the session immediately. No code, no email: nothing to deliver.
    if (!requiresEmailVerification()) {
      const user = await prisma.user.create({
        data: { email, passwordHash, emailVerifiedAt: new Date() },
        select: { id: true, email: true, tokenVersion: true },
      });

      // Parrainage : le code vient du cookie déposé par le middleware, jamais
      // du corps de la requête. Le formulaire n'a donc aucun champ à afficher,
      // et un client modifié n'a rien à falsifier ici.
      await attachPendingReferral(user.id);

      const access = await createAccessToken({
        sub: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
      });
      const refresh = await createRefreshToken(user.id, user.tokenVersion);
      await setAuthCookies(access, refresh);
      await setCsrfCookie();

      log.warn('signup new user — email verification disabled, session issued', {
        userId: user.id,
      });
      const res = NextResponse.json({ ok: true, session: true }, { status: 201 });
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    // 5b. Verification enabled — the session waits for POST /verify-email.
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash },
        select: { id: true },
      });
      await tx.verificationCode.create({
        data: {
          userId: user.id,
          code,
          type: 'EMAIL_VERIFY',
          expiresAt,
        },
      });
      await enqueueOutbox(tx, {
        kind: 'email.verification_code',
        payload: {
          to: email,
          code,
          expiresAt: expiresAt.toISOString(),
        },
      });
      return user;
    });

    // Hors transaction : le rattachement n'a pas à pouvoir annuler la création
    // du compte, et l'inscription reste indiscernable d'un email déjà pris.
    await attachPendingReferral(created.id);

    log.info('signup new user');
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
