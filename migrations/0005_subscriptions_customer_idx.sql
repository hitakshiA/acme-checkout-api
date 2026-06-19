-- 0005 (v2.21.2): subscriptions lookups are always by customer; seq scans
-- were showing up in the checkout latency histogram.
create index concurrently if not exists subscriptions_customer_id on subscriptions (customer_id);
