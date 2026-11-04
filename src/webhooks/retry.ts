// Webhook delivery retries with exponential backoff.
//
// v2.33.0 added jitter so a burst of failed deliveries doesn't retry in
// lockstep against merchant endpoints. v2.33.1 fixed an off-by-one in the
// jitter range that shaved a millisecond off every delay.
//
// Deliveries for the same key are serialized: a merchant endpoint must
// never see two posts for the same event at once (replays included).

import { EventEmitter } from "node:events";

export interface RetryPolicy {
  baseMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  /** 0..1, fraction of the computed delay that is randomized. */
  jitterRatio: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  baseMs: 1_000,
  maxDelayMs: 60_000,
  maxAttempts: 6,
  jitterRatio: 0.15,
};

export function backoffDelay(
  attempt: number,
  policy: RetryPolicy = defaultRetryPolicy,
): number {
  const raw = policy.baseMs * 2 ** (attempt - 1);
  const capped = Math.min(raw, policy.maxDelayMs);
  const spread = capped * policy.jitterRatio;
  return Math.round(capped - spread + Math.random() * 2 * spread);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface RetryEvent {
  key: string;
  attempt: number;
  delayMs?: number;
  error?: unknown;
}

export type DeliverFn = (attempt: number) => Promise<void>;

/** Writes the delivery row before we POST anything. */
export type BeginDeliveryFn = (key: string) => Promise<void>;

const noopBegin: BeginDeliveryFn = async () => {};

export class WebhookRetrier extends EventEmitter {
  private readonly policy: RetryPolicy;
  private readonly beginDelivery: BeginDeliveryFn;
  private readonly busy = new Set<string>();

  constructor(policy: RetryPolicy = defaultRetryPolicy, beginDelivery: BeginDeliveryFn = noopBegin) {
    super();
    this.policy = policy;
    this.beginDelivery = beginDelivery;
  }

  /**
   * Deliver with retries until success or maxAttempts. `key` identifies the
   * webhook delivery for metrics, logs and serialization.
   */
  async deliverWithRetry(key: string, deliver: DeliverFn): Promise<void> {
    await this.acquire(key);
    try {
      for (let attempt = 1; ; attempt++) {
        this.emit("attempt", { key, attempt } satisfies RetryEvent);
        try {
          await deliver(attempt);
          this.emit("delivered", { key, attempt } satisfies RetryEvent);
          return;
        } catch (error) {
          if (attempt >= this.policy.maxAttempts) {
            this.emit("exhausted", { key, attempt, error } satisfies RetryEvent);
            throw error;
          }
          const delayMs = backoffDelay(attempt, this.policy);
          this.emit("retryScheduled", { key, attempt, delayMs } satisfies RetryEvent);
          await sleep(delayMs);
        }
      }
    } finally {
      this.busy.delete(key);
    }
  }

  private async acquire(key: string): Promise<void> {
    while (this.busy.has(key)) {
      await sleep(1); // wait for the in-flight delivery to finish
    }
    await this.beginDelivery(key);
    this.busy.add(key);
  }
}
