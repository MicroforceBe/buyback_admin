-- TEST first: articles are explicitly routed to an existing or new dossier.
DROP INDEX IF EXISTS public.supplier_rma_one_open_reception;
DROP TRIGGER IF EXISTS link_reception_supplier_rma ON public.refurb_reception_items;

CREATE OR REPLACE FUNCTION public.assign_reception_supplier_rma(p_reception_id uuid,p_item_ids uuid[],p_target_case_id uuid,p_register_late boolean,p_use_purchase_price boolean,p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE reception public.refurb_receptions; c public.supplier_rma_cases; selected uuid[]; source record; previous jsonb; created boolean:=false;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 SELECT array_agg(DISTINCT x) INTO selected FROM unnest(p_item_ids) x;
 IF coalesce(cardinality(selected),0)<1 OR cardinality(selected)>200 THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
 SELECT * INTO reception FROM public.refurb_receptions WHERE id=p_reception_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_RECEPTION_NOT_FOUND'; END IF;
 IF p_target_case_id IS NOT NULL THEN
  SELECT * INTO c FROM public.supplier_rma_cases WHERE id=p_target_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  IF c.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
  IF c.stage IN ('refunded','closed','rejected','cancelled') THEN RAISE EXCEPTION 'RMA_CASE_CLOSED'; END IF;
  IF c.reception_id IS NOT NULL AND c.reception_id<>p_reception_id THEN RAISE EXCEPTION 'RMA_RECEPTION_MISMATCH'; END IF;
  IF c.reception_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items ci JOIN public.refurb_reception_items i ON i.id=ci.reception_item_id WHERE ci.case_id=c.id AND i.reception_id=p_reception_id) THEN RAISE EXCEPTION 'RMA_RECEPTION_MISMATCH'; END IF;
  IF (c.supplier_id IS NOT NULL AND c.supplier_id IS DISTINCT FROM reception.supplier_id) OR (c.supplier_id IS NULL AND (reception.supplier_id IS NOT NULL OR lower(trim(c.supplier_name))<>lower(trim(reception.supplier)))) THEN RAISE EXCEPTION 'RMA_SUPPLIER_MISMATCH'; END IF;
  previous:=to_jsonb(c);
 END IF;
 IF (SELECT count(*) FROM public.refurb_reception_items WHERE reception_id=p_reception_id AND id=ANY(selected))<>cardinality(selected) THEN RAISE EXCEPTION 'RMA_RECEPTION_MISMATCH'; END IF;
 FOR source IN SELECT * FROM public.refurb_reception_items WHERE id=ANY(selected) ORDER BY id FOR UPDATE LOOP
  IF public.is_refunded_rma_status(source.refurb_status) THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE reception_item_id=source.id AND active) THEN RAISE EXCEPTION 'RMA_ALREADY_LINKED'; END IF;
  IF NOT coalesce(p_register_late,false) THEN
   IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE reception_item_id=source.id) THEN RAISE EXCEPTION 'RMA_ALREADY_LINKED'; END IF;
   IF NOT (source.rma_registered OR source.compensation_cents IS NOT NULL OR coalesce(source.refurb_status,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE lower(trim(o.value))=lower(trim(coalesce(source.refurb_status,''))) AND o.label ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)')) THEN RAISE EXCEPTION 'RMA_NOT_REGISTERED'; END IF;
  END IF;
  IF source.compensation_cents IS NULL THEN
   IF NOT coalesce(p_use_purchase_price,false) THEN RAISE EXCEPTION 'RMA_COMPENSATION_REQUIRED'; END IF;
   IF source.price_cents IS NULL THEN RAISE EXCEPTION 'RMA_PRICE_MISSING'; END IF;
  END IF;
 END LOOP;
 IF c.id IS NULL THEN
  c.id:=gen_random_uuid(); created:=true;
  INSERT INTO public.supplier_rma_cases(id,code,supplier_id,supplier_name,reception_id,created_by) VALUES(c.id,'RMA-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(c.id::text,'-',''),1,8)),reception.supplier_id,reception.supplier,p_reception_id,p_actor);
 END IF;
 UPDATE public.refurb_reception_items SET compensation_cents=coalesce(compensation_cents,price_cents),rma_registered=true WHERE id=ANY(selected) AND (compensation_cents IS NULL OR NOT rma_registered);
 INSERT INTO public.supplier_rma_items(case_id,reception_item_id,expected_cents) SELECT c.id,id,compensation_cents FROM public.refurb_reception_items WHERE id=ANY(selected);
 UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,CASE WHEN created THEN 'create' ELSE 'add_items' END,jsonb_build_object('before',previous,'change',jsonb_build_object('reception_id',p_reception_id,'item_ids',to_jsonb(selected),'explicit_target',true,'late_rma',coalesce(p_register_late,false))));
 RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION public.assign_reception_supplier_rma(uuid,uuid[],uuid,boolean,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_reception_supplier_rma(uuid,uuid[],uuid,boolean,boolean,text) TO service_role;

-- Fail closed for stale previews instead of silently choosing one of several dossiers.
CREATE OR REPLACE FUNCTION public.prepare_reception_supplier_rma(p_reception_id uuid,p_item_ids uuid[],p_use_purchase_price boolean,p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'RMA_TARGET_REQUIRED'; END $$;
CREATE OR REPLACE FUNCTION public.create_reception_supplier_rma(p_reception_id uuid,p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'RMA_TARGET_REQUIRED'; END $$;
CREATE OR REPLACE FUNCTION public.register_late_reception_rma(p_reception_id uuid,p_item_ids uuid[],p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'RMA_TARGET_REQUIRED'; END $$;
