// POST /api/credits/purchase — ouverture d'un paiement Maketou.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

// `vi.hoisted` : la factory ci-dessous est remontée en tête de fichier, avant
// l'initialisation des `const` ordinaires — un `const` simple lèverait
// « Cannot access before initialization » à cause de l'import statique de
// `./route`, qui déclenche la factory tout de suite.
const { startPurchaseMock } = vi.hoisted(() => ({ startPurchaseMock: vi.fn() }));
vi.mock('@/lib/server/purchases/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/purchases/service')>();
  return { ...actual, startPurchase: startPurchaseMock };
});

import { requireAuth } from '@/lib/server/middleware';
import { PurchaseError } from '@/lib/server/purchases/service';
import { POST } from './route';

const authedCtx = { user: { sub: 'user-1', email: 'kalim@example.com' } };

function makeReq(
  body: unknown,
  opts: { csrf?: 'match' | 'missing'; idempotencyKey?: string } = {},
): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if ((opts.csrf ?? 'match') === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  return new NextRequest('http://test/api/credits/purchase', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __cookieStore.clear();
  vi.mocked(requireAuth).mockResolvedValue(authedCtx);
  startPurchaseMock.mockResolvedValue({
    orderId: 'ord_1',
    paymentUrl: 'https://pay.maketou.net/cart_1',
    packId: 'createur',
    credits: 3000,
    amountFcfa: 9000,
  });
});

describe('POST /api/credits/purchase', () => {
  it('renvoie l’URL de paiement', async () => {
    const res = await POST(makeReq({ packId: 'createur' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      orderId: 'ord_1',
      paymentUrl: 'https://pay.maketou.net/cart_1',
      amountFcfa: 9000,
    });
  });

  it('IGNORE tout montant glissé dans le corps', async () => {
    // Le prix est lu dans le catalogue serveur. Si un jour la route le
    // transmettait, n'importe qui s'achèterait 10 000 crédits pour 1 franc.
    await POST(makeReq({ packId: 'createur', priceFcfa: 1, credits: 999_999 }));

    expect(startPurchaseMock).toHaveBeenCalledWith({
      userId: 'user-1',
      packId: 'createur',
      idempotencyKey: null,
    });
    const passed = startPurchaseMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(passed).not.toHaveProperty('priceFcfa');
    expect(passed).not.toHaveProperty('credits');
  });

  it('transmet la clé d’idempotence', async () => {
    await POST(makeReq({ packId: 'starter' }, { idempotencyKey: 'k-42' }));
    expect(startPurchaseMock.mock.calls[0]?.[0]).toMatchObject({ idempotencyKey: 'k-42' });
  });

  it('exige le jeton CSRF', async () => {
    const res = await POST(makeReq({ packId: 'starter' }, { csrf: 'missing' }));
    expect(res.status).toBe(403);
    expect(startPurchaseMock).not.toHaveBeenCalled();
  });

  it('refuse un corps sans pack', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'VALIDATION_FAILED' });
    expect(startPurchaseMock).not.toHaveBeenCalled();
  });

  it('traduit une erreur d’achat en code stable', async () => {
    startPurchaseMock.mockRejectedValue(new PurchaseError('PACK_UNKNOWN', 'Pack inconnu', 400));
    const res = await POST(makeReq({ packId: 'gratuit' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'PACK_UNKNOWN' });
  });

  it('répond 503 quand Maketou n’est pas configuré', async () => {
    startPurchaseMock.mockRejectedValue(
      new PurchaseError('PAYMENT_PROVIDER_UNCONFIGURED', 'Paiement non configuré', 503),
    );
    const res = await POST(makeReq({ packId: 'starter' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'PAYMENT_PROVIDER_UNCONFIGURED' });
  });

  it('n’écrit rien en base par elle-même', () => {
    // Toute la persistance passe par le service : la route ne doit pas ouvrir
    // un second chemin vers `Order`.
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});
