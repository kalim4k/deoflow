// AUTH-01 — POST /api/auth/signup tests.
// Pattern: D-25 mock Prisma + module-level vi.mock (Pitfall 11).
// prismaMock import MUST come first so the vi.mock auto-hoists above route imports.
import { prismaMock } from '@/test-utils/prisma-mock';
// La branche « vérification désactivée » pose les cookies de session. Sans ce
// mock, `cookies()` lève hors contexte de requête et la route échoue avant ses
// assertions — l'ancienne suite ne l'avait jamais rencontré, ne testant que le
// parcours en deux étapes, qui n'ouvre aucune session.
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

mockNextCookies();
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

// Outbox + dummy-bcrypt mocks installed at module level so they hoist above
// the route's imports.
vi.mock('@/lib/server/outbox', () => ({
  enqueueOutbox: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
}));
vi.mock('@/lib/server/auth/dummy-bcrypt', () => ({
  dummyBcryptCompare: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server/auth/hibp', () => ({
  isPwned: vi.fn().mockResolvedValue(false),
}));

import { POST } from './route';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';
import { isPwned } from '@/lib/server/auth/hibp';
import { enqueueOutbox } from '@/lib/server/outbox';

function makeReq(body: unknown): NextRequest {
  // Build init inline so optional fields (body) aren't typed as `T | undefined`,
  // which trips Next.js's RequestInit under exactOptionalPropertyTypes.
  return body === undefined
    ? new NextRequest('http://test/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
    : new NextRequest('http://test/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  // Default $transaction passes the prismaMock as `tx` so writes within the
  // callback hit the same mocks as the outer client (mockDeep proxies them).
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

/**
 * Ces tests décrivent le parcours EN DEUX ÉTAPES (code par email), qui n'est
 * plus le défaut de Deoflow depuis le 2026-08-14 — la vérification est
 * désactivée sauf `AUTH_REQUIRE_EMAIL_VERIFICATION="1"`.
 *
 * Le drapeau est donc posé explicitement ici. Il l'était implicitement avant :
 * les tests héritaient du défaut ambiant, et le jour où ce défaut a changé, ils
 * se sont mis à décrire un parcours que l'application ne suivait plus. Un test
 * qui n'énonce pas la configuration qu'il suppose finit par tester autre chose
 * que ce que son nom annonce.
 */
describe('POST /api/auth/signup — vérification email exigée', () => {
  beforeEach(() => {
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = '1';
  });
  afterEach(() => {
    delete process.env.AUTH_REQUIRE_EMAIL_VERIFICATION;
  });

  it('creates a new user, code, and outbox event for genuinely new emails', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-new' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);

    const res = await POST(makeReq({ email: 'new@example.com', password: 'a-strong-passphrase' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.verificationCode.create).toHaveBeenCalledTimes(1);
    const codeArg = prismaMock.verificationCode.create.mock.calls[0]?.[0];
    expect(codeArg?.data?.type).toBe('EMAIL_VERIFY');

    expect(enqueueOutbox).toHaveBeenCalledTimes(1);
    const outboxArg = (enqueueOutbox as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(outboxArg?.kind).toBe('email.verification_code');
    expect(outboxArg?.payload?.to).toBe('new@example.com');
  });

  it('returns identical 201 + dummy-bcrypts on existing email (enumeration-resist)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-existing' } as never);

    const res = await POST(
      makeReq({ email: 'existing@example.com', password: 'a-strong-passphrase' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.verificationCode.create).not.toHaveBeenCalled();
    expect(enqueueOutbox).not.toHaveBeenCalled();
  });

  it('rejects banned passwords with PASSWORD_BANNED before user lookup', async () => {
    const res = await POST(makeReq({ email: 'foo@example.com', password: 'password' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PASSWORD_BANNED');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects too-short passwords with PASSWORD_TOO_SHORT', async () => {
    const res = await POST(makeReq({ email: 'foo@example.com', password: 'short' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PASSWORD_TOO_SHORT');
    expect(body.message).toContain('10');
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_FAILED for malformed email', async () => {
    const res = await POST(makeReq({ email: 'not-an-email', password: 'a-strong-passphrase' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 429 TOO_MANY_SIGNUP_ATTEMPTS when the per-email limit is hit', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'u-rate' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);

    const calls = await Promise.all(
      Array.from({ length: 6 }, () =>
        POST(
          makeReq({
            email: 'rate-target@example.com',
            password: 'a-strong-passphrase',
          }),
        ),
      ),
    );
    const statuses = calls.map((r) => r.status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
    const limited = calls.find((r) => r.status === 429)!;
    const body = await limited.json();
    expect(body.error).toBe('TOO_MANY_SIGNUP_ATTEMPTS');
  });

  it('rejects pwned passwords with PASSWORD_PWNED when PASSWORD_HIBP_CHECK=1', async () => {
    vi.stubEnv('PASSWORD_HIBP_CHECK', '1');
    (isPwned as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    try {
      const res = await POST(
        makeReq({
          email: 'hibp@example.com',
          password: 'a-very-unique-passphrase-1234',
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('PASSWORD_PWNED');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("source exports runtime = 'nodejs' (Phase 0 guard)", () => {
    const src = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    expect(src).toMatch(/export\s+const\s+runtime\s*=\s*['"]nodejs['"]/);
  });
});

/**
 * Le parcours par DÉFAUT de Deoflow : vérification désactivée.
 *
 * Il n'était couvert nulle part — le drapeau valait `"0"` dans `.env` mais
 * vitest ne lit pas ce fichier, si bien que la suite ne testait que le
 * parcours en deux étapes. Autrement dit : le chemin réellement emprunté par
 * chaque inscription en production n'avait aucun test.
 */
describe('POST /api/auth/signup — vérification désactivée (défaut)', () => {
  it('ouvre la session immédiatement, sans code ni email', async () => {
    expect(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION).toBeUndefined();

    prismaMock.user.findUnique.mockResolvedValue(null);
    // `tokenVersion` est indispensable : la route le fait entrer dans le jeton
    // signé, et la révocation de session repose dessus.
    prismaMock.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'new@example.com',
      tokenVersion: 0,
    } as never);

    const res = await POST(makeReq({ email: 'new@example.com', password: 'a-strong-passphrase' }));

    expect(res.status).toBe(201);
    expect((await res.json()).session).toBe(true);

    // La session est bien ouverte sur-le-champ : c'est ce que « désactivé »
    // veut dire côté utilisateur.
    expect(__cookieStore.has('app-token')).toBe(true);
    expect(__cookieStore.has('app-refresh')).toBe(true);
    expect(__cookieStore.has('app-csrf')).toBe(true);

    // Ni code à saisir, ni email à envoyer : c'est tout l'objet du réglage.
    expect(prismaMock.verificationCode.create).not.toHaveBeenCalled();
    expect(enqueueOutbox).not.toHaveBeenCalled();
  });

  it('signale un email déjà pris au lieu d’ouvrir une session', async () => {
    // ⚠️ C'est ici que se perd la résistance à l'énumération : la réponse
    // diffère selon que l'adresse existe ou non, donc on peut la tester. Coût
    // assumé de la désactivation, documenté dans email-verification.ts.
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u-existing' } as never);

    const res = await POST(
      makeReq({ email: 'existing@example.com', password: 'a-strong-passphrase' }),
    );

    expect(res.status).toBe(201);
    expect((await res.json()).session).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});
