-- Execute inside BEGIN/ROLLBACK, after shopify-catalog-alt.sql. Synthetic only.
do $$
begin
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','alt_photo','ok','test','{"media":[{"id":"gid://shopify/MediaImage/1","alt":""}]}','{"media":[{"id":"gid://shopify/MediaImage/1","alt":"X"}]}');
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','alt_text','ok','test','{"edits":[]}','{"hash":"1:a"}');
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('x','alt','ok','test'); raise exception 'Unknown kind accepted';
 exception when check_violation then null; end;
end $$;
