-- 0007 (v2.30.3): subscriptions need to remember month vs year billing
alter table subscriptions add column plan_interval text not null default 'month';
