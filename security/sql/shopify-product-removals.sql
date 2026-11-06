-- Log of products archived, restored or deleted in Shopify from the admin tool. Additive.
create table public.shopify_product_removals(
 id bigint generated always as identity primary key,
 product_id text not null,
 title text not null default '' check(length(title)<=255),
 skus text[] not null default '{}',
 action text not null check(action in ('archive','restore','delete')),
 result text not null check(result in ('ok','refused','failed')),
 detail text check(detail is null or length(detail)<=1000),
 previous_status text,
 redirect text,
 actor text not null,
 created_at timestamptz not null default now()
);
create index shopify_product_removals_product_idx on public.shopify_product_removals(product_id, created_at desc);
create index shopify_product_removals_created_idx on public.shopify_product_removals(created_at desc);
alter table public.shopify_product_removals enable row level security;
revoke all on public.shopify_product_removals from public, anon, authenticated, service_role;
-- Append-only for the application: no update or delete.
grant select, insert on public.shopify_product_removals to service_role;
