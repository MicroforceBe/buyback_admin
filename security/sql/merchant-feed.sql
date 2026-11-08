-- Own Google Merchant Center feed (replaces Channable). Additive only.
-- Apply on the test project first, then on production (by a human or with explicit approval).

-- One settings row. Default mode 'off': nothing is sent to Google until enabled.
-- test: only the listed products, as test offers that no Google surface shows. live: the whole feed.
create table public.merchant_feed_settings(
 id boolean primary key default true check(id),
 mode text not null default 'off' check(mode in ('off','test','live')),
 data_source text check(data_source is null or data_source ~ '^accounts/[0-9]+/dataSources/[0-9]+$'),
 test_products text[] not null default '{}' check(cardinality(test_products)<=20),
 -- Safety brake: a run with more inserts and deletes than this sends nothing.
 max_changes integer not null default 1500 check(max_changes between 1 and 100000),
 updated_at timestamptz not null default now(),
 updated_by text not null default 'setup'
);
insert into public.merchant_feed_settings(id) values(true);

-- What was last sent per offer, so a run only sends what changed and removes what is no longer wanted.
create table public.merchant_feed_items(
 offer_id text primary key check(length(offer_id)<=50),
 product_id text not null,
 hash text not null,
 test boolean not null,
 sent_at timestamptz not null default now()
);

create table public.merchant_feed_runs(
 id uuid primary key default gen_random_uuid(),
 trigger text not null check(trigger in ('cron','manual')),
 mode text not null check(mode in ('test','live')),
 status text not null default 'running' check(status in ('running','succeeded','failed','stopped')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 started_by text not null,
 counts jsonb not null default '{}'::jsonb,
 error text check(error is null or length(error)<=4000)
);
create index merchant_feed_runs_started_idx on public.merchant_feed_runs(started_at desc);
-- At most one running feed at a time.
create unique index merchant_feed_runs_one_running on public.merchant_feed_runs((true)) where status='running';

alter table public.merchant_feed_settings enable row level security;
alter table public.merchant_feed_items enable row level security;
alter table public.merchant_feed_runs enable row level security;
revoke all on public.merchant_feed_settings, public.merchant_feed_items, public.merchant_feed_runs from public, anon, authenticated, service_role;
grant select, update on public.merchant_feed_settings to service_role;
grant select, insert, update, delete on public.merchant_feed_items to service_role;
grant select, insert, update, delete on public.merchant_feed_runs to service_role;
