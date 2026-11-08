-- GTIN (EAN) per device model, shared by every quality grade of that model. Additive only.
-- model_key = the product title without the condition part (see modelKey in lib/marketing/merchantFeed.ts).
create table public.model_gtins(
 model_key text primary key check(length(model_key) between 3 and 200),
 gtin text not null check(gtin ~ '^([0-9]{8}|[0-9]{12,14})$'),
 source_url text check(source_url is null or (source_url ~ '^https://' and length(source_url)<=500)),
 note text check(note is null or length(note)<=300),
 updated_at timestamptz not null default now(),
 updated_by text not null
);
alter table public.model_gtins enable row level security;
revoke all on public.model_gtins from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.model_gtins to service_role;
