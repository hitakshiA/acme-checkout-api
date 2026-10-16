-- 0010 (v2.31.1): fix for the Oct 14 incident.
-- 1. Existing rows get a sane status.
-- 2. The column gets a DEFAULT so old application code can still write.
alter table billing_events alter column status set default 'pending';
update billing_events set status = 'pending' where status is null;
