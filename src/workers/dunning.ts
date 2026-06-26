// Dunning: retry failed subscription charges on a fixed schedule.
// v2.22.1: respect 429s from the payment processor.

import type { Db } from "../db.ts";
import { sleep } from "../webhooks/retry.ts";

export interface ChargeAttemptResult {
  status: "succeeded" | "failed" | "rate_limited";
  retryAfterMs?: number;
}

export type ChargeFn = (invoiceId: string) => Promise<ChargeAttemptResult>;

const RETRY_OFFSETS_DAYS = [1, 3, 5, 10];

export async function runDunningCycle(
  db: Db,
  charge: ChargeFn,
): Promise<{ processed: number; recovered: number }> {
  const open = await db.query<{ id: string; attempt_count: number }>(
    `select id, attempt_count from invoices
     where status in ('open', 'overdue') and attempt_count < $1
     order by due_at asc limit 100`,
    [RETRY_OFFSETS_DAYS.length],
  );
  let recovered = 0;
  for (const invoice of open.rows) {
    const result = await charge(invoice.id);
    if (result.status === "rate_limited") {
      // v2.22.1: back off instead of hammering the processor.
      await sleep(result.retryAfterMs ?? 1_000);
      continue;
    }
    if (result.status === "succeeded") {
      await db.query("update invoices set status = 'paid' where id = $1", [invoice.id]);
      recovered += 1;
    } else {
      await db.query("update invoices set attempt_count = attempt_count + 1 where id = $1", [
        invoice.id,
      ]);
    }
  }
  return { processed: open.rows.length, recovered };
}
