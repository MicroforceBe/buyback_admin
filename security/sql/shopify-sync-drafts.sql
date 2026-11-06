-- Shopify sync: optionally create new ERP articles as draft products. Additive; default off.
alter table public.shopify_sync_settings add column if not exists create_drafts boolean not null default false;
