-- 0006 (v2.25.0): usage-based add-ons
create table addon_usage (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id),
  addon_key text not null,
  quantity integer not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now()
);

create index addon_usage_period on addon_usage (subscription_id, period_start);
