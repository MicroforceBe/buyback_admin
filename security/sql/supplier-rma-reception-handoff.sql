-- Existing RMA to fix workflow, no new article statuses. TEST first.
ALTER TABLE public.supplier_rma_followups ADD COLUMN IF NOT EXISTS reception_handoff_at timestamptz;
CREATE TABLE IF NOT EXISTS public.supplier_rma_reception_handoffs(
 case_item_id uuid PRIMARY KEY REFERENCES public.supplier_rma_items(id) ON DELETE RESTRICT,
 reception_item_id uuid NOT NULL REFERENCES public.refurb_reception_items(id) ON DELETE RESTRICT,
 original_item jsonb NOT NULL,
 actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_rma_handoff_source ON public.supplier_rma_reception_handoffs(reception_item_id,created_at DESC);
ALTER TABLE public.supplier_rma_reception_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_rma_reception_handoffs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.supplier_rma_reception_handoffs TO service_role;

CREATE OR REPLACE FUNCTION public.guard_booked_refurb_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF lower(trim(coalesce(OLD.refurb_status,'')))='booked' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Geboekte toestellen mogen niet verwijderd worden'; END IF;
  -- Only the rejected-and-present handoff can reopen a booked source. All other fields stay intact.
  IF (to_jsonb(NEW)-'refurb_status'-'updated_at'-'rma_registered')=(to_jsonb(OLD)-'refurb_status'-'updated_at'-'rma_registered')
    AND NEW.rma_registered
    AND EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE o.value=NEW.refurb_status AND lower(trim(o.label))='rma to fix')
    AND EXISTS(SELECT 1 FROM public.supplier_rma_reception_handoffs h JOIN public.supplier_rma_items i ON i.id=h.case_item_id JOIN public.supplier_rma_followups f ON f.case_item_id=i.id
      WHERE h.reception_item_id=OLD.id AND h.original_item=to_jsonb(OLD) AND i.decision='rejected' AND f.custody IN('on_site','returned') AND f.reception_handoff_at IS NULL)
  THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'row_index'-'updated_at'-'rma_registered'-'compensation_cents') IS DISTINCT FROM (to_jsonb(OLD)-'row_index'-'updated_at'-'rma_registered'-'compensation_cents') OR (OLD.rma_registered AND NOT NEW.rma_registered) OR (NEW.compensation_cents IS DISTINCT FROM OLD.compensation_cents AND NOT coalesce((OLD.compensation_cents IS NULL AND NEW.compensation_cents=OLD.price_cents AND NEW.rma_registered),false)) THEN RAISE EXCEPTION 'Geboekte toestellen zijn vergrendeld'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.handoff_supplier_rma_to_reception(p_case_id uuid,p_item_id uuid,p_actor text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.supplier_rma_items; f public.supplier_rma_followups; s public.refurb_reception_items; target text; matches integer;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 PERFORM 1 FROM public.supplier_rma_cases WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
 SELECT * INTO i FROM public.supplier_rma_items WHERE id=p_item_id AND case_id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
 SELECT * INTO f FROM public.supplier_rma_followups WHERE case_item_id=i.id FOR UPDATE;
 IF NOT FOUND OR i.decision<>'rejected' OR f.custody NOT IN('on_site','returned') OR f.repair_state IN('repaired','unrepairable','parts') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.supplier_rma_reception_handoffs WHERE case_item_id=i.id) THEN RETURN false; END IF;
 SELECT * INTO s FROM public.refurb_reception_items WHERE id=i.reception_item_id FOR UPDATE;
 IF public.is_refunded_rma_status(s.refurb_status) THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
 IF EXISTS(SELECT 1 FROM public.supplier_rma_items newer JOIN public.supplier_rma_cases nc ON nc.id=newer.case_id JOIN public.supplier_rma_cases oc ON oc.id=i.case_id WHERE newer.reception_item_id=i.reception_item_id AND nc.created_at>oc.created_at) THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
 SELECT count(*),min(value) INTO matches,target FROM public.refurb_status_options WHERE lower(trim(label))='rma to fix';
 IF matches<>1 THEN RAISE EXCEPTION 'RMA_FIX_STATUS_MISSING'; END IF;
 INSERT INTO public.supplier_rma_reception_handoffs(case_item_id,reception_item_id,original_item,actor) VALUES(i.id,s.id,to_jsonb(s),p_actor);
 UPDATE public.refurb_reception_items SET refurb_status=target,rma_registered=true,updated_at=now() WHERE id=s.id;
 UPDATE public.supplier_rma_followups SET reception_handoff_at=now(),repair_state='queued',completed_at=NULL,version=version+1,updated_at=now() WHERE case_item_id=i.id;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(i.case_id,p_actor,'reception_handoff',jsonb_build_object('item_id',i.id,'source_id',s.id,'previous_status',s.refurb_status,'new_status',target));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.handoff_supplier_rma_to_reception(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handoff_supplier_rma_to_reception(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_supplier_rma_reception_work() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE h public.supplier_rma_reception_handoffs; item public.supplier_rma_items; next_repair text; status_label text;
BEGIN
 IF NEW.refurb_status IS NOT DISTINCT FROM OLD.refurb_status THEN RETURN NEW; END IF;
 SELECT * INTO h FROM public.supplier_rma_reception_handoffs WHERE reception_item_id=NEW.id ORDER BY created_at DESC,case_item_id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NEW; END IF;
 -- During handoff the ordinary source update happens before the follow-up is marked handed over.
 IF NOT EXISTS(SELECT 1 FROM public.supplier_rma_followups WHERE case_item_id=h.case_item_id AND reception_handoff_at IS NOT NULL) THEN RETURN NEW; END IF;
 SELECT lower(trim(label)) INTO status_label FROM public.refurb_status_options WHERE lower(trim(value))=lower(trim(NEW.refurb_status)) OR lower(trim(label))=lower(trim(NEW.refurb_status)) ORDER BY (value=NEW.refurb_status) DESC LIMIT 1;
 next_repair:=CASE WHEN status_label='rma to fix' THEN 'queued' WHEN status_label='finished - use for parts' THEN 'parts' WHEN status_label IN('finished','ready to book','booked','test booked') THEN 'repaired' ELSE 'working' END;
 UPDATE public.supplier_rma_followups SET repair_state=next_repair,repair_parts=coalesce(NEW.used_parts,''),repair_notes=coalesce(NEW.refurb_diagnostics,''),started_at=coalesce(started_at,now()),completed_at=CASE WHEN next_repair IN('repaired','parts') THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE case_item_id=h.case_item_id;
 SELECT * INTO item FROM public.supplier_rma_items WHERE id=h.case_item_id;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(item.case_id,'reception-workflow','reception_processing',jsonb_build_object('item_id',item.id,'previous_status',OLD.refurb_status,'new_status',NEW.refurb_status));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_supplier_rma_reception_work ON public.refurb_reception_items;
CREATE TRIGGER sync_supplier_rma_reception_work AFTER UPDATE OF refurb_status ON public.refurb_reception_items FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_rma_reception_work();
REVOKE ALL ON FUNCTION public.sync_supplier_rma_reception_work() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_supplier_rma_reception_work() TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_supplier_rma(p_command text, p_data jsonb, p_actor text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE c public.supplier_rma_cases; i public.supplier_rma_items; f public.supplier_rma_followups;
 old_data jsonb; decision_value text; award integer; custody_value text; next_state text; out_date date; back_date date; today date:=(now() AT TIME ZONE 'Europe/Brussels')::date;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 SELECT * INTO c FROM public.supplier_rma_cases WHERE id=(p_data->>'case_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
 SELECT * INTO i FROM public.supplier_rma_items WHERE id=(p_data->>'item_id')::uuid AND case_id=c.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
 IF p_command='decision' THEN
  IF c.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
  IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
  decision_value:=p_data->>'decision';
  IF decision_value IS NULL OR decision_value NOT IN ('pending','approved','partial','rejected','repaired') THEN RAISE EXCEPTION 'RMA_DECISION_INVALID'; END IF;
  IF decision_value='pending' AND EXISTS(SELECT 1 FROM public.supplier_rma_followups WHERE case_item_id=i.id AND repair_state<>'none') THEN RAISE EXCEPTION 'RMA_REPAIR_ACTIVE'; END IF;
  award:=CASE WHEN decision_value='pending' THEN NULL WHEN decision_value IN ('rejected','repaired') THEN 0 WHEN decision_value='approved' THEN i.expected_cents ELSE (p_data->>'approved_cents')::integer END;
  old_data:=to_jsonb(i);
  UPDATE public.supplier_rma_items SET decision=decision_value,approved_cents=award,decision_reason=coalesce(trim(p_data->>'reason'),''),decision_on=CASE WHEN decision_value='pending' THEN NULL ELSE today END WHERE id=i.id;
  UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id;
 ELSE
  SELECT * INTO f FROM public.supplier_rma_followups WHERE case_item_id=i.id FOR UPDATE;
  IF NOT FOUND THEN
   IF (p_data->>'followup_version')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
   INSERT INTO public.supplier_rma_followups(case_item_id,reception_item_id) VALUES(i.id,i.reception_item_id) RETURNING * INTO f;
  ELSIF f.version IS DISTINCT FROM (p_data->>'followup_version')::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
  old_data:=to_jsonb(f);
  IF p_command='repair' AND f.reception_handoff_at IS NOT NULL THEN RAISE EXCEPTION 'RMA_USE_RECEPTION'; END IF;
  IF p_command='custody' THEN
   custody_value:=p_data->>'custody';out_date:=nullif(p_data->>'outbound_on','')::date;back_date:=nullif(p_data->>'returned_on','')::date;
   IF custody_value IS NULL OR custody_value NOT IN ('unknown','on_site','sent','supplier','returning','returned') THEN RAISE EXCEPTION 'RMA_CUSTODY_INVALID'; END IF;
   IF custody_value='on_site' AND (out_date IS NOT NULL OR back_date IS NOT NULL OR f.outbound_on IS NOT NULL) THEN RAISE EXCEPTION 'RMA_RETURN_REQUIRED'; END IF;
   IF custody_value IN ('sent','supplier','returning','returned') AND out_date IS NULL THEN RAISE EXCEPTION 'RMA_SENT_DATE_REQUIRED'; END IF;
   IF custody_value='returned' AND back_date IS NULL THEN RAISE EXCEPTION 'RMA_RETURN_REQUIRED'; END IF;
   IF back_date IS NOT NULL AND (custody_value<>'returned' OR out_date IS NULL OR back_date<out_date) THEN RAISE EXCEPTION 'RMA_CUSTODY_INVALID'; END IF;
   IF out_date>today OR back_date>today THEN RAISE EXCEPTION 'RMA_CUSTODY_INVALID'; END IF;
   IF f.outbound_on IS NOT NULL AND out_date IS NULL THEN RAISE EXCEPTION 'RMA_RETURN_REQUIRED'; END IF;
   IF f.returned_on IS NOT NULL AND back_date IS NULL THEN RAISE EXCEPTION 'RMA_RETURN_REQUIRED'; END IF;
   IF f.repair_state IN ('queued','working','quality') AND custody_value NOT IN ('on_site','returned') THEN RAISE EXCEPTION 'RMA_REPAIR_ACTIVE'; END IF;
   UPDATE public.supplier_rma_followups SET custody=custody_value,outbound_on=out_date,returned_on=back_date,return_reference=coalesce(trim(p_data->>'return_reference'),''),version=version+1,updated_at=now() WHERE id=f.id;
  ELSIF p_command='repair' THEN
   next_state:=p_data->>'repair_state';
   IF f.repair_state IN ('repaired','unrepairable','parts') THEN RAISE EXCEPTION 'RMA_REPAIR_FINALIZED'; END IF;
   IF f.custody NOT IN ('on_site','returned') THEN RAISE EXCEPTION 'RMA_RETURN_REQUIRED'; END IF;
   IF f.repair_state='none' AND i.decision NOT IN ('rejected','partial') THEN RAISE EXCEPTION 'RMA_REJECTION_REQUIRED'; END IF;
   IF f.repair_state='none' AND EXISTS(SELECT 1 FROM public.refurb_reception_items s WHERE s.id=i.reception_item_id AND (coalesce(s.refurb_status,'') ~* '(^|[^a-z0-9])refunded([^a-z0-9]|$)' OR EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE (lower(trim(o.value))=lower(trim(s.refurb_status)) OR lower(trim(o.label))=lower(trim(s.refurb_status))) AND (o.value ~* '(^|[^a-z0-9])refunded([^a-z0-9]|$)' OR o.label ~* '(^|[^a-z0-9])refunded([^a-z0-9]|$)')))) THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
   IF NOT (next_state=f.repair_state OR (f.repair_state='none' AND next_state='queued') OR (f.repair_state='queued' AND next_state='working') OR (f.repair_state='working' AND next_state IN ('quality','unrepairable','parts')) OR (f.repair_state='quality' AND next_state IN ('working','repaired','unrepairable','parts'))) THEN RAISE EXCEPTION 'RMA_REPAIR_TRANSITION'; END IF;
   IF next_state IN ('repaired','unrepairable','parts') AND nullif(trim(p_data->>'repair_notes'),'') IS NULL THEN RAISE EXCEPTION 'RMA_REPAIR_NOTES_REQUIRED'; END IF;
   IF next_state='repaired' AND (coalesce((p_data->>'quality_confirmed')::boolean,false) IS NOT TRUE OR nullif(trim(p_data->>'repair_parts'),'') IS NULL) THEN RAISE EXCEPTION 'RMA_QUALITY_REQUIRED'; END IF;
   UPDATE public.supplier_rma_followups SET repair_state=next_state,repair_notes=coalesce(trim(p_data->>'repair_notes'),''),repair_parts=coalesce(trim(p_data->>'repair_parts'),''),repair_assignee=coalesce(trim(p_data->>'repair_assignee'),''),started_at=CASE WHEN next_state='working' THEN coalesce(started_at,now()) ELSE started_at END,completed_at=CASE WHEN next_state IN ('repaired','unrepairable','parts') THEN now() ELSE completed_at END,version=version+1,updated_at=now() WHERE id=f.id;
  ELSE RAISE EXCEPTION 'RMA_COMMAND_INVALID'; END IF;
 END IF;
 IF p_command IN ('decision','custody') THEN PERFORM public.handoff_supplier_rma_to_reception(c.id,i.id,p_actor); END IF;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,'resolution_'||p_command,jsonb_build_object('item_id',i.id,'before',old_data,'change',p_data));
 RETURN c.id;
END $function$;
