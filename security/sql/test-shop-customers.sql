-- Execute inside BEGIN/ROLLBACK, after shop-customers.sql, using service_role. Synthetic only.
do $$
declare c uuid; l uuid:=gen_random_uuid(); n integer; num text;
begin
  insert into public.shop_customers(customer_type,first_name,last_name,email,created_by,updated_by)
   values('private','TEST','Klant','klant@example.invalid','fixture@example.invalid','fixture@example.invalid') returning id,customer_number into c,num;
  if num !~ '^K[0-9]{6}$' then raise exception 'Customer number format'; end if;
  if not exists(select 1 from public.shop_customer_events where customer_id=c and event='created' and actor='fixture@example.invalid') then raise exception 'Create not audited'; end if;

  update public.shop_customers set city='Gent',version=version+1,updated_by='editor@example.invalid',updated_at=now() where id=c;
  if not exists(select 1 from public.shop_customer_events where customer_id=c and event='updated' and changed_fields=array['city'] and actor='editor@example.invalid') then raise exception 'Update not audited'; end if;
  select count(*) into n from public.shop_customer_events where customer_id=c;
  update public.shop_customers set version=version+1,updated_at=now() where id=c;
  if (select count(*) from public.shop_customer_events where customer_id=c)<>n then raise exception 'No-op update audited'; end if;

  begin insert into public.shop_customers(customer_type,company_name,email,created_by,updated_by) values('business','','b@example.invalid','x','x'); raise exception 'Business without company accepted';
  exception when check_violation then null; end;
  begin insert into public.shop_customers(customer_type,first_name,created_by,updated_by) values('private','NoContact','x','x'); raise exception 'Customer without contact accepted';
  exception when check_violation then null; end;
  begin insert into public.shop_customers(customer_type,first_name,phone,vat_number,created_by,updated_by) values('private','X','+32470000000','be 0123','x','x'); raise exception 'Unnormalized VAT accepted';
  exception when check_violation then null; end;

  insert into public.buyback_leads(id,status,model,email,first_name,last_name,order_code,base_price_cents,final_price_cents)
   values(l,'new','TEST Customer','klant@example.invalid','TEST','Klant','TEST-CUST-SQL-A',10000,10000);
  perform public.shop_customer_link_lead(c,l,'linker@example.invalid');
  if (select shop_customer_id from public.buyback_leads where id=l)<>c then raise exception 'Lead not linked'; end if;
  if not exists(select 1 from public.shop_customer_events where customer_id=c and event='lead_linked' and reference_id=l) then raise exception 'Link not audited'; end if;
  begin perform public.shop_customer_link_lead(c,l,'linker@example.invalid'); raise exception 'Relink accepted';
  exception when raise_exception then if sqlerrm<>'SHOP_CUSTOMER_LEAD_NOT_LINKABLE' then raise; end if; end;

  update public.shop_customers set archived_at=now(),version=version+1,updated_by='editor@example.invalid' where id=c;
  if not exists(select 1 from public.shop_customer_events where customer_id=c and event='archived') then raise exception 'Archive not audited'; end if;
  update public.buyback_leads set shop_customer_id=null where id=l;
  begin perform public.shop_customer_link_lead(c,l,'linker@example.invalid'); raise exception 'Archived link accepted';
  exception when raise_exception then if sqlerrm<>'SHOP_CUSTOMER_NOT_AVAILABLE' then raise; end if; end;

  if has_table_privilege('anon','public.shop_customers','SELECT') or has_table_privilege('authenticated','public.shop_customers','SELECT')
     or has_table_privilege('service_role','public.shop_customer_events','INSERT')
     or has_function_privilege('anon','public.shop_customer_link_lead(uuid,uuid,text)','EXECUTE') then raise exception 'Public access'; end if;
end $$;
