// Subscription report export (v2.34.0). CSV, RFC 4180 quoting.

import type { Db } from "./db.ts";

export interface ExportRow {
  customer_id: string;
  customer_email: string;
  plan_id: string;
  plan_interval: string;
  status: string;
  mrr_cents: number;
  started_at: string;
  churn_reason: string | null;
  last_invoice_date: string | null;
}

const COLUMNS: (keyof ExportRow)[] = [
  "customer_id",
  "customer_email",
  "plan_id",
  "plan_interval",
  "status",
  "mrr_cents",
  "started_at",
  "churn_reason",
  "last_invoice_date",
];

export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((col) => quote(String(row[col]))).join(","));
  }
  return lines.join("\n") + "\n";
}

function quote(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export async function exportSubscriptionReport(db: Db): Promise<string> {
  const result = await db.query<ExportRow>(
    `select s.customer_id,
            c.email            as customer_email,
            s.plan_id,
            s.plan_interval,
            s.status,
            s.mrr_cents,
            s.started_at,
            s.churn_reason,
            s.last_invoice_date
     from subscriptions s
     join customers c on c.id = s.customer_id
     order by s.started_at desc`,
  );
  return toCsv(result.rows);
}
