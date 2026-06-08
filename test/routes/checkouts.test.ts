// Checkout routes, exercised over a real socket with a stub Db (the pg
// seam). Deterministic on purpose -- the flaky stuff lives in test/webhooks.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../../src/server.ts";
import type { Db, QueryResult } from "../../src/db.ts";

interface Row extends Record<string, unknown> {
  id: string;
  store_id: string;
  idempotency_key: string | null;
}

function stubDb(): { db: Db; rows: Row[] } {
  const rows: Row[] = [];
  const db: Db = {
    async connect() {},
    async end() {},
    async query<T>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
      if (text.includes("insert into checkouts")) {
        const row: Row = {
          id: `chk_${rows.length + 1}`,
          store_id: String(params[0]),
          plan_id: String(params[1]),
          amount_cents: params[2],
          currency: String(params[3]),
          status: "open",
          idempotency_key: params[4] == null ? null : String(params[4]),
          created_at: new Date().toISOString(),
        };
        rows.push(row);
        return { rows: [row] as T[], rowCount: 1 };
      }
      if (text.includes("where store_id = $1 and idempotency_key")) {
        const found = rows.filter(
          (r) => r.store_id === params[0] && r.idempotency_key === params[1],
        );
        return { rows: found as T[], rowCount: found.length };
      }
      const found = rows.filter((r) => r.id === params[0]);
      return { rows: found as T[], rowCount: found.length };
    },
  };
  return { db, rows };
}

let server: Server;
let base: string;

test("checkout create + idempotency + read", async () => {
  const { db } = stubDb();
  server = createApp(db, { port: 0, webhookSecret: "whsec_test" });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address == null || typeof address === "string") throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;

  const create = await fetch(`${base}/v1/checkouts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      store_id: "store_1",
      plan_id: "growth",
      amount_cents: 9900,
      currency: "eur",
    }),
  });
  assert.equal(create.status, 201);
  const checkout = (await create.json()) as Row;
  assert.equal(checkout.status, "open");

  const read = await fetch(`${base}/v1/checkouts/${checkout.id}`);
  assert.equal(read.status, 200);

  const missing = await fetch(`${base}/v1/checkouts/chk_nope`);
  assert.equal(missing.status, 404);

  const bad = await fetch(`${base}/v1/checkouts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ store_id: "store_1" }),
  });
  assert.equal(bad.status, 422);
});

after(() => {
  server?.close();
});
