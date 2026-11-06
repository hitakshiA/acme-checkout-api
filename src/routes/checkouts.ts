// Checkout sessions. POST creates a session for the embed; GET reads one.
// Idempotency-Key is honored on create (v2.33.2).

import type { Ctx } from "../server.ts";
import { sendJson } from "../server.ts";
import { NotFoundError } from "../db.ts";

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
  if (method === "POST") return createCheckout(ctx);
  return getCheckout(ctx);
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
