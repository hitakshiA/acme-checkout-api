import { test } from "node:test";
import assert from "node:assert/strict";
import { problemsFor } from "../../scripts/lint-migrations.mjs";

test("flags NOT NULL without default (the 0010 incident)", () => {
  const sql = "alter table billing_events add column status text not null;";
  assert.equal(problemsFor(sql, "0010.sql").length, 1);
});

test("passes with a stable default", () => {
  const sql = "alter table billing_events add column status text not null default 'pending';";
  assert.equal(problemsFor(sql, "0011.sql").length, 0);
});

test("flags volatile defaults", () => {
  const sql = "alter table t add column at timestamptz not null default now();";
  assert.equal(problemsFor(sql, "00xx.sql").length, 1);
});
