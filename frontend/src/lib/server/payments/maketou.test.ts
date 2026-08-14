import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MaketouError,
  MaketouUnconfiguredError,
  __resetMaketouProvider,
  createMaketouProvider,
  getMaketouProvider,
  maketouRedirectUrl,
  splitName,
} from './maketou';

/**
 * L'adaptateur n'appelle jamais Maketou dans ces tests : `fetch` est simulé.
 *
 * Ce qui est vérifié ici tient en deux choses — la forme exacte du panier
 * envoyé (un champ manquant = 422 chez eux, et aucun achat ne passe), et le
 * fait qu'une panne réseau ne soit JAMAIS prise pour un échec de paiement.
 */
function stubFetch(handler: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const spy = vi.fn(async (url: unknown, init: unknown) =>
    handler(String(url), (init ?? {}) as RequestInit),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const FREE_PRICING_ENV = {
  MAKETOU_API_KEY: 'sk_test_abc',
  MAKETOU_PRODUCT_ID: 'prod-libre',
};

const CHARGE = {
  amount: 3000,
  currency: 'XOF',
  customer: { email: 'kalim@example.com', name: 'Kalim Bigard' },
  metadata: { packId: 'createur' },
  successUrl: 'https://deoflow.app/wallet/topup/confirmation?order=ord_1',
  failureUrl: 'https://deoflow.app/wallet/topup/confirmation?order=ord_1',
  externalRef: 'ord_1',
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('création du panier', () => {
  it('envoie la forme attendue par Maketou', async () => {
    const spy = stubFetch(() =>
      json({ cart: { id: 'cart_9' }, redirectUrl: 'https://pay.maketou.net/cart_9' }),
    );

    const result = await createMaketouProvider(FREE_PRICING_ENV).charge(CHARGE);

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.maketou.net/api/v1/stores/cart/checkout');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_abc');

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      productDocumentId: 'prod-libre',
      email: 'kalim@example.com',
      // Maketou refuse un panier sans prénom NI nom : sans le découpage, tout
      // achat depuis un compte email/mot de passe partirait en 422.
      firstName: 'Kalim',
      lastName: 'Bigard',
      customerPrice: 3000,
      redirectURL: CHARGE.successUrl,
      meta: { orderId: 'ord_1', packId: 'createur' },
    });

    expect(result).toEqual({
      providerChargeId: 'cart_9',
      paymentUrl: 'https://pay.maketou.net/cart_9',
      status: 'PENDING',
    });
  });

  it('un produit à prix fixe l’emporte, et le montant n’est plus envoyé', async () => {
    // C'est la sortie de secours : le prix étant verrouillé chez Maketou,
    // envoyer `customerPrice` en plus n'aurait aucun sens.
    const spy = stubFetch(() => json({ cart: { id: 'c' }, redirectUrl: 'https://pay/c' }));

    await createMaketouProvider({
      ...FREE_PRICING_ENV,
      MAKETOU_PRODUCT_CREATEUR: 'prod-createur-fixe',
    }).charge(CHARGE);

    const body = JSON.parse(String((spy.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.productDocumentId).toBe('prod-createur-fixe');
    expect(body).not.toHaveProperty('customerPrice');
  });

  it('refuse de créer un panier sans aucun produit configuré', async () => {
    stubFetch(() => json({}));
    await expect(
      createMaketouProvider({ MAKETOU_API_KEY: 'k' }).charge(CHARGE),
    ).rejects.toMatchObject({ code: 'MAKETOU_PRODUCT_UNCONFIGURED', retryable: false });
  });
});

describe('URL de retour', () => {
  // Constaté sur leur API : `@IsUrl()` refuse tout hôte sans extension, par un
  // 422 « redirectURL must be a URL address » — et le panier n'est PAS créé.
  it.each([
    ['http://localhost:3001/x', null],
    ['http://127.0.0.1:3001/x', null],
    ['http://mon-pc:3001/x', null],
    ['pas une url', null],
    ['ftp://deoflow.app/x', null],
    ['', null],
  ])('%s → omise', (input, expected) => {
    expect(maketouRedirectUrl(input)).toBe(expected);
  });

  it.each([
    'https://deoflow.app/wallet/topup/confirmation?order=ord_1',
    // lvh.me résout vers 127.0.0.1 : c'est ce qui rend le retour testable en
    // local sans tunnel.
    'http://lvh.me:3001/wallet/topup/confirmation?order=ord_1',
  ])('%s → conservée', (input) => {
    expect(maketouRedirectUrl(input)).toBe(input);
  });

  it('omet le champ plutôt que de faire échouer l’achat', async () => {
    // Un achat sans retour reste un achat : le cron crédite. Un 422 sur toute
    // la requête, lui, empêche purement et simplement de payer.
    const spy = stubFetch(() => json({ cart: { id: 'c' }, redirectUrl: 'https://pay/c' }));

    await createMaketouProvider(FREE_PRICING_ENV).charge({
      ...CHARGE,
      successUrl: 'http://localhost:3001/wallet/topup/confirmation?order=ord_1',
    });

    const body = JSON.parse(String((spy.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).not.toHaveProperty('redirectURL');
    expect(body.productDocumentId).toBe('prod-libre');
  });
});

describe('découpage du nom', () => {
  it.each([
    ['Kalim Bigard', 'kalim@x.com', ['Kalim', 'Bigard']],
    ['Kalim', 'kalim@x.com', ['Kalim', '-']],
    ['Jean Claude Van Damme', 'j@x.com', ['Jean', 'Claude Van Damme']],
    [null, 'kalim@x.com', ['kalim', '-']],
    [null, '', ['Client', '-']],
    ['   ', 'zed@x.com', ['zed', '-']],
  ])('%s / %s', (name, email, expected) => {
    expect(splitName(name, email)).toEqual(expected);
  });
});

describe('lecture du statut', () => {
  it.each([
    ['waiting_payment', 'PENDING'],
    ['completed', 'PAID'],
    ['payment_failed', 'FAILED'],
    ['abandoned', 'FAILED'],
  ])('%s → %s', async (maketou, expected) => {
    stubFetch(() => json({ id: 'cart_9', status: maketou }));
    const status = await createMaketouProvider(FREE_PRICING_ENV).pollCharge('cart_9');
    expect(status).toBe(expected);
  });

  it('encode l’identifiant dans l’URL', async () => {
    const spy = stubFetch(() => json({ id: 'a/b', status: 'completed' }));
    await createMaketouProvider(FREE_PRICING_ENV).pollCharge('a/b');
    expect(spy.mock.calls[0]?.[0]).toBe('https://api.maketou.net/api/v1/stores/cart/a%2Fb');
  });

  it('lève plutôt que de conclure à un échec sur un statut inconnu', async () => {
    // Si Maketou ajoute « refunded » ou « disputed », le prendre pour un échec
    // annulerait des commandes payées. Mieux vaut laisser le cron repasser.
    stubFetch(() => json({ id: 'cart_9', status: 'refunded' }));
    await expect(
      createMaketouProvider(FREE_PRICING_ENV).pollCharge('cart_9'),
    ).rejects.toMatchObject({ code: 'MAKETOU_BAD_RESPONSE', retryable: true });
  });
});

describe('erreurs', () => {
  it.each([
    [401, 'INVALID_API_KEY', false],
    [400, 'INVALID_PRODUCT', false],
    [404, 'CART_NOT_FOUND', false],
    [422, 'VALIDATION_ERROR', false],
    [429, 'RATE_LIMITED', true],
    [503, 'MAKETOU_ERROR', true],
  ])('HTTP %i → %s (rejouable : %s)', async (status, code, retryable) => {
    stubFetch(() => new Response('boom', { status }));
    const err = await createMaketouProvider(FREE_PRICING_ENV)
      .pollCharge('cart_9')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MaketouError);
    expect(err).toMatchObject({ code, retryable });
  });

  it('déplie les violations d’un 422 en phrase lisible', async () => {
    // Forme réelle renvoyée par leur API. Sans ce dépliage, l'erreur se
    // résumait à « Maketou a répondu 422 » et il fallait sortir curl pour
    // apprendre quel champ posait problème.
    stubFetch(() =>
      json(
        {
          message: [
            {
              target: { email: 'kalim@example.com' },
              value: 'http://localhost:3001/x',
              property: 'redirectURL',
              constraints: { isUrl: 'redirectURL must be a URL address' },
            },
          ],
          error: 'Unprocessable Entity',
          statusCode: 422,
        },
        422,
      ),
    );

    const err = (await createMaketouProvider(FREE_PRICING_ENV)
      .pollCharge('c')
      .catch((e: unknown) => e)) as MaketouError;

    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('redirectURL : redirectURL must be a URL address');
    // `target` et `value` portent l'email et le nom de l'acheteur : ils ne
    // doivent pas se retrouver dans un message qui finit dans les journaux.
    expect(err.message).not.toContain('kalim@example.com');
  });

  it('préfère le code renvoyé par Maketou au repli sur le statut HTTP', async () => {
    stubFetch(() => json({ code: 'PRODUCT_ARCHIVED', message: 'Produit archivé' }, 400));
    await expect(
      createMaketouProvider(FREE_PRICING_ENV).pollCharge('cart_9'),
    ).rejects.toMatchObject({ code: 'PRODUCT_ARCHIVED', message: 'Produit archivé' });
  });

  it('une panne réseau est rejouable — jamais un échec de paiement', async () => {
    // Le point le plus important du fichier : marquer une commande en échec
    // sur un hoquet réseau reviendrait à refuser des crédits déjà payés.
    stubFetch(() => {
      throw new Error('ECONNRESET');
    });
    await expect(
      createMaketouProvider(FREE_PRICING_ENV).pollCharge('cart_9'),
    ).rejects.toMatchObject({ code: 'MAKETOU_UNREACHABLE', retryable: true });
  });

  it('une réponse illisible est rejouable', async () => {
    stubFetch(() => new Response('<html>maintenance</html>', { status: 200 }));
    await expect(
      createMaketouProvider(FREE_PRICING_ENV).pollCharge('cart_9'),
    ).rejects.toMatchObject({ code: 'MAKETOU_BAD_RESPONSE', retryable: true });
  });
});

describe('configuration', () => {
  it('exige une clé API', () => {
    expect(() => createMaketouProvider({ MAKETOU_API_KEY: '  ' })).toThrow(/MAKETOU_API_KEY/);
  });

  it('accepte une URL de base personnalisée, sans barre finale en double', async () => {
    const spy = stubFetch(() => json({ id: 'c', status: 'completed' }));
    await createMaketouProvider({
      ...FREE_PRICING_ENV,
      MAKETOU_API_URL: 'https://sandbox.maketou.net/',
    }).pollCharge('c');
    expect(spy.mock.calls[0]?.[0]).toBe('https://sandbox.maketou.net/api/v1/stores/cart/c');
  });
});

describe('singleton et absence de configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    __resetMaketouProvider();
  });

  it.each([
    ['sans rien', { MAKETOU_API_KEY: '', MAKETOU_PRODUCT_ID: '' }],
    ['clé seule, aucun produit', { MAKETOU_API_KEY: 'sk', MAKETOU_PRODUCT_ID: '' }],
    ['produit seul, aucune clé', { MAKETOU_API_KEY: '', MAKETOU_PRODUCT_ID: 'p' }],
  ])('%s → erreur typée, traduite en 503 par la route', (_label, env) => {
    // C'est l'état d'une instance fraîchement clonée. Il doit produire un
    // message clair, pas une exception au chargement du module.
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    for (const k of ['MAKETOU_PRODUCT_STARTER', 'MAKETOU_PRODUCT_CREATEUR', 'MAKETOU_PRODUCT_PRO'])
      vi.stubEnv(k, '');
    __resetMaketouProvider();

    expect(() => getMaketouProvider()).toThrow(MaketouUnconfiguredError);
    try {
      getMaketouProvider();
    } catch (err) {
      expect(err).toMatchObject({ code: 'PAYMENT_PROVIDER_UNCONFIGURED' });
    }
  });

  it('un produit à prix fixe suffit, même sans produit « prix libre »', () => {
    vi.stubEnv('MAKETOU_API_KEY', 'sk');
    vi.stubEnv('MAKETOU_PRODUCT_ID', '');
    vi.stubEnv('MAKETOU_PRODUCT_STARTER', 'prod-starter');
    __resetMaketouProvider();

    expect(getMaketouProvider().name).toBe('maketou');
  });

  it('met le fournisseur en cache entre deux appels', () => {
    vi.stubEnv('MAKETOU_API_KEY', 'sk');
    vi.stubEnv('MAKETOU_PRODUCT_ID', 'p');
    __resetMaketouProvider();

    expect(getMaketouProvider()).toBe(getMaketouProvider());
  });
});
