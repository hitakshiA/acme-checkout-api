# checkout-api

Acme Checkout API -- embeddable checkout and subscriptions for small online
stores. TypeScript on Node 24, Postgres (Supabase) on the other end of a
narrow `Db` interface. No framework, no runtime dependencies.

## Layout

- `src/server.ts` -- `node:http` server + tiny router
- `src/routes/` -- `checkouts`, `subscriptions`, `webhooks`
- `src/pricing/` -- plan catalog, proration (`proration.ts`), tax lines
- `src/webhooks/` -- retry/backoff (`retry.ts`), HMAC signatures
- `src/workers/` -- webhook delivery, dunning
- `migrations/` -- plain SQL, applied in order (see `0010` for the Oct 14 story)
- `test/` -- `node:test`, run with `node --test` (native type stripping, no build step)

## Develop

```sh
export DATABASE_URL=postgres://...   # Supabase connection string
npm start                            # node src/index.ts
npm test                             # node --test
```

Node >= 24. There is nothing to `npm install`.

## Known issues (kept visible on purpose)

- `test/pricing/proration.test.ts` is **red on main**. Proration rounds down
  (`Math.floor`) instead of half-up; the fix is a one-liner in
  `src/pricing/proration.ts`. See ENG-148.
- `test/webhooks/retry.test.ts` is **flaky, about 1 run in 5**, on a timer
  race in the test itself. See ENG-233. Do not "fix" it by bumping sleeps.

## Deploying

Releases are tagged `vX.Y.Z` (see CHANGELOG.md). `main` deploys on green CI;
v2.31.0 is a good reminder to read `migrations/0009_billing_events.sql`
before you ship a migration. Rollback target for the current train is
v2.30.4 and up.
