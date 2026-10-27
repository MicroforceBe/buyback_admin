-- Transactional regression; no provider/network calls and no real recipient data.
insert into public.buyback_leads(source,model,email,first_name,last_name,order_code,base_price_cents,final_price_cents,status)
values('trustpilot_e2e_test','TEST Device','authorized@example.invalid','TEST','Authorized','TEST-TRUSTPILOT-E2E-20261027',10000,10000,'check_passed'),
('trustpilot_preview','TEST Device','other@example.invalid','TEST','Other','TEST-TP-ONEOFF-OTHER',10000,10000,'check_passed');
insert into public.buyback_trustpilot_test_authorization(id,lead_id,recipient_email,expires_at)
select true,id,email,now()+interval '1 hour' from public.buyback_leads where order_code='TEST-TRUSTPILOT-E2E-20261027';
set local role service_role;
update public.buyback_leads set status='done' where order_code in ('TEST-TRUSTPILOT-E2E-20261027','TEST-TP-ONEOFF-OTHER');
do $$ begin
 if not exists(select 1 from public.buyback_trustpilot_invitations where reference_id='TEST-TRUSTPILOT-E2E-20261027' and mode='test' and status='queued' and test_send_at=expected_invite_at and test_send_at=completed_at+interval '3 minutes') then raise exception 'Single test override failed';end if;
 if not exists(select 1 from public.buyback_trustpilot_invitations where reference_id='TEST-TP-ONEOFF-OTHER' and mode='preview' and status='preview' and test_send_at is null and expected_invite_at=completed_at+interval '7 days') then raise exception 'Ordinary preview affected';end if;
 if has_table_privilege('anon','public.buyback_trustpilot_test_authorization','select') or has_table_privilege('authenticated','public.buyback_trustpilot_test_authorization','update') or has_table_privilege('service_role','public.buyback_trustpilot_test_authorization','insert') then raise exception 'Authorization can be granted publicly';end if;
end $$;
update public.buyback_leads set status='done' where order_code='TEST-TRUSTPILOT-E2E-20261027';
do $$ begin if(select count(*) from public.buyback_trustpilot_invitations where reference_id='TEST-TRUSTPILOT-E2E-20261027')<>1 then raise exception 'Duplicate test';end if;end $$;
reset role;
