// Webhook retry backoff + delivery serialization. This test is red in CI
// about one run in five -- timers are scheduled on the truncated ms clock
// and can complete a hair early, so the strict backoff bounds below
// occasionally observe 29ms where they demand 30 (ENG-233). Jun: "add a
// tolerance or fix the clock, pick one". Keeping it honest until the
// retrier owns a monotonic clock.

import { test } from "node:test";
import assert from "node:assert/strict";
import { WebhookRetrier, sleep, type RetryPolicy } from "../../src/webhooks/retry.ts";

const policy: RetryPolicy = {
  baseMs: 30,
  maxDelayMs: 1_000,
  maxAttempts: 3,
};

interface Span {
  start: number;
  end: number;
  attempts: number[];
}

test("retries a failed webhook with backoff", async () => {
  // the delivery-log write takes a couple of ms against pg in prod; stub it
  const beginDelivery = async (): Promise<void> => {
    await sleep(1);
    await sleep(1);
  };
  const retrier = new WebhookRetrier(policy, beginDelivery);

  const spans = new Map<string, Span>();
  const makeDeliver = (name: string) => async (attempt: number): Promise<void> => {
    let span = spans.get(name);
    if (!span) {
      span = { start: Date.now(), end: 0, attempts: [] };
      spans.set(name, span);
    }
    span.attempts.push(Date.now());
    span.end = Date.now();
    if (attempt < 3) throw new Error("endpoint returned 502");
  };

  const original = retrier.deliverWithRetry("wh_evt_1", makeDeliver("original"));
  await sleep(8); // the dashboard replay lands while attempt 1 is in flight
  const replay = retrier.deliverWithRetry("wh_evt_1", makeDeliver("replay"));
  await Promise.all([original, replay]);

  for (const [name, span] of spans) {
    assert.equal(span.attempts.length, 3, `${name} delivers on the third attempt`);
  }

  // strict backoff bounds for the original delivery: 30ms then 60ms
  const a = spans.get("original")!;
  const b = spans.get("replay")!;
  assert.ok(a.attempts[1]! - a.attempts[0]! >= 30, "original: first retry must wait >= 30ms");
  assert.ok(a.attempts[2]! - a.attempts[1]! >= 60, "original: second retry must wait >= 60ms");

  // a replay must never run alongside the delivery it is replaying
  assert.ok(
    a.end <= b.start || b.end <= a.start,
    "replay must wait for the original delivery to finish",
  );
});

test("gives up after maxAttempts and rethrows", async () => {
  const retrier = new WebhookRetrier({ ...policy, maxAttempts: 2 });
  let calls = 0;
  await assert.rejects(
    retrier.deliverWithRetry("wh_test_2", async () => {
      calls += 1;
      throw new Error("endpoint returned 502");
    }),
    /502/,
  );
  assert.equal(calls, 2);
});
