-- Clean-up of pasted texts (hidden <script> code, "[Bedrijfsnaam]"): new fix kinds, and room in old_value
-- for the removed code so the clean-up can be undone exactly. Run after shopify-collections.sql. Additive.
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_kind_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_kind_check check(kind in ('condition','category','seo','seo_replace','description','heading','clean','col_seo','col_hide','col_heading','col_clean','revert'));
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_old_value_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_old_value_check check(old_value is null or pg_column_size(old_value) <= 8000 or (kind in ('clean','col_clean') and pg_column_size(old_value) <= 65536));
