-- Shop customers (winkelbeheer fase 1). Additive only: new tables, one nullable column on buyback_leads.
-- Apply on the test project first, then on production (by a human).

create sequence public.shop_customer_number_seq start 1;

create table public.shop_customers(
 id uuid primary key default gen_random_uuid(),
 customer_number text not null unique default ('K'||lpad(nextval('public.shop_customer_number_seq')::text,6,'0')),
 customer_type text not null default 'private' check(customer_type in ('private','business')),
 first_name text not null default '' check(length(first_name)<=80),
 last_name text not null default '' check(length(last_name)<=80),
 company_name text not null default '' check(length(company_name)<=160),
 vat_number text check(vat_number is null or vat_number ~ '^[A-Z]{2}[0-9A-Z]{2,13}$'),
 email text check(email is null or (length(email)<=254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
 phone text check(phone is null or phone ~ '^\+?[0-9]{6,15}$'),
 street text not null default '' check(length(street)<=160),
 house_number text not null default '' check(length(house_number)<=20),
 postal_code text not null default '' check(length(postal_code)<=12),
 city text not null default '' check(length(city)<=80),
 country text not null default 'BE' check(country ~ '^[A-Z]{2}$'),
 preferred_shop_id uuid references public.buyback_shops(id) on delete set null,
 marketing_opt_in boolean not null default false,
 marketing_opt_in_at timestamptz,
 note text not null default '' check(length(note)<=4000),
 version integer not null default 1 check(version>0),
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by text not null,
 updated_by text not null,
 constraint shop_customers_identity check(
  (customer_type='private' and length(trim(first_name||last_name))>0)
  or (customer_type='business' and length(trim(company_name))>0)
 ),
 constraint shop_customers_contact check(email is not null or phone is not null)
);
create index shop_customers_email_idx on public.shop_customers(lower(email)) where email is not null;
create index shop_customers_phone_idx on public.shop_customers(phone) where phone is not null;
create index shop_customers_last_name_idx on public.shop_customers(lower(last_name));
create index shop_customers_company_idx on public.shop_customers(lower(company_name)) where company_name<>'';
create index shop_customers_vat_idx on public.shop_customers(vat_number) where vat_number is not null;
create index shop_customers_updated_idx on public.shop_customers(updated_at desc);

create table public.shop_customer_events(
 id bigint generated always as identity primary key,
 customer_id uuid not null references public.shop_customers(id) on delete cascade,
 event text not null check(event in ('created','updated','archived','restored','lead_linked')),
 actor text not null,
 changed_fields text[] not null default '{}',
 reference_id uuid,
 created_at timestamptz not null default now()
);
create index shop_customer_events_customer_idx on public.shop_customer_events(customer_id,created_at desc);

-- Ids of the customer in an accounting package (Odoo / Exact Online). Filled by the future connector.
create table public.shop_customer_external_refs(
 customer_id uuid not null references public.shop_customers(id) on delete cascade,
 provider text not null check(provider in ('odoo','exact')),
 external_id text check(external_id is null or length(external_id)<=100),
 sync_status text not null default 'pending' check(sync_status in ('pending','synced','failed')),
 synced_version integer,
 last_error text check(last_error is null or length(last_error)<=2000),
 synced_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(customer_id,provider)
);

alter table public.buyback_leads add column shop_customer_id uuid references public.shop_customers(id) on delete set null;
create index buyback_leads_shop_customer_idx on public.buyback_leads(shop_customer_id) where shop_customer_id is not null;

-- Audit trail is written by the database, so it cannot be skipped or forged by application code.
create function public.shop_customers_audit() returns trigger language plpgsql security definer set search_path=public as $$
declare fields text[];
begin
 if tg_op='INSERT' then
  insert into public.shop_customer_events(customer_id,event,actor) values(new.id,'created',new.created_by);
  return new;
 end if;
 select coalesce(array_agg(key order by key),'{}') into fields
 from jsonb_each(to_jsonb(new)) n
 where key not in ('version','updated_at','updated_by','created_at','created_by','archived_at')
   and n.value is distinct from (to_jsonb(old)->key);
 if old.archived_at is null and new.archived_at is not null then
  insert into public.shop_customer_events(customer_id,event,actor) values(new.id,'archived',new.updated_by);
 elsif old.archived_at is not null and new.archived_at is null then
  insert into public.shop_customer_events(customer_id,event,actor) values(new.id,'restored',new.updated_by);
 end if;
 if cardinality(fields)>0 then
  insert into public.shop_customer_events(customer_id,event,actor,changed_fields) values(new.id,'updated',new.updated_by,fields);
 end if;
 return new;
end $$;
create trigger shop_customers_audit after insert or update on public.shop_customers
 for each row execute function public.shop_customers_audit();

-- Link a buyback lead to a customer atomically, with an audit event. Refuses archived customers.
-- The customer row is locked for the duration of the link, so a concurrent archive waits and
-- cannot leave a lead linked to a customer that was archived in between.
create or replace function public.shop_customer_link_lead(p_customer uuid,p_lead uuid,p_actor text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_actor is null or length(trim(p_actor))=0 then raise exception 'SHOP_CUSTOMER_ACTOR_REQUIRED'; end if;
 perform 1 from public.shop_customers where id=p_customer and archived_at is null for update;
 if not found then raise exception 'SHOP_CUSTOMER_NOT_AVAILABLE'; end if;
 update public.buyback_leads set shop_customer_id=p_customer where id=p_lead and shop_customer_id is null;
 if not found then raise exception 'SHOP_CUSTOMER_LEAD_NOT_LINKABLE'; end if;
 insert into public.shop_customer_events(customer_id,event,actor,reference_id) values(p_customer,'lead_linked',p_actor,p_lead);
end $$;

alter table public.shop_customers enable row level security;
alter table public.shop_customer_events enable row level security;
alter table public.shop_customer_external_refs enable row level security;
revoke all on public.shop_customers,public.shop_customer_events,public.shop_customer_external_refs from public,anon,authenticated,service_role;
revoke all on sequence public.shop_customer_number_seq from public,anon,authenticated,service_role;
grant select,insert,update on public.shop_customers to service_role;
grant select on public.shop_customer_events to service_role;
grant select,insert,update on public.shop_customer_external_refs to service_role;
grant usage on sequence public.shop_customer_number_seq to service_role;
revoke all on function public.shop_customers_audit() from public,anon,authenticated;
revoke all on function public.shop_customer_link_lead(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.shop_customer_link_lead(uuid,uuid,text) to service_role;
