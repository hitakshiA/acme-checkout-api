-- 0004: webhook endpoints and delivery log
create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  url text not null,
  enabled boolean not null default true,
  custom_headers jsonb not null default '{}'::jsonb,
  secret text not null,
  created_at timestamptz not null default now()
);

create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references webhook_endpoints(id),
  event_type text not null,
  payload text not null,
  attempt_count integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index webhook_deliveries_endpoint on webhook_deliveries (endpoint_id, created_at desc);
