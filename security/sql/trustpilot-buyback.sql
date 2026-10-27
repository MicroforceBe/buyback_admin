-- Apply only in the approved environment. No backfill of historical done leads.
create table public.buyback_trustpilot_config (
  id boolean primary key default true check(id),
  mode text not null default 'preview' check(mode in ('disabled','preview','live')),
  afs_email text not null default 'microforce.be+10c2ba8b1d@invite.trustpilot.com'
    check(afs_email='microforce.be+10c2ba8b1d@invite.trustpilot.com'),
  delay_days integer not null default 7 check(delay_days=7)
);
insert into public.buyback_trustpilot_config(id) values(true);
create table public.buyback_trustpilot_invitations (
  lead_id uuid primary key references public.buyback_leads(id) on delete restrict,
  reference_id text not null,
  recipient_name text not null,
  recipient_email text not null,
  completed_at timestamptz not null default now(),
  expected_invite_at timestamptz not null,
  mode text not null check(mode in ('preview','live')),
  afs_email text not null,
  delay_days integer not null check(delay_days=7),
  status text not null check(status in ('preview','blocked','queued','sending','submitted','failed','uncertain')),
  error_code text,
  first_attempt_at timestamptz,
  submitted_at timestamptz,
  provider_id text,
  envelope jsonb,
  attempt_token uuid,
  updated_at timestamptz not null default now()
);
create index buyback_trustpilot_completed_idx on public.buyback_trustpilot_invitations(completed_at desc,lead_id);
alter table public.buyback_trustpilot_config enable row level security;
alter table public.buyback_trustpilot_invitations enable row level security;
revoke all on public.buyback_trustpilot_config, public.buyback_trustpilot_invitations from public, anon, authenticated;
grant select on public.buyback_trustpilot_config to service_role;
grant select, insert, update on public.buyback_trustpilot_invitations to service_role;

create function public.capture_buyback_trustpilot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare cfg public.buyback_trustpilot_config%rowtype; nm text; em text; ref text; valid boolean;
begin
  select * into cfg from public.buyback_trustpilot_config where id=true;
  if not found or cfg.mode='disabled' then return new; end if;
  nm := coalesce(nullif(btrim(concat_ws(' ',new.first_name,new.last_name)),''),btrim(new.customer_name),'');
  em := btrim(coalesce(new.email,''));
  ref := coalesce(nullif(btrim(new.order_code),''),new.id::text);
  valid := em ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' and length(em)<=254
    and nm<>'' and length(nm)<=250 and length(ref)<=250 and ref !~ E'[\r\n]';
  insert into public.buyback_trustpilot_invitations(lead_id,reference_id,recipient_name,recipient_email,completed_at,expected_invite_at,mode,afs_email,delay_days,status,error_code)
  values(new.id,ref,nm,em,now(),now()+make_interval(days=>cfg.delay_days),cfg.mode,cfg.afs_email,cfg.delay_days,
    case when not valid then 'blocked' when cfg.mode='preview' then 'preview' else 'queued' end,
    case when not valid then 'invalid_customer' else null end)
  on conflict(lead_id) do nothing;
  return new;
end $$;
revoke all on function public.capture_buyback_trustpilot() from public,anon,authenticated;
grant execute on function public.capture_buyback_trustpilot() to service_role;
create trigger capture_buyback_trustpilot after update of status on public.buyback_leads
for each row when(old.status is distinct from 'done' and new.status='done') execute function public.capture_buyback_trustpilot();

-- Only an existing, never-sent registration can refresh customer details. No historical enqueue endpoint.
create function public.refresh_buyback_trustpilot(p_lead_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare l public.buyback_leads%rowtype; q public.buyback_trustpilot_invitations%rowtype; nm text; em text; ref text; valid boolean;
begin
  select * into l from public.buyback_leads where id=p_lead_id for update;
  select * into q from public.buyback_trustpilot_invitations where lead_id=p_lead_id for update;
  if not found or l.status<>'done' or q.first_attempt_at is not null or q.status not in ('preview','blocked','queued') then
    raise exception 'TRUSTPILOT_REFRESH_NOT_ALLOWED';
  end if;
  nm := coalesce(nullif(btrim(concat_ws(' ',l.first_name,l.last_name)),''),btrim(l.customer_name),'');
  em := btrim(coalesce(l.email,'')); ref := coalesce(nullif(btrim(l.order_code),''),l.id::text);
  valid := em ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$' and length(em)<=254
    and nm<>'' and length(nm)<=250 and length(ref)<=250 and ref !~ E'[\r\n]';
  update public.buyback_trustpilot_invitations set recipient_name=nm,recipient_email=em,reference_id=ref,
    status=case when not valid then 'blocked' when q.mode='preview' then 'preview' else 'queued' end,
    error_code=case when not valid then 'invalid_customer' else null end,updated_at=now() where lead_id=p_lead_id;
end $$;
revoke all on function public.refresh_buyback_trustpilot(uuid) from public,anon,authenticated;
grant execute on function public.refresh_buyback_trustpilot(uuid) to service_role;
