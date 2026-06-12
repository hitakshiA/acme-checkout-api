// Proration must credit unused cycle time with half-up rounding to the
// cent (billing spec, Lena, v2.21.0). This is the test that has been red
// on main -- proration rounds down instead. One-line fix in
// src/pricing/proration.ts, nobody has shipped it yet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProration } from "../../src/pricing/proration.ts";

test("credits unused days with half-up rounding", () => {
  // Starter is $29/mo (2900c). Customer cancels after 29 of 30 days:
  // 1 unused day = 2900/30 = 96.666c -> half-up -> 97c credit.
  const p = computeProration({ priceCents: 2900, cycleDays: 30, usedDays: 29 });
  assert.equal(p.creditCents, 97);
  assert.equal(p.chargeCents, 2803);
});

test("rounds an exact half cent up", () => {
  // Usage add-on: 2900c spread over an 8-day window, 7 days used.
  // 1 unused day = 362.5c -> half-up -> 363c, never 362c.
  const p = computeProration({ priceCents: 2900, cycleDays: 8, usedDays: 7 });
  assert.equal(p.creditCents, 363);
  assert.equal(p.chargeCents, 2537);
});

test("exact divisions are unchanged", () => {
  // Growth is $99/mo (9900c); 15 of 30 days -> 4950c either way.
  const p = computeProration({ priceCents: 9900, cycleDays: 30, usedDays: 15 });
  assert.equal(p.creditCents, 4950);
  assert.equal(p.chargeCents, 4950);
});

test("rejects nonsense inputs", () => {
  assert.throws(() => computeProration({ priceCents: 100, cycleDays: 0, usedDays: 0 }), RangeError);
  assert.throws(() => computeProration({ priceCents: 100, cycleDays: 30, usedDays: 31 }), RangeError);
});
