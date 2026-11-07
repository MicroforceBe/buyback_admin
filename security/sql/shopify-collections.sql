-- Collection report: stored next to the product catalogue reports (scope), fixes in the same append-only log.
-- Run after shopify-catalog-heading.sql. Additive.
alter table public.shopify_catalog_reports add column if not exists scope text not null default 'products' check (scope in ('products','collections'));
create index if not exists shopify_catalog_reports_scope_idx on public.shopify_catalog_reports(scope, created_at desc);
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_kind_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_kind_check check(kind in ('condition','category','seo','seo_replace','description','heading','col_seo','col_hide','col_heading','revert'));
