-- Shopify catalogue health report and log of applied fixes. Additive.
create table public.shopify_catalog_reports(
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 created_by text not null,
 checked integer not null default 0,
 counts jsonb not null default '{}'::jsonb,
 issues jsonb not null default '[]'::jsonb
);
create index shopify_catalog_reports_created_idx on public.shopify_catalog_reports(created_at desc);
create table public.shopify_catalog_fixes(
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 report_id uuid,
 product_id text not null,
 title text not null default '' check(length(title)<=255),
 kind text not null check(kind in ('condition','category')),
 result text not null check(result in ('ok','skipped','failed')),
 detail text check(detail is null or length(detail)<=1000),
 actor text not null
);
create index shopify_catalog_fixes_created_idx on public.shopify_catalog_fixes(created_at desc);
alter table public.shopify_catalog_reports enable row level security;
alter table public.shopify_catalog_fixes enable row level security;
revoke all on public.shopify_catalog_reports, public.shopify_catalog_fixes from public, anon, authenticated, service_role;
grant select, insert, delete on public.shopify_catalog_reports to service_role;
-- Append-only log.
grant select, insert on public.shopify_catalog_fixes to service_role;
