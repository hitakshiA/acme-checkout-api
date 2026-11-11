// Card charges for a completed checkout, through Stripe.
// The route claims the checkout (open -> charging) before calling here, so only
// one request can charge it, and every attempt carries one explicit Stripe
// idempotency key.
//
// The explicit key matters even with maxNetworkRetries: 0: stripe-node 22.4.0
// retries one closed connection (ECONNRESET/EPIPE) before it looks at
// maxNetworkRetries, and it only adds its own idempotency key when retries are
// on. Without ours, that forced retry creates a second PaymentIntent (ENG-488).

export interface ChargeInput {
  checkoutId: string;
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency: string;
  description: string;
}

export interface ChargeResult {
  paymentIntentId: string;
  status: string;
}

interface PaymentIntentParams {
  amount: number;
  currency: string;
  customer: string;
  payment_method: string;
  confirm: true;
  automatic_payment_methods: { enabled: true; allow_redirects: "never" };
  description: string;
  metadata: { checkout_id: string; source: string };
}

interface PaymentIntent {
  id: string;
  status: string;
}

export interface ChargeClient {
  paymentIntents: {
    create(
      params: PaymentIntentParams,
      options: { idempotencyKey: string },
    ): Promise<PaymentIntent>;
  };
}

type StripeConstructor = new (
  key: string,
  config: { timeout: number; maxNetworkRetries: number },
) => ChargeClient;

let stripeClient: Promise<ChargeClient> | undefined;

// Loaded lazily so importing the server (and running the test suite) does not
// need the stripe package: CI runs the tests with nothing installed. Tests
// inject a fake client instead of reaching Stripe.
function defaultStripeClient(): Promise<ChargeClient> {
  stripeClient ??= import("stripe").then((mod) => {
    const Stripe = mod.default as unknown as StripeConstructor;
    return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      timeout: 20_000,
      maxNetworkRetries: 0,
    });
  });
  return stripeClient;
}

// One key per checkout and payment method: a retry of the same attempt replays
// the same PaymentIntent, while a new card after a decline is a new attempt
// (a checkout-only key would replay the decline for 24 hours).
export function chargeIdempotencyKey(checkoutId: string, paymentMethodId: string): string {
  return `checkout:${checkoutId}:${paymentMethodId}`;
}

const DEFINITIVE_CHARGE_ERRORS = new Set([
  "StripeCardError",
  "StripeInvalidRequestError",
  "StripeAuthenticationError",
  "StripePermissionError",
  "StripeRateLimitError",
]);

// True only when Stripe has definitely not created a live charge, so the
// checkout can safely be released for another attempt. Connection, API,
// idempotency and unknown errors may hide a PaymentIntent that exists: those
// are not definitive.
export function isDefinitiveChargeFailure(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const candidate = err as { type?: unknown; payment_intent?: { status?: unknown } };
  if (typeof candidate.type !== "string") return false;
  if (!DEFINITIVE_CHARGE_ERRORS.has(candidate.type)) return false;

  // A decline leaves requires_payment_method, a canceled intent is dead: no
  // charge exists. Anything else (succeeded, processing, requires_action,
  // requires_capture) can still become a charge, so keep the claim.
  const status = candidate.payment_intent?.status;
  if (status === undefined) return true;
  return status === "requires_payment_method" || status === "canceled";
}

// Called by completeCheckout once the buyer submits the embed form.
export async function chargeCheckout(
  input: ChargeInput,
  client?: ChargeClient,
): Promise<ChargeResult> {
  const stripe = client ?? (await defaultStripeClient());
  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency,
      customer: input.customerId,
      payment_method: input.paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: input.description,
      metadata: { checkout_id: input.checkoutId, source: "checkout-api" },
    },
    { idempotencyKey: chargeIdempotencyKey(input.checkoutId, input.paymentMethodId) },
  );
  return { paymentIntentId: intent.id, status: intent.status };
}
