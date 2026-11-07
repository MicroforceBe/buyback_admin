-- Execute inside BEGIN/ROLLBACK, after shopify-catalog-heading.sql. Synthetic only.
do $$
begin
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','heading','ok','test','{"headings":1}','{"headings":1}');
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('x','alt','ok','test'); raise exception 'Unknown kind accepted';
 exception when check_violation then null; end;
end $$;
