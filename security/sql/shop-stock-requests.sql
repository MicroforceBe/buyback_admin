-- Verwittigingen "Op aanvraag" (MacBook-modelpagina's van microforce.be): een klant vraagt een mail zodra een configuratie
-- (chip, werkgeheugen, opslag) in een van de gekozen staten (3 = Behoorlijk, 4 = Zeer goed, 5 = Als nieuw) terug op voorraad is. Eén rij per configuratie. Alleen service_role
-- (de publieke API van buyback-admin en de cron) leest en schrijft; geen toegang voor anon of authenticated.
-- Toepassen in de goedgekeurde omgeving. Geen backfill.
create table public.shop_stock_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (length(btrim(name)) between 1 and 100 and name !~ E'[\\r\\n<>]'),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  language text not null default 'nl' check (language in ('nl','fr','en')),
  collection_handle text not null check (collection_handle ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
  config_key text not null check (config_key ~ '^M[1-9]( Pro| Max)?/[0-9]{1,3}GB/[0-9]{1,4}(GB|TB)$'),
  config_label text not null check (length(config_label) between 1 and 120 and config_label !~ E'[\\r\\n<>]'),
  grades smallint[] not null default '{3,4,5}' check (grades <@ '{3,4,5}'::smallint[] and cardinality(grades) between 1 and 3),
  status text not null default 'open' check (status in ('open','notified','unsubscribed','expired')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '180 days',
  notified_at timestamptz,
  notified_handle text,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  -- Bewijs van toestemming: tijdstip en versie van de toestemmingstekst op het formulier (bv. nl-2026-11-12).
  consent_at timestamptz not null default now(),
  consent_version text not null default 'v1' check (consent_version ~ '^[a-z0-9.-]{1,24}$')
);
-- Eén open aanvraag per e-mailadres en configuratie; opnieuw aanvragen werkt de bestaande bij.
create unique index shop_stock_requests_open_uq on public.shop_stock_requests (lower(email), collection_handle, config_key) where status = 'open';
create index shop_stock_requests_status_idx on public.shop_stock_requests (status, collection_handle);
create index shop_stock_requests_token_idx on public.shop_stock_requests (token);
create index shop_stock_requests_ip_idx on public.shop_stock_requests (ip_hash, created_at) where ip_hash is not null;
alter table public.shop_stock_requests enable row level security;
revoke all on public.shop_stock_requests from public, anon, authenticated;
-- delete: de cron wist naam en e-mailadres 60 dagen na het afsluiten (verwittigd, uitgeschreven of vervallen).
grant select, insert, update, delete on public.shop_stock_requests to service_role;

-- Aanvraag registreren (publieke API). p_configs: [{"key":"M2/16GB/1TB","label":"M2 · 16 GB · 1 TB"}], hoogstens 12.
-- Begrenzing: hoogstens 10 aanvragen per IP-hash per uur en 30 rijen per e-mailadres per dag. Geeft het token terug
-- waarmee de klant zich uitschrijft (alle rijen van deze aanvraag krijgen het, ook bijgewerkte).
create function public.submit_shop_stock_request(p_name text, p_email text, p_language text, p_collection text,
  p_configs jsonb, p_grades smallint[], p_ip_hash text, p_consent_version text default 'v1') returns uuid
language plpgsql security invoker set search_path = '' as $$
declare tok uuid := gen_random_uuid(); c jsonb; n integer; em text := lower(btrim(coalesce(p_email,'')));
begin
  if jsonb_typeof(p_configs) <> 'array' or jsonb_array_length(p_configs) not between 1 and 12 then
    raise exception 'STOCK_REQUEST_INVALID';
  end if;
  if p_ip_hash is not null then
    select count(distinct token) into n from public.shop_stock_requests where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'STOCK_REQUEST_RATE_LIMIT'; end if;
  end if;
  select count(*) into n from public.shop_stock_requests where lower(email) = em and updated_at > now() - interval '1 day';
  if n + jsonb_array_length(p_configs) > 30 then raise exception 'STOCK_REQUEST_RATE_LIMIT'; end if;
  for c in select * from jsonb_array_elements(p_configs) loop
    insert into public.shop_stock_requests (name, email, language, collection_handle, config_key, config_label, grades, token, ip_hash, consent_at, consent_version)
    values (btrim(p_name), em, p_language, p_collection, c->>'key', c->>'label', p_grades, tok, p_ip_hash, now(), coalesce(p_consent_version, 'v1'))
    on conflict (lower(email), collection_handle, config_key) where status = 'open'
    do update set name = excluded.name, language = excluded.language, config_label = excluded.config_label,
      grades = excluded.grades, token = excluded.token, ip_hash = excluded.ip_hash,
      consent_at = excluded.consent_at, consent_version = excluded.consent_version,
      expires_at = now() + interval '180 days', updated_at = now();
  end loop;
  return tok;
end $$;
revoke all on function public.submit_shop_stock_request(text,text,text,text,jsonb,smallint[],text,text) from public, anon, authenticated;
grant execute on function public.submit_shop_stock_request(text,text,text,text,jsonb,smallint[],text,text) to service_role;

-- Bevestigingsmails begrenzen (tegen misbruik als spamkanaal): hoogstens 3 per e-mailadres per 24 uur en 100 in totaal
-- per uur. Het e-mailadres wordt alleen als SHA-256 bewaard; rijen ouder dan 2 dagen mogen weg (zie de cron).
create table public.shop_stock_mail_log (
  id bigint generated always as identity primary key,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz not null default now()
);
create index shop_stock_mail_log_idx on public.shop_stock_mail_log (email_hash, sent_at);
create index shop_stock_mail_log_time_idx on public.shop_stock_mail_log (sent_at);
alter table public.shop_stock_mail_log enable row level security;
revoke all on public.shop_stock_mail_log from public, anon, authenticated;
grant select, insert, delete on public.shop_stock_mail_log to service_role;

-- true = er mag een bevestigingsmail vertrekken (en die wordt meteen geteld); false = aanvraag bewaard, geen mail.
create function public.claim_shop_stock_confirmation(p_email text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare h text := encode(sha256(convert_to(lower(btrim(coalesce(p_email,''))), 'UTF8')), 'hex'); n integer;
begin
  perform pg_advisory_xact_lock(hashtext('shop_stock_mail_log'));
  select count(*) into n from public.shop_stock_mail_log where email_hash = h and sent_at > now() - interval '24 hours';
  if n >= 3 then return false; end if;
  select count(*) into n from public.shop_stock_mail_log where sent_at > now() - interval '1 hour';
  if n >= 100 then return false; end if;
  insert into public.shop_stock_mail_log (email_hash) values (h);
  return true;
end $$;
revoke all on function public.claim_shop_stock_confirmation(text) from public, anon, authenticated;
grant execute on function public.claim_shop_stock_confirmation(text) to service_role;
