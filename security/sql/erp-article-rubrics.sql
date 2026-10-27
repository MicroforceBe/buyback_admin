-- TEST only; existing source flags and core selections are not changed.
alter table public.erp_article_profiles drop constraint erp_article_profiles_product_type_check;
alter table public.erp_article_profiles add constraint erp_article_profiles_product_type_check check(product_type in ('device','part','service','accessory','other'));
create or replace view public.erp_article_overview with(security_invoker=true) as
select a.id,a.sku,a.title as source_title,coalesce(p.display_name,a.title) as title,
 coalesce(p.ean,a.ean) as ean,coalesce(p.brand,a.brand) as brand,coalesce(p.model,a.model) as model,
 coalesce(p.category,a.category) as category,p.product_type,coalesce(p.capacity_gb,a.capacity_gb) as capacity_gb,
 coalesce(p.color,a.color) as color,coalesce(p.condition_grade,a.condition_grade) as condition_grade,
 a.active,a.published,a.refurbished_product,a.vat_margin,a.inventory_qty,a.stock_gentbrugge,a.stock_oudenaarde,a.stock_antwerpen,
 a.price_cents,a.compare_price_cents,a.core_assortment,a.missing_from_erp,a.updated_at as source_updated_at,
 p.image_url,p.updated_at as profile_updated_at,coalesce(p.version,0) as profile_version,
 case when a.refurbished_product is true then 'refurb'
 when p.product_type in ('part','service') then 'repairs'
 when p.product_type='accessory' then 'accessories'
 else 'unclassified' end as management_group
from public.erp_articles a left join public.erp_article_profiles p on p.article_id=a.id;
revoke all on public.erp_article_overview from public,anon,authenticated;
grant select on public.erp_article_overview to service_role;
notify pgrst,'reload schema';
