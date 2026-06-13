import { test } from "node:test";
import assert from "node:assert/strict";
import { computeProration } from "../../src/pricing/proration.ts";

test("362.5 credits as 363", () => {
  const p = computeProration({ priceCents: 2900, cycleDays: 8, usedDays: 7 });
  assert.equal(p.creditCents, 363);
});
