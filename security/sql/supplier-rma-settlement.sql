-- TEST first: receipt controls and immutable final handling.
ALTER TABLE public.supplier_rma_cases ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.supplier_rma_cases DROP CONSTRAINT supplier_rma_cases_stage_check;
ALTER TABLE public.supplier_rma_cases ADD CONSTRAINT supplier_rma_cases_stage_check CHECK(stage IN ('draft','submitted','approved','sent','received','awaiting_compensation','refunded','closed','rejected','cancelled','handled'));
DROP INDEX IF EXISTS public.supplier_rma_one_open_reception;
CREATE UNIQUE INDEX supplier_rma_one_open_reception ON public.supplier_rma_cases(reception_id) WHERE reception_id IS NOT NULL AND stage NOT IN ('handled','refunded','closed','rejected','cancelled');
-- Extend the terminal-state predicates of the existing reviewed invoker functions.
DO $$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.manage_supplier_rma(text,jsonb,text)','public.create_reception_supplier_rma(uuid,text)','public.register_late_reception_rma(uuid,uuid[],text)','public.link_reception_supplier_rma()'] LOOP
  definition:=pg_get_functiondef(to_regprocedure(signature));
  IF definition IS NULL THEN RAISE EXCEPTION 'Required RMA function missing: %',signature; END IF;
  definition:=replace(definition,'''refunded'',''closed'',''rejected'',''cancelled''','''handled'',''refunded'',''closed'',''rejected'',''cancelled''');
  IF signature='public.manage_supplier_rma(text,jsonb,text)' THEN
    definition:=regexp_replace(definition,$find$(ELSIF p_command='update_item' THEN\s*)IF c.stage IN \([^)]*\) THEN RAISE EXCEPTION 'RMA_CASE_CLOSED'; END IF;$find$,$replacement$\1IF c.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;$replacement$);
  END IF;
  EXECUTE definition;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.protect_final_supplier_rma_case() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF NEW.stage='handled' AND (nullif(trim(NEW.stage),'') IS NULL OR nullif(trim(NEW.supplier_reference),'') IS NULL OR nullif(trim(NEW.supplier_credit_note),'') IS NULL) THEN RAISE EXCEPTION 'RMA_FINAL_FIELDS_REQUIRED'; END IF;
 IF NEW.stage='handled' AND (NEW.finalized_at IS NULL OR EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=NEW.id AND active)) THEN RAISE EXCEPTION 'RMA_FINALIZATION_REQUIRED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_final_supplier_rma_case() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.protect_final_supplier_rma_case() TO service_role;
CREATE TRIGGER protect_final_supplier_rma_case BEFORE UPDATE ON public.supplier_rma_cases FOR EACH ROW EXECUTE FUNCTION public.protect_final_supplier_rma_case();
CREATE OR REPLACE FUNCTION public.protect_final_supplier_rma_item() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM public.supplier_rma_cases WHERE id=OLD.case_id AND stage='handled') THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND EXISTS(SELECT 1 FROM public.supplier_rma_cases WHERE id=NEW.case_id AND stage='handled') THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_final_supplier_rma_item() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.protect_final_supplier_rma_item() TO service_role;
CREATE TRIGGER protect_final_supplier_rma_item BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_rma_items FOR EACH ROW EXECUTE FUNCTION public.protect_final_supplier_rma_item();

CREATE OR REPLACE FUNCTION public.settle_supplier_rma(p_command text,p_data jsonb,p_actor text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.supplier_rma_cases; previous jsonb; after_items jsonb; changed integer;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 SELECT * INTO c FROM public.supplier_rma_cases WHERE id=(p_data->>'case_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
 IF c.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'expected_cents',expected_cents,'received_cents',received_cents) ORDER BY id) INTO previous FROM public.supplier_rma_items WHERE case_id=c.id;
 IF p_command IN ('copy_item','copy_all') THEN
  IF p_command='copy_item' AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND id=(p_data->>'item_id')::uuid) THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND (p_command='copy_all' OR id=(p_data->>'item_id')::uuid) AND expected_cents IS NULL) THEN RAISE EXCEPTION 'RMA_EXPECTATION_MISSING'; END IF;
  UPDATE public.supplier_rma_items SET received_cents=expected_cents WHERE case_id=c.id AND (p_command='copy_all' OR id=(p_data->>'item_id')::uuid);
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=0 THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
 ELSIF p_command='finalize' THEN
  IF coalesce((p_data->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'RMA_CONFIRMATION_REQUIRED'; END IF;
  IF nullif(trim(c.stage),'') IS NULL OR nullif(trim(c.supplier_reference),'') IS NULL OR nullif(trim(c.supplier_credit_note),'') IS NULL THEN RAISE EXCEPTION 'RMA_FINAL_FIELDS_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND expected_cents IS NULL) THEN RAISE EXCEPTION 'RMA_EXPECTATION_MISSING'; END IF;
  UPDATE public.supplier_rma_items SET active=false WHERE case_id=c.id;
  UPDATE public.supplier_rma_cases SET stage='handled',finalized_at=now(),version=version+1,updated_at=now() WHERE id=c.id;
 ELSE RAISE EXCEPTION 'RMA_COMMAND_INVALID';
 END IF;
 IF p_command<>'finalize' THEN UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'expected_cents',expected_cents,'received_cents',received_cents) ORDER BY id) INTO after_items FROM public.supplier_rma_items WHERE case_id=c.id;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,p_command,jsonb_build_object('before',previous,'after',after_items,'change',p_data));
 RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION public.settle_supplier_rma(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_supplier_rma(text,jsonb,text) TO service_role;
