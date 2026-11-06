-- Execute inside BEGIN/ROLLBACK, after shopify-product-removals.sql. Synthetic only.
do $$
begin
 insert into public.shopify_product_removals(product_id,title,action,result,actor) values('gid://shopify/Product/1','Test','archive','ok','fixture@example.invalid');
 begin insert into public.shopify_product_removals(product_id,action,result,actor) values('x','purge','ok','a'); raise exception 'Unknown action accepted';
 exception when check_violation then null; end;
 begin insert into public.shopify_product_removals(product_id,action,result,actor) values('x','delete','maybe','a'); raise exception 'Unknown result accepted';
 exception when check_violation then null; end;
 if has_table_privilege('anon','public.shopify_product_removals','SELECT') or has_table_privilege('service_role','public.shopify_product_removals','UPDATE')
    or has_table_privilege('service_role','public.shopify_product_removals','DELETE') then raise exception 'Unexpected privileges'; end if;
end $$;
