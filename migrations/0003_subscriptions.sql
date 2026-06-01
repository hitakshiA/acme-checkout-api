-- 0003: subscriptions and invoices
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  plan_id text not null,
  status text not null default 'trialing',
  cycle_day smallint not null default 1,
  mrr_cents integer not null default 0,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'open',
  attempt_count integer not null default 0,
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);
