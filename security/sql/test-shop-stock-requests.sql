-- Execute inside BEGIN/ROLLBACK, after the schema, using service_role. Synthetic only.
do $$
declare t1 uuid; t2 uuid; n integer; i integer;
begin
  t1 := public.submit_shop_stock_request('TEST Klant', ' Test@Example.invalid ', 'nl', 'refurbished-macbook-air-13-m2',
    '[{"key":"M2/16GB/1TB","label":"M2 · 16 GB · 1 TB"},{"key":"M2/8GB/256GB","label":"M2 · 8 GB · 256 GB"}]'::jsonb, '{4,5}'::smallint[], repeat('a',64));
  select count(*) into n from public.shop_stock_requests where token = t1 and email = 'test@example.invalid' and status = 'open' and grades = '{4,5}';
  if n <> 2 then raise exception 'Insert failed (%)', n; end if;
  -- Opnieuw aanvragen: zelfde rij bijgewerkt, nieuw token.
  t2 := public.submit_shop_stock_request('TEST Klant', 'test@example.invalid', 'fr', 'refurbished-macbook-air-13-m2',
    '[{"key":"M2/16GB/1TB","label":"M2 · 16 Go · 1 To"}]'::jsonb, '{5}'::smallint[], repeat('a',64));
  select count(*) into n from public.shop_stock_requests where lower(email) = 'test@example.invalid';
  if n <> 2 then raise exception 'Duplicate open request (%)', n; end if;
  if not exists (select 1 from public.shop_stock_requests where token = t2 and config_key = 'M2/16GB/1TB' and language = 'fr' and grades = '{5}') then raise exception 'Update failed'; end if;
  if not exists (select 1 from public.shop_stock_requests where token = t1 and consent_version = 'v1' and consent_at is not null) then raise exception 'Consent proof missing'; end if;
  -- Na verwittiging mag een nieuwe open aanvraag.
  update public.shop_stock_requests set status = 'notified', notified_at = now() where token = t2;
  perform public.submit_shop_stock_request('TEST Klant', 'test@example.invalid', 'nl', 'refurbished-macbook-air-13-m2',
    '[{"key":"M2/16GB/1TB","label":"M2 · 16 GB · 1 TB"}]'::jsonb, '{3,4,5}'::smallint[], null);
  select count(*) into n from public.shop_stock_requests where lower(email) = 'test@example.invalid' and config_key = 'M2/16GB/1TB';
  if n <> 2 then raise exception 'Re-request after notify failed'; end if;
  -- Ongeldige invoer.
  begin perform public.submit_shop_stock_request('X', 'x@example.invalid', 'nl', 'h', '[]'::jsonb, '{3,4,5}'::smallint[], null); raise exception 'Empty accepted';
  exception when raise_exception then if sqlerrm <> 'STOCK_REQUEST_INVALID' then raise; end if; end;
  begin perform public.submit_shop_stock_request('X', 'x@example.invalid', 'nl', 'h', '[{"key":"<script>","label":"x"}]'::jsonb, '{3,4,5}'::smallint[], null); raise exception 'Bad key accepted';
  exception when check_violation then null; end;
  begin perform public.submit_shop_stock_request('X', 'geen-mail', 'nl', 'h', '[{"key":"M1/8GB/256GB","label":"x"}]'::jsonb, '{3,4,5}'::smallint[], null); raise exception 'Bad email accepted';
  exception when check_violation then null; end;
  begin perform public.submit_shop_stock_request('X', 'x@example.invalid', 'nl', 'h', '[{"key":"M1/8GB/256GB","label":"x"}]'::jsonb, '{2}'::smallint[], null); raise exception 'Bad grade accepted';
  exception when check_violation then null; end;
  -- Begrenzing per IP-hash: de 11e aanvraag binnen het uur wordt geweigerd.
  for i in 1..10 loop
    perform public.submit_shop_stock_request('R', 'rate' || i || '@example.invalid', 'nl', 'h', '[{"key":"M1/8GB/256GB","label":"x"}]'::jsonb, '{3,4,5}'::smallint[], repeat('b',64));
  end loop;
  begin perform public.submit_shop_stock_request('R', 'rate11@example.invalid', 'nl', 'h', '[{"key":"M1/8GB/256GB","label":"x"}]'::jsonb, '{3,4,5}'::smallint[], repeat('b',64)); raise exception 'IP limit not enforced';
  exception when raise_exception then if sqlerrm <> 'STOCK_REQUEST_RATE_LIMIT' then raise; end if; end;
  if has_table_privilege('anon','public.shop_stock_requests','SELECT') or has_table_privilege('authenticated','public.shop_stock_requests','INSERT')
     or has_function_privilege('anon','public.submit_shop_stock_request(text,text,text,text,jsonb,smallint[],text,text)','EXECUTE') then raise exception 'Public access'; end if;
end $$;
do $$
declare i integer; ok boolean;
begin
  for i in 1..3 loop
    if not public.claim_shop_stock_confirmation(' Limiet@Example.invalid') then raise exception 'Claim % refused', i; end if;
  end loop;
  if public.claim_shop_stock_confirmation('limiet@example.invalid') then raise exception 'Fourth confirmation allowed'; end if;
  if not public.claim_shop_stock_confirmation('ander@example.invalid') then raise exception 'Other address refused'; end if;
  if exists (select 1 from public.shop_stock_mail_log where email_hash !~ '^[0-9a-f]{64}$') then raise exception 'Plain email stored'; end if;
  insert into public.shop_stock_mail_log (email_hash) select repeat('c', 64) from generate_series(1, 100);
  if public.claim_shop_stock_confirmation('nieuw@example.invalid') then raise exception 'Hourly brake not enforced'; end if;
  if has_function_privilege('anon','public.claim_shop_stock_confirmation(text)','EXECUTE') or has_table_privilege('anon','public.shop_stock_mail_log','SELECT') then raise exception 'Public access'; end if;
end $$;
