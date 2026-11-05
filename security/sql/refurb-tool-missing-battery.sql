CREATE OR REPLACE FUNCTION public.guard_booked_refurb_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF lower(trim(coalesce(OLD.refurb_status,'')))='booked' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Geboekte toestellen mogen niet verwijderd worden'; END IF;
  -- A previously unknown battery may be measured once for label reprinting.
  -- No other field, including status/SKU/parts/price, may change in this exception.
  IF OLD.battery_percentage IS NULL AND NEW.battery_percentage BETWEEN 0 AND 100
    AND (to_jsonb(NEW)-'battery_percentage'-'updated_at')=(to_jsonb(OLD)-'battery_percentage'-'updated_at')
  THEN RETURN NEW; END IF;
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
END $function$
