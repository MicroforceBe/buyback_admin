-- TEST ONLY: explicitly fictional preview dataset. Never run against production.
BEGIN;
DO $$
DECLARE supplier_uuid uuid; reception_uuid uuid; a uuid; b uuid; case_uuid uuid; line_uuid uuid; version_value integer; status_value text; source_uuid uuid; target_uuid uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM public.refurb_suppliers WHERE name='TEST RMA Supplier preview') THEN RETURN; END IF;
  FOREACH status_value IN ARRAY ARRAY['New','RMA','RMA Submitted','RMA Supplier','Battery','Booked','Refunded'] LOOP
    IF NOT EXISTS(SELECT 1 FROM public.refurb_status_options WHERE lower(value)=lower(status_value)) THEN
      INSERT INTO public.refurb_status_options(value,label,is_default,sort_order,color,admin_only,need_sku) VALUES(status_value,CASE WHEN status_value='Refunded' THEN 'RMA Refunded (Finished)' ELSE status_value END,false,100,'#64748b',false,false);
    END IF;
  END LOOP;
  FOR status_value IN SELECT unnest(ARRAY['New','RMA','RMA Submitted','RMA Supplier','Battery']) LOOP
    SELECT id INTO source_uuid FROM public.refurb_status_options WHERE lower(value)=lower(status_value) LIMIT 1;
    SELECT id INTO target_uuid FROM public.refurb_status_options WHERE lower(value)=lower(CASE status_value WHEN 'New' THEN 'RMA' WHEN 'RMA' THEN 'RMA Submitted' WHEN 'RMA Submitted' THEN 'RMA Supplier' ELSE 'Booked' END) LIMIT 1;
    IF NOT EXISTS(SELECT 1 FROM public.refurb_status_transitions WHERE from_status_id=source_uuid AND to_status_id=target_uuid) THEN INSERT INTO public.refurb_status_transitions(from_status_id,to_status_id) VALUES(source_uuid,target_uuid); END IF;
  END LOOP;
  INSERT INTO public.refurb_suppliers(name) VALUES('TEST RMA Supplier preview') RETURNING id INTO supplier_uuid;
  INSERT INTO public.refurb_receptions(reception_number,reception_date,supplier,supplier_id,vat_scheme,supplier_invoice_nr) VALUES('TEST-RMA-PREVIEW-20261025',current_date,'TEST RMA Supplier preview',supplier_uuid,'margin','TEST-INVOICE-001') RETURNING id INTO reception_uuid;
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,price_cents,description,imei_sn,sku,rma_defect_description) VALUES(reception_uuid,0,'RMA',10000,'TEST Device A - automatisch 100 euro','TEST-RMA-001','TEST-SKU-001','Fictief schermdefect') RETURNING id INTO a;
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,price_cents,description,imei_sn,sku,rma_defect_description) VALUES(reception_uuid,1,'RMA',20000,'TEST Device B - andere RMA-status','TEST-RMA-002','TEST-SKU-002','Fictief toetsenborddefect') RETURNING id INTO b;
  UPDATE public.refurb_reception_items SET refurb_status='RMA Submitted' WHERE id=b;
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,price_cents,compensation_cents,description,imei_sn,sku,rma_defect_description) VALUES(reception_uuid,2,'RMA Supplier',30000,18000,'TEST Device C - handmatig 180 euro','TEST-RMA-003','TEST-SKU-003','Fictief cameradefect');
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,price_cents,description,imei_sn,sku) VALUES(reception_uuid,3,'RMA',15000,'TEST Device D - eenmaal RMA altijd RMA','TEST-RMA-004','TEST-SKU-004') RETURNING id INTO source_uuid;
  UPDATE public.refurb_reception_items SET refurb_status='Battery',compensation_cents=NULL WHERE id=source_uuid;
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,price_cents,description,imei_sn,sku) VALUES(reception_uuid,4,'New',17500,'TEST Device E - zet zelf op RMA','TEST-RMA-005','TEST-SKU-005');
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,price_cents,description,imei_sn,sku) VALUES(reception_uuid,5,'Refunded',25000,'TEST Device F - afgeronde RMA','TEST-RMA-006','TEST-SKU-006');
  case_uuid:=public.manage_supplier_rma('create',jsonb_build_object('supplier_id',supplier_uuid,'supplier_name','TEST RMA Supplier preview','item_ids',jsonb_build_array(a,b)), 'preview@example.invalid');
  SELECT version INTO version_value FROM public.supplier_rma_cases WHERE id=case_uuid;
  PERFORM public.manage_supplier_rma('update_case',jsonb_build_object('case_id',case_uuid,'version',version_value,'stage','awaiting_compensation','supplier_reference','TEST-SUPPLIER-REF-001','tracking_reference','TEST-TRACKING-001','sent_on',current_date-3,'received_on',current_date-2,'followup_on',current_date+7,'notes','Fictief voorbeelddossier. Geen echte verzending of betaling.'), 'preview@example.invalid');
  SELECT version INTO version_value FROM public.supplier_rma_cases WHERE id=case_uuid;
  SELECT id INTO line_uuid FROM public.supplier_rma_items WHERE case_id=case_uuid AND reception_item_id=a;
  PERFORM public.manage_supplier_rma('update_item',jsonb_build_object('case_id',case_uuid,'version',version_value,'item_id',line_uuid,'expected_cents',10000,'received_cents',2500,'notes','Fictieve deelontvangst van 25 euro'), 'preview@example.invalid');
END $$;
COMMIT;
SELECT 'Fictional RMA preview dataset ready' AS result;
