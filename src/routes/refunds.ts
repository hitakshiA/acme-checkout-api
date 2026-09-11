// Refunds (v2.29.0: partial refunds). Every refund writes a refund_audit
// row in the same transaction (v2.28.2).

import type { Ctx } from "../server.ts";
import { sendJson } from "../server.ts";
import { NotFoundError } from "../db.ts";

interface RefundRow {
  id: string;
  invoice_id: string;
  amount_cents: number;
  reason: string | null;
  actor: string;
  created_at: string;
}

export async function handleRefunds(ctx: Ctx): Promise<void> {
  const body = (ctx.body ?? null) as {
    invoice_id?: string;
    amount_cents?: number;
    reason?: string;
    actor?: string;
  } | null;
  if (!body?.invoice_id || !Number.isInteger(body.amount_cents) || body.amount_cents <= 0) {
    sendJson(ctx, 422, {
      error: "validation",
      message: "invoice_id and positive integer amount_cents are required",
    });
    return;
  }

  const invoice = await ctx.db.query<{ id: string; amount_cents: number; status: string }>(
    "select id, amount_cents, status from invoices where id = $1 limit 1",
    [body.invoice_id],
  );
  if (invoice.rows.length === 0) throw new NotFoundError("invoice", body.invoice_id);
  if (body.amount_cents > invoice.rows[0]!.amount_cents) {
    sendJson(ctx, 422, { error: "validation", message: "refund exceeds the invoice amount" });
    return;
  }

  const inserted = await ctx.db.query<RefundRow>(
    `insert into refund_audit (invoice_id, amount_cents, reason, actor)
     values ($1, $2, $3, $4)
     returning *`,
    [body.invoice_id, body.amount_cents, body.reason ?? null, body.actor ?? "api"],
  );
  sendJson(ctx, 201, inserted.rows[0]);
}
