-- Execute inside BEGIN/ROLLBACK, after shop-customers.sql and the function definitions of
-- shop-customers-import-leads.sql (without its final SELECT). Synthetic data only.
do $$
declare
 existing_g uuid; existing_x uuid; archived_z uuid; r jsonb; r2 jsonb; c record; n integer;
begin
 insert into public.shop_customers(customer_type,first_name,email,customer_number,created_by,updated_by)
  values('private','Bestaand','import-g@example.invalid','80000009','fixture','fixture') returning id into existing_g;
 insert into public.shop_customers(customer_type,first_name,email,customer_number,created_by,updated_by)
  values('private','Bezet','import-x@example.invalid','70000005','fixture','fixture') returning id into existing_x;

 insert into public.shop_customers(customer_type,first_name,email,customer_number,archived_at,created_by,updated_by)
  values('private','Gearchiveerd','import-z@example.invalid','80000010',now(),'fixture','fixture') returning id into archived_z;

 insert into public.buyback_leads(status,model,order_code,base_price_cents,final_price_cents,email,first_name,last_name,phone,country,customer_number,created_at) values
  ('done','TEST','TEST-IMP-I1',1,1,'import-i@example.invalid','Ida','Iota',null,'BE','70000011',now()-interval '20 days'),
  ('done','TEST','TEST-IMP-I2',1,1,'import-i@example.invalid','Ida','Iota',null,'BE','70000012',now()-interval '2 days'),
  ('done','TEST','TEST-IMP-J1',1,1,'import-j@example.invalid','Jan','Kappa',null,'BE','70000011',now()-interval '6 days'),
  ('done','TEST','TEST-IMP-Z1',1,1,'import-z@example.invalid','Zoe','Zeta',null,'BE','80000010',now()-interval '6 days'),
  ('done','TEST','TEST-IMP-A1',1,1,'Import-A@Example.invalid','Anna','Alfa','0470 12 34 56','BE','70000001',now()-interval '30 days'),
  ('done','TEST','TEST-IMP-A2',1,1,'import-a@example.invalid','Anna','Alfa-Nieuw','0470 12 34 56','BE','70000001',now()-interval '1 day'),
  ('done','TEST','TEST-IMP-B1',1,1,'import-b@example.invalid','Bert','Beta',null,'BE','70000002',now()-interval '20 days'),
  ('cancelled','TEST','TEST-IMP-B2',1,1,'import-b@example.invalid','Bert','Beta',null,'BE','70000003',now()-interval '2 days'),
  ('done','TEST','TEST-IMP-C1',1,1,'import-c@example.invalid','Carl','Gamma',null,'BE','70000004',now()-interval '10 days'),
  ('done','TEST','TEST-IMP-C2',1,1,'import-c@example.invalid','Carl','Gamma',null,'BE','70000004',now()-interval '9 days'),
  ('done','TEST','TEST-IMP-D1',1,1,'import-d@example.invalid','Dana','Delta',null,'BE','70000004',now()-interval '1 day'),
  ('done','TEST','TEST-IMP-E1',1,1,'import-e@example.invalid','Eva','Epsilon','+31 (0)6 12345678','NL','open',now()-interval '5 days'),
  ('new','TEST','TEST-IMP-F1',1,1,'import-f@example.invalid',null,null,'12','BE','mail gestuurd 01/04',now()-interval '4 days'),
  ('done','TEST','TEST-IMP-G1',1,1,'import-g@example.invalid','Gert','Bestaand',null,'BE','70000006',now()-interval '3 days'),
  ('done','TEST','TEST-IMP-H1',1,1,'import-h@example.invalid','Hans','Eta',null,'BE','70000005',now()-interval '3 days');
 update public.buyback_leads set customer_name='Fien Zonder Voornaam' where order_code='TEST-IMP-F1';

 r := public.shop_customers_import_from_leads();

 -- A: two leads, same number, e-mail case differs -> one customer with the number, profile of latest lead.
 select * into c from public.shop_customers where lower(email)='import-a@example.invalid';
 if c.customer_number<>'70000001' or c.review_note is not null or c.last_name<>'Alfa-Nieuw' or c.phone<>'+32470123456'
    or c.created_by<>'import:buyback-leads' or c.marketing_opt_in then raise exception 'Case A failed'; end if;
 if (select count(*) from public.shop_customers where lower(email)='import-a@example.invalid')<>1 then raise exception 'Case A duplicated'; end if;
 if c.created_at > now()-interval '29 days' then raise exception 'Case A created_at not from first lead'; end if;
 if c.email<>'import-a@example.invalid' then raise exception 'Case A e-mail not lowercased'; end if;

 -- I/J: a number shared on an older lead is still ambiguous; both customers are marked, J keeps its number.
 select * into c from public.shop_customers where email='import-i@example.invalid';
 if c.customer_number<>'70000012' or c.review_note !~ '70000011, 70000012' or c.review_note !~ 'ook gevonden op leads van een andere klant' then raise exception 'Case I failed: %', row_to_json(c); end if;
 select * into c from public.shop_customers where email='import-j@example.invalid';
 if c.customer_number<>'70000011' or c.review_note !~ 'ook gevonden op leads van een andere klant' then raise exception 'Case J failed: %', row_to_json(c); end if;

 -- Z: e-mail only known as an archived customer -> new active customer, lead linked, archive untouched.
 if (select count(*) from public.shop_customers where email='import-z@example.invalid' and archived_at is null)<>1 then raise exception 'Case Z no active customer'; end if;
 if (select shop_customer_id from public.buyback_leads where order_code='TEST-IMP-Z1') = archived_z then raise exception 'Case Z linked to archive'; end if;
 select * into c from public.shop_customers where email='import-z@example.invalid' and archived_at is null;
 if c.customer_number is not null or c.review_note !~ 'bestaande klant' then raise exception 'Case Z number taken from archive: %', row_to_json(c); end if;
 if (select customer_number from public.shop_customers where id=archived_z)<>'80000010' then raise exception 'Case Z archive changed'; end if;

 -- B: two different numbers -> latest number, marked for review; cancelled lead also imported.
 select * into c from public.shop_customers where email='import-b@example.invalid';
 if c.customer_number<>'70000003' or c.review_note !~ '70000002, 70000003' then raise exception 'Case B failed'; end if;

 -- C/D: same number on two customers -> C (more leads) keeps it, D gets none; both marked.
 select * into c from public.shop_customers where email='import-c@example.invalid';
 if c.customer_number<>'70000004' or c.review_note is null then raise exception 'Case C failed'; end if;
 select * into c from public.shop_customers where email='import-d@example.invalid';
 if c.customer_number is not null or c.review_note !~ 'niet overgenomen' then raise exception 'Case D failed'; end if;

 -- E: "open" is not a number; NL phone with (0) normalised.
 select * into c from public.shop_customers where email='import-e@example.invalid';
 if c.customer_number is not null or c.review_note is not null or c.phone<>'+31612345678' or c.country<>'NL' then raise exception 'Case E failed'; end if;

 -- F: name only in customer_name, unusable phone dropped, note in number field ignored.
 select * into c from public.shop_customers where email='import-f@example.invalid';
 if c.last_name<>'Fien Zonder Voornaam' or c.phone is not null or c.customer_number is not null then raise exception 'Case F failed'; end if;

 -- G: existing customer reused and untouched; no second customer.
 if (select count(*) from public.shop_customers where lower(email)='import-g@example.invalid')<>1 then raise exception 'Case G duplicated'; end if;
 if (select customer_number from public.shop_customers where id=existing_g)<>'80000009' then raise exception 'Case G overwritten'; end if;
 if (select shop_customer_id from public.buyback_leads where order_code='TEST-IMP-G1')<>existing_g then raise exception 'Case G not linked'; end if;

 -- H: number already owned by an existing customer is not taken over.
 select * into c from public.shop_customers where email='import-h@example.invalid';
 if c.customer_number is not null or c.review_note !~ 'bestaande klant' then raise exception 'Case H failed'; end if;
 if (select customer_number from public.shop_customers where id=existing_x)<>'70000005' then raise exception 'Case H overwritten'; end if;

 -- Every fixture lead is linked with a history event and the creation is audited.
 if exists(select 1 from public.buyback_leads where order_code like 'TEST-IMP-%' and shop_customer_id is null) then raise exception 'Lead not linked'; end if;
 select count(*) into n from public.shop_customer_events e join public.buyback_leads l on l.id=e.reference_id
  where l.order_code like 'TEST-IMP-%' and e.event='lead_linked' and e.actor='import:buyback-leads';
 if n<>15 then raise exception 'Expected 15 link events, got %', n; end if;
 if not exists(select 1 from public.shop_customer_events e join public.shop_customers s on s.id=e.customer_id
  where s.email='import-a@example.invalid' and e.event='created') then raise exception 'Creation not audited'; end if;

 -- Running again changes nothing.
 r2 := public.shop_customers_import_from_leads();
 if (r2->>'customers_created')::int<>0 or (r2->>'leads_linked')::int<>0 then raise exception 'Second run not idempotent: %', r2; end if;

 if has_function_privilege('service_role','public.shop_customers_import_from_leads()','EXECUTE')
    or has_function_privilege('anon','public.shop_customers_import_from_leads()','EXECUTE') then raise exception 'Import callable by app roles'; end if;

 raise notice 'Import summary (incl. other test leads): %', r;
end $$;
