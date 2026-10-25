-- TEST first. Existing reception expiry dates are preserved.
ALTER TABLE public.refurb_suppliers ADD COLUMN IF NOT EXISTS rma_expiry_days integer NOT NULL DEFAULT 30 CHECK(rma_expiry_days BETWEEN 0 AND 36500);
ALTER TABLE public.refurb_receptions ADD COLUMN IF NOT EXISTS rma_expiry_days integer CHECK(rma_expiry_days BETWEEN 0 AND 36500);
CREATE OR REPLACE FUNCTION public.snapshot_reception_rma_terms() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.rma_expiry_days IS NULL AND NEW.rma_expiry_date IS NOT NULL THEN NEW.rma_expiry_days:=NEW.rma_expiry_date-NEW.reception_date; END IF;
  IF NEW.rma_expiry_days IS NULL THEN SELECT rma_expiry_days INTO NEW.rma_expiry_days FROM public.refurb_suppliers WHERE id=NEW.supplier_id; END IF;
  NEW.rma_expiry_days:=coalesce(NEW.rma_expiry_days,30);
  NEW.rma_expiry_date:=NEW.reception_date+NEW.rma_expiry_days;
 ELSIF NEW.rma_expiry_days IS DISTINCT FROM OLD.rma_expiry_days OR NEW.reception_date IS DISTINCT FROM OLD.reception_date THEN
  IF NEW.rma_expiry_days IS NOT NULL THEN NEW.rma_expiry_date:=NEW.reception_date+NEW.rma_expiry_days; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_reception_rma_terms() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_reception_rma_terms() TO service_role;
CREATE TRIGGER snapshot_reception_rma_terms BEFORE INSERT OR UPDATE OF rma_expiry_days,reception_date ON public.refurb_receptions FOR EACH ROW EXECUTE FUNCTION public.snapshot_reception_rma_terms();
