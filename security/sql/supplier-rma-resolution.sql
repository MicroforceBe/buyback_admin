-- Preview only. Apply exclusively to Microforce-buyback-security-test until approved.
-- Additive: historical decisions are deliberately left unknown, never inferred from money.
ALTER TABLE public.supplier_rma_items
 ADD COLUMN IF NOT EXISTS decision text NOT NULL DEFAULT 'pending',
 ADD COLUMN IF NOT EXISTS decision_reason text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS decision_on date,
 ADD COLUMN IF NOT EXISTS approved_cents integer,
 ADD COLUMN IF NOT EXISTS claim_locked boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS written_off_cents integer NOT NULL DEFAULT 0;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='supplier_rma_resolution_check') THEN
  ALTER TABLE public.supplier_rma_items ADD CONSTRAINT supplier_rma_resolution_check CHECK(decision IN ('pending','approved','partial','rejected','repaired') AND (approved_cents IS NULL OR approved_cents>=0) AND written_off_cents>=0 AND length(decision_reason)<=5000);
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.supplier_rma_followups(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_item_id uuid NOT NULL UNIQUE REFERENCES public.supplier_rma_items(id) ON DELETE RESTRICT,
 reception_item_id uuid NOT NULL REFERENCES public.refurb_reception_items(id) ON DELETE RESTRICT,
 custody text NOT NULL DEFAULT 'unknown' CHECK(custody IN ('unknown','on_site','sent','supplier','returning','returned')),
 outbound_on date, returned_on date, return_reference text NOT NULL DEFAULT '' CHECK(length(return_reference)<=250),
 repair_state text NOT NULL DEFAULT 'none' CHECK(repair_state IN ('none','queued','working','quality','repaired','unrepairable','parts')),
 repair_notes text NOT NULL DEFAULT '' CHECK(length(repair_notes)<=10000),
 repair_parts text NOT NULL DEFAULT '' CHECK(length(repair_parts)<=2000),
 repair_assignee text NOT NULL DEFAULT '' CHECK(length(repair_assignee)<=250),
 started_at timestamptz, completed_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(returned_on IS NULL OR (outbound_on IS NOT NULL AND returned_on>=outbound_on))
);
CREATE INDEX IF NOT EXISTS supplier_rma_followups_source_idx ON public.supplier_rma_followups(reception_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_rma_one_internal_repair ON public.supplier_rma_followups(reception_item_id) WHERE repair_state IN ('queued','working','quality');
ALTER TABLE public.supplier_rma_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_rma_followups FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.supplier_rma_followups TO service_role;

CREATE OR REPLACE FUNCTION public.validate_supplier_rma_resolution_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.claim_locked AND NEW.expected_cents IS DISTINCT FROM OLD.expected_cents THEN RAISE EXCEPTION 'RMA_CLAIM_LOCKED'; END IF;
 IF TG_OP='UPDATE' THEN NEW.claim_locked:=OLD.claim_locked OR NEW.claim_locked; END IF;
 IF NEW.decision='pending' THEN
  IF NEW.approved_cents IS NOT NULL OR NEW.written_off_cents<>0 THEN RAISE EXCEPTION 'RMA_DECISION_INVALID'; END IF;
  IF TG_OP='UPDATE' AND NEW.received_cents IS DISTINCT FROM OLD.received_cents AND NEW.received_cents>0 THEN RAISE EXCEPTION 'RMA_DECISION_REQUIRED'; END IF;
 ELSE
  NEW.claim_locked:=true;
  IF NEW.expected_cents IS NULL OR NEW.approved_cents IS NULL OR NEW.approved_cents>NEW.expected_cents THEN RAISE EXCEPTION 'RMA_DECISION_INVALID'; END IF;
  IF NEW.decision='approved' AND NEW.approved_cents<>NEW.expected_cents THEN RAISE EXCEPTION 'RMA_DECISION_INVALID'; END IF;
  IF NEW.decision='partial' AND (NEW.approved_cents<=0 OR NEW.approved_cents>=NEW.expected_cents) THEN RAISE EXCEPTION 'RMA_DECISION_INVALID'; END IF;
  IF NEW.decision IN ('rejected','repaired') AND NEW.approved_cents<>0 THEN RAISE EXCEPTION 'RMA_DECISION_INVALID'; END IF;
  IF NEW.decision IN ('partial','rejected','repaired') AND nullif(trim(NEW.decision_reason),'') IS NULL THEN RAISE EXCEPTION 'RMA_REASON_REQUIRED'; END IF;
  IF NEW.received_cents>NEW.approved_cents OR NEW.written_off_cents>greatest(NEW.approved_cents-NEW.received_cents,0) THEN RAISE EXCEPTION 'RMA_RECEIPT_EXCEEDS_AWARD'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER validate_supplier_rma_resolution_item BEFORE INSERT OR UPDATE ON public.supplier_rma_items FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_rma_resolution_item();

CREATE OR REPLACE FUNCTION public.supplier_rma_requires_credit_note(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=p_case AND (coalesce(approved_cents,0)>0 OR received_cents>0));
$$;

CREATE OR REPLACE FUNCTION public.protect_final_supplier_rma_case() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF NEW.stage='handled' THEN
  IF nullif(trim(NEW.supplier_reference),'') IS NULL OR (public.supplier_rma_requires_credit_note(NEW.id) AND nullif(trim(NEW.supplier_credit_note),'') IS NULL) THEN RAISE EXCEPTION 'RMA_FINAL_FIELDS_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=NEW.id) OR EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=NEW.id AND (decision='pending' OR approved_cents IS NULL OR expected_cents IS NULL)) THEN RAISE EXCEPTION 'RMA_DECISION_REQUIRED'; END IF;
  IF NEW.finalized_at IS NULL OR EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=NEW.id AND active) THEN RAISE EXCEPTION 'RMA_FINALIZATION_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Each command locks case -> item -> physical follow-up in that order.
-- No command updates the booked/refurb source: repair work remains an independent record.
CREATE OR REPLACE FUNCTION public.resolve_supplier_rma(p_command text,p_data jsonb,p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,'resolution_'||p_command,jsonb_build_object('item_id',i.id,'before',old_data,'change',p_data));
 RETURN c.id;
END $$;

CREATE OR REPLACE FUNCTION public.settle_supplier_rma(p_command text,p_data jsonb,p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.supplier_rma_cases; previous jsonb; after_items jsonb; changed integer;
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 SELECT * INTO c FROM public.supplier_rma_cases WHERE id=(p_data->>'case_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
 IF c.stage='handled' THEN RAISE EXCEPTION 'RMA_FINALIZED'; END IF;
 IF c.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'RMA_CONFLICT'; END IF;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO previous FROM public.supplier_rma_items i WHERE case_id=c.id;
 IF p_command IN ('copy_item','copy_all') THEN
  IF p_command='copy_item' AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND id=(p_data->>'item_id')::uuid) THEN RAISE EXCEPTION 'RMA_ITEM_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND (p_command='copy_all' OR id=(p_data->>'item_id')::uuid) AND (decision='pending' OR approved_cents IS NULL)) THEN RAISE EXCEPTION 'RMA_DECISION_REQUIRED'; END IF;
  UPDATE public.supplier_rma_items SET received_cents=approved_cents WHERE case_id=c.id AND (p_command='copy_all' OR id=(p_data->>'item_id')::uuid);
  GET DIAGNOSTICS changed=ROW_COUNT;IF changed=0 THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
 ELSIF p_command='finalize' THEN
  IF coalesce((p_data->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'RMA_CONFIRMATION_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id) OR EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND (decision='pending' OR approved_cents IS NULL OR expected_cents IS NULL)) THEN RAISE EXCEPTION 'RMA_DECISION_REQUIRED'; END IF;
  IF nullif(trim(c.supplier_reference),'') IS NULL OR (public.supplier_rma_requires_credit_note(c.id) AND nullif(trim(c.supplier_credit_note),'') IS NULL) THEN RAISE EXCEPTION 'RMA_FINAL_FIELDS_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE case_id=c.id AND approved_cents>received_cents) AND coalesce((p_data->>'confirm_writeoff')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'RMA_WRITEOFF_CONFIRMATION'; END IF;
  UPDATE public.supplier_rma_items SET active=false,written_off_cents=greatest(approved_cents-received_cents,0) WHERE case_id=c.id;
  UPDATE public.supplier_rma_cases SET stage='handled',finalized_at=now(),version=version+1,updated_at=now() WHERE id=c.id;
 ELSE RAISE EXCEPTION 'RMA_COMMAND_INVALID'; END IF;
 IF p_command<>'finalize' THEN UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id; END IF;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY id) INTO after_items FROM public.supplier_rma_items i WHERE case_id=c.id;
 INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,p_command,jsonb_build_object('before',previous,'after',after_items,'change',p_data));
 RETURN c.id;
END $$;

REVOKE ALL ON FUNCTION public.validate_supplier_rma_resolution_item() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.supplier_rma_requires_credit_note(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_supplier_rma(text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_supplier_rma(text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_rma_requires_credit_note(uuid),public.resolve_supplier_rma(text,jsonb,text),public.settle_supplier_rma(text,jsonb,text) TO service_role;
