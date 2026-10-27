-- Additive TEST preview. Imported ERP records remain authoritative and untouched.
create table public.erp_article_profiles (
 article_id uuid primary key references public.erp_articles(id) on delete restrict,
 display_name text check(char_length(display_name) between 1 and 250),
 ean text check(ean ~ '^([0-9]{8}|[0-9]{12,14})$'),
 brand text check(char_length(brand)<=100),
 model text check(char_length(model)<=150),
 category text check(char_length(category)<=100),
 product_type text check(product_type in ('device','part','accessory','other')),
 capacity_gb integer check(capacity_gb between 0 and 1048576),
 color text check(char_length(color)<=80),
 condition_grade text check(char_length(condition_grade)<=40),
 description text check(char_length(description)<=10000),
 specifications text check(char_length(specifications)<=10000),
 image_url text check(char_length(image_url)<=2000 and image_url ~ '^https://[^[:space:]]+$'),
 notes text check(char_length(notes)<=5000),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 updated_by text not null check(char_length(updated_by) between 1 and 320)
);
create table public.erp_article_profile_history (
 id uuid primary key default gen_random_uuid(),
 article_id uuid not null references public.erp_articles(id) on delete restrict,
 version integer not null,
 changed_at timestamptz not null default now(),
 changed_by text not null,
 before_data jsonb,
 after_data jsonb not null,
 unique(article_id,version)
);
alter table public.erp_article_profiles enable row level security;
alter table public.erp_article_profile_history enable row level security;
revoke all on public.erp_article_profiles,public.erp_article_profile_history from public,anon,authenticated;
revoke all on public.erp_article_profiles,public.erp_article_profile_history from service_role;
grant select,insert,update on public.erp_article_profiles to service_role;
grant select,insert on public.erp_article_profile_history to service_role;

create function public.save_erp_article_profile(p_article_id uuid,p_version integer,p_data jsonb,p_actor text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare old_row public.erp_article_profiles%rowtype; new_row public.erp_article_profiles%rowtype; next_version integer;
begin
 if p_version<0 or p_version is null or p_actor is null or length(trim(p_actor))=0 or length(p_actor)>320 then raise exception 'invalid_input'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_input'; end if;
 if exists(select 1 from jsonb_object_keys(p_data) k where k not in ('display_name','ean','brand','model','category','product_type','capacity_gb','color','condition_grade','description','specifications','image_url','notes')) then raise exception 'invalid_fields'; end if;
 -- Lock existing source row: serializes first creation as well as subsequent saves.
 perform 1 from public.erp_articles where id=p_article_id for update;
 if not found then raise exception 'article_not_found'; end if;
 select * into old_row from public.erp_article_profiles where article_id=p_article_id;
 if coalesce(old_row.version,0)<>p_version then raise exception 'profile_conflict'; end if;
 next_version:=p_version+1;
 select * into new_row from jsonb_populate_record(null::public.erp_article_profiles,p_data);
 insert into public.erp_article_profiles(article_id,display_name,ean,brand,model,category,product_type,capacity_gb,color,condition_grade,description,specifications,image_url,notes,version,updated_at,updated_by)
 values(p_article_id,new_row.display_name,new_row.ean,new_row.brand,new_row.model,new_row.category,new_row.product_type,new_row.capacity_gb,new_row.color,new_row.condition_grade,new_row.description,new_row.specifications,new_row.image_url,new_row.notes,next_version,now(),p_actor)
 on conflict(article_id) do update set display_name=excluded.display_name,ean=excluded.ean,brand=excluded.brand,model=excluded.model,category=excluded.category,product_type=excluded.product_type,capacity_gb=excluded.capacity_gb,color=excluded.color,condition_grade=excluded.condition_grade,description=excluded.description,specifications=excluded.specifications,image_url=excluded.image_url,notes=excluded.notes,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.erp_article_profile_history(article_id,version,changed_by,before_data,after_data)
 select p_article_id,next_version,p_actor,case when old_row.article_id is null then null else to_jsonb(old_row)-'updated_by' end,to_jsonb(p)-'updated_by' from public.erp_article_profiles p where article_id=p_article_id;
 return next_version;
end $$;
revoke all on function public.save_erp_article_profile(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_erp_article_profile(uuid,integer,jsonb,text) to service_role;

create view public.erp_article_overview with(security_invoker=true) as
select a.id,a.sku,a.title as source_title,coalesce(p.display_name,a.title) as title,
 coalesce(p.ean,a.ean) as ean,coalesce(p.brand,a.brand) as brand,coalesce(p.model,a.model) as model,
 coalesce(p.category,a.category) as category,p.product_type,coalesce(p.capacity_gb,a.capacity_gb) as capacity_gb,
 coalesce(p.color,a.color) as color,coalesce(p.condition_grade,a.condition_grade) as condition_grade,
 a.active,a.published,a.refurbished_product,a.vat_margin,a.inventory_qty,a.stock_gentbrugge,a.stock_oudenaarde,a.stock_antwerpen,
 a.price_cents,a.compare_price_cents,a.core_assortment,a.missing_from_erp,a.updated_at as source_updated_at,
 p.image_url,p.updated_at as profile_updated_at,coalesce(p.version,0) as profile_version
from public.erp_articles a left join public.erp_article_profiles p on p.article_id=a.id;
revoke all on public.erp_article_overview from public,anon,authenticated,service_role;
grant select on public.erp_article_overview to service_role;
notify pgrst,'reload schema';
