-- Limiet op buyback-aanvragen per bezoeker (26/11/2026).
-- Bewaart alleen een gehashte sleutel (nooit het IP-adres zelf) en het tijdstip. Oude rijen (> 1 dag) worden bij elke
-- aanroep opgeruimd. Alleen de service role (server) mag dit gebruiken.
create table if not exists public.buyback_lead_attempts (
  id bigint generated always as identity primary key,
  key_hash text not null check (char_length(key_hash) between 16 and 128),
  created_at timestamptz not null default now()
);
create index if not exists buyback_lead_attempts_key_idx on public.buyback_lead_attempts(key_hash, created_at desc);
alter table public.buyback_lead_attempts enable row level security;
revoke all on public.buyback_lead_attempts from public, anon, authenticated;
grant select, insert, delete on public.buyback_lead_attempts to service_role;

-- true = aanvraag toegelaten (en geteld), false = limiet bereikt (niet geteld).
create or replace function public.buyback_lead_rate_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  if p_key is null or char_length(p_key) < 16 or p_max < 1 or p_window_seconds < 1 then
    raise exception 'invalid arguments';
  end if;
  delete from public.buyback_lead_attempts where created_at < now() - interval '1 day';
  select count(*) into n from public.buyback_lead_attempts
    where key_hash = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then
    return false;
  end if;
  insert into public.buyback_lead_attempts(key_hash) values (p_key);
  return true;
end $$;
revoke all on function public.buyback_lead_rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.buyback_lead_rate_hit(text, integer, integer) to service_role;
