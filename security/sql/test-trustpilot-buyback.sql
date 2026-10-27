-- Execute inside BEGIN/ROLLBACK, after the schema, using service_role. Synthetic only.
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); n integer;
begin
  insert into public.buyback_leads(id,status,model,email,first_name,last_name,order_code,base_price_cents,final_price_cents) values
    (a,'check_passed','TEST Trustpilot','test@example.invalid','TEST','Valid','TEST-TP-SQL-A',10000,10000),
    (b,'check_passed','TEST Trustpilot',null,'TEST','Missing','TEST-TP-SQL-B',10000,10000),
    (c,'done','TEST Trustpilot','historical@example.invalid','TEST','Historical','TEST-TP-SQL-C',10000,10000),
    (d,'new','TEST Trustpilot','new@example.invalid','TEST','New','TEST-TP-SQL-D',10000,10000);
  if exists(select 1 from public.buyback_trustpilot_invitations where lead_id in (a,b,c,d)) then raise exception 'Insert/historical captured'; end if;
  update public.buyback_leads set status='cancelled' where id=d;
  if exists(select 1 from public.buyback_trustpilot_invitations where lead_id=d) then raise exception 'Non-final captured'; end if;
  update public.buyback_leads set status='done' where id in (a,b);
  if not exists(select 1 from public.buyback_trustpilot_invitations where lead_id=a and status='preview' and mode='preview' and delay_days=7 and recipient_name='TEST Valid' and expected_invite_at=completed_at+interval '7 days') then raise exception 'Valid snapshot/delay failed'; end if;
  if not exists(select 1 from public.buyback_trustpilot_invitations where lead_id=b and status='blocked') then raise exception 'Missing email not blocked'; end if;
  update public.buyback_leads set status='done' where id=a;
  update public.buyback_leads set status='done',email='changed@example.invalid' where id=a;
  select count(*) into n from public.buyback_trustpilot_invitations where lead_id=a;
  if n<>1 or not exists(select 1 from public.buyback_trustpilot_invitations where lead_id=a and recipient_email='test@example.invalid') then raise exception 'Dedup/frozen snapshot failed'; end if;
  update public.buyback_leads set email='fixed@example.invalid' where id=b;
  perform public.refresh_buyback_trustpilot(b);
  if not exists(select 1 from public.buyback_trustpilot_invitations where lead_id=b and status='preview' and recipient_email='fixed@example.invalid') then raise exception 'Correction failed'; end if;
  begin perform public.refresh_buyback_trustpilot(c); raise exception 'Historical refresh accepted'; exception when raise_exception then if sqlerrm <> 'TRUSTPILOT_REFRESH_NOT_ALLOWED' then raise; end if; end;
  begin perform public.refresh_buyback_trustpilot(d); raise exception 'Cancelled refresh accepted'; exception when raise_exception then if sqlerrm <> 'TRUSTPILOT_REFRESH_NOT_ALLOWED' then raise; end if; end;
  update public.buyback_trustpilot_invitations set mode='live',status='submitted',first_attempt_at=now(),provider_id='synthetic-only' where lead_id=a;
  begin perform public.refresh_buyback_trustpilot(a); raise exception 'Submitted refresh accepted'; exception when raise_exception then if sqlerrm <> 'TRUSTPILOT_REFRESH_NOT_ALLOWED' then raise; end if; end;
  if has_table_privilege('anon','public.buyback_trustpilot_invitations','SELECT') or has_table_privilege('authenticated','public.buyback_trustpilot_invitations','UPDATE')
     or has_function_privilege('anon','public.refresh_buyback_trustpilot(uuid)','EXECUTE') then raise exception 'Public access'; end if;
end $$;
