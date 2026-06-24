// Subscriptions: create, read, change plan (with proration quote), cancel.

import type { Ctx } from "../server.ts";
import { sendJson } from "../server.ts";
import { NotFoundError } from "../db.ts";
import { computeProration } from "../pricing/proration.ts";
import { priceFor, type Interval, type PlanId } from "../pricing/plans.ts";

interface SubscriptionRow {
  id: string;
  customer_id: string;
  plan_id: string;
  plan_interval: string;
  status: string;
  cycle_day: number;
  created_at: string;
}

export async function handleSubscriptions(ctx: Ctx): Promise<void> {
  const method = ctx.req.method ?? "GET";
  const hasId = Boolean(ctx.params.id);
  if (method === "GET" && hasId) return getSubscription(ctx);
  if (method === "POST" && !hasId) return createSubscription(ctx);
  if (method === "POST" && ctx.req.url?.endsWith("/change-plan")) return changePlan(ctx);
  if (method === "POST" && ctx.req.url?.endsWith("/cancel")) return cancelSubscription(ctx);
  sendJson(ctx, 405, { error: "method_not_allowed" });
}

async function createSubscription(ctx: Ctx): Promise<void> {
  const body = (ctx.body ?? null) as {
    customer_id?: string;
    plan_id?: string;
    plan_interval?: string;
  } | null;
  if (!body?.customer_id || !body.plan_id) {
    sendJson(ctx, 422, { error: "validation", message: "customer_id and plan_id are required" });
    return;
  }
  const interval = (body.plan_interval ?? "month") as Interval;
  const priceCents = priceFor(body.plan_id as PlanId, interval); // throws RangeError -> 500, validated below
  const inserted = await ctx.db.query<SubscriptionRow>(
    `insert into subscriptions (customer_id, plan_id, plan_interval, status, cycle_day)
     values ($1, $2, $3, 'trialing', 1)
     returning *`,
    [body.customer_id, body.plan_id, interval],
  );
  sendJson(ctx, 201, { ...inserted.rows[0], price_cents: priceCents });
}

async function getSubscription(ctx: Ctx): Promise<void> {
  const id = ctx.params.id!;
  const found = await ctx.db.query<SubscriptionRow>(
    "select * from subscriptions where id = $1 limit 1",
    [id],
  );
  if (found.rows.length === 0) throw new NotFoundError("subscription", id);
  sendJson(ctx, 200, found.rows[0]);
}

async function changePlan(ctx: Ctx): Promise<void> {
  const id = ctx.params.id!;
  const body = (ctx.body ?? null) as {
    plan_id?: string;
    plan_interval?: string;
    used_days?: number;
  } | null;
  if (!body?.plan_id || !Number.isInteger(body.used_days)) {
    sendJson(ctx, 422, {
      error: "validation",
      message: "plan_id and integer used_days are required",
    });
    return;
  }
  const found = await ctx.db.query<SubscriptionRow>(
    "select * from subscriptions where id = $1 limit 1",
    [id],
  );
  if (found.rows.length === 0) throw new NotFoundError("subscription", id);
  const sub = found.rows[0]!;

  const interval = (body.plan_interval ?? sub.plan_interval) as Interval;
  const cycleDays = interval === "year" ? 360 : 30;
  const oldPrice = priceFor(sub.plan_id as PlanId, interval);
  const newPrice = priceFor(body.plan_id as PlanId, interval);

  // Downgrades credit unused time on the old plan; upgrades charge the
  // difference for the days used on the new plan.
  const proration =
    newPrice >= oldPrice
      ? computeProration({ priceCents: newPrice - oldPrice, cycleDays, usedDays: body.used_days! })
      : computeProration({ priceCents: oldPrice - newPrice, cycleDays, usedDays: body.used_days! });

  await ctx.db.query(
    "update subscriptions set plan_id = $2, plan_interval = $3 where id = $1",
    [id, body.plan_id, interval],
  );
  sendJson(ctx, 200, {
    subscription_id: id,
    plan_id: body.plan_id,
    plan_interval: interval,
    proration: {
      ...proration,
      direction: newPrice >= oldPrice ? "upgrade_charge" : "downgrade_credit",
    },
  });
}

async function cancelSubscription(ctx: Ctx): Promise<void> {
  const id = ctx.params.id!;
  const found = await ctx.db.query<SubscriptionRow>(
    "select * from subscriptions where id = $1 limit 1",
    [id],
  );
  if (found.rows.length === 0) throw new NotFoundError("subscription", id);
  await ctx.db.query("update subscriptions set status = 'canceled' where id = $1", [id]);
  sendJson(ctx, 200, { subscription_id: id, status: "canceled" });
}
