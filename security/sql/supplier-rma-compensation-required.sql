-- TEST first: strict compensation and terminal refunded status.
CREATE OR REPLACE FUNCTION public.is_refunded_rma_status(p_status text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(p_status,'') ~* '(refund|terugbetaald)' OR EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE (lower(trim(o.value))=lower(trim(coalesce(p_status,''))) OR lower(trim(o.label))=lower(trim(coalesce(p_status,'')))) AND (o.value||' '||o.label) ~* '(refund|terugbetaald)');
$$;
REVOKE ALL ON FUNCTION public.is_refunded_rma_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_refunded_rma_status(text) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_booked_refurb_item() RETURNS trigger
LANGUAGE plpgsql SET search_path='pg_catalog','public','pg_temp' AS $$
BEGIN
  IF lower(trim(coalesce(OLD.refurb_status,'')))='booked' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Geboekte toestellen mogen niet verwijderd worden'; END IF;
    IF (to_jsonb(NEW)-'row_index'-'updated_at'-'rma_registered'-'compensation_cents') IS DISTINCT FROM (to_jsonb(OLD)-'row_index'-'updated_at'-'rma_registered'-'compensation_cents') OR (OLD.rma_registered AND NOT NEW.rma_registered) OR (NEW.compensation_cents IS DISTINCT FROM OLD.compensation_cents AND NOT coalesce((OLD.compensation_cents IS NULL AND NEW.compensation_cents=OLD.price_cents AND NEW.rma_registered),false)) THEN RAISE EXCEPTION 'Geboekte toestellen zijn vergrendeld'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.create_reception_supplier_rma(p_reception_id uuid,p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE reception public.refurb_receptions; c public.supplier_rma_cases; created_id uuid; added integer;
BEGIN
  IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
  SELECT * INTO reception FROM public.refurb_receptions WHERE id=p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_RECEPTION_NOT_FOUND'; END IF;
  SELECT * INTO c FROM public.supplier_rma_cases WHERE reception_id=p_reception_id AND stage NOT IN ('refunded','closed','rejected','cancelled') FOR UPDATE;
  IF FOUND THEN RETURN c.id; END IF;
  IF EXISTS(SELECT 1 FROM public.refurb_reception_items i JOIN public.supplier_rma_items ci ON ci.reception_item_id=i.id WHERE i.reception_id=p_reception_id AND ci.active) THEN RAISE EXCEPTION 'RMA_ALREADY_LINKED'; END IF;
  created_id := gen_random_uuid();
  INSERT INTO public.supplier_rma_cases(id,code,supplier_id,supplier_name,reception_id,created_by)
  VALUES(created_id,'RMA-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(created_id::text,'-',''),1,8)),reception.supplier_id,reception.supplier,p_reception_id,p_actor);
  INSERT INTO public.supplier_rma_items(case_id,reception_item_id,expected_cents)
  SELECT created_id,i.id,coalesce(i.compensation_cents,i.price_cents) FROM public.refurb_reception_items i
  WHERE i.reception_id=p_reception_id AND i.compensation_cents IS NOT NULL AND NOT public.is_refunded_rma_status(i.refurb_status) AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items ci WHERE ci.reception_item_id=i.id)
  AND (i.rma_registered OR i.compensation_cents IS NOT NULL OR coalesce(i.refurb_status,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE (lower(trim(o.value))=lower(trim(coalesce(i.refurb_status,''))) OR lower(trim(o.label))=lower(trim(coalesce(i.refurb_status,'')))) AND (o.value ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR o.label ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)')));
  GET DIAGNOSTICS added=ROW_COUNT;
  IF added=0 THEN RAISE EXCEPTION 'RMA_NO_NEW_ITEMS'; END IF;
  INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(created_id,p_actor,'create',jsonb_build_object('change',jsonb_build_object('reception_id',p_reception_id,'added',added)));
  RETURN created_id;
END $$;
REVOKE ALL ON FUNCTION public.create_reception_supplier_rma(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_reception_supplier_rma(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.register_late_reception_rma(p_reception_id uuid,p_item_ids uuid[],p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE reception public.refurb_receptions; c public.supplier_rma_cases; selected uuid[]; added integer; created boolean:=false;
BEGIN
  IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
  SELECT array_agg(DISTINCT x) INTO selected FROM unnest(p_item_ids) x;
  IF coalesce(cardinality(selected),0)<1 OR cardinality(selected)>200 THEN RAISE EXCEPTION 'RMA_ITEMS_REQUIRED'; END IF;
  SELECT * INTO reception FROM public.refurb_receptions WHERE id=p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_RECEPTION_NOT_FOUND'; END IF;
  IF (SELECT count(*) FROM public.refurb_reception_items WHERE reception_id=p_reception_id AND id=ANY(selected))<>cardinality(selected) THEN RAISE EXCEPTION 'RMA_RECEPTION_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=ANY(selected) AND public.is_refunded_rma_status(refurb_status)) THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
  IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=ANY(selected) AND compensation_cents IS NULL) THEN RAISE EXCEPTION 'RMA_COMPENSATION_REQUIRED'; END IF;
  SELECT * INTO c FROM public.supplier_rma_cases WHERE reception_id=p_reception_id AND stage NOT IN ('refunded','closed','rejected','cancelled') FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE reception_item_id=ANY(selected) AND active AND case_id IS DISTINCT FROM c.id) THEN RAISE EXCEPTION 'RMA_ALREADY_LINKED'; END IF;
  IF c.id IS NULL THEN
    c.id:=gen_random_uuid(); created:=true;
    INSERT INTO public.supplier_rma_cases(id,code,supplier_id,supplier_name,reception_id,created_by) VALUES(c.id,'RMA-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(c.id::text,'-',''),1,8)),reception.supplier_id,reception.supplier,p_reception_id,p_actor);
  END IF;
  UPDATE public.refurb_reception_items SET rma_registered=true WHERE id=ANY(selected) AND NOT rma_registered;
  INSERT INTO public.supplier_rma_items(case_id,reception_item_id,expected_cents)
  SELECT c.id,i.id,coalesce(i.compensation_cents,i.price_cents) FROM public.refurb_reception_items i WHERE i.reception_id=p_reception_id AND i.compensation_cents IS NOT NULL AND NOT public.is_refunded_rma_status(i.refurb_status)
  AND (i.id=ANY(selected) OR (i.rma_registered AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items ci WHERE ci.reception_item_id=i.id)))
  AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items ci WHERE ci.reception_item_id=i.id AND (ci.active OR ci.case_id=c.id));
  GET DIAGNOSTICS added=ROW_COUNT;
  UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id;
  INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,p_actor,CASE WHEN created THEN 'create' ELSE 'late_rma' END,jsonb_build_object('change',jsonb_build_object('reception_id',p_reception_id,'item_ids',to_jsonb(selected),'added',added)));
  RETURN c.id;
END $$;
REVOKE ALL ON FUNCTION public.register_late_reception_rma(uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.register_late_reception_rma(uuid,uuid[],text) TO service_role;
CREATE OR REPLACE FUNCTION public.link_reception_supplier_rma() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.supplier_rma_cases; added integer;
BEGIN
  IF NEW.compensation_cents IS NULL OR public.is_refunded_rma_status(NEW.refurb_status) OR NOT NEW.rma_registered OR EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE reception_item_id=NEW.id) THEN RETURN NEW; END IF;
  -- Same parent lock as creation: a concurrent RMA edit waits for the new dossier to commit.
  PERFORM 1 FROM public.refurb_receptions WHERE id=NEW.reception_id FOR UPDATE;
  SELECT * INTO c FROM public.supplier_rma_cases WHERE reception_id=NEW.reception_id AND stage NOT IN ('refunded','closed','rejected','cancelled') FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.supplier_rma_items(case_id,reception_item_id,expected_cents)
  VALUES(c.id,NEW.id,coalesce(NEW.compensation_cents,NEW.price_cents)) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT;
  IF added>0 THEN
    UPDATE public.supplier_rma_cases SET version=version+1,updated_at=now() WHERE id=c.id;
    INSERT INTO public.supplier_rma_history(case_id,actor,event,details) VALUES(c.id,'Automatisch via receptie','auto_add_item',jsonb_build_object('change',jsonb_build_object('reception_item_id',NEW.id,'reception_id',NEW.reception_id)));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.link_reception_supplier_rma() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_reception_supplier_rma() TO service_role;
DROP TRIGGER IF EXISTS link_reception_supplier_rma ON public.refurb_reception_items;
CREATE TRIGGER link_reception_supplier_rma AFTER INSERT OR UPDATE ON public.refurb_reception_items FOR EACH ROW EXECUTE FUNCTION public.link_reception_supplier_rma();

CREATE OR REPLACE FUNCTION public.validate_reception_supplier_rma_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.supplier_rma_cases; source_reception uuid;
BEGIN
  IF NEW.expected_cents IS NULL THEN RAISE EXCEPTION 'RMA_COMPENSATION_REQUIRED'; END IF;
  IF TG_OP='INSERT' THEN
    IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=NEW.reception_item_id AND public.is_refunded_rma_status(refurb_status)) THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
    IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=NEW.reception_item_id AND compensation_cents IS NULL) THEN RAISE EXCEPTION 'RMA_COMPENSATION_REQUIRED'; END IF;
  END IF;
  SELECT * INTO c FROM public.supplier_rma_cases WHERE id=NEW.case_id;
  SELECT reception_id INTO source_reception FROM public.refurb_reception_items WHERE id=NEW.reception_item_id;
  IF c.reception_id IS NOT NULL AND c.reception_id IS DISTINCT FROM source_reception THEN RAISE EXCEPTION 'RMA_RECEPTION_MISMATCH'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_reception_supplier_rma_item() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_reception_supplier_rma_item() TO service_role;
DROP TRIGGER IF EXISTS validate_reception_supplier_rma_item ON public.supplier_rma_items;
CREATE TRIGGER validate_reception_supplier_rma_item BEFORE INSERT OR UPDATE ON public.supplier_rma_items FOR EACH ROW EXECUTE FUNCTION public.validate_reception_supplier_rma_item();


CREATE OR REPLACE FUNCTION public.enforce_rma_source_rules() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND public.is_refunded_rma_status(OLD.refurb_status) AND NEW.refurb_status IS DISTINCT FROM OLD.refurb_status THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
 IF NEW.compensation_cents IS NULL AND EXISTS(SELECT 1 FROM public.supplier_rma_items WHERE reception_item_id=NEW.id AND active) THEN RAISE EXCEPTION 'RMA_COMPENSATION_REQUIRED'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_rma_source_rules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_rma_source_rules() TO service_role;
CREATE TRIGGER enforce_rma_source_rules BEFORE UPDATE ON public.refurb_reception_items FOR EACH ROW EXECUTE FUNCTION public.enforce_rma_source_rules();

CREATE OR REPLACE FUNCTION public.prepare_reception_supplier_rma(p_reception_id uuid,p_item_ids uuid[],p_use_purchase_price boolean,p_actor text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE selected uuid[];
BEGIN
 IF nullif(trim(p_actor),'') IS NULL THEN RAISE EXCEPTION 'RMA_ACTOR_REQUIRED'; END IF;
 PERFORM 1 FROM public.refurb_receptions WHERE id=p_reception_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RMA_RECEPTION_NOT_FOUND'; END IF;
 IF p_item_ids IS NULL THEN
   SELECT array_agg(i.id) INTO selected FROM public.refurb_reception_items i WHERE i.reception_id=p_reception_id
   AND NOT public.is_refunded_rma_status(i.refurb_status) AND NOT EXISTS(SELECT 1 FROM public.supplier_rma_items ci WHERE ci.reception_item_id=i.id)
   AND (i.rma_registered OR i.compensation_cents IS NOT NULL OR coalesce(i.refurb_status,'') ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)' OR EXISTS(SELECT 1 FROM public.refurb_status_options o WHERE lower(trim(o.value))=lower(trim(coalesce(i.refurb_status,''))) AND o.label ~* '(^|[^a-z0-9])rma([^a-z0-9]|$)'));
 ELSE
   SELECT array_agg(DISTINCT x) INTO selected FROM unnest(p_item_ids) x;
   IF coalesce(cardinality(selected),0)<1 OR cardinality(selected)>200 OR (SELECT count(*) FROM public.refurb_reception_items WHERE reception_id=p_reception_id AND id=ANY(selected))<>cardinality(selected) THEN RAISE EXCEPTION 'RMA_RECEPTION_MISMATCH'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=ANY(selected) AND public.is_refunded_rma_status(refurb_status)) THEN RAISE EXCEPTION 'RMA_REFUNDED'; END IF;
 IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=ANY(selected) AND compensation_cents IS NULL) THEN
   IF NOT coalesce(p_use_purchase_price,false) THEN RAISE EXCEPTION 'RMA_COMPENSATION_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM public.refurb_reception_items WHERE id=ANY(selected) AND compensation_cents IS NULL AND price_cents IS NULL) THEN RAISE EXCEPTION 'RMA_PRICE_MISSING'; END IF;
   UPDATE public.refurb_reception_items SET compensation_cents=price_cents,rma_registered=true WHERE id=ANY(selected) AND compensation_cents IS NULL;
 END IF;
 IF p_item_ids IS NULL THEN RETURN public.create_reception_supplier_rma(p_reception_id,p_actor); END IF;
 RETURN public.register_late_reception_rma(p_reception_id,selected,p_actor);
END $$;
REVOKE ALL ON FUNCTION public.prepare_reception_supplier_rma(uuid,uuid[],boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_reception_supplier_rma(uuid,uuid[],boolean,text) TO service_role;
