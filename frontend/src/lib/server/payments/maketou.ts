/**
 * Maketou — encaissement mobile money au Togo (Tmoney, Flooz).
 *
 * Documentation : https://docs-api.maketou.com
 *
 * ⚠️ AUCUN WEBHOOK. Toute l'API tient en deux points d'entrée :
 *
 *   POST /api/v1/stores/cart/checkout   crée un panier → `redirectUrl`
 *   GET  /api/v1/stores/cart/{cartId}   renvoie `status`
 *
 * Ni callback, ni IPN, ni signature à vérifier. La confirmation d'un paiement
 * ne peut donc venir que d'une interrogation depuis notre serveur — d'où
 * `pollCharge()` ci-dessous, et le cron de rattrapage qui l'appelle pour les
 * acheteurs ayant fermé leur onglet. Rien de l'architecture webhook de la
 * trousse de départ (`webhook/handler.ts`, `WebhookLog`, HMAC) ne s'applique
 * ici ; elle reste en place pour Bictorys.
 *
 * ⚠️ Maketou vend des PRODUITS, pas des montants. Chaque panier référence un
 * `productDocumentId` créé à la main dans le tableau de bord. Deux montages
 * possibles, voir `resolveProduct()` :
 *
 *   - « Prix libre » — un seul produit, notre serveur envoie `customerPrice`.
 *     Montage retenu. Confortable, mais la lecture du panier ne renvoie PAS
 *     le montant payé : `completed` atteste qu'un paiement a eu lieu, pas
 *     qu'il était du bon montant.
 *   - Prix fixe — un produit par pack, le montant est verrouillé chez Maketou.
 *     Sortie de secours, activée par les seules variables d'environnement.
 *
 * Ce qui protège dans les deux cas : le prix ne transite jamais par le client.
 * `lib/server/purchases/service.ts` le lit dans `CREDIT_PACKS` à partir du
 * seul `packId` reçu.
 */
import 'server-only';
import { z } from 'zod';
import { createLogger } from '../logger';
import type { PaymentProvider, ChargeInput, ChargeResult, ChargeStatus } from './provider';

const logger = createLogger();

const DEFAULT_API_URL = 'https://api.maketou.net';
const DEFAULT_TIMEOUT_MS = 20_000;

// ───────────────────────────────────────────────────────────────────────
// Env
// ───────────────────────────────────────────────────────────────────────

export interface MaketouEnv {
  /** Clé API — liée à UNE boutique. Requise. */
  MAKETOU_API_KEY: string;
  MAKETOU_API_URL?: string;
  MAKETOU_TIMEOUT_MS?: string;
  /** Produit « Prix libre » — utilisé quand aucun produit dédié au pack n'existe. */
  MAKETOU_PRODUCT_ID?: string;
  /** Produits à prix fixe, un par pack. Priment sur `MAKETOU_PRODUCT_ID`. */
  MAKETOU_PRODUCT_STARTER?: string;
  MAKETOU_PRODUCT_CREATEUR?: string;
  MAKETOU_PRODUCT_PRO?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Erreurs
// ───────────────────────────────────────────────────────────────────────

/**
 * Échec côté Maketou, porteur d'un code stable.
 *
 * `retryable` distingue ce qui vaut la peine d'être rejoué (429, 5xx, réseau)
 * de ce qui ne le sera jamais (clé invalide, produit inconnu). Le cron de
 * rattrapage s'en sert pour ne pas marquer une commande en échec sur un
 * simple hoquet réseau — ce serait refuser des crédits déjà payés.
 */
export class MaketouError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'MaketouError';
  }
}

// ───────────────────────────────────────────────────────────────────────
// Réponses
// ───────────────────────────────────────────────────────────────────────

/**
 * Statuts de panier documentés. `passthrough()` sur les objets : Maketou
 * renvoie plus de champs que ceux-ci, et une réponse enrichie de leur côté
 * ne doit pas faire échouer un encaissement du nôtre.
 */
const cartStatusSchema = z.enum(['waiting_payment', 'completed', 'abandoned', 'payment_failed']);

const checkoutResponseSchema = z.object({
  cart: z.object({ id: z.string().min(1) }).passthrough(),
  redirectUrl: z.string().url(),
});

const cartResponseSchema = z
  .object({
    id: z.string().min(1),
    status: cartStatusSchema,
  })
  .passthrough();

/**
 * Aplatit les violations class-validator d'un 422 en une phrase lisible.
 *
 * `[{ property: "redirectURL", constraints: { isUrl: "redirectURL must be…" }}]`
 * devient `redirectURL : redirectURL must be a URL address`. Les valeurs
 * envoyées (`target`, `value`) sont volontairement écartées : elles portent
 * l'email et le nom de l'acheteur, et cette phrase finit dans les journaux.
 */
function describeViolations(raw: unknown[]): string | undefined {
  const parts = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return typeof entry === 'string' ? entry : null;
      const bag = entry as { property?: unknown; constraints?: unknown };
      const property = typeof bag.property === 'string' ? bag.property : null;
      const constraints =
        bag.constraints && typeof bag.constraints === 'object'
          ? Object.values(bag.constraints as Record<string, unknown>)
              .filter((v): v is string => typeof v === 'string')
              .join(', ')
          : null;
      if (property && constraints) return `${property} : ${constraints}`;
      return constraints ?? property;
    })
    .filter((p): p is string => Boolean(p));

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** `waiting_payment` → PENDING · `completed` → PAID · le reste → FAILED. */
function toChargeStatus(status: z.infer<typeof cartStatusSchema>): ChargeStatus {
  if (status === 'completed') return 'PAID';
  if (status === 'waiting_payment') return 'PENDING';
  return 'FAILED';
}

// ───────────────────────────────────────────────────────────────────────
// Identité de l'acheteur
// ───────────────────────────────────────────────────────────────────────

/**
 * Maketou exige `firstName` ET `lastName`, non vides.
 *
 * Nos comptes n'ont qu'un email et un `name` facultatif (rempli seulement par
 * une inscription Google). Sans ce découpage, tout achat depuis un compte
 * email/mot de passe échouerait en 422 — c'est-à-dire la majorité d'entre eux.
 */
export function splitName(name: string | null | undefined, email: string): [string, string] {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return [parts[0] as string, parts.slice(1).join(' ')];
  if (parts.length === 1) return [parts[0] as string, '-'];
  const local = email.split('@')[0]?.trim();
  return [local && local.length > 0 ? local : 'Client', '-'];
}

// ───────────────────────────────────────────────────────────────────────
// URL de retour
// ───────────────────────────────────────────────────────────────────────

/**
 * `redirectURL` acceptable par Maketou, ou `null`.
 *
 * Leur validateur applique `@IsUrl()` (class-validator), qui exige un domaine
 * porteur d'une extension. `http://localhost:3001` est donc refusé par un 422
 * — et le panier n'est pas créé DU TOUT : sans ce filtre, aucun achat n'est
 * possible en développement.
 *
 * Plutôt que de faire échouer l'achat, on omet le champ. Maketou affiche alors
 * sa propre page de fin et le cron de rattrapage crédite quand même : c'est
 * exactement ce pour quoi il existe. On perd le retour automatique, pas
 * l'argent.
 *
 * Pour retrouver ce retour en local : `APP_URL="http://lvh.me:3001"` — lvh.me
 * résout vers 127.0.0.1 et porte une extension, donc il passe. Il faut alors
 * naviguer sur lvh.me:3001 d'un bout à l'autre, les cookies de session étant
 * liés à l'hôte.
 */
export function maketouRedirectUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // Hôte sans point (localhost, une machine du réseau local…) ou adresse IP :
  // refusés par `@IsUrl()`, qui impose `require_tld`.
  if (!url.hostname.includes('.')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) return null;
  return url.toString();
}

// ───────────────────────────────────────────────────────────────────────
// Fabrique
// ───────────────────────────────────────────────────────────────────────

export type MaketouProviderHandle = PaymentProvider & {
  pollCharge(providerChargeId: string): Promise<ChargeStatus>;
};

export function createMaketouProvider(env: MaketouEnv): MaketouProviderHandle {
  const apiKey = env.MAKETOU_API_KEY?.trim();
  if (!apiKey) throw new Error('MAKETOU_API_KEY manquante');

  const baseUrl = (env.MAKETOU_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  const timeoutMs = Number(env.MAKETOU_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  const fixedProducts: Record<string, string | undefined> = {
    starter: env.MAKETOU_PRODUCT_STARTER?.trim() || undefined,
    createur: env.MAKETOU_PRODUCT_CREATEUR?.trim() || undefined,
    pro: env.MAKETOU_PRODUCT_PRO?.trim() || undefined,
  };
  const freePricingProduct = env.MAKETOU_PRODUCT_ID?.trim() || undefined;

  /**
   * Produit à référencer, et faut-il envoyer le montant ?
   *
   * Un produit dédié au pack l'emporte : son prix étant fixé chez Maketou,
   * envoyer `customerPrice` en plus n'aurait pas de sens et pourrait entrer en
   * conflit. C'est ce qui permet de fermer le trou du prix libre sans toucher
   * une ligne de code — trois variables d'environnement suffisent.
   */
  function resolveProduct(packId: string): { productDocumentId: string; sendPrice: boolean } {
    const fixed = fixedProducts[packId];
    if (fixed) return { productDocumentId: fixed, sendPrice: false };
    if (freePricingProduct) return { productDocumentId: freePricingProduct, sendPrice: true };
    throw new MaketouError(
      'MAKETOU_PRODUCT_UNCONFIGURED',
      `Aucun produit Maketou pour le pack « ${packId} » : renseignez MAKETOU_PRODUCT_ID ou MAKETOU_PRODUCT_${packId.toUpperCase()}.`,
      503,
      false,
    );
  }

  async function call(path: string, init: RequestInit): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Réseau ou délai dépassé : rejouable. Ne JAMAIS conclure à un échec de
      // paiement là-dessus — le panier peut très bien être payé.
      throw new MaketouError(
        'MAKETOU_UNREACHABLE',
        err instanceof Error ? err.message : 'Maketou injoignable',
        503,
        true,
      );
    }

    const text = await res.text();
    if (!res.ok) throw httpError(res.status, text);

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new MaketouError('MAKETOU_BAD_RESPONSE', 'Réponse Maketou illisible', 502, true);
    }
  }

  function httpError(status: number, body: string): MaketouError {
    // Leurs codes documentés ; le corps peut porter `code` et `message`.
    let code: string | undefined;
    let message: string | undefined;
    try {
      const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
      if (typeof parsed.code === 'string') code = parsed.code;
      if (typeof parsed.message === 'string') message = parsed.message;
      // Sur un 422, `message` est un TABLEAU class-validator, pas une chaîne :
      //   [{ property: "redirectURL", constraints: { isUrl: "…" } }]
      // Sans ce dépliage, l'erreur se résume à « Maketou a répondu 422 » et il
      // faut sortir curl pour apprendre quel champ pose problème.
      else if (Array.isArray(parsed.message)) message = describeViolations(parsed.message);
    } catch {
      /* corps non-JSON — on retombe sur les valeurs par défaut */
    }

    if (message) {
      logger.warn('maketou.request.rejected', { status, code: code ?? null, message });
    }

    const fallback =
      status === 401
        ? 'INVALID_API_KEY'
        : status === 400
          ? 'INVALID_PRODUCT'
          : status === 404
            ? 'CART_NOT_FOUND'
            : status === 422
              ? 'VALIDATION_ERROR'
              : status === 429
                ? 'RATE_LIMITED'
                : 'MAKETOU_ERROR';

    // 429 et 5xx repassent plus tard ; une clé ou un produit invalides, jamais.
    const retryable = status === 429 || status >= 500;
    return new MaketouError(
      code ?? fallback,
      message ?? `Maketou a répondu ${status}`,
      status,
      retryable,
    );
  }

  return {
    name: 'maketou',

    async charge(input: ChargeInput): Promise<ChargeResult> {
      const packId = String(input.metadata?.packId ?? '');
      const { productDocumentId, sendPrice } = resolveProduct(packId);
      const [firstName, lastName] = splitName(input.customer.name, input.customer.email ?? '');

      const redirectURL = maketouRedirectUrl(input.successUrl);
      if (!redirectURL) {
        logger.warn('maketou.redirect.omitted', {
          successUrl: input.successUrl,
          // Sans retour, l'acheteur reste sur la page de Maketou : ses crédits
          // arriveront par le cron `purchase-reconcile`, pas par le sondage du
          // navigateur. En local, déclenchez-le à la main.
          hint: 'APP_URL doit porter un domaine avec extension — essayez http://lvh.me:3001',
        });
      }

      const body: Record<string, unknown> = {
        productDocumentId,
        email: input.customer.email,
        firstName,
        lastName,
        ...(redirectURL ? { redirectURL } : {}),
        // `meta` nous est renvoyé tel quel à la lecture du panier. C'est un
        // confort de diagnostic, PAS une preuve : ce sont nos propres données
        // en écho, elles n'attestent rien de ce que l'acheteur a réellement
        // payé. Ne jamais s'en servir pour valider un montant.
        meta: { orderId: input.externalRef, packId },
        ...(input.customer.phone ? { phone: input.customer.phone } : {}),
        ...(sendPrice ? { customerPrice: input.amount } : {}),
      };

      const parsed = checkoutResponseSchema.safeParse(
        await call('/api/v1/stores/cart/checkout', { method: 'POST', body: JSON.stringify(body) }),
      );
      if (!parsed.success) {
        throw new MaketouError(
          'MAKETOU_BAD_RESPONSE',
          'Réponse de création de panier inattendue',
          502,
          true,
        );
      }

      logger.info('maketou.cart.created', {
        cartId: parsed.data.cart.id,
        orderId: input.externalRef,
        packId,
        priceLocked: !sendPrice,
      });

      return {
        providerChargeId: parsed.data.cart.id,
        paymentUrl: parsed.data.redirectUrl,
        status: 'PENDING',
      };
    },

    async pollCharge(providerChargeId: string): Promise<ChargeStatus> {
      const parsed = cartResponseSchema.safeParse(
        await call(`/api/v1/stores/cart/${encodeURIComponent(providerChargeId)}`, {
          method: 'GET',
        }),
      );
      if (!parsed.success) {
        // Un statut inconnu ne doit pas être pris pour un échec : Maketou
        // pourrait en ajouter un (« refunded », « disputed »…) et nous
        // annulerions alors des commandes payées.
        throw new MaketouError('MAKETOU_BAD_RESPONSE', 'Statut de panier inattendu', 502, true);
      }
      return toChargeStatus(parsed.data.status);
    },
  };
}

// ───────────────────────────────────────────────────────────────────────
// Singleton paresseux
// ───────────────────────────────────────────────────────────────────────

/** Levée quand `MAKETOU_API_KEY` manque — traduite en 503 par les routes. */
export class MaketouUnconfiguredError extends Error {
  readonly code = 'PAYMENT_PROVIDER_UNCONFIGURED';
  constructor() {
    super('Paiement non configuré (MAKETOU_API_KEY / MAKETOU_PRODUCT_ID manquants)');
    this.name = 'MaketouUnconfiguredError';
  }
}

let _provider: MaketouProviderHandle | null = null;

/**
 * Construit le fournisseur au premier appel et le met en cache.
 *
 * Paresseux comme `payments/provider-singleton.ts` : une construction au
 * chargement du module ferait planter la route entière à l'import quand la
 * configuration manque, au lieu du 503 lisible attendu.
 */
export function getMaketouProvider(): MaketouProviderHandle {
  if (_provider) return _provider;

  const apiKey = process.env.MAKETOU_API_KEY ?? '';
  const productId = process.env.MAKETOU_PRODUCT_ID ?? '';
  const starter = process.env.MAKETOU_PRODUCT_STARTER ?? '';
  const createur = process.env.MAKETOU_PRODUCT_CREATEUR ?? '';
  const pro = process.env.MAKETOU_PRODUCT_PRO ?? '';

  // Une clé sans aucun produit ne permet de créer aucun panier : autant le
  // dire tout de suite plutôt qu'au premier acheteur.
  if (!apiKey.trim() || !(productId.trim() || starter.trim() || createur.trim() || pro.trim())) {
    throw new MaketouUnconfiguredError();
  }

  _provider = createMaketouProvider({
    MAKETOU_API_KEY: apiKey,
    ...(process.env.MAKETOU_API_URL ? { MAKETOU_API_URL: process.env.MAKETOU_API_URL } : {}),
    ...(process.env.MAKETOU_TIMEOUT_MS
      ? { MAKETOU_TIMEOUT_MS: process.env.MAKETOU_TIMEOUT_MS }
      : {}),
    ...(productId ? { MAKETOU_PRODUCT_ID: productId } : {}),
    ...(starter ? { MAKETOU_PRODUCT_STARTER: starter } : {}),
    ...(createur ? { MAKETOU_PRODUCT_CREATEUR: createur } : {}),
    ...(pro ? { MAKETOU_PRODUCT_PRO: pro } : {}),
  });
  return _provider;
}

/** Réservé aux tests — vide le cache pour rejouer l'init avec un autre env. */
export function __resetMaketouProvider(): void {
  _provider = null;
}
