-- VOORSTEL. Vereist tests met de externe Shopify-widget, die niet in deze repo staat.
-- Deze catalogusgegevens zijn bewust publiek. Alleen SELECT blijft toegestaan.
-- De twee bestaande read-only widget-RPC's gebruiken de rechten en RLS van de aanroeper.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buyback_catalog', 'buyback_categories', 'buyback_models', 'buyback_capacities',
    'buyback_category_meta', 'buyback_answer_labels', 'buyback_question_titles',
    'buyback_ui_tips', 'buyback_multipliers_norm',
    'buyback_multipliers_per_category_json', 'buyback_multipliers_category_json',
    'buyback_multiplier_sets_json', 'buyback_model_multiplier_assignments'
  ] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY public_catalog_read ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON TABLE public.buyback_shops FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, name, address1, zip, city, opening_hours, active, created_at, updated_at)
  ON public.buyback_shops TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.buyback_shops TO service_role;
ALTER TABLE public.buyback_shops ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='buyback_shops' LOOP
    EXECUTE format('DROP POLICY %I ON public.buyback_shops', p.policyname);
  END LOOP;
END $$;
CREATE POLICY public_active_shops_read ON public.buyback_shops
  FOR SELECT TO anon, authenticated USING (active IS TRUE);

ALTER VIEW public.buyback_catalog_api SET (security_invoker = true);
ALTER VIEW public.buyback_multipliers_per_model_json SET (security_invoker = true);
REVOKE ALL PRIVILEGES ON TABLE public.buyback_catalog_api,
  public.buyback_multipliers_per_model_json FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.buyback_catalog_api,
  public.buyback_multipliers_per_model_json TO anon, authenticated, service_role;

-- Sluit overige functies voor clientrollen. Ook geërfde PUBLIC-rechten intrekken.
-- service_role behoudt EXECUTE, onder meer voor ordernummers en imports.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f.signature);
  END LOOP;
END $$;
ALTER FUNCTION public.api_buyback_catalog() SECURITY INVOKER;
ALTER FUNCTION public.api_buyback_widget(text) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.api_buyback_catalog(), public.api_buyback_widget(text)
  TO anon, authenticated;
COMMIT;

-- Default privileges worden pas aangepast nadat alle object-creators en de
-- Data API-instellingen zijn geïnventariseerd. Dit script beschermt bestaande objecten.
-- Storage-policy catalog: zie apart voorstel 06-storage.sql.
