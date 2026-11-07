-- Execute inside BEGIN/ROLLBACK, after shopify-catalog-seo.sql. Synthetic only.
do $$
begin
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('gid://shopify/Product/1','seo','ok','test'),('gid://shopify/Product/1','description','skipped','test');
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('x','alt','ok','test'); raise exception 'Unknown kind accepted';
 exception when check_violation then null; end;
end $$;
