-- Catalogue fixes: H1 -> H2 in descriptions (kind 'heading'). Run after shopify-catalog-revert.sql.
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_kind_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_kind_check check(kind in ('condition','category','seo','seo_replace','description','heading','revert'));
