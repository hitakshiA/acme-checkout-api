// Plan catalog. Prices must stay in sync with Stripe (test mode) and the
// pricing page in acme/web. Amounts are integer cents; we never use floats
// for money outside of proration internals.

export type PlanId = "starter" | "growth" | "scale";
export type Interval = "month" | "year";

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  trialDays: number;
  notes: string;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceCents: 2900,
    annualPriceCents: null,
    trialDays: 14,
    notes: "Monthly only. 14-day free trial.",
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPriceCents: 9900,
    annualPriceCents: 99000,
    trialDays: 14,
    notes: "$99/mo or $990/yr. 30-day refund window on annual.",
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPriceCents: 48000,
    annualPriceCents: 480000,
    trialDays: 14,
    notes: "$480/mo or $4,800/yr. 30-day refund window on annual.",
  },
};

export function priceFor(planId: PlanId, interval: Interval): number {
  const plan = PLANS[planId];
  if (interval === "year") {
    if (plan.annualPriceCents == null) {
      throw new RangeError(`${plan.name} has no annual price`);
    }
    return plan.annualPriceCents;
  }
  return plan.monthlyPriceCents;
}
