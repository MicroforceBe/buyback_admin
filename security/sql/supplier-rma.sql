-- Preview first. Apply only to the TEST project until Olivier approves live.
ALTER TABLE public.refurb_reception_items ADD COLUMN IF NOT EXISTS rma_registered boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.supplier_rma_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.refurb_suppliers(id) ON DELETE RESTRICT,
  supplier_name text NOT NULL CHECK (length(trim(supplier_name)) BETWEEN 1 AND 250),
  supplier_reference text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft','submitted','approved','sent','received','awaiting_compensation','closed','rejected','cancelled')),
  tracking_reference text NOT NULL DEFAULT '',
  sent_on date, received_on date, followup_on date,
  notes text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_rma_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.supplier_rma_cases(id) ON DELETE RESTRICT,
  reception_item_id uuid NOT NULL REFERENCES public.refurb_reception_items(id) ON DELETE RESTRICT,
  expected_cents integer CHECK (expected_cents >= 0),
  received_cents integer NOT NULL DEFAULT 0 CHECK (received_cents >= 0),
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id,reception_item_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_rma_one_active_case ON public.supplier_rma_items(reception_item_id) WHERE active;
CREATE INDEX IF NOT EXISTS supplier_rma_items_case ON public.supplier_rma_items(case_id);
CREATE INDEX IF NOT EXISTS supplier_rma_items_source ON public.supplier_rma_items(reception_item_id);
CREATE INDEX IF NOT EXISTS supplier_rma_cases_supplier ON public.supplier_rma_cases(supplier_id);
CREATE TABLE IF NOT EXISTS public.supplier_rma_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.supplier_rma_cases(id) ON DELETE RESTRICT,
  actor text NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_rma_history_case ON public.supplier_rma_history(case_id,created_at);
CREATE TABLE IF NOT EXISTS public.supplier_rma_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_item_id uuid NOT NULL REFERENCES public.refurb_reception_items(id) ON DELETE RESTRICT,
  old_status text, new_status text,
  old_compensation_cents integer, new_compensation_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_rma_status_history_item ON public.supplier_rma_status_history(reception_item_id,created_at);

ALTER TABLE public.supplier_rma_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_rma_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_rma_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_rma_status_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_rma_cases, public.supplier_rma_items, public.supplier_rma_history, public.supplier_rma_status_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.supplier_rma_cases,public.supplier_rma_items TO service_role;
GRANT SELECT,INSERT ON public.supplier_rma_history,public.supplier_rma_status_history TO service_role;

CREATE OR REPLACE FUNCTION public.register_supplier_rma_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_rma boolean; previous_rma boolean := false;
BEGIN
  current_rma := coalesce(NEW.refurb_status,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR EXISTS (
    SELECT 1 FROM public.refurb_status_options o WHERE (lower(trim(o.value))=lower(trim(coalesce(NEW.refurb_status,''))) OR lower(trim(o.label))=lower(trim(coalesce(NEW.refurb_status,'')))) AND (o.value ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR o.label ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)'));
  IF TG_OP='UPDATE' THEN
    previous_rma := OLD.rma_registered OR OLD.compensation_cents IS NOT NULL OR coalesce(OLD.refurb_status,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR EXISTS (
      SELECT 1 FROM public.refurb_status_options o WHERE (lower(trim(o.value))=lower(trim(coalesce(OLD.refurb_status,''))) OR lower(trim(o.label))=lower(trim(coalesce(OLD.refurb_status,'')))) AND (o.value ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR o.label ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)'));
  END IF;
  NEW.rma_registered := NEW.rma_registered OR current_rma OR previous_rma OR NEW.compensation_cents IS NOT NULL;
  IF lower(trim(coalesce(NEW.refurb_status,'')))='rma' AND NEW.compensation_cents IS NULL THEN
    IF TG_OP='INSERT' OR lower(trim(coalesce(OLD.refurb_status,'')))<>'rma' THEN
      NEW.compensation_cents := NEW.price_cents;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.register_supplier_rma_item() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_supplier_rma_item() TO service_role;
DROP TRIGGER IF EXISTS register_supplier_rma_item ON public.refurb_reception_items;
CREATE TRIGGER register_supplier_rma_item BEFORE INSERT OR UPDATE ON public.refurb_reception_items FOR EACH ROW EXECUTE FUNCTION public.register_supplier_rma_item();

CREATE OR REPLACE FUNCTION public.record_supplier_rma_status() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.rma_registered THEN
    IF TG_OP='INSERT' THEN
      INSERT INTO public.supplier_rma_status_history(reception_item_id,new_status,new_compensation_cents) VALUES(NEW.id,NEW.refurb_status,NEW.compensation_cents);
    ELSIF NEW.refurb_status IS DISTINCT FROM OLD.refurb_status OR NEW.compensation_cents IS DISTINCT FROM OLD.compensation_cents THEN
      INSERT INTO public.supplier_rma_status_history(reception_item_id,old_status,new_status,old_compensation_cents,new_compensation_cents) VALUES(NEW.id,OLD.refurb_status,NEW.refurb_status,OLD.compensation_cents,NEW.compensation_cents);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_supplier_rma_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_supplier_rma_status() TO service_role;
DROP TRIGGER IF EXISTS record_supplier_rma_status ON public.refurb_reception_items;
CREATE TRIGGER record_supplier_rma_status AFTER INSERT OR UPDATE ON public.refurb_reception_items FOR EACH ROW EXECUTE FUNCTION public.record_supplier_rma_status();

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
    IF c.stage IN ('closed','rejected','cancelled') THEN RAISE EXCEPTION 'RMA_CASE_CLOSED'; END IF;
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
    UPDATE public.supplier_rma_cases SET stage=p_data->>'stage',supplier_reference=coalesce(p_data->>'supplier_reference',''),tracking_reference=coalesce(p_data->>'tracking_reference',''),sent_on=nullif(p_data->>'sent_on','')::date,received_on=nullif(p_data->>'received_on','')::date,followup_on=nullif(p_data->>'followup_on','')::date,notes=coalesce(p_data->>'notes','') WHERE id=c.id;
    UPDATE public.supplier_rma_items SET active=(p_data->>'stage') NOT IN ('closed','rejected','cancelled') WHERE case_id=c.id;
  ELSIF p_command='update_item' THEN
    IF c.stage IN ('closed','rejected','cancelled') THEN RAISE EXCEPTION 'RMA_CASE_CLOSED'; END IF;
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
