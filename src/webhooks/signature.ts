// HMAC signatures for outbound webhook payloads and inbound webhook
// verification (Stripe-style). Header casing mattered here: see the
// v2.20.1 hotfix -- Node folds incoming header names to lowercase and we
// used to look up the literal "X-Acme-Signature".

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-acme-signature";

export function signPayload(secret: string, body: string, timestampMs: number): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestampMs}.`)
    .update(body)
    .digest("hex");
  return `t=${timestampMs},v1=${mac}`;
}

export function verifySignature(
  secret: string,
  body: string,
  headerValue: string | undefined,
): boolean {
  if (!headerValue) return false;
  const parts = new Map(
    headerValue.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  if (!Number.isFinite(t) || !v1) return false;

  const expected = signPayload(secret, body, t).split("v1=")[1]!;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
