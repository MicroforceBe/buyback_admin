-- Execute inside BEGIN/ROLLBACK, after shopify-collections.sql. Synthetic only.
do $$
begin
 if (select count(*) from public.shopify_catalog_reports where scope is distinct from 'products' and scope is distinct from 'collections') > 0 then raise exception 'Unexpected scope'; end if;
 insert into public.shopify_catalog_reports(scope,created_by,checked) values('collections','test',1);
 begin insert into public.shopify_catalog_reports(scope,created_by,checked) values('other','test',1); raise exception 'Unknown scope accepted';
 exception when check_violation then null; end;
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Collection/1','col_hide','ok','test','{"hidden":false}','{"hidden":true}');
end $$;
