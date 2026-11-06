-- Execute inside BEGIN/ROLLBACK, after shopify-sync.sql. Synthetic only.
do $$
declare r uuid;
begin
 if (select mode from public.shopify_sync_settings) <> 'off' then raise exception 'Sync must start switched off'; end if;
 begin insert into public.shopify_sync_settings(id) values(false); raise exception 'Second settings row accepted';
 exception when check_violation then null; end;
 begin update public.shopify_sync_settings set mode='turbo'; raise exception 'Unknown mode accepted';
 exception when check_violation then null; end;

 insert into public.shopify_sync_runs(trigger,mode,started_by) values('manual','shadow','fixture@example.invalid') returning id into r;
 begin insert into public.shopify_sync_runs(trigger,mode,started_by) values('cron','shadow','cron'); raise exception 'Two running syncs accepted';
 exception when unique_violation then null; end;
 update public.shopify_sync_runs set status='succeeded', finished_at=now() where id=r;
 insert into public.shopify_sync_runs(trigger,mode,started_by) values('cron','live','cron');

 insert into public.shopify_sync_changes(run_id,sku,scope,field,old_value,new_value) values(r,'TEST-SKU','variant','price','10.00','12.00');
 begin insert into public.shopify_sync_changes(run_id,sku,scope,field) values(r,'TEST-SKU','image','src'); raise exception 'Unknown scope accepted';
 exception when check_violation then null; end;
 delete from public.shopify_sync_runs where id=r;
 if exists(select 1 from public.shopify_sync_changes where run_id=r) then raise exception 'Changes not removed with run'; end if;

 if has_table_privilege('anon','public.shopify_sync_settings','SELECT') or has_table_privilege('authenticated','public.shopify_sync_runs','SELECT')
    or has_table_privilege('service_role','public.shopify_sync_settings','INSERT') or has_table_privilege('service_role','public.shopify_sync_changes','DELETE')
 then raise exception 'Unexpected privileges'; end if;
end $$;
