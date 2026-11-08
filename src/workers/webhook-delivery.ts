// Outbound webhook delivery. One shot here; retries are handled by
// src/webhooks/retry.ts and the delivery worker.

import { WebhookRetrier, defaultRetryPolicy, type RetryPolicy } from "../webhooks/retry.ts";

export interface DeliveryTarget {
  url: string;
  headers: Record<string, string>;
  sign: (body: string) => string;
}

export interface DeliveryRequest {
  endpoint: DeliveryTarget;
  payload: string;
  replayOf?: string;
  policy?: RetryPolicy;
}

export interface DeliveryResult {
  ok: boolean;
  attempts: number;
  status?: number;
  replay_of?: string;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number }>;

const defaultFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status };
};

let fetchImpl: FetchLike = defaultFetch;

/** Tests swap the transport; production uses global fetch. */
export function setFetchImpl(fn: FetchLike): void {
  fetchImpl = fn;
}

export async function deliverWithRetryPolicy(req: DeliveryRequest): Promise<DeliveryResult> {
  const policy = req.policy ?? defaultRetryPolicy;
  const retrier = new WebhookRetrier(policy);
  let attempts = 0;
  let lastStatus: number | undefined;

  await retrier.deliverWithRetry("delivery", async (attempt) => {
    attempts = attempt;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-acme-signature": req.endpoint.sign(req.payload),
      "x-acme-delivery-attempt": String(attempt),
      ...req.endpoint.headers,
    };
    const res = await fetchImpl(req.endpoint.url, {
      method: "POST",
      headers,
      body: req.payload,
    });
    lastStatus = res.status;
    if (res.status >= 500 || res.status === 429) {
      throw new Error(`endpoint returned ${res.status}`);
    }
  });

  return { ok: true, attempts, status: lastStatus, replay_of: req.replayOf };
}

// --- fair scheduling (eu worker backlog, Nov 2026) ---
// Round-robin over stores with a per-store cap, so one retrying store cannot
// starve the queue. Used by the delivery worker before admitting new work.
export interface QueueItem { storeId: string; enqueuedAt: number; run: () => Promise<void>; }

export function fairSchedule(items: QueueItem[], perStoreCap = 4): QueueItem[] {
  const byStore = new Map<string, QueueItem[]>();
  for (const it of items) (byStore.get(it.storeId) ?? byStore.set(it.storeId, []).get(it.storeId)!).push(it);
  for (const list of byStore.values()) list.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  const out: QueueItem[] = [];
  while (out.length < items.length) {
    for (const [, list] of byStore) out.push(...list.splice(0, perStoreCap));
  }
  return out;
}

// Drain gate: admit new deliveries only once the backlog is under the high-water
// mark. Backpressure beats unbounded queuing (the Oct 18–Nov 4 eu incident).
export const QUEUE_HIGH_WATER = 500;
export function admitNewDeliveries(queueDepth: number): boolean {
  return queueDepth < QUEUE_HIGH_WATER;
}
