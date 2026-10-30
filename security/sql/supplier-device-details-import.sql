alter table public.refurb_suppliers add column if not exists csv_import_format text;
alter table public.refurb_suppliers add constraint refurb_supplier_csv_format_check check(csv_import_format is null or csv_import_format='device_details_v1');
create table public.refurb_csv_imports (
 request_id uuid primary key,
 reception_id uuid not null unique references public.refurb_receptions(id) on delete cascade,
 fingerprint text not null,
 format text not null check(format='device_details_v1'),
 item_count integer not null check(item_count between 1 and 1000),
 total_cents bigint not null check(total_cents>=0),
 created_by text not null,
 created_at timestamptz not null default now()
);
alter table public.refurb_csv_imports enable row level security;
revoke all on public.refurb_csv_imports from public,anon,authenticated;
grant select,insert on public.refurb_csv_imports to service_role;
create function public.import_refurb_supplier_csv(p_request uuid,p_actor text,p_data jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.refurb_suppliers%rowtype; v_id uuid; prior public.refurb_csv_imports%rowtype;
 v_status public.refurb_status_options%rowtype; v_location text; v_role text; v_days int; v_date date;
 v_fingerprint text:=md5(p_data::text); v_count int; v_total bigint; v_existing int;
begin
 if p_request is null or p_actor is null or btrim(p_actor)='' then raise exception 'IMPORT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('refurb_csv_import',0));
 select * into prior from public.refurb_csv_imports where request_id=p_request;
 if found then
  if prior.fingerprint<>v_fingerprint or prior.created_by<>p_actor then raise exception 'IMPORT_REPLAY_MISMATCH';end if;
  return prior.reception_id;
 end if;
 select role into v_role from public.buyback_admin_users where lower(email)=lower(p_actor) and is_active=true;
 if v_role is null then raise exception 'IMPORT_ACTOR';end if;
 if p_data->>'format' is distinct from 'device_details_v1' or jsonb_typeof(p_data->'items') is distinct from 'array' then raise exception 'IMPORT_INVALID';end if;
 v_count:=jsonb_array_length(p_data->'items');if v_count<1 or v_count>1000 then raise exception 'IMPORT_INVALID';end if;
 if coalesce(p_data->>'reception_number','') !~ '^[A-Za-z0-9_-]{1,100}$' or coalesce(p_data->>'invoice','')='' or length(p_data->>'invoice')>100 or p_data->>'vat_scheme' not in ('margin','normal') or p_data->>'vat_scheme' is null then raise exception 'IMPORT_INVALID';end if;
 v_date:=(p_data->>'date')::date;if v_date is null then raise exception 'IMPORT_INVALID';end if;
 select * into s from public.refurb_suppliers where id=(p_data->>'supplier_id')::uuid for update;
 if not found then raise exception 'IMPORT_SUPPLIER';end if;
 if s.csv_import_format is not null and s.csv_import_format<>p_data->>'format' then raise exception 'IMPORT_FORMAT';end if;
 if exists(select 1 from public.refurb_receptions where reception_number=p_data->>'reception_number') then raise exception 'IMPORT_RECEPTION_EXISTS';end if;
 if exists(select 1 from public.refurb_receptions where supplier_id=s.id and supplier_invoice_nr=p_data->>'invoice') then raise exception 'IMPORT_INVOICE_EXISTS';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'items') x where jsonb_typeof(x) is distinct from 'object' or coalesce(x->>'imei_sn','') !~ '^[A-Za-z0-9-]{3,100}$' or coalesce(x->>'description','')='' or length(x->>'description')>2000 or coalesce(x->>'price_cents','') !~ '^[0-9]{1,10}$' or (x->>'price_cents')::bigint>2147483647) then raise exception 'IMPORT_ITEMS_INVALID';end if;
 if (select count(distinct upper(x->>'imei_sn')) from jsonb_array_elements(p_data->'items') x)<>v_count then raise exception 'IMPORT_DUPLICATE_DEVICE';end if;
 select count(*) into v_existing from public.refurb_reception_items i join jsonb_array_elements(p_data->'items') x on upper(btrim(i.imei_sn))=upper(x->>'imei_sn');
 if v_existing>0 then raise exception 'IMPORT_DEVICE_EXISTS';end if;
 select * into v_status from public.refurb_status_options where lower(value)='new';
 if not found or v_status.need_sku or v_status.admin_only and lower(v_role)<>'admin' then raise exception 'IMPORT_INITIAL_STATUS';end if;
 if exists(select 1 from public.refurb_status_transitions where from_status_id=v_status.id) is false then raise exception 'IMPORT_INITIAL_STATUS';end if;
 select value into v_location from public.refurb_location_options where is_default order by sort_order,id limit 1;
 v_days:=s.rma_expiry_days;
 if coalesce((p_data->>'save_profile')::boolean,false) and lower(v_role)<>'admin' then raise exception 'IMPORT_PROFILE_ADMIN';end if;
 insert into public.refurb_receptions(reception_number,reception_date,supplier_id,supplier,vat_scheme,supplier_invoice_nr,rma_expiry_days,rma_expiry_date)
 values(p_data->>'reception_number',v_date,s.id,s.name,p_data->>'vat_scheme',p_data->>'invoice',v_days,v_date+v_days) returning id into v_id;
 insert into public.refurb_reception_items(reception_id,row_index,refurb_status,location,imei_sn,description,price_cents)
 select v_id,(ord-1)::int,v_status.value,v_location,x->>'imei_sn',x->>'description',(x->>'price_cents')::int from jsonb_array_elements(p_data->'items') with ordinality t(x,ord);
 select sum((x->>'price_cents')::bigint) into v_total from jsonb_array_elements(p_data->'items') x;
 insert into public.refurb_csv_imports(request_id,reception_id,fingerprint,format,item_count,total_cents,created_by)
 values(p_request,v_id,v_fingerprint,p_data->>'format',v_count,v_total,p_actor);
 if coalesce((p_data->>'save_profile')::boolean,false) then update public.refurb_suppliers set csv_import_format='device_details_v1',updated_at=now() where id=s.id;end if;
 return v_id;
end $$;
revoke all on function public.import_refurb_supplier_csv(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.import_refurb_supplier_csv(uuid,text,jsonb) to service_role;
