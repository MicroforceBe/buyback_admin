-- Synthetic TEST-only review scenarios. Never copy to production.
DO $$
DECLARE r uuid; source_id uuid; c uuid; line_id uuid; v integer; n integer; actor text:='preview-fixture@example.invalid';today date:=(now() AT TIME ZONE 'Europe/Brussels')::date;
BEGIN
 IF EXISTS(SELECT 1 FROM public.refurb_receptions WHERE reception_number='TEST-RMA-RESOLUTION-20261026') THEN RETURN;END IF;
 INSERT INTO public.refurb_receptions(reception_number,reception_date,supplier,vat_scheme,supplier_invoice_nr) VALUES('TEST-RMA-RESOLUTION-20261026',today,'TEST RMA Resolution preview','margin','TEST-NO-REAL-INVOICE') RETURNING id INTO r;
 FOR n IN 1..4 LOOP
  INSERT INTO public.refurb_reception_items(reception_id,row_index,refurb_status,sku,description,imei_sn,price_cents,compensation_cents,rma_registered,rma_defect_description)
  VALUES(r,n-1,CASE WHEN n=4 THEN 'booked' ELSE 'RMA' END,'TEST-RESOLUTION-'||n,
   CASE n WHEN 1 THEN 'TEST A · Geweigerd vóór verzending' WHEN 2 THEN 'TEST B · Geweigerd na verzending, wacht op retour' WHEN 3 THEN 'TEST C · Gedeeltelijke vergoeding 40 op claim 100' ELSE 'TEST D · Al geboekt, financieel afgehandeld, intern herstel mogelijk' END,
   'TEST-RESOLUTION-SN-'||n,CASE WHEN n=2 THEN 20000 ELSE 10000 END,CASE WHEN n=2 THEN 20000 ELSE 10000 END,true,'Fictief defect voor de RMA-preview; geen echt toestel') RETURNING id INTO source_id;
  c:=public.assign_reception_supplier_rma(r,array[source_id],NULL,n=4,false,actor);
  SELECT id INTO line_id FROM public.supplier_rma_items WHERE case_id=c;
  SELECT version INTO v FROM public.supplier_rma_cases WHERE id=c;
  PERFORM public.resolve_supplier_rma('decision',jsonb_build_object('case_id',c,'item_id',line_id,'version',v,'decision',CASE WHEN n=3 THEN 'partial' ELSE 'rejected' END,'approved_cents',CASE WHEN n=3 THEN 4000 ELSE 0 END,'reason','TEST: fictieve leveranciersbeslissing'),actor);
  SELECT version INTO v FROM public.supplier_rma_cases WHERE id=c;
  PERFORM public.manage_supplier_rma('update_case',jsonb_build_object('case_id',c,'version',v,'stage',CASE WHEN n=3 THEN 'awaiting_compensation' ELSE 'rejected' END,'supplier_reference','TEST-REJECTION-REF-'||n,'notes','Fictief previewdossier. Geen echte betaling, zending of ERP-boeking.'),actor);
  IF n=4 THEN
   SELECT version INTO v FROM public.supplier_rma_cases WHERE id=c;
   PERFORM public.settle_supplier_rma('finalize',jsonb_build_object('case_id',c,'version',v,'confirmed',true),actor);
  END IF;
  PERFORM public.resolve_supplier_rma('custody',jsonb_build_object('case_id',c,'item_id',line_id,'followup_version',0,'custody',CASE WHEN n=2 THEN 'returning' ELSE 'on_site' END,'outbound_on',CASE WHEN n=2 THEN today-2 ELSE NULL END,'return_reference',CASE WHEN n=2 THEN 'TEST-RETURN-TRACKING' ELSE '' END),actor);
 END LOOP;
END $$;

