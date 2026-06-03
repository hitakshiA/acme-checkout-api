// Webhook endpoint management + replay. Actual delivery lives in
// src/workers/webhook-delivery.ts and retries in src/webhooks/retry.ts.

import type { Ctx } from "../server.ts";
import { sendJson } from "../server.ts";
import { NotFoundError } from "../db.ts";
import { signPayload } from "../webhooks/signature.ts";
import { deliverWithRetryPolicy } from "../workers/webhook-delivery.ts";

interface WebhookEndpointRow {
  id: string;
  store_id: string;
  url: string;
  enabled: boolean;
  custom_headers: Record<string, string> | null;
  secret: string;
}

interface WebhookDeliveryRow {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload: string;
  attempt_count: number;
  status: string;
}

export async function handleWebhooks(ctx: Ctx): Promise<void> {
  const url = ctx.req.url ?? "";
  if (url.endsWith("/test")) return sendTestEvent(ctx);
  return registerEndpoint(ctx);
}

async function registerEndpoint(ctx: Ctx): Promise<void> {
  const body = (ctx.body ?? null) as {
    store_id?: string;
    url?: string;
    custom_headers?: Record<string, string>;
  } | null;
  if (!body?.store_id || !body.url) {
    sendJson(ctx, 422, { error: "validation", message: "store_id and url are required" });
    return;
  }
  const inserted = await ctx.db.query<WebhookEndpointRow>(
    `insert into webhook_endpoints (store_id, url, enabled, custom_headers, secret)
     values ($1, $2, true, $3, $4)
     returning id, store_id, url, enabled, custom_headers`,
    [body.store_id, body.url, JSON.stringify(body.custom_headers ?? {}), ctx.config.webhookSecret],
  );
  sendJson(ctx, 201, inserted.rows[0]);
}

async function sendTestEvent(ctx: Ctx): Promise<void> {
  const id = ctx.params.id!;
  const found = await ctx.db.query<WebhookEndpointRow>(
    "select * from webhook_endpoints where id = $1 limit 1",
    [id],
  );
  if (found.rows.length === 0) throw new NotFoundError("webhook endpoint", id);
  const endpoint = found.rows[0]!;
  const payload = JSON.stringify({ type: "webhook.test", created_at: new Date().toISOString() });
  const result = await deliverWithRetryPolicy({
    endpoint: {
      url: endpoint.url,
      headers: endpoint.custom_headers ?? {},
      sign: (body: string) => signPayload(endpoint.secret, body, Date.now()),
    },
    payload,
  });
  sendJson(ctx, 200, result);
}
