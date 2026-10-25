BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE s uuid; r uuid; r2 uuid; original_date date; blocked boolean;
BEGIN
 INSERT INTO public.refurb_suppliers(name) VALUES('TEST TERM '||gen_random_uuid()) RETURNING id INTO s;
 IF (SELECT rma_expiry_days FROM public.refurb_suppliers WHERE id=s)<>30 THEN RAISE EXCEPTION 'Supplier default not 30'; END IF;
 UPDATE public.refurb_suppliers SET rma_expiry_days=45 WHERE id=s;
 INSERT INTO public.refurb_receptions(reception_number,reception_date,supplier,supplier_id,vat_scheme,supplier_invoice_nr) VALUES('TEST TERM '||gen_random_uuid(),'2026-03-28','TEST TERM',s,'margin','TEST ONLY') RETURNING id INTO r;
 IF NOT EXISTS(SELECT 1 FROM public.refurb_receptions WHERE id=r AND rma_expiry_days=45 AND rma_expiry_date='2026-05-12') THEN RAISE EXCEPTION 'Supplier snapshot not copied'; END IF;
 UPDATE public.refurb_suppliers SET rma_expiry_days=90 WHERE id=s;
 IF NOT EXISTS(SELECT 1 FROM public.refurb_receptions WHERE id=r AND rma_expiry_days=45 AND rma_expiry_date='2026-05-12') THEN RAISE EXCEPTION 'Supplier edit changed existing reception'; END IF;
 INSERT INTO public.refurb_receptions(reception_number,reception_date,supplier,supplier_id,vat_scheme,supplier_invoice_nr) VALUES('TEST TERM '||gen_random_uuid(),'2026-03-28','TEST TERM',s,'margin','TEST ONLY') RETURNING id INTO r2;
 IF NOT EXISTS(SELECT 1 FROM public.refurb_receptions WHERE id=r2 AND rma_expiry_days=90 AND rma_expiry_date='2026-06-26') THEN RAISE EXCEPTION 'New reception missed changed supplier term'; END IF;
 UPDATE public.refurb_receptions SET internal_invoice_nr='TEST-INV' WHERE id=r;
 IF NOT EXISTS(SELECT 1 FROM public.refurb_receptions WHERE id=r AND rma_expiry_date='2026-05-12') THEN RAISE EXCEPTION 'Invoice save changed expiry'; END IF;
 UPDATE public.refurb_receptions SET rma_expiry_days=7 WHERE id=r;
 IF NOT EXISTS(SELECT 1 FROM public.refurb_receptions WHERE id=r AND rma_expiry_date='2026-04-04') THEN RAISE EXCEPTION 'Reception override not recalculated'; END IF;
 UPDATE public.refurb_receptions SET rma_expiry_days=0 WHERE id=r;
 IF NOT EXISTS(SELECT 1 FROM public.refurb_receptions WHERE id=r AND rma_expiry_date='2026-03-28') THEN RAISE EXCEPTION 'Zero term not preserved'; END IF;
 blocked:=false; BEGIN UPDATE public.refurb_suppliers SET rma_expiry_days=-1 WHERE id=s; EXCEPTION WHEN check_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Negative term accepted'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: default 30, supplier inheritance, independent snapshot, invoice preservation, override, calendar date and zero validation; fixtures rolled back' as verification;
