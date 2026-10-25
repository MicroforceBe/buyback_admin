-- TEST only until approved. Preserve existing supplier RMA references.
ALTER TABLE public.supplier_rma_cases ADD COLUMN IF NOT EXISTS supplier_credit_note text NOT NULL DEFAULT '' CHECK(length(supplier_credit_note)<=250);
ALTER TABLE public.supplier_rma_cases DROP CONSTRAINT supplier_rma_cases_stage_check;
ALTER TABLE public.supplier_rma_cases ADD CONSTRAINT supplier_rma_cases_stage_check CHECK(stage IN ('draft','submitted','approved','sent','received','awaiting_compensation','refunded','closed','rejected','cancelled'));
CREATE OR REPLACE FUNCTION public.manage_supplier_rma(p_command text,p_data jsonb,p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.supplier_rma_cases; item record; item_ids uuid[]; created_id uuid; supplier_uuid uuid; supplier_text text; wanted integer; previous jsonb;
BEGIN
  IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
  IF p_command='create' THEN
    supplier_uuid := nullif(p_data->>'supplier_id','')::uuid;
    supplier_text := trim(p_data->>'supplier_name');
    created_id := gen_random_uuid();
    INSERT INTO public.supplier_rma_cases(id,code,supplier_id,supplier_name,created_by)
    VALUES(created_id,'RMA-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(created_id::text,'-',''),1,8)),supplier_uuid,supplier_text,p_actor) RETURNING * INTO c;
  ELSE
    SELECT * INTO c FROM public.supplier_rma_cases WHERE id=(p_data->>'case_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
    IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
    created_id := c.id;
  END IF;
  IF p_command IN ('create','add_items') THEN
    IF c.stage IN ('refunded','closed','rejected','cancelled') THEN RAISE EXCEPTION 'RMA_CASE_CLOSED'; END IF;
    SELECT array_agg(DISTINCT value::uuid) INTO item_ids FROM jsonb_array_elements_text(p_data->'item_ids');
    wanted := cardinality(item_ids);
    IF coalesce(wanted,0)<1 OR wanted>200 THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
    IF (SELECT count(*) FROM public.refurb_reception_items WHERE id=ANY(item_ids))<>wanted THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
    FOR item IN SELECT i.*,r.supplier_id,r.supplier FROM public.refurb_reception_items i JOIN public.refurb_receptions r ON r.id=i.reception_id WHERE i.id=ANY(item_ids) ORDER BY i.id FOR UPDATE OF i LOOP
      IF (c.supplier_id IS NOT NULL AND item.supplier_id IS DISTINCT FROM c.supplier_id) OR (c.supplier_id IS NULL AND (item.supplier_id IS NOT NULL OR lower(trim(coalesce(item.supplier,'')))<>lower(trim(c.supplier_name)))) THEN RAISE EXCEPTION 'RMA_SUPPLIER_MISMATCH'; END IF;
      IF NOT (item.rma_registered OR item.compensation_cents IS NOT NULL OR coalesce(item.refurb_status,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE lower(trim(o.value))=lower(trim(coalesce(item.refurb_status,''))) AND coalesce(o.label,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)')) THEN RAISE EXCEPTION 'RMA_ITEM_REQUIRED'; END IF;
      INSERT INTO public.supplier_rma_items(case_id,reception_item_id,expected_cents) VALUES(c.id,item.id,coalesce(item.compensation_cents,item.price_cents));
    END LOOP;
  ELSIF p_command='update_case' THEN
    previous := to_jsonb(c);
    UPDATE public.supplier_rma_cases SET stage=p_data->>'stage',supplier_reference=coalesce(p_data->>'supplier_reference',c.supplier_reference),supplier_credit_note=coalesce(p_data->>'supplier_credit_note',c.supplier_credit_note),tracking_reference=coalesce(p_data->>'tracking_reference',''),sent_on=nullif(p_data->>'sent_on','')::date,received_on=nullif(p_data->>'received_on','')::date,followup_on=nullif(p_data->>'followup_on','')::date,notes=coalesce(p_data->>'notes','') WHERE id=c.id;
    UPDATE public.supplier_rma_items SET active=(p_data->>'stage') NOT IN ('refunded','closed','rejected','cancelled') WHERE case_id=c.id;
  ELSIF p_command='update_item' THEN
    IF c.stage IN ('refunded','closed','rejected','cancelled') THEN RAISE EXCEPTION 'RMA_CASE_CLOSED'; END IF;
    SELECT to_jsonb(i) INTO previous FROM public.supplier_rma_items i WHERE i.id=(p_data->>'item_id')::uuid AND i.case_id=c.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
    UPDATE public.supplier_rma_items SET expected_cents=nullif(p_data->>'expected_cents','')::integer,received_cents=(p_data->>'received_cents')::integer,notes=coalesce(p_data->>'notes','') WHERE id=(p_data->>'item_id')::uuid AND case_id=c.id;
  ELSE RAISE EXCEPTION 'RMA_COMMAND_INVALID';
  END IF;
  UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id;
  INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,p_command,jsonb_build_object('before',previous,'change',p_data));
  RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION public.manage_supplier_rma(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_supplier_rma(text,jsonb,text) TO service_role;
