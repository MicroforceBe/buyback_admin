-- VOORSTEL. Vereist vóór deployment van de lokale code (nieuwe delete-RPC).
-- Geen bestaande toesteldata wordt herschreven.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.guard_booked_refurb_item()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF lower(trim(coalesce(OLD.refurb_status,''))) = 'booked' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Geboekte toestellen mogen niet verwijderd worden';
    END IF;
    -- Alleen presentatievolgorde/timestamp mogen bij atomair hernummeren wijzigen.
    IF (to_jsonb(NEW) - 'row_index' - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'row_index' - 'updated_at') THEN
      RAISE EXCEPTION 'Geboekte toestellen zijn vergrendeld';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_booked_refurb_item() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_booked_refurb_item() TO service_role;
DROP TRIGGER IF EXISTS guard_booked_refurb_item ON public.refurb_reception_items;
CREATE TRIGGER guard_booked_refurb_item BEFORE UPDATE OR DELETE
  ON public.refurb_reception_items FOR EACH ROW EXECUTE FUNCTION public.guard_booked_refurb_item();

CREATE OR REPLACE FUNCTION public.delete_refurb_reception_secure(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM id FROM public.refurb_receptions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receptie niet gevonden'; END IF;
  -- De parent-lock blokkeert nieuwe child-inserts via de bestaande foreign key.
  PERFORM id FROM public.refurb_reception_items WHERE reception_id=p_id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.refurb_reception_items WHERE reception_id=p_id
    AND lower(trim(coalesce(refurb_status,'')))='booked') THEN
    RAISE EXCEPTION 'Receptie bevat geboekte toestellen';
  END IF;
  -- De bestaande ON DELETE CASCADE verwijdert items binnen dezelfde transactie.
  DELETE FROM public.refurb_receptions WHERE id=p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_refurb_reception_secure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_refurb_reception_secure(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_refurb_reception_item_secure(p_reception_id uuid, p_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE removed_index integer;
BEGIN
  PERFORM id FROM public.refurb_receptions WHERE id=p_reception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receptie niet gevonden'; END IF;
  PERFORM id FROM public.refurb_reception_items WHERE reception_id=p_reception_id ORDER BY id FOR UPDATE;
  SELECT row_index INTO removed_index FROM public.refurb_reception_items
    WHERE id=p_item_id AND reception_id=p_reception_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rij niet gevonden'; END IF;
  -- De trigger weigert een geboekte rij. De volledige transactie wordt dan teruggedraaid.
  DELETE FROM public.refurb_reception_items WHERE id=p_item_id AND reception_id=p_reception_id;
  UPDATE public.refurb_reception_items SET row_index=row_index-1, updated_at=now()
    WHERE reception_id=p_reception_id AND row_index>removed_index;
END $$;
REVOKE EXECUTE ON FUNCTION public.delete_refurb_reception_item_secure(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_refurb_reception_item_secure(uuid,uuid) TO service_role;
COMMIT;
