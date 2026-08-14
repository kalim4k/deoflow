// GET /api/credits/purchase/[id] — sondage + règlement.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

// `vi.hoisted` — voir la note dans `../route.test.ts` : l'import statique de
// `./route` déclenche la factory avant l'initialisation d'un `const` ordinaire.
const { settlePurchaseMock } = vi.hoisted(() => ({ settlePurchaseMock: vi.fn() }));
vi.mock('@/lib/server/purchases/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/purchases/service')>();
  return { ...actual, settlePurchase: settlePurchaseMock };
});

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const authedCtx = { user: { sub: 'user-1', email: 'kalim@example.com' } };

const ORDER = {
  id: 'ord_1',
  userId: 'user-1',
  provider: 'maketou',
  amount: 9000,
  currency: 'XOF',
  metadata: { packId: 'createur', credits: 3000 },
  createdAt: new Date('2026-08-13T10:00:00Z'),
};

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/credits/purchase/ord_1', { method: 'GET' });
}

const params = { params: Promise.resolve({ id: 'ord_1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  vi.mocked(requireAuth).mockResolvedValue(authedCtx);
  prismaMock.order.findUnique.mockResolvedValue(ORDER as never);
  settlePurchaseMock.mockResolvedValue({
    status: 'PAID',
    credits: 3000,
    balanceAfter: 3050,
    alreadySettled: false,
  });
});

describe('GET /api/credits/purchase/[id]', () => {
  it('renvoie l’achat réglé et le nouveau solde', async () => {
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      orderId: 'ord_1',
      status: 'PAID',
      credits: 3000,
      balanceAfter: 3050,
      amountFcfa: 9000,
      packId: 'createur',
      failureCode: null,
    });
  });

  it('rend un 404, jamais un 403, pour la commande d’un autre', async () => {
    // Répondre « interdit » confirmerait que cette commande existe.
    prismaMock.order.findUnique.mockResolvedValue({ ...ORDER, userId: 'someone-else' } as never);
    const res = await GET(makeReq(), params);
    expect(res.status).toBe(404);
    expect(settlePurchaseMock).not.toHaveBeenCalled();
  });

  it('rend un 404 pour une commande d’un autre fournisseur', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...ORDER, provider: 'bictorys' } as never);
    expect((await GET(makeReq(), params)).status).toBe(404);
    expect(settlePurchaseMock).not.toHaveBeenCalled();
  });

  it('rend un 404 pour une commande inexistante', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    expect((await GET(makeReq(), params)).status).toBe(404);
  });

  it('reste en attente sans annoncer de crédits', async () => {
    settlePurchaseMock.mockResolvedValue({ status: 'PENDING' });
    const body = await (await GET(makeReq(), params)).json();
    expect(body).toMatchObject({ status: 'PENDING', balanceAfter: null });
    // 3000 vient des métadonnées de la commande : c'est ce qui est PROMIS, pas
    // ce qui est acquis. `status` reste la seule affirmation.
    expect(body.credits).toBe(3000);
  });

  it('remonte le motif d’échec', async () => {
    settlePurchaseMock.mockResolvedValue({ status: 'FAILED', code: 'PAYMENT_FAILED' });
    expect(await (await GET(makeReq(), params)).json()).toMatchObject({
      status: 'FAILED',
      failureCode: 'PAYMENT_FAILED',
      balanceAfter: null,
    });
  });

  it('exige une session', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }) as never,
    );
    expect((await GET(makeReq(), params)).status).toBe(401);
  });
});
