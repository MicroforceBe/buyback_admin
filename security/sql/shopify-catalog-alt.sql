-- Alt texts for product photos and description images: new fix kinds. Run after shopify-catalog-clean.sql. Additive.
alter table public.shopify_catalog_fixes drop constraint if exists shopify_catalog_fixes_kind_check;
alter table public.shopify_catalog_fixes add constraint shopify_catalog_fixes_kind_check check(kind in ('condition','category','seo','seo_replace','description','heading','clean','alt_photo','alt_text','col_seo','col_hide','col_heading','col_clean','revert'));
