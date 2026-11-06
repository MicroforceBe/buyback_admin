-- Execute inside BEGIN/ROLLBACK, after shopify-sync-drafts.sql.
do $$
begin
 if (select create_drafts from public.shopify_sync_settings) is distinct from false then raise exception 'Draft creation must start switched off'; end if;
 begin update public.shopify_sync_settings set create_drafts = null; raise exception 'Null accepted';
 exception when not_null_violation then null; end;
end $$;
