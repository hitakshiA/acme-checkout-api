// Webhook retry backoff + delivery serialization.
//
// This test used to be red in CI about one run in five (ENG-233) because it
// timed spans with `Date.now()`: the wall clock has whole-ms resolution and can
// step, so it occasionally measured 29ms for a 30ms backoff. The retrier now
// stamps every `attempt` event with a monotonic timestamp (`monotonicNow()`,
// backed by `performance.now()`), and the test times the backoff off those
// stamps instead of reading the clock at the call site, so the measurement and
// the timer share one clock and the strict bounds below need no tolerance.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WebhookRetrier,
  monotonicNow,
  sleep,
  type RetryEvent,
  type RetryPolicy,
} from "../../src/webhooks/retry.ts";

const policy: RetryPolicy = {
  baseMs: 30,
  maxDelayMs: 1_000,
  maxAttempts: 3,
  jitterRatio: 0, // deterministic backoff for this test (jitter ships in v2.33.0)
};

interface Span {
  /** monotonic ms at this delivery's first attempt */
  start: number;
  /** monotonic ms when its last deliver call returned */
  end: number;
  attempts: number[];
}

function emptySpan(): Span {
  return { start: monotonicNow(), end: 0, attempts: [] };
}

test("retries a failed webhook with backoff", async () => {
  // the delivery-log write takes a couple of ms against pg in prod; stub it
  const beginDelivery = async (): Promise<void> => {
    await sleep(1);
    await sleep(1);
  };
  const retrier = new WebhookRetrier(policy, beginDelivery);

  const spans = new Map<string, Span>([
    ["original", emptySpan()],
    ["replay", emptySpan()],
  ]);
  // both deliveries share one key (that is the point: the replay is the same
  // event), so `attempt` events are attributed by which deliver body ran last
  const name = { current: "original" as string };
  const stamps: RetryEvent[] = [];
  retrier.on("attempt", (event: RetryEvent) => {
    stamps.push(event);
  });

  const makeDeliver = (delivery: string) => async (): Promise<void> => {
    name.current = delivery;
    spans.get(delivery)!.end = monotonicNow();
    // copy the stamps collected for this attempt onto the span, right here,
    // outside the event listener
    for (const event of stamps.splice(0)) {
      const span = spans.get(delivery)!;
      span.attempts.push(event.atMs!);
      if (event.attempt === 1) span.start = event.atMs!;
    }
    throw new Error("endpoint returned 502");
  };

  const original = retrier.deliverWithRetry("wh_evt_1", makeDeliver("original")).then(
    () => {},
    () => {},
  );
  await sleep(8); // the dashboard replay lands while attempt 1 is in flight
  const replay = retrier.deliverWithRetry("wh_evt_1", makeDeliver("replay")).then(
    () => {},
    () => {},
  );
  await Promise.all([original, replay]);

  for (const [delivery, span] of spans) {
    assert.equal(span.attempts.length, 3, `${delivery} delivers on the third attempt`);
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
