-- Verwittigingen: optionele kleurkeuze (Olivier, 28 november 2026).
-- colors = [{"id": "144231301452", "name": "Groen"}, …]: het nummer van het kleurbolletje (custom.color_swatch) en de naam
-- zoals de klant ze zag. Leeg = elke kleur is goed. Het voorraadnazicht vergelijkt alleen op het nummer.
-- Toepassen: eerst op test, productie pas na "ja" van Olivier. De oude functie (8 parameters) wordt vervangen door een
-- versie met p_colors (standaard leeg), zodat de huidige code blijft werken tot de nieuwe uitgerold is.
alter table public.shop_stock_requests add column if not exists colors jsonb not null default '[]'::jsonb;
alter table public.shop_stock_requests drop constraint if exists shop_stock_requests_colors_check;
alter table public.shop_stock_requests add constraint shop_stock_requests_colors_check
  check (jsonb_typeof(colors) = 'array' and jsonb_array_length(colors) <= 12);

drop function if exists public.submit_shop_stock_request(text, text, text, text, jsonb, smallint[], text, text);
create or replace function public.submit_shop_stock_request(p_name text, p_email text, p_language text, p_collection text, p_configs jsonb, p_grades smallint[], p_ip_hash text, p_consent_version text default 'v1', p_colors jsonb default '[]'::jsonb)
 returns uuid
 language plpgsql
 set search_path to ''
as $function$
declare tok uuid := gen_random_uuid(); c jsonb; n integer; em text := lower(btrim(coalesce(p_email,''))); kl jsonb := coalesce(p_colors, '[]'::jsonb);
begin
  if jsonb_typeof(p_configs) <> 'array' or jsonb_array_length(p_configs) not between 1 and 12 then
    raise exception 'STOCK_REQUEST_INVALID';
  end if;
  if jsonb_typeof(kl) <> 'array' or jsonb_array_length(kl) > 12 then
    raise exception 'STOCK_REQUEST_INVALID';
  end if;
  if p_ip_hash is not null then
    select count(distinct token) into n from public.shop_stock_requests where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'STOCK_REQUEST_RATE_LIMIT'; end if;
  end if;
  select count(*) into n from public.shop_stock_requests where lower(email) = em and updated_at > now() - interval '1 day';
  if n + jsonb_array_length(p_configs) > 30 then raise exception 'STOCK_REQUEST_RATE_LIMIT'; end if;
  for c in select * from jsonb_array_elements(p_configs) loop
    insert into public.shop_stock_requests (name, email, language, collection_handle, config_key, config_label, grades, colors, token, ip_hash, consent_at, consent_version)
    values (btrim(p_name), em, p_language, p_collection, c->>'key', c->>'label', p_grades, kl, tok, p_ip_hash, now(), coalesce(p_consent_version, 'v1'))
    on conflict (lower(email), collection_handle, config_key) where status = 'open'
    do update set name = excluded.name, language = excluded.language, config_label = excluded.config_label,
      grades = excluded.grades, colors = excluded.colors, token = excluded.token, ip_hash = excluded.ip_hash,
      consent_at = excluded.consent_at, consent_version = excluded.consent_version,
      expires_at = now() + interval '180 days', updated_at = now();
  end loop;
  return tok;
end $function$;
revoke all on function public.submit_shop_stock_request(text, text, text, text, jsonb, smallint[], text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_shop_stock_request(text, text, text, text, jsonb, smallint[], text, text, jsonb) to service_role;
