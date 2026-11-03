import { test } from "node:test";
import assert from "node:assert/strict";
import { priceFor } from "../../src/pricing/plans.ts";

test("growth annual is 99000 cents", () => {
  assert.equal(priceFor("growth", "year"), 99000);
});

test("starter has no annual price", () => {
  assert.throws(() => priceFor("starter", "year"), RangeError);
});
