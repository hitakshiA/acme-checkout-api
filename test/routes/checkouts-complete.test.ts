// ENG-488: a checkout must produce one charge, however often (or however
// concurrently) POST /v1/checkouts/:id/complete is called.
//
// Runs with no dependencies installed, like CI: the Stripe client is injected,
// so nothing here imports the stripe package or opens a socket to Stripe.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { createApp, type Ctx } from "../../src/server.ts";
import type { Db, QueryResult } from "../../src/db.ts";
import {
  chargeCheckout,
  chargeIdempotencyKey,
  type ChargeClient,
  type ChargeInput,
} from "../../src/payments/charge.ts";
import { completeCheckout } from "../../src/routes/checkouts.ts";

interface CheckoutRow extends Record<string, unknown> {
  id: string;
  store_id: string;
  plan_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  idempotency_key: string | null;
  created_at: string;
}

function checkoutRow(overrides: Partial<CheckoutRow> = {}): CheckoutRow {
  return {
    id: "chk_1",
    store_id: "store_1",
    plan_id: "growth",
    amount_cents: 9900,
    currency: "eur",
    status: "open",
    idempotency_key: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// In-memory stand-in for the pg seam, answering only the statements the
// complete path uses. Rows are copied in and out, like a real round trip.
function stubDb(...seed: CheckoutRow[]): { db: Db; rows: CheckoutRow[] } {
  const rows = seed.map((r) => ({ ...r }));
  const db: Db = {
    async connect() {},
    async end() {},
    async query<T>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
      const id = params[0];
      const transition = (from: string, to: string): QueryResult<T> => {
        const hit = rows.filter((r) => r.id === id && r.status === from);
        for (const r of hit) r.status = to;
        return { rows: hit.map((r) => ({ ...r })) as T[], rowCount: hit.length };
      };
      if (text.includes("set status = 'charging'")) return transition("open", "charging");
      if (text.includes("set status = 'complete'")) return transition("charging", "complete");
      if (text.includes("set status = 'open'")) return transition("charging", "open");
      const found = rows.filter((r) => r.id === id);
      return { rows: found.map((r) => ({ ...r })) as T[], rowCount: found.length };
    },
  };
  return { db, rows };
}

interface Captured {
  status: number;
  payload: Record<string, unknown> | undefined;
}

function fakeCtx(
  db: Db,
  params: Record<string, string>,
  body: unknown = { customer_id: "cus_1", payment_method_id: "pm_1" },
): { ctx: Ctx; out: Captured } {
  const out: Captured = { status: 0, payload: undefined };
  const res = {
    headersSent: false,
    getHeader: () => "",
    setHeader: () => {},
    writeHead: (status: number) => {
      out.status = status;
      return res;
    },
    end: (payload?: string) => {
      out.payload = payload === undefined ? undefined : JSON.parse(payload);
      return res;
    },
  } as unknown as ServerResponse;
  const ctx: Ctx = {
    req: {} as Ctx["req"],
    res,
    db,
    config: { port: 0, webhookSecret: "whsec_test" },
    params,
    body,
  };
  return { ctx, out };
}

// Stripe's side of the contract: one PaymentIntent per idempotency key, a
// replay for the same params, an idempotency_error for different ones.
class FakeStripe implements ChargeClient {
  calls: { params: Record<string, unknown>; key: string }[] = [];
  intents = new Map<string, { params: string; intent: { id: string; status: string } }>();
  failNextWith: unknown = undefined;
  beforeCreate: (() => Promise<void>) | undefined = undefined;

  paymentIntents = {
    create: (params: Record<string, unknown>, options: { idempotencyKey: string }) =>
      this.create(params, options),
  };

  async create(params: Record<string, unknown>, options: { idempotencyKey: string }) {
    this.calls.push({ params, key: options.idempotencyKey });
    const saved = this.intents.get(options.idempotencyKey);
    if (saved) {
      if (saved.params !== JSON.stringify(params)) {
        throw Object.assign(new Error("keys can only be used with the same parameters"), {
          type: "StripeIdempotencyError",
        });
      }
      return saved.intent;
    }
    await this.beforeCreate?.();
    const intent = { id: `pi_${this.intents.size + 1}`, status: "succeeded" };
    this.intents.set(options.idempotencyKey, { params: JSON.stringify(params), intent });
    if (this.failNextWith !== undefined) {
      const failure = this.failNextWith as { payment_intent?: { status?: string } };
      if (failure?.payment_intent?.status) intent.status = failure.payment_intent.status;
      this.failNextWith = undefined;
      throw failure;
    }
    return intent;
  }

  charge = (input: ChargeInput) => chargeCheckout(input, this);
}

test("every charge attempt carries a per-checkout, per-payment-method idempotency key", async () => {
  const fake = new FakeStripe();
  const input: ChargeInput = {
    checkoutId: "chk_1",
    customerId: "cus_1",
    paymentMethodId: "pm_1",
    amountCents: 9900,
    currency: "eur",
    description: "Acme Checkout growth",
  };

  const first = await chargeCheckout(input, fake);
  const replay = await chargeCheckout(input, fake);

  assert.equal(fake.calls[0].key, "checkout:chk_1:pm_1");
  assert.equal(fake.calls[0].key, chargeIdempotencyKey("chk_1", "pm_1"));
  assert.equal(replay.paymentIntentId, first.paymentIntentId);
  assert.equal(fake.intents.size, 1, "a replayed attempt must not create a second PaymentIntent");
});

test("two concurrent completes charge once: one wins the claim, the other gets 409", async () => {
  const { db, rows } = stubDb(checkoutRow());
  const fake = new FakeStripe();
  let release!: () => void;
  fake.beforeCreate = () => new Promise<void>((resolve) => (release = resolve));

  const first = fakeCtx(db, { id: "chk_1" });
  const second = fakeCtx(db, { id: "chk_1" }, { customer_id: "cus_1", payment_method_id: "pm_2" });

  const inFlight = completeCheckout(first.ctx, fake.charge);
  await completeCheckout(second.ctx, fake.charge);

  assert.equal(second.out.status, 409);
  assert.equal(second.out.payload?.error, "checkout_not_chargeable");
  assert.equal(fake.calls.length, 1, "the losing request must not reach Stripe");
  assert.equal(rows[0].status, "charging");

  release();
  await inFlight;

  assert.equal(first.out.status, 200);
  assert.equal(first.out.payload?.payment_intent, "pi_1");
  assert.equal(rows[0].status, "complete");
  assert.equal(fake.intents.size, 1);
});

test("a lost response stays claimed, so a resubmit with a new card cannot charge again", async () => {
  const { db, rows } = stubDb(checkoutRow());
  const fake = new FakeStripe();
  fake.failNextWith = Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });

  const first = fakeCtx(db, { id: "chk_1" });
  await completeCheckout(first.ctx, fake.charge);

  assert.equal(first.out.status, 409);
  assert.equal(first.out.payload?.error, "checkout_charge_uncertain");
  assert.equal(rows[0].status, "charging", "an ambiguous outcome must not reopen the checkout");
  assert.equal(fake.intents.size, 1);

  const resubmit = fakeCtx(db, { id: "chk_1" }, { customer_id: "cus_1", payment_method_id: "pm_2" });
  await completeCheckout(resubmit.ctx, fake.charge);

  assert.equal(resubmit.out.status, 409);
  assert.equal(resubmit.out.payload?.error, "checkout_not_chargeable");
  assert.equal(fake.calls.length, 1, "the resubmit must not reach Stripe");
  assert.equal(fake.intents.size, 1, "still exactly one PaymentIntent");
});

test("an idempotency_error is not treated as a free retry", async () => {
  const { db, rows } = stubDb(checkoutRow());
  const fake = new FakeStripe();
  // An earlier request with this key exists and used different params.
  fake.intents.set(chargeIdempotencyKey("chk_1", "pm_1"), {
    params: JSON.stringify({ amount: 9900, payment_method: "pm_1", customer: "cus_other" }),
    intent: { id: "pi_earlier", status: "succeeded" },
  });

  const attempt = fakeCtx(db, { id: "chk_1" });
  await completeCheckout(attempt.ctx, fake.charge);

  assert.equal(attempt.out.status, 409);
  assert.equal(attempt.out.payload?.error, "checkout_charge_uncertain");
  assert.equal(rows[0].status, "charging");
  assert.equal(fake.intents.size, 1);
});

test("a declined card releases the claim so the buyer can retry with another card", async () => {
  const { db, rows } = stubDb(checkoutRow());
  const fake = new FakeStripe();
  fake.failNextWith = Object.assign(new Error("Your card was declined."), {
    type: "StripeCardError",
    payment_intent: { status: "requires_payment_method" },
  });

  const declined = fakeCtx(db, { id: "chk_1" });
  await assert.rejects(completeCheckout(declined.ctx, fake.charge));
  assert.equal(rows[0].status, "open", "a decline leaves no charge behind");

  const retry = fakeCtx(db, { id: "chk_1" }, { customer_id: "cus_1", payment_method_id: "pm_2" });
  await completeCheckout(retry.ctx, fake.charge);

  assert.equal(retry.out.status, 200);
  assert.equal(retry.out.payload?.payment_intent, "pi_2");
  assert.equal(rows[0].status, "complete");
  assert.equal(fake.calls.length, 2);
  assert.equal(fake.intents.size, 2);
  assert.equal(
    fake.intents.get(chargeIdempotencyKey("chk_1", "pm_1"))?.intent.status,
    "requires_payment_method",
  );
  assert.equal(fake.intents.get(chargeIdempotencyKey("chk_1", "pm_2"))?.intent.status, "succeeded");
});

test("the route reaches the claim: completing an already complete checkout returns 200 and charges nothing", async () => {
  const { db } = stubDb(checkoutRow({ status: "complete" }));
  const server = createApp(db, { port: 0, webhookSecret: "whsec_test" });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no port");
  try {
    const res = await fetch(`http://127.0.0.1:${address.port}/v1/checkouts/chk_1/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_id: "cus_1", payment_method_id: "pm_1" }),
    });
    assert.equal(res.status, 200);
    const payload = (await res.json()) as { status: string; payment_intent?: string };
    assert.equal(payload.status, "complete");
    assert.equal(payload.payment_intent, undefined, "no charge on a completed checkout");
  } finally {
    server.close();
  }
});
