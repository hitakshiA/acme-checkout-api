// Dunning: retry failed subscription charges on a schedule.
// v2.22.1 taught us to respect 429s from the payment processor.

import type { Db } from "../db.ts";
import { sleep } from "../webhooks/retry.ts";

export interface DunningSchedule {
  /** Days after the failed charge attempt. */
  offsetDays: number;
}

export const defaultSchedule: DunningSchedule[] = [
  { offsetDays: 1 },
  { offsetDays: 3 },
  { offsetDays: 5 },
  { offsetDays: 10 },
];

export interface ChargeAttemptResult {
  status: "succeeded" | "failed" | "rate_limited";
  retryAfterMs?: number;
}

export type ChargeFn = (invoiceId: string) => Promise<ChargeAttemptResult>;

export async function runDunningCycle(
  db: Db,
  charge: ChargeFn,
  schedule: DunningSchedule[] = defaultSchedule,
): Promise<{ processed: number; recovered: number }> {
  const open = await db.query<{ id: string; attempt_count: number }>(
    `select id, attempt_count from invoices
     where status in ('open', 'overdue') and attempt_count < $1
     order by due_at asc limit 100`,
    [schedule.length],
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
