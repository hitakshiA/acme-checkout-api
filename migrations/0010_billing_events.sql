-- 0009 (v2.31.0): billing_events is the new ledger for charge/refund
-- lifecycle events.
--
-- NOTE: this is the migration from the Oct 14 incident. `status` was added
-- NOT NULL without a DEFAULT, so every insert from the running v2.30.4 code
-- (which knows nothing about `status`) failed and checkouts 500'd for 47
-- minutes. Fixed in 0011. Do not copy this pattern; see the migration lint
-- work (ENG-341).
create table billing_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id),
  invoice_id uuid,
  event_type text not null,
  amount_cents integer not null default 0,
  status text not null,
  created_at timestamptz not null default now()
);

create index billing_events_subscription on billing_events (subscription_id, created_at desc);
