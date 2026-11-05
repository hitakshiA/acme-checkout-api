import type { Ctx, Handler } from "../server.ts";

// Invoice API v1 — read-only, for the invoice page. Writes stay internal.
export const handleInvoices: Handler = async (ctx: Ctx) => {
  const list = ctx.req.url?.startsWith("/invoices?") || ctx.req.url === "/invoices";
  if (list) {
    const storeId = ctx.params.store_id;
    const limit = Math.min(Number(ctx.params.limit ?? 50), 100);
    const rows = await ctx.db.query(
      "select id, store_id, total_cents, currency, status, period_start, period_end from invoices where store_id = $1 order by period_start desc limit $2",
      [storeId, limit],
    );
    ctx.res.end(JSON.stringify({ data: rows, next_cursor: null }));
    return;
  }
  const inv = await ctx.db.query("select * from invoices where id = $1", [ctx.params.id]);
  if (!inv.length) { ctx.res.statusCode = 404; ctx.res.end(JSON.stringify({ error: "invoice_not_found" })); return; }
  const lines = await ctx.db.query("select * from invoice_lines where invoice_id = $1", [ctx.params.id]);
  ctx.res.end(JSON.stringify({ ...inv[0], lines }));
};
