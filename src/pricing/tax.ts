// Tax lines (Stripe tax, beta since v2.24.0). Rounding rule is half-up to
// the cent -- this is the rule the v2.21.1 fix established for tax lines.
// Annual invoices are taxed per period, not per invoice (v2.24.1).

import { roundHalfUp } from "./proration.ts";

export interface TaxLineInput {
  netCents: number;
  /** Basis points, e.g. 2300 = 23% (PT standard rate). */
  rateBps: number;
}

export interface TaxLine {
  netCents: number;
  taxCents: number;
  grossCents: number;
  rateBps: number;
}

export function computeTaxLine(input: TaxLineInput): TaxLine {
  const { netCents, rateBps } = input;
  if (!Number.isInteger(netCents) || netCents < 0) {
    throw new RangeError("netCents must be a non-negative integer");
  }
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new RangeError("rateBps must be a non-negative integer");
  }
  const taxCents = roundHalfUp((netCents * rateBps) / 10_000);
  return {
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
    rateBps,
  };
}
