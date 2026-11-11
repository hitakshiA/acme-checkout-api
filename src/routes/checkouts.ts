// Checkout sessions. POST creates a session for the embed; GET reads one.
// Idempotency-Key is honored on create (v2.33.2).

import type { Ctx } from "../server.ts";
import { sendJson } from "../server.ts";
import { NotFoundError } from "../db.ts";
import {
  chargeCheckout,
  isDefinitiveChargeFailure,
  type ChargeInput,
  type ChargeResult,
} from "../payments/charge.ts";

type ChargeFn = (input: ChargeInput) => Promise<ChargeResult>;

interface CheckoutRow {
  id: string;
  store_id: string;
  plan_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  idempotency_key: string | null;
  created_at: string;
}

export async function handleCheckouts(ctx: Ctx): Promise<void> {
  const method = ctx.req.method ?? "GET";
  if (method === "POST" && ctx.req.url?.endsWith("/complete")) return completeCheckout(ctx);
  if (method === "POST") return createCheckout(ctx);
  return getCheckout(ctx);
}

// POST /v1/checkouts/:id/complete: the buyer submitted the form; charge the card once.
//
// open -> charging is the single-winner claim: only the request that changes the
// row calls Stripe. charging is not released after an ambiguous error (a
// connection drop, an API error, an idempotency_error) because the first request
// may already have created a successful PaymentIntent; the checkout has to be
// reconciled against Stripe before anyone retries it.
export async function completeCheckout(
  ctx: Ctx,
  charge: ChargeFn = chargeCheckout,
): Promise<void> {
  const id = ctx.params.id!;
  const body = (ctx.body ?? {}) as { customer_id?: string; payment_method_id?: string };

  const claimed = await ctx.db.query<CheckoutRow>(
    `update checkouts
        set status = 'charging'
      where id = $1 and status = 'open'
      returning *`,
    [id],
  );

  if (claimed.rows.length === 0) {
    const found = await ctx.db.query<CheckoutRow>(
      "select * from checkouts where id = $1 limit 1",
      [id],
    );
    if (found.rows.length === 0) throw new NotFoundError("checkout", id);
    const checkout = found.rows[0];
    if (checkout.status === "complete") {
      sendJson(ctx, 200, checkout);
      return;
    }
    sendJson(ctx, 409, {
      error: "checkout_not_chargeable",
      status: checkout.status,
      message: "this checkout already has a charge in progress or needs reconciliation",
    });
    return;
  }

  const checkout = claimed.rows[0];
  let result: ChargeResult;
  try {
    result = await charge({
      checkoutId: checkout.id,
      customerId: String(body.customer_id ?? ""),
      paymentMethodId: String(body.payment_method_id ?? ""),
      amountCents: checkout.amount_cents,
      currency: checkout.currency,
      description: `Acme Checkout ${checkout.plan_id}`,
    });
  } catch (err) {
    if (isDefinitiveChargeFailure(err)) {
      // Stripe said no live charge exists (decline, bad request, auth, rate
      // limit): release the claim so a corrected attempt can run.
      await ctx.db.query(
        "update checkouts set status = 'open' where id = $1 and status = 'charging'",
        [id],
      );
      throw err;
    }
    // The PaymentIntent may exist. Stay claimed and send the caller to
    // reconciliation; a new idempotency key here would charge again.
    sendJson(ctx, 409, {
      error: "checkout_charge_uncertain",
      status: "charging",
      message: "a previous charge attempt may have succeeded; reconcile before retrying",
    });
    return;
  }

  const done = await ctx.db.query<CheckoutRow>(
    `update checkouts
        set status = 'complete'
      where id = $1 and status = 'charging'
      returning *`,
    [id],
  );
  if (done.rows.length === 0) {
    // The charge landed but the row is no longer ours: do not reopen it.
    throw new Error(`checkout ${id} was not charging when its charge completed`);
  }
  sendJson(ctx, 200, { ...done.rows[0], payment_intent: result.paymentIntentId });
}

async function createCheckout(ctx: Ctx): Promise<void> {
  const body = (ctx.body ?? null) as {
    store_id?: string;
    plan_id?: string;
    amount_cents?: number;
    currency?: string;
    success_url?: string;
  } | null;
  if (!body || typeof body !== "object") {
    sendJson(ctx, 400, { error: "invalid_json" });
    return;
  }
  const { store_id, plan_id, amount_cents, currency } = body;
  if (!store_id || !plan_id || !Number.isInteger(amount_cents)) {
    sendJson(ctx, 422, {
      error: "validation",
      message: "store_id, plan_id and integer amount_cents are required",
    });
    return;
  }

  const idempotencyKey =
    (ctx.req.headers["idempotency-key"] as string | undefined) ?? null;

  // v2.33.2: replaying a create with the same Idempotency-Key returns the
  // original session instead of a second charge attempt.
  if (idempotencyKey) {
    const existing = await ctx.db.query<CheckoutRow>(
      "select * from checkouts where store_id = $1 and idempotency_key = $2 limit 1",
      [store_id, idempotencyKey],
    );
    if (existing.rows.length > 0) {
      sendJson(ctx, 200, existing.rows[0]);
      return;
    }
  }

  const inserted = await ctx.db.query<CheckoutRow>(
    `insert into checkouts (store_id, plan_id, amount_cents, currency, status, idempotency_key)
     values ($1, $2, $3, $4, 'open', $5)
     returning *`,
    [store_id, plan_id, amount_cents, currency ?? "eur", idempotencyKey],
  );
  sendJson(ctx, 201, inserted.rows[0]);
}

async function getCheckout(ctx: Ctx): Promise<void> {
  const id = ctx.params.id!;
  const found = await ctx.db.query<CheckoutRow>(
    "select * from checkouts where id = $1 limit 1",
    [id],
  );
  if (found.rows.length === 0) throw new NotFoundError("checkout", id);
  sendJson(ctx, 200, found.rows[0]);
}
