// Card charges for a completed checkout, through Stripe.
// The charge worker retries a failed charge itself (with backoff and alerting),
// so the SDK's own network retries are off: one call here is one attempt.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  timeout: 20_000,
  maxNetworkRetries: 0,
});

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

// Called by completeCheckout once the buyer submits the embed form.
// No idempotency key: with SDK retries off, a request is never sent twice.
export async function chargeCheckout(input: ChargeInput): Promise<ChargeResult> {
  const intent = await stripe.paymentIntents.create({
    amount: input.amountCents,
    currency: input.currency,
    customer: input.customerId,
    payment_method: input.paymentMethodId,
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    description: input.description,
    metadata: { checkout_id: input.checkoutId, source: "checkout-api" },
  });
  return { paymentIntentId: intent.id, status: intent.status };
}
