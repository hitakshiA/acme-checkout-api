-- 0007 (v2.28.2): audit log for refunds. Lena wanted a trail that survives
-- Stripe dashboard edits, so every refund writes a row here in the same
-- transaction as the refund itself.
create table refund_audit (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  amount_cents integer not null check (amount_cents > 0),
  reason text,
  actor text not null,
  created_at timestamptz not null default now()
);

create index refund_audit_invoice on refund_audit (invoice_id, created_at desc);
