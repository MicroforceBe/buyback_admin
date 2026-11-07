-- Execute inside BEGIN/ROLLBACK, after shopify-catalog-clean.sql. Synthetic only.
do $$
begin
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','clean','ok','test',jsonb_build_object('edits',jsonb_build_array(jsonb_build_object('at',1,'removed',(select string_agg(md5(random()::text),'') from generate_series(1,1000)),'inserted',''))),'{"hash":"1:a"}');
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Collection/1','col_clean','ok','test','{"edits":[]}','{"hash":"1:a"}');
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value) values('x','seo','ok','test',jsonb_build_object('t',(select string_agg(md5(random()::text),'') from generate_series(1,1000)))); raise exception 'Large old_value accepted for seo';
 exception when check_violation then null; end;
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('x','alt','ok','test'); raise exception 'Unknown kind accepted';
 exception when check_violation then null; end;
end $$;
