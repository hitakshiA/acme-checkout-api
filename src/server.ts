// HTTP layer. No framework: node:http plus a tiny router.
// The server is created via `createServer(options)` so tests can inject a Db
// and an ephemeral port.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { Db } from "./db.ts";
import { handleCheckouts } from "./routes/checkouts.ts";
import { handleRefunds } from "./routes/refunds.ts";
import { handleSubscriptions } from "./routes/subscriptions.ts";
import { handleWebhooks } from "./routes/webhooks.ts";

export interface ServerConfig {
  port: number;
  webhookSecret: string;
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  db: Db;
  config: ServerConfig;
  params: Record<string, string>;
  body: unknown;
}

export type Handler = (ctx: Ctx) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[]; // ":id" marks a param
  handler: Handler;
}

const routes: Route[] = [];

function route(method: string, pattern: string, handler: Handler): void {
  routes.push({ method, segments: pattern.split("/").filter(Boolean), handler });
}

export function sendJson(ctx: Ctx, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  ctx.res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "x-request-id": ctx.res.getHeader("x-request-id") ?? "",
  });
  ctx.res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null; // malformed json; handlers decide what to do
  }
}

function match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
  const parts = pathname.split("/").filter(Boolean);
  for (const r of routes) {
    if (r.method !== method || r.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = r.segments.every((seg, i) => {
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]!);
        return true;
      }
      return seg === parts[i];
    });
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

// ---- route table (v1 API) ----
route("GET", "/healthz", (ctx) => sendJson(ctx, 200, { ok: true }));
route("POST", "/v1/checkouts", handleCheckouts);
route("GET", "/v1/checkouts/:id", handleCheckouts);
route("POST", "/v1/refunds", handleRefunds);
route("POST", "/v1/subscriptions", handleSubscriptions);
route("GET", "/v1/subscriptions/:id", handleSubscriptions);
route("POST", "/v1/subscriptions/:id/change-plan", handleSubscriptions);
route("POST", "/v1/subscriptions/:id/cancel", handleSubscriptions);
route("POST", "/v1/webhooks/endpoints", handleWebhooks);
route("POST", "/v1/webhooks/endpoints/:id/test", handleWebhooks);
route("POST", "/v1/webhooks/replay/:deliveryId", handleWebhooks);

export function createApp(db: Db, config: Partial<ServerConfig> = {}): Server {
  const fullConfig: ServerConfig = {
    port: config.port ?? Number(process.env.PORT ?? 8080),
    webhookSecret: config.webhookSecret ?? process.env.WEBHOOK_SECRET ?? "whsec_dev",
  };

  return createServer(async (req, res) => {
    const requestId = randomUUID();
    res.setHeader("x-request-id", requestId);
    const url = new URL(req.url ?? "/", "http://localhost");
    const hit = match(req.method ?? "GET", url.pathname);
    const ctx: Ctx = {
      req,
      res,
      db,
      config: fullConfig,
      params: hit?.params ?? {},
      body: undefined,
    };
    if (!hit) {
      sendJson(ctx, 404, { error: "not_found", path: url.pathname });
      return;
    }
    try {
      ctx.body = await readBody(req);
      await hit.handler(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      const status = err instanceof Error && err.name === "NotFoundError" ? 404 : 500;
      if (!res.headersSent) {
        sendJson(ctx, status, { error: status === 404 ? "not_found" : "internal", message });
      } else {
        res.end();
      }
    }
  });
}
