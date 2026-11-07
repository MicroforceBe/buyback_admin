-- Execute inside BEGIN/ROLLBACK, after shopify-catalog.sql. Synthetic only.
do $$
declare r uuid;
begin
 insert into public.shopify_catalog_reports(created_by,checked) values('test',1) returning id into r;
 insert into public.shopify_catalog_fixes(report_id,product_id,kind,result,actor) values(r,'gid://shopify/Product/1','condition','ok','test');
 begin insert into public.shopify_catalog_fixes(product_id,kind,result,actor) values('x','photo','ok','test'); raise exception 'Unknown kind accepted';
 exception when check_violation then null; end;
 if has_table_privilege('anon','public.shopify_catalog_reports','SELECT') or has_table_privilege('authenticated','public.shopify_catalog_fixes','SELECT') then raise exception 'Client roles have access'; end if;
 if has_table_privilege('service_role','public.shopify_catalog_fixes','UPDATE') or has_table_privilege('service_role','public.shopify_catalog_fixes','DELETE') then raise exception 'Fix log is not append-only'; end if;
 if not has_table_privilege('service_role','public.shopify_catalog_reports','DELETE') then raise exception 'Old reports cannot be pruned'; end if;
end $$;
