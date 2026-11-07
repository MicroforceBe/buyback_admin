-- Execute inside BEGIN/ROLLBACK, after shopify-catalog-alt.sql. Synthetic only.
do $$
begin
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','alt_photo','ok','test','{"media":[{"id":"gid://shopify/MediaImage/1","alt":""}]}','{"media":[{"id":"gid://shopify/MediaImage/1","alt":"X"}]}');
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','alt_text','ok','test','{"edits":[]}','{"hash":"1:a"}');
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','alt_photo','ok','test',jsonb_build_object('media',(select string_agg(md5(random()::text),'') from generate_series(1,1000))),jsonb_build_object('media',(select string_agg(md5(random()::text),'') from generate_series(1,1000))));
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','alt_text','ok','test',jsonb_build_object('edits',(select string_agg(md5(random()::text),'') from generate_series(1,1000))),'{"hash":"1:a"}');
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor,new_value) values('x','alt_text','ok','test',jsonb_build_object('t',(select string_agg(md5(random()::text),'') from generate_series(1,1000)))); raise exception 'Large new_value accepted for alt_text';
 exception when check_violation then null; end;
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('x','alt','ok','test'); raise exception 'Unknown kind accepted';
 exception when check_violation then null; end;
end $$;
