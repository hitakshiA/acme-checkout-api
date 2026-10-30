# Changelog

Notable changes to Acme Checkout. Tags are cut from `acme/checkout-api` and
refer to the whole product (web included).

## v2.20.0 — 2026-06-03

- webhook retry dashboard; web footer links

## v2.20.1 — 2026-06-05

- hotfix: webhook signature header casing

## v2.20.2 — 2026-06-10

- deps bump; docs links on the 404 page

## v2.21.0 — 2026-06-12

- subscription upgrade proration v1

## v2.21.1 — 2026-06-17

- fix: rounding on tax lines

## v2.21.2 — 2026-06-19

- perf: index on subscriptions.customer_id

## v2.22.0 — 2026-06-24

- plan change API endpoint

## v2.22.1 — 2026-06-26

- fix: 429 handling in dunning worker

## v2.22.2 — 2026-07-01

- web: account page redesign behind flag

## v2.23.0 — 2026-07-03

- trial expiration emails

## v2.23.1 — 2026-07-08

- fix: trial emails sent at midnight local time

## v2.23.2 — 2026-07-10

- account page flag defaults off again

## v2.23.3 — 2026-07-15

- fix: leaked db connection in webhook worker

## v2.24.0 — 2026-07-17

- Stripe tax integration (beta)

## v2.24.1 — 2026-07-22

- fix: tax on annual invoices

## v2.24.2 — 2026-07-24

- chore: node 22

## v2.25.0 — 2026-07-29

- usage-based add-ons

## v2.25.1 — 2026-07-31

- fix: add-on quantity validation

## v2.25.2 — 2026-08-05

- web: pricing page AB test scaffolding (not wired up yet)

## v2.26.0 — 2026-08-07

- webhook replay UI in the dashboard

## v2.26.1 — 2026-08-12

- fix: replay drops custom headers

## v2.26.2 — 2026-08-14

- ci: shard checkout-api tests

## v2.27.0 — 2026-08-19

- dunning retry schedule configurable

## v2.27.1 — 2026-08-21

- fix: dunning stops after card update

## v2.27.2 — 2026-08-26

- customer portal: update-card link

## v2.27.3 — 2026-08-28

- fix: portal link expiry 1h -> 24h

## v2.28.0 — 2026-09-02

- annual invoices show a savings line

## v2.28.1 — 2026-09-04

- fix: savings line overflow on PDF

## v2.28.2 — 2026-09-09

- audit log for refunds

## v2.29.0 — 2026-09-11

- refund API: partial refunds

## v2.29.1 — 2026-09-16

- fix: refund race on double click

## v2.29.2 — 2026-09-18

- web: locale switcher

## v2.29.3 — 2026-09-23

- fix: locale cookie on checkout embed

## v2.30.0 — 2026-09-25

- checkout embed v2 (script tag)

## v2.30.1 — 2026-09-30

- fix: embed CSP on Safari

## v2.30.2 — 2026-10-02

- metrics: checkout latency histogram

## v2.30.3 — 2026-10-07

- migrations: add subscriptions.plan_interval

## v2.30.4 — 2026-10-09

- hotfix: plan_interval backfill batch size. This is the version we rolled back to on Oct 14.

## v2.31.0 — 2026-10-14

- billing_events table; migration added a NOT NULL column without a default. Rolled back at 14:49 UTC after 47 minutes of checkout 500s.

## v2.31.1 — 2026-10-16

- fix: default for billing_events.status; migration lint follow-up still open

## v2.32.0 — 2026-10-21

- billing_events backfill + retry metrics

## v2.32.1 — 2026-10-23

- fix: retry metrics label cardinality

## v2.32.2 — 2026-10-28

- web: pricing page v3 scaffold merged behind a flag

## v2.33.0 — 2026-10-30

- webhook backoff jitter
