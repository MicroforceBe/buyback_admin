-- Shopify sync: handle articles that are no longer in the ERP (stock 0, archive after 24h). Additive; default off.
alter table public.shopify_sync_settings add column if not exists handle_missing boolean not null default false;
create table if not exists public.shopify_sku_missing(
 sku text primary key,
 product_id text not null,
 first_missing_at timestamptz not null default now()
);
alter table public.shopify_sku_missing enable row level security;
revoke all on public.shopify_sku_missing from public, anon, authenticated, service_role;
grant select, insert, delete on public.shopify_sku_missing to service_role;
