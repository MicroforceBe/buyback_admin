-- Execute inside BEGIN/ROLLBACK, after shopify-catalog-revert.sql. Synthetic only.
do $$
declare f bigint;
begin
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,old_value,new_value) values('gid://shopify/Product/1','seo_replace','ok','test','{"title":"a"}','{"title":"b"}') returning id into f;
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,reverts) values('gid://shopify/Product/1','revert','skipped','test',f);
 insert into public.shopify_catalog_fixes(product_id,kind,result,actor,reverts) values('gid://shopify/Product/1','revert','ok','test',f);
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor,reverts) values('gid://shopify/Product/1','revert','ok','test',f); raise exception 'Double revert accepted';
 exception when unique_violation then null; end;
 if has_table_privilege('service_role','public.shopify_catalog_fixes','UPDATE') then raise exception 'Fix log is not append-only'; end if;
end $$;
