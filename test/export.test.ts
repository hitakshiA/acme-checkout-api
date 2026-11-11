import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/export.ts";

test("quotes cells containing commas", () => {
  const csv = toCsv([
    {
      customer_id: "c1",
      customer_email: "ops@moss.example",
      plan_id: "growth",
      plan_interval: "year",
      status: "active",
      mrr_cents: 8250,
      started_at: "2026-04-02",
      churn_reason: null,
      last_invoice_date: "2026-11-01",
    },
  ]);
  assert.match(csv, /8250/);
  assert.equal(csv.trim().split("\n").length, 2);
});
