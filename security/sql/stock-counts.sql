-- Additive stock-count module. External ERP articles are read only.
create table public.stock_count_sessions (
 id uuid primary key, title text not null check(length(title) between 1 and 150),
 location text not null check(location in ('gentbrugge','oudenaarde','antwerpen')),
 count_type text not null check(count_type in ('cycle','full')),
 group_id uuid, subgroup_id uuid, status text not null default 'active' check(status in ('active','review','approved','cancelled')),
 version integer not null default 1, active_round integer not null default 1,
 created_by text not null, created_at timestamptz not null default now(),
 reviewed_at timestamptz, approved_at timestamptz, approved_by text, approval_note text
);
create table public.stock_count_lines (
 session_id uuid not null references public.stock_count_sessions(id), article_id uuid not null,
 sku text not null, ean text, title text, group_name text, subgroup_name text, model text,
 expected_qty integer, counted_qty integer check(counted_qty between 0 and 1000000),
 round integer not null default 1, needs_recount boolean not null default false,
 review_qty integer, review_missing boolean not null default false,
 primary key(session_id,article_id)
);
create index stock_count_lines_sku_idx on public.stock_count_lines(session_id,sku);
create index stock_count_lines_ean_idx on public.stock_count_lines(session_id,ean) where ean is not null;
create table public.stock_count_zones (
 id uuid primary key, session_id uuid not null references public.stock_count_sessions(id),
 name text not null check(length(name) between 1 and 100), assigned_to text not null,
 status text not null default 'open' check(status in ('open','complete')),
 scan_count integer not null default 0, created_at timestamptz not null default now()
);
create unique index stock_count_zone_name_idx on public.stock_count_zones(session_id,lower(name));
create table public.stock_count_events (
 id uuid primary key, session_id uuid not null references public.stock_count_sessions(id),
 zone_id uuid references public.stock_count_zones(id), article_id uuid, round integer,
 command text not null, kind text not null, quantity integer, serial text, code text,
 reference_event uuid references public.stock_count_events(id), actor text not null,
 note text, payload_hash text not null, result jsonb not null, created_at timestamptz not null default now()
);
create index stock_count_events_zone_idx on public.stock_count_events(zone_id);
create index stock_count_events_session_idx on public.stock_count_events(session_id,created_at desc);
create index stock_count_events_serial_idx on public.stock_count_events(session_id,serial,article_id,round) where serial is not null;
create index stock_count_events_ref_idx on public.stock_count_events(reference_event,kind);
create unique index stock_count_single_undo_idx on public.stock_count_events(reference_event) where kind='undo';
create unique index stock_count_single_resolve_idx on public.stock_count_events(reference_event) where kind='resolve';

alter table public.stock_count_sessions enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_zones enable row level security;
alter table public.stock_count_events enable row level security;
revoke all on public.stock_count_sessions,public.stock_count_lines,public.stock_count_zones,public.stock_count_events from public,anon,authenticated,service_role;
grant select,insert,update on public.stock_count_sessions,public.stock_count_lines,public.stock_count_zones to service_role;
grant select,insert on public.stock_count_events to service_role;
create policy stock_sessions_service on public.stock_count_sessions to service_role using(true) with check(true);
create policy stock_lines_service on public.stock_count_lines to service_role using(true) with check(true);
create policy stock_zones_service on public.stock_count_zones to service_role using(true) with check(true);
create policy stock_events_service on public.stock_count_events to service_role using(true) with check(true);

create function public.stock_count_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if tg_table_name='stock_count_events' then raise exception 'stock_audit_immutable'; end if;
 if tg_table_name='stock_count_sessions' then
  if old.status in ('approved','cancelled') then raise exception 'stock_closed'; end if;
 else
  if exists(select 1 from public.stock_count_sessions where id=old.session_id and status in ('approved','cancelled')) then raise exception 'stock_closed'; end if;
 end if;
 if tg_op='DELETE' then raise exception 'stock_no_delete'; end if;
 return new;
end $$;
revoke all on function public.stock_count_immutable() from public,anon,authenticated,service_role;
grant execute on function public.stock_count_immutable() to service_role;
create trigger stock_sessions_immutable before update or delete on public.stock_count_sessions for each row execute function public.stock_count_immutable();
create trigger stock_lines_immutable before update or delete on public.stock_count_lines for each row execute function public.stock_count_immutable();
create trigger stock_zones_immutable before update or delete on public.stock_count_zones for each row execute function public.stock_count_immutable();
create trigger stock_events_immutable before update or delete on public.stock_count_events for each row execute function public.stock_count_immutable();

create view public.stock_count_open_issues with(security_invoker=true) as
 select e.id,e.session_id,e.zone_id,e.code,e.actor,e.created_at
 from public.stock_count_events e where e.kind='unknown'
 and not exists(select 1 from public.stock_count_events r where r.reference_event=e.id and r.kind='resolve');
revoke all on public.stock_count_open_issues from public,anon,authenticated,service_role;
grant select on public.stock_count_open_issues to service_role;

create function public.stock_count_command(p_actor text,p_admin boolean,p_command text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 sid uuid:=(p_payload->>'session_id')::uuid; rid uuid:=(p_payload->>'request_id')::uuid;
 zid uuid:=nullif(p_payload->>'zone_id','')::uuid; aid uuid:=nullif(p_payload->>'article_id','')::uuid;
 ref uuid:=nullif(p_payload->>'reference','')::uuid;
 s public.stock_count_sessions%rowtype; z public.stock_count_zones%rowtype;
 l public.stock_count_lines%rowtype; e public.stock_count_events%rowtype;
 result jsonb; candidates jsonb; n integer; qty integer; old_qty integer;
 code text:=btrim(coalesce(p_payload->>'code','')); sn text:=nullif(upper(btrim(coalesce(p_payload->>'serial',''))),'');
 note text:=btrim(coalesce(p_payload->>'note','')); event_kind text:=p_command; name text;
 event_round integer; event_quantity integer; event_serial text; event_article uuid;
begin
 if sid is null or rid is null or length(coalesce(p_actor,'')) not between 3 and 250 then raise exception 'stock_invalid'; end if;
 if p_command not in ('create','zone','zone_complete','zone_open','zone_claim','scan','undo','zero','resolve','review','recount','reopen','approve','cancel') then raise exception 'stock_invalid'; end if;
 if p_command in ('approve','recount','reopen','cancel','zone_claim') and not coalesce(p_admin,false) then raise exception 'stock_admin_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('stock-count:'||sid::text,0));
 select * into e from public.stock_count_events where id=rid;
 if found then
  if e.session_id<>sid or e.actor<>p_actor or e.command<>p_command or e.payload_hash<>md5(p_payload::text) then raise exception 'stock_request_conflict'; end if;
  return e.result;
 end if;
 if p_command='create' then
  if exists(select 1 from public.stock_count_sessions where id=sid) then raise exception 'stock_request_conflict'; end if;
  if p_payload->>'location' not in ('gentbrugge','oudenaarde','antwerpen') or p_payload->>'count_type' not in ('cycle','full') or length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 150 then raise exception 'stock_invalid'; end if;
  if nullif(p_payload->>'group_id','') is not null and not exists(select 1 from public.erp_article_groups where id=(p_payload->>'group_id')::uuid and parent_id is null and active) then raise exception 'stock_scope'; end if;
  if nullif(p_payload->>'subgroup_id','') is not null and not exists(select 1 from public.erp_article_groups where id=(p_payload->>'subgroup_id')::uuid and active and parent_id is not null and (nullif(p_payload->>'group_id','') is null or parent_id=(p_payload->>'group_id')::uuid)) then raise exception 'stock_scope'; end if;
  insert into public.stock_count_sessions(id,title,location,count_type,group_id,subgroup_id,created_by)
  values(sid,btrim(p_payload->>'title'),p_payload->>'location',p_payload->>'count_type',nullif(p_payload->>'group_id','')::uuid,nullif(p_payload->>'subgroup_id','')::uuid,p_actor) returning * into s;
  insert into public.stock_count_lines(session_id,article_id,sku,ean,title,group_name,subgroup_name,model,expected_qty)
  select sid,c.id,c.sku,nullif(c.ean,''),c.title,c.article_group_name,c.article_subgroup_name,c.recognized_model,
   case s.location when 'gentbrugge' then a.stock_gentbrugge when 'oudenaarde' then a.stock_oudenaarde else a.stock_antwerpen end
  from public.erp_article_classified c join public.erp_articles a on a.id=c.id
  where a.active and not a.missing_from_erp and (s.group_id is null or c.article_group_id=s.group_id) and (s.subgroup_id is null or c.article_subgroup_id=s.subgroup_id);
  get diagnostics n=row_count;
  if n=0 then raise exception 'stock_empty_scope'; end if;
  name:=regexp_replace(btrim(coalesce(p_payload->>'zone','')),'\s+',' ','g');
  if length(name) not between 1 and 100 then raise exception 'stock_zone_name'; end if;
  zid:=gen_random_uuid();insert into public.stock_count_zones(id,session_id,name,assigned_to) values(zid,sid,name,p_actor);
  result:=jsonb_build_object('ok',true,'session_id',sid,'zone_id',zid,'lines',n);
 else
  select * into s from public.stock_count_sessions where id=sid for update;
  if not found then raise exception 'stock_not_found'; end if;
  if s.status in ('approved','cancelled') then raise exception 'stock_closed'; end if;
  if p_command in ('review','recount','reopen','approve','cancel') and coalesce((p_payload->>'version')::integer,-1)<>s.version then raise exception 'stock_stale'; end if;
  if p_command in ('zone','zone_complete','zone_open','zone_claim','scan','undo','zero','resolve') and s.status<>'active' then raise exception 'stock_not_active'; end if;
  if p_command='zone' then
   name:=regexp_replace(btrim(coalesce(p_payload->>'name','')),'\s+',' ','g');
   if length(name) not between 1 and 100 then raise exception 'stock_zone_name'; end if;
   zid:=gen_random_uuid();insert into public.stock_count_zones(id,session_id,name,assigned_to) values(zid,sid,name,p_actor);
   result:=jsonb_build_object('ok',true,'zone_id',zid);
  elsif p_command in ('zone_complete','zone_open','zone_claim','scan','zero') then
   select * into z from public.stock_count_zones where id=zid and session_id=sid for update;
   if not found then raise exception 'stock_zone_required'; end if;
   if p_command<>'zone_claim' and z.assigned_to<>p_actor then raise exception 'stock_zone_owner'; end if;
   if p_command in ('zone_complete','zone_open','zone_claim') then
    if p_command='zone_claim' and length(note)<5 then raise exception 'stock_note_required'; end if;
    update public.stock_count_zones set status=case when p_command='zone_complete' then 'complete' else 'open' end,assigned_to=case when p_command='zone_claim' then p_actor else assigned_to end where id=zid;
    result:=jsonb_build_object('ok',true);
   else
    if z.status<>'open' then raise exception 'stock_zone_closed'; end if;
    if p_command='scan' then
     if length(code) not between 1 and 128 or code~'[[:cntrl:]]' then raise exception 'stock_invalid_code'; end if;
     select jsonb_agg(jsonb_build_object('article_id',article_id,'sku',sku,'title',title) order by sku),count(*) into candidates,n from public.stock_count_lines where session_id=sid and (sku=code or ean=code);
     if n=1 then select article_id into aid from public.stock_count_lines where session_id=sid and (sku=code or ean=code);
     elsif aid is null or not exists(select 1 from public.stock_count_lines where session_id=sid and article_id=aid and (sku=code or ean=code)) then
      event_kind:='unknown';result:=jsonb_build_object('ok',false,'issue_id',rid,'error',case when n=0 then 'Barcode niet gevonden binnen deze telling.' else 'Deze barcode hoort bij meerdere artikelen. Kies het juiste artikel.' end,'candidates',coalesce(candidates,'[]'::jsonb));
     end if;
    end if;
    if event_kind<>'unknown' then
     select * into l from public.stock_count_lines where session_id=sid and article_id=aid for update;
     if not found then raise exception 'stock_article_scope'; end if;
     if l.round<>s.active_round then raise exception 'stock_recount_scope'; end if;
     event_article:=aid;event_round:=l.round;
     if p_command='scan' then
      qty:=(p_payload->>'quantity')::integer;
      if qty is null or qty not between 1 and 9999 then raise exception 'stock_quantity'; end if;
      if sn is not null then
       if sn!~'^[A-Z0-9-]{4,64}$' or qty<>1 then raise exception 'stock_serial'; end if;
       if exists(select 1 from public.stock_count_events ev join public.stock_count_lines li on li.session_id=ev.session_id and li.article_id=ev.article_id and li.round=ev.round where ev.session_id=sid and ev.serial=sn group by ev.serial having sum(ev.quantity)>0) then raise exception 'stock_duplicate_serial'; end if;
      end if;
      if coalesce(l.counted_qty,0)+qty>1000000 then raise exception 'stock_quantity'; end if;
      update public.stock_count_lines set counted_qty=coalesce(counted_qty,0)+qty,needs_recount=false where session_id=sid and article_id=aid returning * into l;
      update public.stock_count_zones set scan_count=scan_count+1 where id=zid;
      event_quantity:=qty;event_serial:=sn;
     else
      if l.counted_qty is not null and l.counted_qty<>0 then raise exception 'stock_zero_has_scans'; end if;
      update public.stock_count_lines set counted_qty=0,needs_recount=false where session_id=sid and article_id=aid returning * into l;
      event_quantity:=0;
     end if;
     if ref is not null then
      if not exists(select 1 from public.stock_count_events where id=ref and session_id=sid and kind='unknown' and (actor=p_actor or p_admin)) then raise exception 'stock_issue_scope'; end if;
      insert into public.stock_count_events(id,session_id,zone_id,command,kind,reference_event,actor,note,payload_hash,result) values(gen_random_uuid(),sid,zid,'resolve','resolve',ref,p_actor,'Artikel gekozen na barcodecontrole.',md5(p_payload::text),'{}');
     end if;
     result:=jsonb_build_object('ok',true,'event_id',rid,'article_id',aid,'sku',l.sku,'title',l.title,'counted_qty',l.counted_qty);
    end if;
   end if;
  elsif p_command='undo' then
   select * into e from public.stock_count_events where id=ref and session_id=sid and kind='scan';
   if not found or (e.actor<>p_actor and not p_admin) then raise exception 'stock_undo_scope'; end if;
   select * into z from public.stock_count_zones where id=e.zone_id and session_id=sid;
   if z.status<>'open' or (z.assigned_to<>p_actor and not p_admin) then raise exception 'stock_zone_closed'; end if;
   select * into l from public.stock_count_lines where session_id=sid and article_id=e.article_id for update;
   if l.round<>e.round or l.round<>s.active_round or exists(select 1 from public.stock_count_events where reference_event=ref and kind='undo') or l.counted_qty<e.quantity then raise exception 'stock_undo_scope'; end if;
   update public.stock_count_lines set counted_qty=counted_qty-e.quantity where session_id=sid and article_id=e.article_id returning * into l;
   zid:=e.zone_id;event_article:=e.article_id;event_round:=e.round;event_quantity:=-e.quantity;event_serial:=e.serial;
   result:=jsonb_build_object('ok',true,'article_id',l.article_id,'sku',l.sku,'title',l.title,'counted_qty',l.counted_qty);
  elsif p_command='resolve' then
   if length(note) not between 5 and 1000 or not exists(select 1 from public.stock_count_events where id=ref and session_id=sid and kind='unknown' and (actor=p_actor or p_admin)) then raise exception 'stock_issue_scope'; end if;
   if exists(select 1 from public.stock_count_events where reference_event=ref and kind='resolve') then raise exception 'stock_issue_resolved'; end if;
   result:=jsonb_build_object('ok',true);
  elsif p_command='review' then
   if s.status<>'active' then raise exception 'stock_not_active'; end if;
   if exists(select 1 from public.stock_count_zones where session_id=sid and status='open') then raise exception 'stock_open_zones'; end if;
   if exists(select 1 from public.stock_count_open_issues where session_id=sid) then raise exception 'stock_open_issues'; end if;
   if not exists(select 1 from public.stock_count_lines where session_id=sid and counted_qty is not null) then raise exception 'stock_no_counts'; end if;
   update public.stock_count_lines cl set review_qty=(select case s.location when 'gentbrugge' then a.stock_gentbrugge when 'oudenaarde' then a.stock_oudenaarde else a.stock_antwerpen end from public.erp_articles a where a.id=cl.article_id and not a.missing_from_erp),review_missing=not exists(select 1 from public.erp_articles a where a.id=cl.article_id and not a.missing_from_erp) where cl.session_id=sid;
   update public.stock_count_sessions set status='review',reviewed_at=now() where id=sid;
   result:=jsonb_build_object('ok',true);
  elsif p_command='recount' then
   if s.status<>'review' or length(note)<5 then raise exception 'stock_review_required'; end if;
   select * into l from public.stock_count_lines where session_id=sid and article_id=aid for update;
   if not found then raise exception 'stock_article_scope'; end if;
   old_qty:=l.counted_qty;
   update public.stock_count_lines set round=s.active_round+1,counted_qty=null,needs_recount=true where session_id=sid and article_id=aid;
   update public.stock_count_sessions set status='active',active_round=active_round+1 where id=sid;
   event_article:=aid;event_round:=s.active_round+1;
   result:=jsonb_build_object('ok',true,'previous_qty',old_qty);
  elsif p_command='reopen' then
   if s.status<>'review' or length(note)<5 then raise exception 'stock_review_required'; end if;
   update public.stock_count_sessions set status='active' where id=sid;
   result:=jsonb_build_object('ok',true);
  elsif p_command='approve' then
   if s.status<>'review' or length(note) not between 10 and 1000 or coalesce((p_payload->>'confirmed')::boolean,false) is not true then raise exception 'stock_approval_required'; end if;
   if exists(select 1 from public.stock_count_lines where session_id=sid and (needs_recount or (s.count_type='full' and counted_qty is null and (expected_qty is null or expected_qty<>0 or review_qty is null or review_qty<>0)))) then raise exception 'stock_uncounted'; end if;
   lock table public.erp_articles in share mode;
   if s.count_type='full' and exists(select 1 from public.erp_article_classified c join public.erp_articles a on a.id=c.id where a.active and not a.missing_from_erp and (s.group_id is null or c.article_group_id=s.group_id) and (s.subgroup_id is null or c.article_subgroup_id=s.subgroup_id) and (case s.location when 'gentbrugge' then a.stock_gentbrugge when 'oudenaarde' then a.stock_oudenaarde else a.stock_antwerpen end)>0 and not exists(select 1 from public.stock_count_lines cl where cl.session_id=sid and cl.article_id=c.id)) then raise exception 'stock_scope_changed'; end if;
   if exists(select 1 from public.stock_count_lines cl left join public.erp_articles a on a.id=cl.article_id and not a.missing_from_erp where cl.session_id=sid and cl.counted_qty is not null and (cl.review_missing is distinct from (a.id is null) or cl.review_qty is distinct from case s.location when 'gentbrugge' then a.stock_gentbrugge when 'oudenaarde' then a.stock_oudenaarde else a.stock_antwerpen end)) then raise exception 'stock_erp_changed'; end if;
   update public.stock_count_sessions set status='approved',approved_at=now(),approved_by=p_actor,approval_note=note where id=sid;
   result:=jsonb_build_object('ok',true);
  elsif p_command='cancel' then
   if length(note)<5 then raise exception 'stock_note_required'; end if;
   update public.stock_count_sessions set status='cancelled',approval_note=note where id=sid;
   result:=jsonb_build_object('ok',true);
  end if;
  update public.stock_count_sessions set version=version+1 where id=sid and status not in ('approved','cancelled');
 end if;
 insert into public.stock_count_events(id,session_id,zone_id,article_id,round,command,kind,quantity,serial,code,reference_event,actor,note,payload_hash,result)
 values(rid,sid,zid,event_article,event_round,p_command,event_kind,event_quantity,event_serial,nullif(code,''),ref,p_actor,nullif(note,''),md5(p_payload::text),result);
 return result;
end $$;
revoke all on function public.stock_count_command(text,boolean,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.stock_count_command(text,boolean,text,jsonb) to service_role;