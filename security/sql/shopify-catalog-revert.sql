-- Catalogue fixes: SEO replacement and undo. Run after shopify-catalog-seo.sql. Additive.
alter table public.shopify_catalog_fixes
  add column if not exists old_value jsonb check (old_value is null or pg_column_size(old_value) <= 8000),
  add column if not exists new_value jsonb check (new_value is null or pg_column_size(new_value) <= 8000),
  add column if not exists reverts bigint references public.shopify_catalog_fixes(id);
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_kind_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_kind_check check(kind in ('condition','category','seo','seo_replace','description','revert'));
-- A fix can be undone only once.
create unique index if not exists shopify_catalog_fixes_reverts_uidx on public.shopify_catalog_fixes(reverts) where reverts is not null and result = 'ok';
