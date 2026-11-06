-- Execute inside BEGIN/ROLLBACK, after shopify-sync-missing.sql. Synthetic only.
do $$
begin
 if (select handle_missing from public.shopify_sync_settings) is distinct from false then raise exception 'Must start switched off'; end if;
 insert into public.shopify_sku_missing(sku,product_id) values('TEST-SKU','gid://shopify/Product/1');
 begin insert into public.shopify_sku_missing(sku,product_id) values('TEST-SKU','x'); raise exception 'Duplicate SKU accepted';
 exception when unique_violation then null; end;
 if has_table_privilege('anon','public.shopify_sku_missing','SELECT') or has_table_privilege('service_role','public.shopify_sku_missing','UPDATE') then raise exception 'Unexpected privileges'; end if;
end $$;
