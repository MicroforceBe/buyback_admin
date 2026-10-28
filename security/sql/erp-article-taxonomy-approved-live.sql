-- Approved production schema only. No example groups, prefixes, models or articles.
lock table public.erp_articles,public.erp_article_profiles in share mode;
create temporary table microforce_taxonomy_rollout_guard on commit drop as select 'articles'::text kind,count(*) rows,md5(string_agg(md5(to_jsonb(a)::text),'' order by a.id)) signature from public.erp_articles a
union all select 'profiles',count(*),md5(string_agg(md5(to_jsonb(p)::text),'' order by p.article_id)) from public.erp_article_profiles p;
-- Additional classification only. ERP source, legacy areas and core remain untouched.
create table public.erp_article_groups(
 id uuid primary key default gen_random_uuid(),parent_id uuid references public.erp_article_groups(id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 100),active boolean not null default true,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),updated_by text not null check(length(updated_by) between 1 and 320),check(parent_id is distinct from id)
);
create unique index erp_article_groups_unique_name on public.erp_article_groups(coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(trim(name)));
create index erp_article_groups_parent_idx on public.erp_article_groups(parent_id);
create table public.erp_article_prefixes(
 id uuid primary key default gen_random_uuid(),prefix text not null unique check(prefix ~ '^[0-9]{3}$'),group_id uuid not null references public.erp_article_groups(id) on delete restrict,active boolean not null default true,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),updated_by text not null check(length(updated_by) between 1 and 320)
);
create index erp_article_prefixes_group_idx on public.erp_article_prefixes(group_id);
create table public.erp_article_model_rules(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.erp_article_groups(id) on delete restrict,
 name text not null check(length(trim(name)) between 1 and 150),include_terms text[] not null check(cardinality(include_terms) between 1 and 10 and length(array_to_string(include_terms,','))<=800),exclude_terms text[] not null default '{}' check(cardinality(exclude_terms)<=10 and length(array_to_string(exclude_terms,','))<=800),priority integer not null default 100 check(priority between 0 and 999),active boolean not null default true,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),updated_by text not null check(length(updated_by) between 1 and 320)
);
create unique index erp_article_models_name_idx on public.erp_article_model_rules(group_id,lower(trim(name)));
create index erp_article_models_group_idx on public.erp_article_model_rules(group_id) where active;
create table public.erp_article_group_assignments(
 id uuid primary key default gen_random_uuid(),article_id uuid not null unique references public.erp_articles(id) on delete restrict,
 mode text not null check(mode in ('auto','manual','none')),group_id uuid references public.erp_article_groups(id) on delete restrict,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),updated_by text not null check(length(updated_by) between 1 and 320),
 check((mode='manual' and group_id is not null) or (mode in ('auto','none') and group_id is null))
);
create index erp_article_group_assignments_group_idx on public.erp_article_group_assignments(group_id);
create table public.erp_article_taxonomy_history(
 id uuid primary key default gen_random_uuid(),entity text not null,entity_id uuid not null,version integer not null,changed_at timestamptz not null default now(),changed_by text not null,before_data jsonb,after_data jsonb not null,
 unique(entity,entity_id,version)
);
create function public.erp_taxonomy_before_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.version<>old.version+1) then raise exception 'taxonomy_conflict';end if;
 if tg_op='INSERT' and new.version<>1 then raise exception 'taxonomy_conflict';end if;
 new.updated_at:=now();
 if tg_table_name='erp_article_groups' then
  perform pg_advisory_xact_lock(20261028,211);
  if new.parent_id is not null then
   if not exists(select 1 from public.erp_article_groups where id=new.parent_id and parent_id is null) then raise exception 'parent_must_be_root';end if;
   if exists(select 1 from public.erp_article_groups where parent_id=new.id) then raise exception 'group_has_subgroups';end if;
  end if;
 end if;
 if tg_table_name='erp_article_group_assignments' then
  if tg_op='UPDATE' then if new.article_id<>old.article_id then raise exception 'immutable_article';end if;end if;
 end if;
 if tg_table_name='erp_article_model_rules' then
  if exists(select 1 from unnest(new.include_terms||new.exclude_terms) t where t is null or length(trim(t)) not between 1 and 80 or t !~ '[[:alnum:]]') then raise exception 'invalid_terms';end if;
 end if;
 return new;
end $$;
create function public.erp_taxonomy_history_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.erp_article_taxonomy_history(entity,entity_id,version,changed_by,before_data,after_data)
 values(tg_table_name,new.id,new.version,new.updated_by,case when tg_op='UPDATE' then to_jsonb(old)-'updated_by' else null end,to_jsonb(new)-'updated_by');return new;
end $$;
do $$declare n text;begin
 foreach n in array array['erp_article_groups','erp_article_prefixes','erp_article_model_rules','erp_article_group_assignments'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',n);
 execute format('grant select,insert,update on public.%I to service_role',n);
 execute format('create trigger taxonomy_validate before insert or update on public.%I for each row execute function public.erp_taxonomy_before_write()',n);
 execute format('create trigger taxonomy_history after insert or update on public.%I for each row execute function public.erp_taxonomy_history_write()',n);
 end loop;
end $$;
alter table public.erp_article_taxonomy_history enable row level security;
revoke all on public.erp_article_taxonomy_history from public,anon,authenticated,service_role;
grant select,insert on public.erp_article_taxonomy_history to service_role;
revoke all on function public.erp_taxonomy_before_write(),public.erp_taxonomy_history_write() from public,anon,authenticated;
grant execute on function public.erp_taxonomy_before_write(),public.erp_taxonomy_history_write() to service_role;
create function public.erp_model_term_matches(body text,term text) returns boolean language sql immutable strict set search_path='' as $$
 select length(trim(term))>0 and strpos(' '||trim(regexp_replace(lower(body),'[^[:alnum:]]+',' ','g'))||' ',' '||trim(regexp_replace(lower(term),'[^[:alnum:]]+',' ','g'))||' ')>0
$$;
create function public.erp_recognize_article_model(target uuid,body text) returns jsonb language sql stable security invoker set search_path='' as $$
 with matches as (
 select r.*,length(array_to_string(r.include_terms,'')) score from public.erp_article_model_rules r
 where r.group_id=target and r.active
 and not exists(select 1 from unnest(r.include_terms) t where not public.erp_model_term_matches(coalesce(body,''),t))
 and not exists(select 1 from unnest(r.exclude_terms) t where public.erp_model_term_matches(coalesce(body,''),t))
 ),best as (select priority,score from matches order by priority desc,score desc limit 1),winners as (
 select m.* from matches m join best b using(priority,score)
 ) select jsonb_build_object('name',case when count(distinct name)=1 then min(name) else null end,'state',case when count(*)=0 then 'unmatched' when count(distinct name)=1 then 'matched' else 'conflict' end) from winners
$$;
revoke all on function public.erp_model_term_matches(text,text),public.erp_recognize_article_model(uuid,text) from public,anon,authenticated;
grant execute on function public.erp_model_term_matches(text,text),public.erp_recognize_article_model(uuid,text) to service_role;
create view public.erp_article_classified with(security_invoker=true) as
select o.*,root.id as article_group_id,root.name as article_group_name,
 case when g.parent_id is not null then g.id end as article_subgroup_id,case when g.parent_id is not null then g.name end as article_subgroup_name,
 g.id as assigned_group_id,
 case when x.mode='manual' then 'manual' when x.mode='none' then 'excluded' when g.id is not null then 'prefix' else 'unassigned' end as group_origin,
 coalesce(x.version,0) as assignment_version,
 case when p.model is not null then p.model when model.result->>'state'='matched' then model.result->>'name' when model.result->>'state'='conflict' then null else a.model end as recognized_model,
 case when p.model is not null then 'manual' when model.result->>'state'='conflict' then 'conflict' when model.result->>'state'='matched' then 'description' when a.model is not null then 'erp' else 'unmatched' end as model_origin
from public.erp_article_overview o join public.erp_articles a on a.id=o.id
left join public.erp_article_profiles p on p.article_id=o.id
left join public.erp_article_group_assignments x on x.article_id=o.id
left join public.erp_article_prefixes prefix on prefix.prefix=left(o.sku,3) and prefix.active
left join public.erp_article_groups pg on pg.id=prefix.group_id and pg.active
left join public.erp_article_groups parent on parent.id=pg.parent_id
left join public.erp_article_groups g on g.id=case when x.mode='manual' then x.group_id when x.mode='none' then null when pg.parent_id is null or parent.active then pg.id else null end
left join public.erp_article_groups root on root.id=coalesce(g.parent_id,g.id)
left join lateral (select public.erp_recognize_article_model(g.id,coalesce(p.display_name,a.title)||' '||coalesce(p.description,a.description,'')) result) model on true;
revoke all on public.erp_article_classified from public,anon,authenticated,service_role;
grant select on public.erp_article_classified to service_role;
notify pgrst,'reload schema';

do $$ begin
 if exists(select 1 from microforce_taxonomy_rollout_guard g join (select 'articles'::text kind,count(*) rows,md5(string_agg(md5(to_jsonb(a)::text),'' order by a.id)) signature from public.erp_articles a
union all select 'profiles',count(*),md5(string_agg(md5(to_jsonb(p)::text),'' order by p.article_id)) from public.erp_article_profiles p) n using(kind) where (g.rows,g.signature) is distinct from (n.rows,n.signature)) then raise exception 'Existing article/profile data changed';end if;
 if exists(select 1 from public.erp_article_groups) or exists(select 1 from public.erp_article_prefixes) or exists(select 1 from public.erp_article_model_rules) or exists(select 1 from public.erp_article_group_assignments) or exists(select 1 from public.erp_article_taxonomy_history) then raise exception 'Production taxonomy must start empty';end if;
end $$;
