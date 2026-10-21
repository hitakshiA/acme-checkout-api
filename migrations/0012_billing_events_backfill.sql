-- 0011 (v2.32.0): backfill billing_events from historical invoices so the
-- retry metrics (also v2.32.0) have something to count against.
insert into billing_events (subscription_id, invoice_id, event_type, amount_cents, status, created_at)
select i.subscription_id, i.id, 'invoice.paid', i.amount_cents, 'succeeded', i.created_at
from invoices i
where i.status = 'paid'
  and not exists (
    select 1 from billing_events b
    where b.invoice_id = i.id and b.event_type = 'invoice.paid'
  );
