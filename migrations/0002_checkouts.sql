-- 0002: checkout sessions for the embed
create table checkouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  plan_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'open',
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index checkouts_store on checkouts (store_id);
