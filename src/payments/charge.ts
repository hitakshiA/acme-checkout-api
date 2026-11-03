// Card charges for a completed checkout, through Stripe.
// One PaymentIntent per checkout: the checkout id is the idempotency key, so a
// resent request can never charge the card twice.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  timeout: 20_000,
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
export async function chargeCheckout(input: ChargeInput): Promise<ChargeResult> {
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
    { idempotencyKey: `checkout:${input.checkoutId}` },
  );
  return { paymentIntentId: intent.id, status: intent.status };
}
