-- 0008 (v2.30.4): the 0007 backfill updated all 2.1M rows in one statement
-- and held a lock for 40s. Batched here; 5k rows per statement, looped by
-- the backfill worker.
do $$
declare
  n integer;
begin
  loop
    update subscriptions set plan_interval = 'month'
    where id in (
      select id from subscriptions
      where plan_interval is null
      limit 5000
    );
    get diagnostics n = row_count;
    exit when n = 0;
    perform pg_sleep(0.05);
  end loop;
end $$;
