-- Synthetic database regression; run inside BEGIN/ROLLBACK as service_role.
do $$
declare r uuid:=gen_random_uuid(); i uuid:=gen_random_uuid(); n integer;
begin
 insert into public.refurb_receptions(id,reception_number,reception_date,supplier,vat_scheme,supplier_invoice_nr)
 values(r,'TEST-BATTERY-ROLLBACK',current_date,'TEST Supplier','margin','TEST-INVOICE');
 insert into public.refurb_reception_items(id,reception_id,row_index,refurb_status,description)
 values(i,r,0,'new','TEST smartphone');
 if (select battery_percentage from public.refurb_reception_items where id=i) is not null then raise exception 'Default must be NULL'; end if;
 foreach n in array array[0,84,85,100] loop
  update public.refurb_reception_items set battery_percentage=n where id=i;
  if (select battery_percentage from public.refurb_reception_items where id=i)<>n then raise exception 'Battery not persisted'; end if;
 end loop;
 begin update public.refurb_reception_items set battery_percentage=101 where id=i; raise exception '101 accepted';
 exception when check_violation then null; end;
 begin update public.refurb_reception_items set battery_percentage=-1 where id=i; raise exception '-1 accepted';
 exception when check_violation then null; end;
 update public.refurb_reception_items set battery_percentage=null where id=i;
 if (select battery_percentage from public.refurb_reception_items where id=i) is not null then raise exception 'Clear failed'; end if;
end $$;
