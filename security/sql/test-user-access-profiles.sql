-- Run only within BEGIN/ROLLBACK on TEST, as service_role. No persistent test accounts.
do $$
declare e text:='test-access-'||gen_random_uuid()::text||'@example.invalid'; n integer; k integer;
begin
 n:=public.manage_buyback_user_access('save',jsonb_build_object('email',e,'role','user','version',0,'is_active',true,
 'permissions',jsonb_build_object('refurb',jsonb_build_object('read',true,'write',false,'future_flag',true),'future_module',jsonb_build_object('read',true)),
 'password_hash','synthetic-hash-not-a-login'), 'test-admin@example.invalid');
 if n<>1 then raise exception 'Creation version'; end if;
 n:=public.manage_buyback_user_access('save',jsonb_build_object('email',e,'role','user','version',1,'role_profile','technician',
 'permissions',jsonb_build_object('rma_supplier',jsonb_build_object('read',true,'write',true,'finance',false,'finalize',false))), 'test-admin@example.invalid');
 if n<>2 then raise exception 'Update version'; end if;
 if not exists(select 1 from public.buyback_admin_users where email=e and password_hash='synthetic-hash-not-a-login' and permissions->'refurb'->>'future_flag'='true' and permissions->'future_module'->>'read'='true') then raise exception 'Existing fields lost'; end if;
 begin
  perform public.manage_buyback_user_access('save',jsonb_build_object('email',e,'role','admin','version',1,'permissions','{}'::jsonb), 'test-admin@example.invalid');
  raise exception 'Stale version accepted';
 exception when others then if sqlerrm not like '%ACCESS_CONFLICT%' then raise; end if; end;
 n:=public.manage_buyback_user_access('save',jsonb_build_object('email',e,'role','user','version',2,'is_active',false,'permissions','{}'::jsonb), 'test-admin@example.invalid');
 if exists(select 1 from public.buyback_admin_users where email=e and is_active) then raise exception 'Deactivation failed'; end if;
 perform public.manage_buyback_user_access('revoke_sessions',jsonb_build_object('email',e,'version',n), 'test-admin@example.invalid');
 select count(*) into k from public.buyback_user_access_audit where subject_email=e;
 if k<>4 then raise exception 'Audit incomplete'; end if;
 if exists(select 1 from public.buyback_user_access_audit where subject_email=e and (changes::text like '%synthetic-hash%' or changes::text like '%password_hash%')) then raise exception 'Secret in audit'; end if;
 begin
  perform public.manage_buyback_user_access('save',jsonb_build_object('email',e,'role','user','version',n,'permissions','{}'::jsonb),e);
  raise exception 'Self downgrade accepted';
 exception when others then if sqlerrm not like '%ACCESS_SELF_PROTECTION%' then raise; end if; end;
 if has_function_privilege('anon','public.manage_buyback_user_access(text,jsonb,text)','execute')
 or has_function_privilege('authenticated','public.manage_buyback_user_access(text,jsonb,text)','execute')
 or has_table_privilege('anon','public.buyback_user_access_audit','select')
 or has_table_privilege('authenticated','public.buyback_user_access_audit','insert') then raise exception 'Public access exposed'; end if;
end $$;
