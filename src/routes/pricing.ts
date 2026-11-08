// Pricing quotes for the web pricing page and the sales team.

import type { Ctx } from "../server.ts";
import { sendJson } from "../server.ts";
import { computeProration } from "../pricing/proration.ts";
import { computeTaxLine } from "../pricing/tax.ts";
import { priceFor, type Interval, type PlanId } from "../pricing/plans.ts";

export async function handlePricing(ctx: Ctx): Promise<void> {
  const body = (ctx.body ?? null) as {
    plan_id?: string;
    plan_interval?: string;
    used_days?: number;
    from_plan_id?: string;
    tax_rate_bps?: number;
  } | null;
  if (!body?.plan_id) {
    sendJson(ctx, 422, { error: "validation", message: "plan_id is required" });
    return;
  }
  const interval = (body.plan_interval ?? "month") as Interval;
  const priceCents = priceFor(body.plan_id as PlanId, interval);
  const from = body.from_plan_id ? priceFor(body.from_plan_id as PlanId, interval) : 0;
  const proration = computeProration({
    priceCents: priceCents - from,
    cycleDays: interval === "year" ? 360 : 30,
    usedDays: body.used_days ?? 0,
  });
  const tax = computeTaxLine({
    netCents: proration.chargeCents,
    rateBps: body.tax_rate_bps ?? 0,
  });
  sendJson(ctx, 200, {
    plan_id: body.plan_id,
    plan_interval: interval,
    price_cents: priceCents,
    proration,
    tax,
  });
}
