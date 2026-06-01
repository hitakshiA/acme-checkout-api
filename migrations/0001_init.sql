-- 0001: initial schema (pre-June history squashed into this file)
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id),
  email text not null,
  timezone text not null default 'Europe/Lisbon',
  created_at timestamptz not null default now()
);

create unique index customers_store_email on customers (store_id, email);
