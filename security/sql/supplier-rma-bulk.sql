-- Atomic selected/all supplier decisions and received compensation. Existing single-item rules remain authoritative.
CREATE OR REPLACE FUNCTION public.bulk_supplier_rma(p_command text,p_data jsonb,p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.supplier_rma_cases; ids uuid[]; item_id uuid; current_version integer; followup_version integer;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 IF p_command NOT IN ('decision','copy_received','custody') OR p_command IS NULL THEN RAISE EXCEPTION 'RMA_COMMAND_INVALID'; END IF;
 SELECT * INTO c FROM public.supplier_rma_cases WHERE id=(p_data->>'case_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
 IF c.stage='handled' AND p_command<>'custody' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
 IF coalesce((p_data->>'all')::boolean,false) THEN
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.supplier_rma_items WHERE case_id=c.id;
 ELSE
  IF jsonb_typeof(p_data->'item_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
  SELECT array_agg(DISTINCT value::uuid ORDER BY value::uuid) INTO ids FROM jsonb_array_elements_text(p_data->'item_ids');
 END IF;
 IF coalesce(cardinality(ids),0)=0 OR cardinality(ids)>200 THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ids) selected(id) LEFT JOIN public.supplier_rma_items i ON i.id=selected.id AND i.case_id=c.id WHERE i.id IS NULL) THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
 FOREACH item_id IN ARRAY ids LOOP
  SELECT version INTO current_version FROM public.supplier_rma_cases WHERE id=c.id;
  IF p_command='decision' THEN
   PERFORM public.resolve_supplier_rma('decision',p_data || jsonb_build_object('item_id',item_id,'version',current_version),p_actor);
  ELSIF p_command='custody' THEN
   SELECT coalesce((SELECT f.version FROM public.supplier_rma_followups f WHERE f.case_item_id=item_id),0) INTO followup_version;
   IF followup_version IS DISTINCT FROM (p_data->'followup_versions'->>item_id::text)::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
   PERFORM public.resolve_supplier_rma('custody',p_data || jsonb_build_object('item_id',item_id,'followup_version',followup_version),p_actor);
  ELSE
   PERFORM public.settle_supplier_rma('copy_item',jsonb_build_object('case_id',c.id,'item_id',item_id,'version',current_version),p_actor);
  END IF;
 END LOOP;
 IF p_command='custody' THEN UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id; END IF;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,'bulk_'||p_command,jsonb_build_object('count',cardinality(ids),'item_ids',ids,'change',p_data-'item_ids'));
 RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION public.bulk_supplier_rma(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_supplier_rma(text,jsonb,text) TO service_role;
