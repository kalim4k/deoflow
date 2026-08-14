import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));
vi.mock('@/lib/server/prisma', () => ({ prisma: {} }));

const reconcilePurchasesMock = vi.fn();
vi.mock('@/lib/server/purchases/service', () => ({
  reconcilePurchases: reconcilePurchasesMock,
}));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  reconcilePurchasesMock.mockReset();
  reconcilePurchasesMock.mockResolvedValue({ scanned: 3, settled: 2, failed: 1, skipped: 0 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

function makeReq(method: 'GET' | 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/cron/purchase-reconcile', {
    method,
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('cron purchase-reconcile', () => {
  it.each(['GET', 'POST'] as const)('répond en %s', async (method) => {
    // Vercel Cron déclenche en GET. Un 405 silencieux ici signifierait des
    // crédits payés et jamais livrés — c'est pourquoi les deux verbes sont
    // exposés, contrairement aux six crons hérités de la trousse de départ.
    const mod = await import('./route');
    const res = await mod[method](makeReq(method));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, scanned: 3, settled: 2, failed: 1 });
  });

  it('refuse sans le secret', async () => {
    const { verifyCronSecret } = await import('@/lib/server/cron/auth');
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { GET } = await import('./route');
    expect((await GET(makeReq('GET'))).status).toBe(401);
    expect(reconcilePurchasesMock).not.toHaveBeenCalled();
  });

  it('passe par le bail — deux instances ne doublonnent pas', async () => {
    const { withLease } = await import('@/lib/server/leader-lease');
    const { POST } = await import('./route');
    await POST(makeReq('POST'));
    expect(withLease).toHaveBeenCalledWith(
      undefined,
      'purchase-reconcile',
      expect.any(Number),
      expect.any(Function),
    );
  });
});
