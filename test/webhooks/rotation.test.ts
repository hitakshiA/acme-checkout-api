import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifySignature } from "../../src/webhooks/signature.ts";

test("accepts the previous secret while both are active", () => {
  const body = '{"type":"invoice.paid"}';
  const sig = signPayload("whsec_old", body, Date.now());
  assert.equal(verifySignature(["whsec_new", "whsec_old"], body, sig), true);
});

test("rejects an unknown secret", () => {
  const body = '{"type":"invoice.paid"}';
  const sig = signPayload("whsec_evil", body, Date.now());
  assert.equal(verifySignature(["whsec_new", "whsec_old"], body, sig), false);
});
