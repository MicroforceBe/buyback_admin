-- Shopify product sync (replaces the Matrixify CSV import). Additive only.
-- Apply on the test project first, then on production (by a human or with explicit approval).

-- One settings row. Default mode 'off': nothing is read from or written to Shopify until enabled.
create table public.shopify_sync_settings(
 id boolean primary key default true check(id),
 mode text not null default 'off' check(mode in ('off','shadow','live')),
 -- Safety brake: a live run with more changes than this is stopped before writing anything.
 max_changes integer not null default 1500 check(max_changes between 1 and 100000),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by text not null default 'setup'
);
insert into public.shopify_sync_settings(id) values(true);

create table public.shopify_sync_runs(
 id uuid primary key default gen_random_uuid(),
 trigger text not null check(trigger in ('cron','manual')),
 mode text not null check(mode in ('shadow','live')),
 status text not null default 'running' check(status in ('running','succeeded','failed','stopped')),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 started_by text not null,
 counts jsonb not null default '{}'::jsonb,
 error text check(error is null or length(error)<=4000)
);
create index shopify_sync_runs_started_idx on public.shopify_sync_runs(started_at desc);
-- At most one running sync at a time.
create unique index shopify_sync_runs_one_running on public.shopify_sync_runs((true)) where status='running';

-- Field-level changes per run: what would change (shadow) or what was written (live).
create table public.shopify_sync_changes(
 id bigint generated always as identity primary key,
 run_id uuid not null references public.shopify_sync_runs(id) on delete cascade,
 sku text not null,
 scope text not null check(scope in ('product','variant','inventory','metafield')),
 field text not null,
 old_value text,
 new_value text,
 applied boolean not null default false,
 error text check(error is null or length(error)<=1000)
);
create index shopify_sync_changes_run_idx on public.shopify_sync_changes(run_id, id);
create index shopify_sync_changes_sku_idx on public.shopify_sync_changes(sku);

alter table public.shopify_sync_settings enable row level security;
alter table public.shopify_sync_runs enable row level security;
alter table public.shopify_sync_changes enable row level security;
revoke all on public.shopify_sync_settings, public.shopify_sync_runs, public.shopify_sync_changes from public, anon, authenticated, service_role;
grant select, update on public.shopify_sync_settings to service_role;
grant select, insert, update, delete on public.shopify_sync_runs to service_role;
grant select, insert, update on public.shopify_sync_changes to service_role;

-- Old runs are pruned by the application after 30 days; changes follow via cascade.
