/**
 * Provider-agnostic payments interface.
 *
 * Each provider (Bictorys, Stripe, Paddle…) implements `PaymentProvider`.
 * The orders/withdrawals routes consume the interface — never the concrete
 * adapter — so swapping providers is one wiring change in `index.ts`.
 *
 * Amounts are integer "smallest unit" of `currency`. For XOF (FCFA) that's
 * 1 = 1 FCFA (no decimals). For USD/EUR adapt to cents at the call site.
 */

import type { WebhookProvider } from '../webhook/handler';

// ───────────────────────────────────────────────────────────────────────
// Charge (customer payment)
// ───────────────────────────────────────────────────────────────────────

export interface ChargeCustomer {
  email?: string;
  phone?: string;
  name?: string;
}

export interface ChargeInput {
  /** Smallest currency unit (FCFA: 1 = 1 FCFA, USD: 1 = 1 cent). */
  amount: number;
  /** ISO 4217 currency code (e.g. "XOF", "USD"). */
  currency: string;
  customer: ChargeCustomer;
  /** App-specific bag stored as Order.metadata. */
  metadata?: Record<string, unknown>;
  successUrl: string;
  failureUrl: string;
  /**
   * Your order id — used as the provider merchant_reference and as the
   * idempotency key for retries. MUST be unique per logical charge.
   */
  externalRef: string;
}

export type ChargeStatus = 'PENDING' | 'PAID' | 'FAILED';

export interface ChargeResult {
  /** Provider-side charge id, stored on Order.providerChargeId. */
  providerChargeId: string;
  /** Hosted checkout / redirect URL the customer should visit. */
  paymentUrl: string;
  /** Initial status from the provider — usually PENDING for hosted flows. */
  status: ChargeStatus;
}

// ───────────────────────────────────────────────────────────────────────
// Payout (seller withdrawal)
// ───────────────────────────────────────────────────────────────────────

export interface PayoutDestination {
  /** Provider-specific method code, e.g. "WAVE", "ORANGE_MONEY", "FREE_MONEY". */
  method: string;
  /** E.164 phone (e.g. "+221771234567"). */
  phone: string;
  accountName?: string;
}

export interface PayoutInput {
  amount: number;
  currency: string;
  destination: PayoutDestination;
  /** Your withdrawal id — idempotency key. */
  externalRef: string;
}

export type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface PayoutResult {
  providerPayoutId: string;
  status: PayoutStatus;
  failureReason?: string;
}

// ───────────────────────────────────────────────────────────────────────
// Refund
// ───────────────────────────────────────────────────────────────────────

export interface RefundInput {
  providerChargeId: string;
  /** Defaults to full refund when omitted. */
  amount?: number;
}

export type RefundStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface RefundResult {
  providerRefundId: string;
  status: RefundStatus;
}

// ───────────────────────────────────────────────────────────────────────
// PaymentProvider — capability-typed
// ───────────────────────────────────────────────────────────────────────

export interface PaymentProvider {
  /** Short identifier (used for logging + DB Order.provider). */
  name: string;

  charge(input: ChargeInput): Promise<ChargeResult>;

  /**
   * Optional — read a charge's current status straight from the provider.
   *
   * Only providers WITHOUT webhooks need this. Bictorys pushes its outcome to
   * `/api/webhooks/bictorys`, so it doesn't implement it. Maketou has no
   * webhook of any kind — polling this is the only way to learn that a payment
   * succeeded, which is why it lives on the interface rather than on the one
   * adapter: the next Togolese provider will very likely be the same.
   *
   * Callers must treat the answer as authoritative and grant entitlements
   * exactly once — see `lib/server/purchases/service.ts`.
   */
  pollCharge?(providerChargeId: string): Promise<ChargeStatus>;

  /** Optional — providers without payouts simply don't implement it. */
  payout?(input: PayoutInput): Promise<PayoutResult>;

  /** Optional — providers without refunds simply don't implement it. */
  refund?(input: RefundInput): Promise<RefundResult>;
}

/**
 * A `PaymentProvider` that also implements webhook delivery — that's the
 * shape orders/webhooks routes wire together. The webhook payload type is
 * intentionally erased to `unknown` here; concrete providers expose a
 * stronger type via their factory return.
 */
export type PaymentProviderWithWebhook = PaymentProvider & {
  webhookProvider: WebhookProvider<unknown>;
};
