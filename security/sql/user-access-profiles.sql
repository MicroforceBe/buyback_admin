-- Additive TEST migration: preserve existing account data and all existing rights.
create temporary table access_users_before on commit drop as
 select email,role,permissions,password_hash,is_active from public.buyback_admin_users;
alter table public.buyback_admin_users add column role_profile text
 check(role_profile in ('custom','reception','technician','finance','manager'));
alter table public.buyback_admin_users add column access_version integer not null default 1 check(access_version>0);
create table public.buyback_user_access_audit(
 id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),
 actor text not null,subject_email text not null,event text not null,changes jsonb not null default '{}'::jsonb
);
alter table public.buyback_user_access_audit enable row level security;
revoke all on public.buyback_user_access_audit from public,anon,authenticated;
revoke all on public.buyback_user_access_audit from service_role;
grant select,insert on public.buyback_user_access_audit to service_role;

create function public.manage_buyback_user_access(p_command text,p_data jsonb,p_actor text)
returns integer language plpgsql security invoker set search_path='' as $$
declare target text:=lower(trim(p_data->>'email')); oldrow public.buyback_admin_users%rowtype;
 next_role text; next_active boolean; next_profile text; next_permissions jsonb; next_hash text;
 wanted_version integer; resulting_version integer; k text; v jsonb; before_public jsonb; after_public jsonb;
begin
 if target is null or target='' or length(target)>254 or p_actor is null or p_actor='' then raise exception 'ACCESS_INPUT'; end if;
 -- Serialize user administration so two admins cannot remove the last administrator concurrently.
 perform pg_advisory_xact_lock(hashtextextended('microforce-user-administration',0));
 select * into oldrow from public.buyback_admin_users where email=target for update;
 wanted_version:=(p_data->>'version')::integer;
 if wanted_version is null or wanted_version<>coalesce(oldrow.access_version,0) then raise exception 'ACCESS_CONFLICT'; end if;
 if p_command='revoke_sessions' then
  if oldrow.email is null then raise exception 'ACCESS_INPUT'; end if;
  update public.buyback_admin_sessions set revoked_at=now() where user_email=target and revoked_at is null;
  insert into public.buyback_user_access_audit(actor,subject_email,event) values(p_actor,target,'sessions_revoked');
  return oldrow.access_version;
 end if;
 if p_command<>'save' then raise exception 'ACCESS_INPUT'; end if;
 next_role:=p_data->>'role'; next_profile:=p_data->>'role_profile';
 next_active:=coalesce((p_data->>'is_active')::boolean,oldrow.is_active,true);
 if next_role not in ('admin','user') or next_role is null or coalesce(next_profile,'custom') not in ('custom','reception','technician','finance','manager') then raise exception 'ACCESS_INPUT'; end if;
 if jsonb_typeof(p_data->'permissions') is distinct from 'object' then raise exception 'ACCESS_INPUT'; end if;
 next_permissions:=coalesce(oldrow.permissions,'{}'::jsonb);
 for k,v in select * from jsonb_each(p_data->'permissions') loop
  if jsonb_typeof(v)<>'object' then raise exception 'ACCESS_INPUT'; end if;
  next_permissions:=jsonb_set(next_permissions,array[k],coalesce(next_permissions->k,'{}'::jsonb)||v,true);
 end loop;
 next_hash:=nullif(p_data->>'password_hash','');
 if oldrow.email is null and next_hash is null then raise exception 'ACCESS_PASSWORD_REQUIRED'; end if;
 if target=lower(trim(p_actor)) and (not next_active or next_role<>'admin') then raise exception 'ACCESS_SELF_PROTECTION'; end if;
 if oldrow.role='admin' and oldrow.is_active and (next_role<>'admin' or not next_active)
  and not exists(select 1 from public.buyback_admin_users where role='admin' and is_active and email<>target)
 then raise exception 'ACCESS_LAST_ADMIN'; end if;
 before_public:=case when oldrow.email is null then null else jsonb_build_object('role',oldrow.role,'role_profile',oldrow.role_profile,'is_active',oldrow.is_active,'permissions',oldrow.permissions) end;
 insert into public.buyback_admin_users(email,role,permissions,role_profile,is_active,password_hash,access_version)
 values(target,next_role,next_permissions,next_profile,next_active,coalesce(next_hash,oldrow.password_hash),coalesce(oldrow.access_version,0)+1)
 on conflict(email) do update set role=excluded.role,permissions=excluded.permissions,role_profile=excluded.role_profile,
 is_active=excluded.is_active,password_hash=excluded.password_hash,access_version=excluded.access_version,updated_at=now()
 returning access_version into resulting_version;
 if next_hash is not null or not next_active then
  update public.buyback_admin_sessions set revoked_at=now() where user_email=target and revoked_at is null;
 end if;
 after_public:=jsonb_build_object('role',next_role,'role_profile',next_profile,'is_active',next_active,'permissions',next_permissions);
 insert into public.buyback_user_access_audit(actor,subject_email,event,changes)
 values(p_actor,target,case when oldrow.email is null then 'created' else 'access_updated' end,
 jsonb_build_object('before',before_public,'after',after_public,'password_changed',next_hash is not null));
 return resulting_version;
end $$;
revoke all on function public.manage_buyback_user_access(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.manage_buyback_user_access(text,jsonb,text) to service_role;
do $$ begin
 if (select count(*) from access_users_before)<>(select count(*) from public.buyback_admin_users)
 or exists(select 1 from access_users_before b join public.buyback_admin_users u using(email)
 where (b.role,b.permissions,b.password_hash,b.is_active) is distinct from (u.role,u.permissions,u.password_hash,u.is_active))
 then raise exception 'Existing accounts changed unexpectedly'; end if;
end $$;
