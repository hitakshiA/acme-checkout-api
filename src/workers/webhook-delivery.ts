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
