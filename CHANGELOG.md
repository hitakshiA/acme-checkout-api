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
