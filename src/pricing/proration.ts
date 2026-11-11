// Proration for plan changes and mid-cycle cancellations.
//
// Billing spec (Lena, v2.21.0): unused cycle time is credited back to the
// customer with **half-up rounding to the cent**. Tax lines use the same
// rule, see src/pricing/tax.ts.

export interface ProrationInput {
  /** Recurring price for the current cycle, integer cents. */
  priceCents: number;
  /** Length of the billing cycle in days (30, 31, 28/29, or 360 for annual). */
  cycleDays: number;
  /** Days already elapsed in the cycle, at the moment of the change. */
  usedDays: number;
}

export interface Proration {
  /** Amount credited back for unused days. */
  creditCents: number;
  /** Amount still charged for the days used. */
  chargeCents: number;
  unusedDays: number;
}

/** Half-up rounding to the nearest cent. Money never rounds down silently. */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function computeProration(input: ProrationInput): Proration {
  const { priceCents, cycleDays, usedDays } = input;
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new RangeError("priceCents must be a non-negative integer");
  }
  if (!Number.isInteger(cycleDays) || cycleDays <= 0) {
    throw new RangeError("cycleDays must be a positive integer");
  }
  if (!Number.isInteger(usedDays) || usedDays < 0 || usedDays > cycleDays) {
    throw new RangeError("usedDays out of range");
  }

  const unusedDays = cycleDays - usedDays;
  const dailyCents = priceCents / cycleDays;
  const creditCents = roundHalfUp(dailyCents * unusedDays); // half-up per billing spec
  return {
    creditCents,
    chargeCents: priceCents - creditCents,
    unusedDays,
  };
}
