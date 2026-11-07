-- Alt texts for product photos and description images: new fix kinds, and the larger undo-data allowance
-- (64 KB) for them too (many images per product). Run after shopify-catalog-clean.sql. Additive.
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_kind_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_kind_check check(kind in ('condition','category','seo','seo_replace','description','heading','clean','alt_photo','alt_photo_replace','alt_text','col_seo','col_hide','col_heading','col_clean','revert'));
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_old_value_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_old_value_check check(old_value is null or pg_column_size(old_value) <= 8000 or (kind in ('clean','col_clean','alt_photo','alt_photo_replace','alt_text') and pg_column_size(old_value) <= 65536));
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_new_value_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_new_value_check check(new_value is null or pg_column_size(new_value) <= 8000 or (kind in ('alt_photo','alt_photo_replace') and pg_column_size(new_value) <= 65536));
